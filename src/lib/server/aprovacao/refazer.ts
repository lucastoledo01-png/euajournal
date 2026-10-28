import type { Aprovacao, Etapa, Ramo, ResumoDaPeca } from "./contrato";
import type { PecaParaFila } from "./fila";
import type { AprendizadoDoCanal } from "../aprendizado/do-canal";

/**
 * O despacho da refação: refazer SÓ a etapa culpada (RF-22), 05/10/2026.
 *
 * A reprovação aponta uma etapa, e o sistema refaz aquela e o que depende
 * dela, nada antes. Reprovar a imagem chama a resolução visual e a arte, e não
 * chama o redator: o texto foi aprovado, e reescrevê-lo junto trocaria uma peça
 * com um defeito por uma peça com defeitos novos que ninguém olhou.
 *
 * A dependência é para a FRENTE, nunca para trás:
 *
 *   selecao  ->  refaz a peça inteira (outra pauta)
 *   texto    ->  texto, e a arte do post, porque a manchete está impressa nela
 *   imagem   ->  imagem e arte
 *   arte     ->  só a arte
 *
 * Cada etapa é um gancho tipado. Onde a regeneração ainda não está ligada, o
 * gancho padrão responde `ETAPA_SEM_REGENERACAO` e a peça fica em `refazendo`
 * com o motivo no resumo, à espera de quem saiba refazê-la. Inventar uma
 * regeneração aqui, sem o contexto da pauta, seria escrever um segundo
 * gerador do lado de fora do gerador.
 */

export type ContextoDaRefacao = {
  aprovacao: Aprovacao;
  etapa: Etapa;
  /** O bloco "não repetir" da memória de reprovação, pronto para o prompt da etapa. */
  naoRepetir: string;
  /** O motivo desta reprovação, escrito pelo editor. */
  motivo: string;
  /** Newsletter: a pauta que o editor apontou (`storyId`), quando apontou. */
  alvo?: string | null;
  /**
   * O que o CANAL desta peça aprendeu com as reprovações dele (06/10/2026): a
   * seleção evita a fonte e o ator recusados, a imagem evita a foto recusada
   * e leva o motivo para a cena, a arte troca a decisão recusada. Ausente,
   * cada etapa refaz como antes.
   */
  aprendizado?: AprendizadoDoCanal;
  /**
   * A etapa que o editor CULPOU. `etapa` é a que está rodando agora: a arte
   * roda depois do texto e da imagem, e só deve trocar a decisão de arte
   * quando foi ela a recusada.
   */
  culpada?: Etapa;
};

/**
 * O que uma etapa devolve.
 *
 * `substituta` só vem da SELEÇÃO do artigo e do post (06/10/2026): a peça
 * reprovada sai, e uma peça NOVA, de outra pauta, entra na fila no lugar dela.
 * Quem enfileira é a fila, com as dependências dela; a etapa só produz e grava
 * a peça na tabela do canal.
 *
 * Falha técnica (rede, banco fora) LANÇA, e não volta como `ok: false`: o
 * processador devolve a refação à fila para tentar de novo. `ok: false` é o
 * "não dá", que vai para o painel com o motivo.
 */
export type ResultadoDaEtapa =
  | {
      ok: true;
      resumo?: Partial<ResumoDaPeca>;
      substituta?: PecaParaFila;
      detalhe?: string;
      /**
       * A versão nova é feita FORA daqui (o Reel, pelo Claude no MCP): a etapa
       * só devolveu o pedido, e as etapas seguintes não rodam. O texto diz ao
       * painel o que se espera.
       */
      assincrona?: string;
    }
  | { ok: false; motivo: string };

export type GanchoDeEtapa = (ctx: ContextoDaRefacao) => Promise<ResultadoDaEtapa>;

/** Um gancho por etapa e por ramo. Ausente vale "sem regeneração ligada". */
export type GanchosDeRefazer = Partial<Record<Ramo, Partial<Record<Etapa, GanchoDeEtapa>>>>;

export const MOTIVO_SEM_REGENERACAO = "ETAPA_SEM_REGENERACAO";

/** Há gancho para todas as etapas que esta reprovação pede? Sem isso, nem vale agendar. */
export function etapaSemGancho(ramo: Ramo, etapa: Etapa, ganchos: GanchosDeRefazer): Etapa | null {
  for (const e of etapasARefazer(ramo, etapa)) if (!ganchos[ramo]?.[e]) return e;
  return null;
}

/** O que é refeito quando a etapa é culpada. A ordem é a de execução. */
export function etapasARefazer(ramo: Ramo, etapa: Etapa): Etapa[] {
  if (etapa === "selecao") return ["selecao"];
  if (ramo !== "post") return [etapa];
  if (etapa === "texto") return ["texto", "arte"];
  if (etapa === "imagem") return ["imagem", "arte"];
  return ["arte"];
}

export type ResultadoDaRefacao =
  | {
      ok: true;
      executadas: Etapa[];
      resumo: Partial<ResumoDaPeca>;
      substituta?: PecaParaFila;
      detalhes: string[];
      assincrona?: string;
    }
  | { ok: false; executadas: Etapa[]; falhou: Etapa; motivo: string };

/**
 * Executa as etapas em ordem e para na primeira que não conseguir.
 *
 * Parar é o certo: a arte refeita sobre uma imagem que não foi refeita
 * congelaria de novo a mesma peça reprovada, com hash novo, e ela voltaria à
 * fila parecendo corrigida.
 */
export async function executarRefacao(
  ctx: ContextoDaRefacao,
  ganchos: GanchosDeRefazer,
): Promise<ResultadoDaRefacao> {
  const ramo = ctx.aprovacao.ramo;
  const executadas: Etapa[] = [];
  const detalhes: string[] = [];
  let resumo: Partial<ResumoDaPeca> = {};
  let substituta: PecaParaFila | undefined;

  for (const etapa of etapasARefazer(ramo, ctx.etapa)) {
    const gancho = ganchos[ramo]?.[etapa];
    if (!gancho) {
      return {
        ok: false,
        executadas,
        falhou: etapa,
        motivo: `${MOTIVO_SEM_REGENERACAO}: a etapa "${etapa}" do ramo ${ramo} ainda não tem regeneração automática`,
      };
    }
    const r = await gancho({ ...ctx, etapa, culpada: ctx.culpada ?? ctx.etapa });
    if (!r.ok) return { ok: false, executadas, falhou: etapa, motivo: r.motivo };
    executadas.push(etapa);
    resumo = { ...resumo, ...(r.resumo ?? {}) };
    if (r.detalhe) detalhes.push(r.detalhe);
    if (r.substituta) substituta = r.substituta;
    if (r.assincrona) return { ok: true, executadas, resumo, detalhes, assincrona: r.assincrona };
  }

  return { ok: true, executadas, resumo, detalhes, ...(substituta ? { substituta } : {}) };
}
