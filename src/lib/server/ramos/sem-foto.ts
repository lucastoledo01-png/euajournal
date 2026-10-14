import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoVisual } from "../visual/tipos";
import { ehImagemDaBandeira, ehUltimoRecurso } from "../visual/bandeira";

/**
 * Pauta sem foto não vira conteúdo (decisão do dono, 05/10/2026).
 *
 * Até aqui valia a regra de 17/09/2026, "nenhuma peça sem imagem": quando a
 * busca não achava foto DA PAUTA, o resolvedor devolvia a bandeira americana
 * com `status: NO_VALID_IMAGE`, e a peça saía com ela. A decisão nova inverte
 * o caso: sem foto real da pauta, a pauta não sai em canal nenhum (newsletter,
 * matéria do portal, post do Instagram). A bandeira continua existindo no
 * resolvedor só como marcador interno, e nunca é publicada.
 *
 * Três regras, e o motivo de cada uma:
 *
 *   1. **A régua é uma só, aqui.** "Tem foto" é `status === "SELECTED"` com
 *      URL, e o asset NÃO é o último recurso. Status sozinho já bastaria hoje,
 *      mas a bandeira já mudou de significado uma vez (o incidente de 18/09,
 *      em que a newsletter lia `status` e o campo tinha mudado de sentido), e
 *      conferir os dois custa uma linha.
 *   2. **Cai ANTES da redação, sempre que dá.** A imagem é resolvida a partir
 *      do título da fonte e da classificação, que existem antes do texto. Então
 *      a pauta sem foto sai antes de alguém pagar para escrevê-la.
 *   3. **A seleção anda para a próxima.** Tirar a pauta e encolher o canal
 *      seria trocar um defeito por outro. Quem chama refaz a seleção sem as
 *      pautas sem foto, e a vaga vai para a próxima elegível, até a seleção
 *      parar de mudar.
 *
 * O código do motivo é `REJECT_NO_PHOTO`, no formato `CODIGO: explicação` que
 * o painel de logs agrupa (`painel-logs.ts`).
 */

export const MOTIVO_SEM_FOTO = "REJECT_NO_PHOTO";

/** O evento em `platform_events` com as pautas que caíram por falta de foto. */
export const EVENTO_SEM_FOTO = "pauta_sem_foto";

/** A pauta tem foto de verdade, publicável? Ver a regra 1 acima. */
export function temFotoDaPauta(r: ResultadoVisual | null | undefined): boolean {
  if (!r || r.status !== "SELECTED") return false;
  const url = r.asset?.imageUrl ?? "";
  if (!url) return false;
  if (ehUltimoRecurso(r.asset)) return false;
  return !ehImagemDaBandeira(url);
}

/** O texto do motivo, já no formato que o painel agrupa. */
export function motivoSemFoto(r: ResultadoVisual | null | undefined, erro?: string): string {
  if (erro) return `${MOTIVO_SEM_FOTO}: a resolução de imagem falhou (${erro.slice(0, 160)})`;
  if (!r) return `${MOTIVO_SEM_FOTO}: sem resultado do resolvedor`;
  if (r.asset && ehUltimoRecurso(r.asset)) {
    return `${MOTIVO_SEM_FOTO}: só a bandeira de último recurso (${r.motivo ?? r.status})`;
  }
  return `${MOTIVO_SEM_FOTO}: ${r.motivo ?? r.status}`;
}

export type QuedaSemFoto = { storyId: string; titulo: string; motivo: string };

/**
 * A memória da pergunta "esta pauta tem foto?" dentro de uma execução.
 *
 * Os canais refazem a seleção várias vezes até ela parar de mudar, e cada
 * rodada pergunta de novo pelas mesmas pautas. A memória guarda a PROMESSA,
 * para duas perguntas simultâneas da mesma pauta não resolverem em paralelo,
 * e é o que garante que o canal que escreve depois veja exatamente a foto que
 * a seleção viu.
 */
export type FotosDoDia<P> = {
  resultado(p: P): Promise<{ visual: ResultadoVisual | null; erro?: string }>;
  temFoto(p: P): Promise<boolean>;
  /** O que já foi resolvido para uma pauta, sem resolver. */
  jaResolvido(storyId: string): ResultadoVisual | null | undefined;
};

export function criarFotosDoDia<P>(
  chave: (p: P) => string,
  resolver: (p: P) => Promise<ResultadoVisual | null>,
): FotosDoDia<P> {
  const memoria = new Map<string, Promise<{ visual: ResultadoVisual | null; erro?: string }>>();
  const prontos = new Map<string, ResultadoVisual | null>();

  const resultado = (p: P) => {
    const k = chave(p);
    const ja = memoria.get(k);
    if (ja) return ja;
    const promessa = (async () => {
      try {
        const visual = await resolver(p);
        prontos.set(k, visual);
        return { visual };
      } catch (erro) {
        /*
         * Falha técnica é "sem foto", nunca passe livre: é a mesma régua da
         * conferência visual de 17/09 ("falha de conferência é recusa"). O
         * motivo leva o erro, para o painel separar as duas coisas.
         */
        prontos.set(k, null);
        return { visual: null, erro: erro instanceof Error ? erro.message : String(erro) };
      }
    })();
    memoria.set(k, promessa);
    return promessa;
  };

  return {
    resultado,
    temFoto: async (p) => temFotoDaPauta((await resultado(p)).visual),
    jaResolvido: (storyId) => prontos.get(storyId),
  };
}

/**
 * Refaz a seleção até todas as escolhidas terem foto.
 *
 * `selecionar` recebe o conjunto de `storyId` proibidos e devolve a seleção do
 * canal; `escolhidas` tira dela a lista de pautas. A cada rodada, as
 * escolhidas sem foto entram no conjunto e a seleção é refeita, e a vaga vai
 * para a próxima elegível. Termina quando nenhuma escolhida nova cai, o que
 * acontece em no máximo uma rodada por pauta do pool.
 */
export async function selecionarComFoto<P, S>(e: {
  selecionar: (excluir: Set<string>) => S;
  escolhidas: (s: S) => P[];
  chave: (p: P) => string;
  titulo: (p: P) => string;
  fotos: FotosDoDia<P>;
  /** Proibidas de saída, por exemplo as que outra rodada já achou sem foto. */
  excluirDeInicio?: Iterable<string>;
  /**
   * Falso no portal e na newsletter (dono, 14/10/2026): ali a pauta sem foto
   * sai com capa tipográfica, e não cai. Só o Instagram continua exigindo
   * foto, porque no feed é a foto que faz a pessoa parar.
   */
  exigirFoto?: boolean;
}): Promise<{ selecao: S; semFoto: QuedaSemFoto[]; excluidas: Set<string> }> {
  const excluir = new Set<string>(e.excluirDeInicio ?? []);
  if (e.exigirFoto === false) return { selecao: e.selecionar(excluir), semFoto: [], excluidas: excluir };
  const semFoto: QuedaSemFoto[] = [];
  let selecao = e.selecionar(excluir);

  for (let rodada = 0; rodada < 1000; rodada += 1) {
    const atuais = e.escolhidas(selecao);
    /*
     * Em sequência, e não em paralelo: o resolvedor evita repetir a foto que
     * outra pauta do dia já levou (`jaUsadosNestaEdicao`), e duas resoluções
     * simultâneas escolheriam a mesma foto sem ver uma à outra. É a causa 3 de
     * "A mesma foto em quatro posts".
     */
    let caiu = false;
    for (const p of atuais) {
      const r = await e.fotos.resultado(p);
      if (temFotoDaPauta(r.visual)) continue;
      const k = e.chave(p);
      if (excluir.has(k)) continue;
      excluir.add(k);
      semFoto.push({ storyId: k, titulo: e.titulo(p), motivo: motivoSemFoto(r.visual, r.erro) });
      caiu = true;
    }
    if (!caiu) break;
    selecao = e.selecionar(excluir);
  }

  return { selecao, semFoto, excluidas: excluir };
}

/**
 * Quais pautas de uma peça JÁ ESCRITA ficaram sem foto, pela foto decidida.
 *
 * É a rede de depois da resolução, para os caminhos em que a foto da edição
 * não sai da mesma resolução que a seleção conferiu (o resolvedor da fase 1,
 * o ranker antigo). Ali não dá para cair antes de escrever, então cai logo
 * depois de a foto ser decidida, e antes de qualquer coisa ir ao ar. URL vazia
 * e bandeira contam como sem foto.
 */
export function separarPautasSemFoto<S>(
  pautas: S[],
  fotoDa: (pauta: S) => string | null | undefined,
): { ficam: number[]; saem: number[] } {
  const ficam: number[] = [];
  const saem: number[] = [];
  pautas.forEach((p, i) => {
    const url = (fotoDa(p) ?? "").trim();
    if (!url || ehImagemDaBandeira(url)) saem.push(i);
    else ficam.push(i);
  });
  return { ficam, saem };
}

/** As linhas de log das quedas, uma por pauta, com o canal na frente. */
export function linhasDasQuedas(canal: string, quedas: QuedaSemFoto[]): string[] {
  return quedas.map((q) => `[RAMO ${canal}] pauta sem foto não vira conteúdo :: ${q.motivo} :: ${q.titulo.slice(0, 70)}`);
}

/**
 * O registro das quedas em `platform_events`.
 *
 * O formato do payload repete o de `social_cycle_diagnostic` de propósito
 * (`descartados` com `etapa`, `motivo` e `titulo`): o painel de logs já sabe
 * ler essa lista e agrupar pelo código. Gravar nunca derruba o ciclo; devolve
 * o motivo para quem chamou pôr no log.
 */
export async function gravarQuedasSemFoto(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  canal: string,
  quedas: QuedaSemFoto[],
  contexto: { data: string; dryRun: boolean },
): Promise<string | null> {
  if (quedas.length === 0) return null;
  try {
    const { error } = await client.from("platform_events").insert({
      event_type: EVENTO_SEM_FOTO,
      project_id: projectId,
      payload: montarPayloadDasQuedas(canal, quedas, contexto),
    });
    return error ? error.message : null;
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

export function montarPayloadDasQuedas(
  canal: string,
  quedas: QuedaSemFoto[],
  contexto: { data: string; dryRun: boolean },
) {
  return {
    data: contexto.data,
    dryRun: contexto.dryRun,
    canal,
    motivo: MOTIVO_SEM_FOTO,
    total: quedas.length,
    descartados: quedas.slice(0, 30).map((q) => ({
      etapa: `sem_foto_${canal}`,
      storyId: q.storyId,
      titulo: q.titulo.slice(0, 240),
      motivo: q.motivo.slice(0, 240),
    })),
  };
}
