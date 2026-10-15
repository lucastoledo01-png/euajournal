import sharp from "sharp";
import { MARCA } from "@/lib/marca";
import { agenteDaWikimedia } from "./wikidata";

/**
 * A foto inteira, sem corte, numa moldura de proporção fixa (14/10/2026).
 *
 * O e-mail fixa a foto em 600x360 (cinco por três) para a edição não virar
 * uma rolagem sem fim no celular, e recortava com `object-fit: cover`. O dono
 * viu a edição de 15/10 no computador: a cabeça do Lula cortada no alto, e o
 * prédio da pauta de inflação sem o topo. "As duas não podem cortar."
 *
 * A saída é a mesma do portal (capa da matéria, 14/10/2026): a foto INTEIRA
 * por cima dela mesma, ampliada e desfocada, ocupando a moldura. Cliente de
 * e-mail não faz desfoque por CSS, então a composição é feita aqui, no
 * servidor, e servida como uma imagem só, pela rota `/api/visual/foto-inteira`.
 * Foto deitada na proporção certa sai igual à original; foto em pé ou de outra
 * proporção sai inteira, com as laterais preenchidas pela própria foto.
 *
 * A rota só busca imagem dos hosts que o resolvedor usa: não é um proxy
 * aberto.
 */
export const LARGURA_DA_FOTO_INTEIRA = 1200;
export const ALTURA_DA_FOTO_INTEIRA = 720;

export const HOSTS_DA_FOTO_INTEIRA = [
  "images.pexels.com",
  "images.unsplash.com",
  "upload.wikimedia.org",
  "live.staticflickr.com",
  "azqpdesusdzqndvsqmko.supabase.co",
  "euajournal.com",
  "www.camara.leg.br",
  "www.whitehouse.gov",
  "www.federalreserve.gov",
  "images-assets.nasa.gov",
];

/** O endereço vale para a rota? Só https e só dos hosts conhecidos. */
export function origemPermitida(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && HOSTS_DA_FOTO_INTEIRA.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** O endereço público da foto inteira. Imagem sem origem permitida volta como veio. */
export function urlDaFotoInteira(src: string, base: string = MARCA.site): string {
  if (!src || !origemPermitida(src)) return src;
  return `${base.replace(/\/$/, "")}/api/visual/foto-inteira?src=${encodeURIComponent(src)}`;
}

/**
 * Onde baixar sem trazer um arquivo de 20 MB: o Commons pela miniatura de
 * 1600 px, o Pexels e o Unsplash pelo parâmetro de largura. O resto, como veio.
 */
export function enderecoParaBaixar(src: string): string {
  const u = new URL(src);
  const host = u.hostname.toLowerCase();
  if (host === "upload.wikimedia.org") {
    const m = u.pathname.match(/^\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/);
    if (m) return `https://commons.wikimedia.org/wiki/Special:FilePath/${m[3]}?width=1600`;
    return `${u.origin}${u.pathname}`;
  }
  if (host === "images.pexels.com" || host === "images.unsplash.com") {
    u.searchParams.set("w", "1600");
    u.searchParams.delete("h");
    u.searchParams.delete("fit");
    u.searchParams.delete("crop");
    return u.toString();
  }
  return src;
}

export async function baixarFoto(
  src: string,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<Buffer> {
  const r = await (opcoes.fetcher ?? fetch)(enderecoParaBaixar(src), {
    headers: { "User-Agent": agenteDaWikimedia(opcoes.env ?? process.env) },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`a origem respondeu ${r.status}`);
  const tipo = r.headers.get("content-type") ?? "";
  if (tipo && !tipo.startsWith("image/")) throw new Error(`a origem não devolveu imagem (${tipo})`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Foto deitada não ganha desfoque (14/10/2026, segunda leitura do dono): o
 * Walmart visto de cima saiu com duas faixas desfocadas que não protegiam
 * nada, "estava melhor antes". A partir desta proporção a foto só é ajustada
 * à moldura 5:3, com o corte guiado pelo ponto de interesse (`attention`); o
 * que se perde é uma faixa fina de céu ou de chão. Em pé ou quadrada, onde o
 * corte comeria a cabeça, continua a foto inteira sobre ela mesma desfocada.
 */
export const PROPORCAO_DEITADA = 1.25;

/** A foto na moldura de 1200x720, JPEG: ajustada se deitada, inteira sobre o desfoque se não. */
export async function comporFotoInteira(foto: Buffer): Promise<Buffer> {
  const W = LARGURA_DA_FOTO_INTEIRA;
  const H = ALTURA_DA_FOTO_INTEIRA;
  const meta = await sharp(foto).rotate().metadata();
  const largura = meta.autoOrient?.width ?? meta.width ?? 0;
  const altura = meta.autoOrient?.height ?? meta.height ?? 1;
  if (largura / altura >= PROPORCAO_DEITADA) {
    return sharp(foto).rotate().resize(W, H, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 85 }).toBuffer();
  }
  const fundo = await sharp(foto).rotate().resize(W, H, { fit: "cover" }).blur(40).modulate({ brightness: 0.6 }).toBuffer();
  const frente = await sharp(foto).rotate().resize(W, H, { fit: "inside", withoutEnlargement: false }).toBuffer();
  const m = await sharp(frente).metadata();
  return sharp(fundo)
    .composite([{ input: frente, left: Math.round((W - (m.width ?? W)) / 2), top: Math.round((H - (m.height ?? H)) / 2) }])
    .jpeg({ quality: 85 })
    .toBuffer();
}
