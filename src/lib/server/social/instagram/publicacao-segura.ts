import type { SupabaseClient } from "@supabase/supabase-js";
import { midiasRecentes, publishContainer, statusDoContainer, waitForContainerReady } from "./meta-client";

/**
 * Publicar sem correr o risco de publicar duas vezes.
 *
 * O defeito que este módulo fecha: o worker publicava na Meta e só depois
 * gravava no banco. Entre uma coisa e outra existe uma janela em que o post
 * está no Instagram e não está na tabela. Pior, os três `update` do worker
 * descartavam o `error` do supabase-js, que não lança: uma gravação recusada
 * pelo banco seguia para o log de sucesso, a linha continuava em `generated`,
 * e o giro seguinte do worker publicava o mesmo post de novo.
 *
 * A correção não é um índice único. Índice impede duas linhas reivindicarem a
 * mesma mídia; não impede a segunda mídia de existir no Instagram, que é o
 * dano real e o único que o leitor vê.
 *
 * São quatro camadas, e a ordem entre elas é o que importa:
 *
 *   1. registrar a intenção antes de agir. O `creation_id` existe antes do
 *      `media_publish`, então ele é gravado antes. Se o banco recusar essa
 *      gravação, não se publica: não saber o que foi publicado é pior que não
 *      publicar.
 *
 *   2. toda gravação confere o erro. Nenhum caminho declara sucesso sobre uma
 *      escrita que não aconteceu.
 *
 *   3. a retentativa reusa o MESMO container, nunca cria outro. A Meta recusa
 *      publicar duas vezes o mesmo `creation_id`, então repetir a chamada é
 *      seguro por construção. Criar um container novo é que duplicaria o post.
 *
 *   4. quando a evidência não fecha, para. Container inalcançável não vira
 *      "tenta de novo": vira revisão humana. É a única regra que garante que
 *      um erro de rede não custe um post duplicado no perfil.
 */

export type ResultadoDaPublicacao =
  | { desfecho: "publicado"; mediaId: string; reaproveitado: boolean }
  | { desfecho: "revisar"; motivo: string; creationId: string | null };

/** Escrita que não deixa passar erro. Existe porque a do worker deixava. */
export async function gravarOuFalhar(
  client: SupabaseClient,
  socialPostId: string,
  campos: Record<string, unknown>,
  oQue: string,
): Promise<void> {
  const { error } = await client
    .from("social_posts")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", socialPostId);

  if (error) {
    throw new Error(`Não foi possível gravar ${oQue} do post ${socialPostId}: ${error.message}`);
  }
}

/**
 * Reivindica a vaga, e só uma reivindicação vence.
 *
 * `gravarOuFalhar` com `status` não serve para isso: `UPDATE ... WHERE id = X`
 * dá certo nos dois giros que estejam disputando a mesma linha, porque nenhum
 * dos dois pergunta em que estado ela estava. Os dois seguem em frente, os dois
 * renderizam, os dois publicam.
 *
 * A condição no WHERE é o que torna a troca atômica: quem chegar depois não
 * casa mais com `status = de`, não afeta linha nenhuma, e descobre pela
 * contagem que perdeu. É o Postgres decidindo, e não a ordem em que dois
 * processos acordaram.
 */
export async function reivindicarVaga(
  client: SupabaseClient,
  socialPostId: string,
  de: string,
  para: string,
): Promise<{ ganhou: boolean; motivo: string }> {
  const { data, error } = await client
    .from("social_posts")
    .update({ status: para, updated_at: new Date().toISOString() })
    .eq("id", socialPostId)
    .eq("status", de)
    .select("id");

  if (error) {
    return { ganhou: false, motivo: `não consegui reivindicar a vaga: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return {
      ganhou: false,
      motivo: `a vaga não estava mais em "${de}": outro giro pegou este post primeiro, ou ele já mudou de estado`,
    };
  }

  return { ganhou: true, motivo: "" };
}

/**
 * Grava o `media_id` com insistência.
 *
 * Esta é a única escrita do fluxo que acontece DEPOIS de um efeito externo
 * irreversível. Falhar aqui deixa o post publicado e órfão, então ela tenta de
 * novo antes de desistir, e quando desiste diz exatamente qual mídia ficou sem
 * dono, para o registro poder ser refeito à mão.
 */
async function gravarMediaId(
  client: SupabaseClient,
  socialPostId: string,
  mediaId: string,
  tentativas = 3,
): Promise<void> {
  let ultimoErro = "";

  for (let i = 1; i <= tentativas; i += 1) {
    const { error } = await client
      .from("social_posts")
      .update({
        provider_post_id: mediaId,
        status: "published",
        published_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", socialPostId);

    if (!error) return;

    ultimoErro = error.message;
    console.warn(`[PUBLICAÇÃO] Tentativa ${i} de gravar o media_id falhou: ${error.message}`);
    if (i < tentativas) await new Promise((r) => setTimeout(r, 1000 * i));
  }

  throw new Error(
    `PUBLICADO NO INSTAGRAM E NÃO GRAVADO. Post ${socialPostId}, mídia ${mediaId}. ` +
      `Último erro do banco: ${ultimoErro}. Registrar à mão antes do próximo giro.`,
  );
}

/**
 * Recupera o id da mídia de um container que já foi publicado.
 *
 * A Meta não devolve o `media_id` quando se pergunta pelo container, então o
 * caminho é listar as últimas mídias da conta e casar pela legenda. É
 * aproximado de propósito: a legenda pode ter sido cortada pelo Instagram, e
 * por isso a comparação usa o começo dela.
 */
async function acharMidiaPelaLegenda(
  legenda: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<string | null> {
  const inicio = (legenda || "").trim().slice(0, 60);
  if (inicio.length < 20) return null;

  const r = await midiasRecentes(15, env, fetcher);
  if (!r.ok) return null;

  const achada = r.midias.find((m) => (m.caption || "").trim().startsWith(inicio));
  return achada?.id ?? null;
}

export type EstadoAnterior = {
  providerPostId: string | null;
  providerCreationId: string | null;
  publishAttemptedAt: string | null;
  caption: string;
};

/**
 * O que fazer com um post que já teve uma tentativa de publicação.
 *
 * Chamado ANTES de qualquer coisa cara. Um post que já foi publicado não é
 * regerado, não é renderizado e não é publicado de novo.
 */
export async function reconciliarTentativaAnterior(
  client: SupabaseClient,
  socialPostId: string,
  anterior: EstadoAnterior,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<ResultadoDaPublicacao | null> {
  if (anterior.providerPostId) {
    return { desfecho: "publicado", mediaId: anterior.providerPostId, reaproveitado: true };
  }

  // Sem container registrado, não houve tentativa: o caminho normal serve.
  if (!anterior.providerCreationId || !anterior.publishAttemptedAt) return null;

  const creationId = anterior.providerCreationId;
  const estado = await statusDoContainer(creationId, env, fetcher);

  if (!estado.ok) {
    /*
     * Não conseguir perguntar não é a mesma coisa que a resposta ser "não".
     *
     * Aqui o sistema sabe que mandou publicar e não sabe o desfecho. Publicar
     * de novo com container novo seria decidir, no escuro, pelo desfecho que
     * duplica o post. A escolha é parar.
     */
    return {
      desfecho: "revisar",
      motivo: `houve tentativa de publicação em ${anterior.publishAttemptedAt} e o container ${creationId} não pôde ser consultado (${estado.error}). Não republicado de propósito.`,
      creationId,
    };
  }

  if (estado.status === "PUBLISHED") {
    const mediaId = await acharMidiaPelaLegenda(anterior.caption, env, fetcher);

    if (!mediaId) {
      return {
        desfecho: "revisar",
        motivo: `o container ${creationId} consta como PUBLISHED na Meta, então o post JÁ ESTÁ no ar, mas o id da mídia não foi recuperado pela legenda. Não republicado.`,
        creationId,
      };
    }

    await gravarMediaId(client, socialPostId, mediaId);
    console.log(`[PUBLICAÇÃO] Reconciliado: ${creationId} já estava publicado como ${mediaId}.`);
    return { desfecho: "publicado", mediaId, reaproveitado: true };
  }

  if (estado.status === "ERROR" || estado.status === "EXPIRED") {
    // Container morto nunca publicou. Refazer do zero é seguro.
    console.log(`[PUBLICAÇÃO] Container ${creationId} está ${estado.status}; refazendo do início.`);
    await gravarOuFalhar(
      client,
      socialPostId,
      { provider_creation_id: null, publish_attempted_at: null },
      "limpeza do container morto",
    );
    return null;
  }

  /*
   * FINISHED ou IN_PROGRESS: o container existe e a publicação não se
   * confirmou. Repetir o `media_publish` DESTE container é seguro, porque a
   * Meta recusa publicar o mesmo `creation_id` duas vezes. É o oposto de criar
   * um container novo, que é o que duplicaria.
   */
  console.log(`[PUBLICAÇÃO] Container ${creationId} está ${estado.status}; repetindo a publicação dele.`);
  const publicado = await publishContainer(creationId, env, fetcher);

  if (publicado.ok && publicado.mediaId) {
    await gravarMediaId(client, socialPostId, publicado.mediaId);
    return { desfecho: "publicado", mediaId: publicado.mediaId, reaproveitado: true };
  }

  return {
    desfecho: "revisar",
    motivo: `a repetição da publicação do container ${creationId} falhou: ${publicado.error}. Não foi criado container novo.`,
    creationId,
  };
}

/**
 * Publica um container registrando a intenção antes.
 *
 * A ordem é: espera ficar pronto, GRAVA que vai publicar, publica, grava o
 * resultado. Trocar a segunda pela terceira é o defeito que este módulo
 * existe para fechar.
 */
export async function publicarComRegistro(
  client: SupabaseClient,
  socialPostId: string,
  creationId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  espera?: { timeoutMs?: number; intervalMs?: number },
): Promise<ResultadoDaPublicacao> {
  const pronto = await waitForContainerReady(creationId, env, fetcher, espera);
  if (!pronto.ok) {
    return { desfecho: "revisar", motivo: `container não ficou pronto: ${pronto.error}`, creationId };
  }

  // Se não dá para registrar que vou publicar, não publico.
  await gravarOuFalhar(
    client,
    socialPostId,
    { provider_creation_id: creationId, publish_attempted_at: new Date().toISOString() },
    "a intenção de publicar",
  );

  const publicado = await publishContainer(creationId, env, fetcher);

  if (!publicado.ok || !publicado.mediaId) {
    /*
     * Falhou a chamada, e não se sabe se ela chegou.
     *
     * Um erro de rede depois de a Meta já ter processado o publish é
     * indistinguível daqui de um publish que nunca aconteceu. O container fica
     * registrado, e o próximo giro pergunta à Meta em vez de chutar.
     */
    return {
      desfecho: "revisar",
      motivo: `a publicação falhou: ${publicado.error}. O container ${creationId} ficou registrado para reconciliação no próximo giro.`,
      creationId,
    };
  }

  await gravarMediaId(client, socialPostId, publicado.mediaId);
  return { desfecho: "publicado", mediaId: publicado.mediaId, reaproveitado: false };
}
