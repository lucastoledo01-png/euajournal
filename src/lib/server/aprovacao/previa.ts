import type { SupabaseClient } from "@supabase/supabase-js";
import type { Aprovacao, Ramo } from "./contrato";
import { hashDaNewsletter, hashDoArtigo, hashDoPostDaLinha } from "./hash";

/**
 * O que vai ao ar, lido da tabela da peça, para a fila mostrar a PEÇA e não
 * o resumo dela (06/10/2026).
 *
 * Até aqui o cartão mostrava o que a linha da fila guardou: a capa, o título e
 * o pacote factual. O dono abriu a fila e não viu a newsletter, nem a matéria,
 * nem o post: viu os fatos brutos. Aprovar é aprovar o que vai ao ar, então o
 * cartão lê o que vai ao ar, da mesma linha de onde o portão calcula o hash.
 *
 * `hashConfere` diz se a linha ainda é a versão que entrou na fila. Quando não
 * é, aprovar é recusado pelo servidor ("a peça mudou depois de entrar na
 * fila"), e o painel avisa ANTES do clique.
 *
 * O HTML inteiro do e-mail e o corpo da matéria não vêm aqui: cada um tem a
 * sua prévia (`/api/admin/aprovacao/previa` e `/admin/<projeto>/aprovacao/previa/<id>`),
 * carregada só quando o cartão aparece. A lista fica leve no celular.
 */

export type PreviaDaNewsletter = {
  ramo: "newsletter";
  assunto: string;
  preheader: string;
  dataDaEdicao: string;
  statusNaTabela: string;
  noAr: boolean;
  hashConfere: boolean;
};

export type PreviaDoArtigo = {
  ramo: "artigo";
  titulo: string;
  linhaFina: string;
  capa: string | null;
  editoria: string;
  assuntos: string[];
  perguntas: number;
  palavras: number;
  slug: string;
  statusNaTabela: string;
  publicadoEm: string | null;
  noAr: boolean;
  hashConfere: boolean;
};

export type PreviaDoPost = {
  ramo: "post";
  legenda: string;
  manchete: string;
  /** As telas congeladas, na ordem de publicação: o que o worker sobe para a Meta. */
  telas: string[];
  formato: "post único" | "carrossel" | "reel";
  agendadoPara: string | null;
  publicadoEm: string | null;
  statusNaTabela: string;
  /** O motivo que o portão ou o worker gravaram na linha, quando há. */
  mensagem: string | null;
  noAr: boolean;
  hashConfere: boolean;
};

export type PreviaDaPeca = PreviaDaNewsletter | PreviaDoArtigo | PreviaDoPost | { ramo: Ramo; ausente: true };

type Linha = Record<string, unknown>;

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function palavrasDoHtml(html: string): number {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * As telas congeladas do post, na ordem. A fonte é a mesma do hash
 * (`conteudoDoPostDaLinha`): o manifesto, e na falta dele `content_json.arte`.
 */
export function telasDoPost(linha: Linha): string[] {
  const ordenar = (lista: unknown[]) =>
    lista
      .map((bruto, i) => {
        const item = (bruto ?? {}) as { index?: unknown; url?: unknown };
        const index = Number(item.index);
        return { index: Number.isFinite(index) ? index : i + 1, url: s(item.url) };
      })
      .filter((x) => x.url)
      .sort((a, b) => a.index - b.index)
      .map((x) => x.url);

  const manifesto = Array.isArray(linha.slides_manifest) ? ordenar(linha.slides_manifest as unknown[]) : [];
  if (manifesto.length > 0) return manifesto;
  const arte = ((linha.content_json ?? {}) as { arte?: { artefatos?: unknown; artefato?: unknown } }).arte;
  if (Array.isArray(arte?.artefatos)) return ordenar(arte.artefatos as unknown[]);
  if (arte?.artefato) return ordenar([arte.artefato]);
  return [];
}

function ehReelDaLinha(linha: Linha): boolean {
  return s(((linha.content_json ?? {}) as { formato?: unknown }).formato) === "reel";
}

export function previaDoPost(linha: Linha, a: Pick<Aprovacao, "hashArtefato">): PreviaDoPost {
  const telas = telasDoPost(linha);
  const status = s(linha.status);
  return {
    ramo: "post",
    legenda: s(linha.caption),
    manchete: s(linha.title),
    telas,
    // O Reel é decidido pelo registro, nunca pela contagem: um vídeo é uma tela só.
    formato: ehReelDaLinha(linha) ? "reel" : telas.length > 1 ? "carrossel" : "post único",
    agendadoPara: s(linha.scheduled_at) || null,
    publicadoEm: s(linha.published_at) || null,
    statusNaTabela: status,
    mensagem: s(linha.error_message) || null,
    noAr: status === "published",
    hashConfere: hashDoPostDaLinha(linha) === a.hashArtefato,
  };
}

export function previaDoArtigo(linha: Linha, a: Pick<Aprovacao, "hashArtefato">): PreviaDoArtigo {
  const tags = Array.isArray(linha.tags) ? (linha.tags as unknown[]).map(s) : [];
  const html = s(linha.content_html);
  const status = s(linha.status);
  return {
    ramo: "artigo",
    titulo: s(linha.title),
    linhaFina: s(linha.description) || s(linha.excerpt),
    capa: s(linha.cover_image) || null,
    editoria: s(linha.category),
    assuntos: tags.filter((t) => t.startsWith("assunto:")).map((t) => t.slice("assunto:".length)),
    perguntas: Array.isArray(linha.aeo_questions) ? (linha.aeo_questions as unknown[]).length : 0,
    palavras: palavrasDoHtml(html),
    slug: s(linha.slug),
    statusNaTabela: status,
    publicadoEm: s(linha.published_at) || null,
    noAr: status === "published",
    hashConfere: hashDoArtigo(s(linha.title), html, s(linha.cover_image)) === a.hashArtefato,
  };
}

/**
 * A newsletter "no ar": liberada pela fila, ou, fora de `enforce`, gravada
 * como publicada com o horário de envio já passado. Fora de `enforce` quem
 * envia é o caminho de sempre, e a edição gravada `published` é a que saiu.
 */
export function previaDaNewsletter(
  linha: Linha,
  a: Pick<Aprovacao, "hashArtefato" | "liberadoEm" | "publicarEm">,
  modo: string,
  agoraMs: number,
): PreviaDaNewsletter {
  const status = s(linha.status);
  const horario = a.publicarEm ? Date.parse(a.publicarEm) : NaN;
  const passou = !Number.isFinite(horario) || horario <= agoraMs;
  return {
    ramo: "newsletter",
    assunto: s(linha.subject),
    preheader: s(linha.preheader),
    dataDaEdicao: s(linha.edition_date),
    statusNaTabela: status,
    noAr: Boolean(a.liberadoEm) || (modo !== "enforce" && status === "published" && passou),
    hashConfere: hashDaNewsletter(s(linha.subject), s(linha.content_html)) === a.hashArtefato,
  };
}

async function lerLinhas(client: SupabaseClient, tabela: string, colunas: string, projectId: string, ids: string[]): Promise<Map<string, Linha>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client.from(tabela).select(colunas).eq("project_id", projectId).in("id", ids);
  // "Não consegui ler" sobe, e não vira "a peça sumiu" (lição de 13/09/2026).
  if (error) throw new Error(`[FILA] prévia: não consegui ler ${tabela}: ${error.message}`);
  return new Map(((data ?? []) as unknown as Linha[]).map((l) => [String(l.id), l]));
}

/** As prévias da fila inteira, três leituras no total, uma por tabela. */
export async function previasDaFila(
  client: SupabaseClient,
  projectId: string,
  fila: Aprovacao[],
  modo: string,
  agoraMs = Date.now(),
): Promise<Record<string, PreviaDaPeca>> {
  const ids = (ramo: Ramo) => [...new Set(fila.filter((a) => a.ramo === ramo).map((a) => a.pecaId))];
  const [posts, artigos, edicoes] = await Promise.all([
    lerLinhas(client, "social_posts", "id, status, title, caption, scheduled_at, published_at, slides_manifest, content_json, error_message", projectId, ids("post")),
    lerLinhas(client, "articles", "id, slug, status, title, description, excerpt, category, cover_image, content_html, tags, aeo_questions, published_at", projectId, ids("artigo")),
    lerLinhas(client, "news_editions", "id, status, subject, preheader, edition_date, content_html", projectId, ids("newsletter")),
  ]);

  const saida: Record<string, PreviaDaPeca> = {};
  for (const a of fila) {
    const linha = (a.ramo === "post" ? posts : a.ramo === "artigo" ? artigos : edicoes).get(a.pecaId);
    if (!linha) {
      saida[a.id] = { ramo: a.ramo, ausente: true };
      continue;
    }
    saida[a.id] =
      a.ramo === "post"
        ? previaDoPost(linha, a)
        : a.ramo === "artigo"
          ? previaDoArtigo(linha, a)
          : previaDaNewsletter(linha, a, modo, agoraMs);
  }
  return saida;
}
