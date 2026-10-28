import { sha256De } from "../artefato";
import type { CargaV2 } from "./carga-v2";

/**
 * O ramo do worker que publica o que já foi aprovado.
 *
 * A diferença com o caminho legado não é de estilo: o legado RECEBE uma vaga e
 * PRODUZ o post (chama o modelo, escreve a copy, escolhe a imagem, desenha os
 * slides). Este recebe o post inteiro e só o entrega.
 *
 * Ele nem desenha mais. A peça foi congelada num arquivo quando o pipeline a
 * aprovou, e aqui o trabalho é conferir que o arquivo continua sendo aquele. O
 * que ele não pode fazer, e por que está separado num módulo próprio:
 *
 *   - não chama gerador de copy, então manchete, legenda, CTA e hashtags
 *     chegam ao Instagram como o Social Guard as aprovou;
 *   - não renderiza nada, então tema do banco, desenho do painel, fontes da
 *     rede e foto do Commons não entram mais na conta na hora de publicar;
 *   - não importa `opendesign-renderer`, que puxa banco de fotos de estoque;
 *   - não importa nada de `prompt-system`, onde vive a geração de imagem por
 *     IA.
 *
 * As ausências são verificáveis lendo o grafo de imports deste arquivo, e
 * `worker-v2-alcance.test.ts` as verifica. Um mock não provaria isso: mock
 * demonstra que não foi chamado nesta execução, e o que se quer afirmar é que
 * não HÁ caminho.
 */

/** Vai no `error_message`, na mesma convenção de `PUBLICAÇÃO INCERTA:`. */
export const MOTIVO_HASH_DIVERGENTE = "SOCIAL_ARTIFACT_HASH_MISMATCH";

export type ArtefatoVerificado = {
  url: string;
  filename: string;
  sha256: string;
  bytes: number;
};

export type OpcoesDoArtefato = {
  socialPostId: string;
  fetcher?: typeof fetch;
  tetoMs?: number;
};

/**
 * Baixa o arquivo aprovado e confere que ele é o mesmo.
 *
 * A pergunta que isto responde: os bytes que a Meta vai buscar são os bytes que
 * passaram pelo Social Guard? O Storage é confiável, mas "confiável" não é o
 * mesmo que "provado" — um arquivo sobrescrito por engano, um bucket
 * restaurado de backup, um caminho reaproveitado, e a peça publicada deixa de
 * ser a peça aprovada sem que nada acuse.
 *
 * Divergência não é tratada como erro de rede: é recusa. Publicar um arquivo
 * cujo conteúdo não se conhece é pior que não publicar.
 */
export async function verificarArtefato(
  carga: CargaV2,
  opcoes: OpcoesDoArtefato,
): Promise<ArtefatoVerificado> {
  const verificados = await verificarArtefatos(carga, opcoes);
  return verificados[0];
}

/**
 * Confere TODOS os arquivos aprovados, e recusa a peça inteira se um divergir.
 *
 * Nada de publicar carrossel pela metade. Um slide que não é o aprovado torna a
 * peça outra peça: publicar os cinco que conferem seria publicar um carrossel
 * que ninguém aprovou, com um buraco no meio da explicação. E parar no primeiro
 * divergente é de propósito: o objetivo não é catalogar o estrago, é não
 * publicar.
 *
 * A conferência acontece ANTES de qualquer chamada à Meta. Nenhum container é
 * criado enquanto um hash estiver em dúvida, porque container criado é lixo que
 * fica pendurado na conta e, pior, é candidato a ser publicado por uma
 * reconciliação futura.
 */
export async function verificarArtefatos(
  carga: CargaV2,
  opcoes: OpcoesDoArtefato,
): Promise<ArtefatoVerificado[]> {
  const fetcher = opcoes.fetcher ?? fetch;
  const verificados: ArtefatoVerificado[] = [];

  for (const artefato of carga.artefatos) {
    const onde = carga.artefatos.length > 1 ? `slide ${artefato.index}: ` : "";

    const resposta = await fetcher(artefato.url, {
      // O MP4 do Reel pesa dezenas de MB; a imagem, centenas de KB.
      signal: AbortSignal.timeout(opcoes.tetoMs ?? (artefato.mime === "video/mp4" ? 120_000 : 30_000)),
    });

    if (!resposta.ok) {
      throw new Error(
        `${onde}não consegui baixar o artefato aprovado (${resposta.status}) de ${artefato.url.slice(0, 100)}`,
      );
    }

    const bytes = Buffer.from(await resposta.arrayBuffer());

    if (bytes.byteLength === 0) {
      throw new Error(`${onde}o artefato aprovado voltou vazio de ${artefato.url.slice(0, 100)}`);
    }

    const hash = sha256De(bytes);

    if (hash !== artefato.sha256) {
      throw new Error(
        `${MOTIVO_HASH_DIVERGENTE}: ${onde}o arquivo em ${artefato.path} não é o aprovado. ` +
          `Esperado ${artefato.sha256.slice(0, 16)} (${artefato.bytes} bytes), ` +
          `veio ${hash.slice(0, 16)} (${bytes.byteLength} bytes).`,
      );
    }

    /*
     * O tamanho é conferido junto, e não porque o hash já não bastasse: bytes
     * iguais implicam tamanho igual. Serve para o log dizer O QUE mudou quando
     * algo muda, em vez de só dizer que mudou.
     */
    verificados.push({
      url: artefato.url,
      filename: artefato.filename,
      sha256: hash,
      bytes: bytes.byteLength,
    });
  }

  if (verificados.length !== carga.artefatos.length) {
    throw new Error(
      `${MOTIVO_HASH_DIVERGENTE}: ${verificados.length} de ${carga.artefatos.length} arquivos conferidos`,
    );
  }

  return verificados;
}
