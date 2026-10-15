import type { AssetVisual, EntidadeVisual, TipoDeContextoDaImagem } from "../tipos";
import { ehPessoa, normalizarEntidade } from "../tipos";
import type { Acervo, FaltaNoAcervo, ImagemDoAcervo, MotivoDaFalta, TipoDeFalta } from "./acervo";
import { ASSUNTO_POR_QID } from "./entidades";

/**
 * O pedaço do resolvedor que fala com o acervo próprio.
 *
 * Mora fora de `resolver.ts` para o diff do resolvedor ser só a ORDEM (onde o
 * acervo entra) e não o COMO (janela, falta, conversão para asset). O resolvedor
 * já tem 900 linhas, e cada uma delas é cicatriz de incidente.
 */

export type ContextoDaBusca = {
  storyId: string;
  titulo: string;
  janelaEmDias: number;
  /** Fotos já escolhidas nesta edição, por URL. */
  usadosAgora: Set<string>;
  /** Foto já saiu em dia anterior? Pela identidade, sem parâmetros de entrega. */
  jaSaiu: (url: string) => boolean;
  agoraMs?: number;
};

export type ResultadoDaBusca = {
  escolhida: ImagemDoAcervo | null;
  encontradas: number;
  falta: MotivoDaFalta | null;
  nota: string;
};

/** Usada dentro da janela de repetição (EDITORIAL_JANELA_IMAGEM_DIAS)? */
export function usadaNaJanela(img: ImagemDoAcervo, janelaEmDias: number, agoraMs = Date.now()): boolean {
  if (!img.ultimoUsoEm) return false;
  const quando = new Date(img.ultimoUsoEm).getTime();
  if (Number.isNaN(quando)) return false;
  return quando >= agoraMs - janelaEmDias * 24 * 60 * 60 * 1000;
}

/**
 * As chaves de assunto que uma entidade pode ter no nome do arquivo.
 *
 * "Donald Trump" vira `donald_trump`, "Casa Branca" vira `casa_branca`. Vale o
 * nome como o Wikidata devolveu e a forma normalizada que a biblioteca usa,
 * porque um deles pode estar em inglês e o designer nomeia em português.
 */
export function assuntosDaEntidade(entidade: EntidadeVisual): string[] {
  const nomes = [entidade.nome, entidade.normalizado];
  /*
   * O QID vem primeiro (14/10/2026): o rótulo muda com o idioma da busca
   * ("Federal Reserve", "Sistema de Reserva Federal"), o identificador não.
   */
  const peloQid = entidade.qid ? ASSUNTO_POR_QID[entidade.qid.toUpperCase()] : undefined;
  return [
    ...new Set(
      [peloQid ?? "", ...nomes.map((n) => normalizarEntidade(n ?? "").replace(/ /g, "_"))].filter((n) => n.length >= 2),
    ),
  ];
}

/**
 * Filtra o que o acervo devolveu e escolhe a primeira disponível.
 *
 * A ordem já vem do banco (menos usada recentemente primeiro), então "a
 * primeira que passa" espalha o uso pela tag inteira.
 */
export function escolherDoAcervo(candidatas: ImagemDoAcervo[], ctx: ContextoDaBusca): ResultadoDaBusca {
  if (candidatas.length === 0) {
    return { escolhida: null, encontradas: 0, falta: "vazio", nota: "nenhuma foto no acervo" };
  }

  let naJanela = 0;
  let naEdicao = 0;
  for (const c of candidatas) {
    if (usadaNaJanela(c, ctx.janelaEmDias, ctx.agoraMs) || ctx.jaSaiu(c.urlPublica)) {
      naJanela += 1;
      continue;
    }
    if (ctx.usadosAgora.has(c.urlPublica)) {
      naEdicao += 1;
      continue;
    }
    return {
      escolhida: c,
      encontradas: candidatas.length,
      falta: null,
      nota: `${c.arquivo} (${candidatas.length} na prateleira, ${naJanela} na janela de ${ctx.janelaEmDias} dias)`,
    };
  }

  return {
    escolhida: null,
    encontradas: candidatas.length,
    falta: "janela",
    nota:
      `${candidatas.length} foto(s), todas indisponíveis: ${naJanela} na janela de ${ctx.janelaEmDias} dias, ` +
      `${naEdicao} já escolhida(s) nesta edição`,
  };
}

/**
 * Grava a falta, e nunca derruba a resolução por isso.
 *
 * A lista de compras é registro, não decisão. Tabela ausente (o dono ainda não
 * rodou a migration) ou rede fora custam a linha da lista, nunca a foto do dia.
 * O erro volta como texto para entrar na nota do resolvedor, que é onde o
 * diagnóstico do ramo visual é lido.
 */
export async function anotarFalta(
  acervo: Acervo,
  tipo: TipoDeFalta,
  chave: string,
  pais: string,
  motivo: MotivoDaFalta,
  ctx: Pick<ContextoDaBusca, "storyId" | "titulo">,
): Promise<string> {
  if (!acervo.gravarFaltas || !chave || !ctx.storyId) return "";
  const falta: FaltaNoAcervo = { storyId: ctx.storyId, tipo, chave, pais, motivo, titulo: ctx.titulo };
  try {
    await acervo.registrarFalta(falta);
    return "falta anotada na lista de compras";
  } catch (erro) {
    return `falta NÃO anotada: ${(erro as Error).message}`;
  }
}

/** Uso marcado, e o mesmo princípio: falha vira nota, não exceção. */
export async function marcarUso(acervo: Acervo, img: ImagemDoAcervo): Promise<string> {
  if (!acervo.gravarUso) return "";
  try {
    await acervo.registrarUso(img.id);
    return "";
  } catch (erro) {
    return `uso NÃO marcado: ${(erro as Error).message}`;
  }
}

function contextoDaImagem(entidade: EntidadeVisual | null, img: ImagemDoAcervo): TipoDeContextoDaImagem {
  if (!entidade || entidade.tipo === "conceptual") return "conceptual";
  if (ehPessoa(entidade.tipo)) return "entity_portrait";
  if (entidade.tipo === "place") return "place";
  if (entidade.tipo === "company") return "company";
  if (entidade.tipo === "institution" || entidade.tipo === "government_agency") return "institution";
  return img.grupo === "pessoas" ? "entity_portrait" : "conceptual";
}

/**
 * A foto do acervo no vocabulário do resolvedor.
 *
 * `rightsStatus` é o que a linha grava, sem filtro: a trava de licença saiu
 * (29/09/2026) e o registro ficou. `attribution` vazia porque a foto é nossa;
 * quando o acervo receber foto licenciada de terceiro com crédito obrigatório,
 * o autor está na linha e entra aqui.
 */
export function assetDoAcervo(img: ImagemDoAcervo, entidade: EntidadeVisual | null): AssetVisual {
  const agora = new Date().toISOString();
  const contexto = contextoDaImagem(entidade, img);
  const rights = (["verified", "unknown", "revoked", "needs_review"] as const).find((r) => r === img.rightsStatus);

  return {
    id: img.id,
    entityName: entidade?.nome ?? img.tag,
    entityNormalized: entidade?.normalizado ?? img.tag,
    entityType: entidade?.tipo ?? "conceptual",
    source: "acervo_proprio",
    sourceAssetId: img.arquivo,
    imageUrl: img.urlPublica,
    // A página do original (Commons, banco oficial) quando a curadoria a gravou.
    sourcePageUrl: /^https?:\/\//.test(img.originalRef ?? "") ? (img.originalRef as string) : img.urlPublica,
    author: img.autor,
    license: img.licenca || "acervo próprio",
    licenseUrl: "",
    // Foto de terceiro no acervo continua devendo o crédito ao autor (14/10/2026).
    attribution: img.autor ? `${img.autor} (${img.licenca || "acervo próprio"})` : "",
    rightsStatement: "acervo próprio do projeto; conferido na ingestão",
    rightsStatus: rights ?? "unknown",
    rightsCheckedAt: agora,
    sourceLastCheckedAt: agora,
    width: img.largura,
    height: img.altura,
    mimeType: "image/jpeg",
    storagePath: img.caminho,
    perceptualHash: null,
    /*
     * Nota cheia porque a régua de relevância não roda sobre o acervo: quem
     * decidiu que esta foto serve para esta tag foi a curadoria, na entrada.
     */
    imageRelevanceScore: 100,
    imageContextType: contexto,
    metadata: {
      acervo: {
        id: img.id,
        arquivo: img.arquivo,
        tag: img.tag,
        pais: img.pais,
        repositorio: img.repositorio,
        tom: img.tom,
        orientacao: img.orientacao,
        luminanciaDoTopo: img.luminanciaDoTopo,
      },
    },
  };
}
