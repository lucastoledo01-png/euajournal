import { createHash } from "node:crypto";
import type { Ramo } from "./contrato";

/**
 * A impressão digital da versão exata de uma peça (RF-20).
 *
 * O que entra no hash é o que vai ao ar, e nada mais. No post isso é a legenda
 * e o SHA-256 de cada arquivo congelado, na ordem de publicação: a imagem já
 * tem hash próprio desde o artefato congelado de 16/09/2026, então basta
 * encadear. Na newsletter é o assunto e o HTML do e-mail; no artigo, o título e
 * o HTML do portal.
 *
 * Fica de fora o que muda sem mudar a peça: horário, id de container,
 * `updated_at`. Se ficasse dentro, reagendar um post aprovado invalidaria a
 * aprovação, e o editor aprenderia a aprovar de novo sem olhar.
 */

export type ConteudoDoPost = { legenda: string; artefatos: string[] };
export type ConteudoDaNewsletter = { assunto: string; html: string };
/*
 * `capa` entrou em 05/10/2026, na integração: a refação de IMAGEM do artigo
 * troca só `cover_image`, e sem a capa no hash a foto podia mudar depois da
 * aprovação sem o portão perceber. Opcional e omitida quando vazia, para o
 * hash do artigo sem capa continuar exatamente o de antes.
 */
export type ConteudoDoArtigo = { titulo: string; html: string; capa?: string };
/** O plano do dia (29/10/2026): os itens, que são o que a aprovação libera para produzir. */
export type ConteudoDoPlano = { itens: unknown };

export type ConteudoDaPeca =
  | { ramo: "post"; conteudo: ConteudoDoPost }
  | { ramo: "newsletter"; conteudo: ConteudoDaNewsletter }
  | { ramo: "artigo"; conteudo: ConteudoDoArtigo }
  | { ramo: "plano"; conteudo: ConteudoDoPlano };

/**
 * JSON com as chaves em ordem fixa.
 *
 * `JSON.stringify` segue a ordem de inserção, e dois caminhos que montam o
 * mesmo objeto em ordens diferentes dariam hashes diferentes para a mesma peça.
 * Esse defeito apareceria como "aprovação recusada por hash" num post intacto.
 */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor ?? null);
}

export function hashDaPeca(peca: ConteudoDaPeca): string {
  const material = canonico({ ramo: peca.ramo, versao: 1, conteudo: peca.conteudo });
  return createHash("sha256").update(material, "utf8").digest("hex");
}

/**
 * O conteúdo de um post a partir da linha de `social_posts`.
 *
 * Os hashes saem de `slides_manifest`, que é onde quem congelou a arte gravou
 * o SHA-256 de cada arquivo, e na falta dele de `content_json.arte`, que é
 * onde o worker V2 os lê. Sem nenhum dos dois (o caminho legado e o carrossel
 * de campanha, que geram o post na hora de publicar, gravam manifesto sem
 * hash), a lista sai vazia: não há artefato para aprovar, e o portão recusa
 * por isso mesmo.
 */
function shasOrdenados(lista: unknown[]): string[] {
  return lista
    .map((bruto, i) => {
      const item = (bruto ?? {}) as { index?: unknown; sha256?: unknown };
      const index = Number(item.index);
      return { index: Number.isFinite(index) ? index : i + 1, sha256: typeof item.sha256 === "string" ? item.sha256 : "" };
    })
    .filter((a) => a.sha256)
    .sort((a, b) => a.index - b.index)
    .map((a) => a.sha256);
}

export function conteudoDoPostDaLinha(linha: {
  caption?: unknown;
  slides_manifest?: unknown;
  content_json?: unknown;
}): ConteudoDoPost {
  let artefatos = shasOrdenados(Array.isArray(linha.slides_manifest) ? (linha.slides_manifest as unknown[]) : []);

  if (artefatos.length === 0) {
    const arte = ((linha.content_json ?? {}) as { arte?: { artefatos?: unknown; artefato?: unknown } }).arte;
    if (Array.isArray(arte?.artefatos)) artefatos = shasOrdenados(arte.artefatos as unknown[]);
    else if (arte?.artefato) artefatos = shasOrdenados([arte.artefato]);
  }

  return { legenda: typeof linha.caption === "string" ? linha.caption : "", artefatos };
}

/**
 * O hash do post, ou string vazia quando não há arquivo congelado.
 *
 * Vazio, e não o hash de uma lista vazia, de propósito: o caminho legado e o
 * carrossel de campanha do Sistema PROMPT geram a peça na hora de publicar, e
 * não existe versão para alguém ter aprovado. Um hash válido de "nada" poderia
 * ser aprovado por engano e liberaria uma peça que ninguém viu. Vazio, o portão
 * responde `APROVACAO_SEM_ARTEFATO`.
 */
export function hashDoPostDaLinha(linha: { caption?: unknown; slides_manifest?: unknown; content_json?: unknown }): string {
  const conteudo = conteudoDoPostDaLinha(linha);
  if (conteudo.artefatos.length === 0) return "";
  return hashDaPeca({ ramo: "post", conteudo });
}

export function hashDaNewsletter(assunto: string | null | undefined, html: string | null | undefined): string {
  return hashDaPeca({ ramo: "newsletter", conteudo: { assunto: assunto ?? "", html: html ?? "" } });
}

export function hashDoArtigo(
  titulo: string | null | undefined,
  html: string | null | undefined,
  capa?: string | null,
): string {
  const conteudo: ConteudoDoArtigo = { titulo: titulo ?? "", html: html ?? "" };
  if (capa) conteudo.capa = capa;
  return hashDaPeca({ ramo: "artigo", conteudo });
}

export function ramoDoConteudo(peca: ConteudoDaPeca): Ramo {
  return peca.ramo;
}

export function hashDoPlano(itens: unknown): string {
  return hashDaPeca({ ramo: "plano", conteudo: { itens: itens ?? {} } });
}
