import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverCapacidade, type EstadoDaCapacidade, type ProjetoComCapacidades } from "../capacidades";
import { criarCandidatosStore, type CandidatosStore } from "../editorial/candidatos-store";
import { gerarStoryId } from "../editorial/history";
import { dominioDe } from "../editorial/url-canonica";
import { getSupabaseAdminClient } from "../supabase-admin";
import { getProjectNewsSources } from "../projects";
import { collectAllNews, type NewsCandidate } from "./collector";
import type { NewsSourceConfig } from "./news-sources";

/**
 * O radar (28/10/2026): a coleta curta, de 15 em 15 minutos.
 *
 * O ciclo diário coleta uma vez, de noite. O termômetro de pauta lê o que está
 * no banco, então quando o Flávio Bolsonaro chegou aos EUA ele ainda via "viaja
 * rumo aos EUA" de 20 horas antes. O radar só LÊ OS FEEDS e grava o que é novo
 * como `collected`: sem classificação, sem modelo, sem post. A classificação
 * continua sendo do ciclo que decide, e `gravarNovas` já completa a linha
 * `collected` quando a classificação chega, sem sobrescrever nada.
 *
 * `dry_run` conta o que gravaria e não grava. `off` não lê nem a rede.
 */

export const EVENTO_DO_RADAR = "radar_coleta";

function googleNoticias(id: string, busca: string): NewsSourceConfig {
  const q = encodeURIComponent(`${busca} when:1d`);
  return {
    id: `radar-gn-${id}`,
    name: `Google Notícias: ${busca}`,
    type: "rss",
    url: `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    enabled: true,
    priority: 2,
    category: "br_media",
    region: "br",
  };
}

function feed(id: string, name: string, url: string): NewsSourceConfig {
  return { id: `radar-${id}`, name, type: "rss", url, enabled: true, priority: 1, category: "br_media", region: "br" };
}

/**
 * Os feeds quentes que o radar lê além das fontes do projeto (28/10/2026).
 *
 * Moram no código, e não em `project_news_sources`, porque servem a uma
 * pergunta só, "o que o Brasil está lendo agora", e não decidem pauta: o que
 * o radar grava é `collected`, e quem aprova é o ciclo de sempre. Conferidos
 * com o agente do projeto em 28/10/2026. O Google Notícias entra pela busca
 * por assunto, e conta pelo veículo de verdade (`<source url>`), nunca pelo
 * link do agregador.
 */
export const FEEDS_DO_RADAR: NewsSourceConfig[] = [
  feed("g1", "G1, principal", "https://g1.globo.com/rss/g1/"),
  feed("folha", "Folha, em cima da hora", "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml"),
  feed("uol", "UOL, últimas", "https://rss.uol.com.br/feed/noticias.xml"),
  feed("estadao-int", "Estadão, internacional", "https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/internacional/"),
  feed("estadao-pol", "Estadão, política", "https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/"),
  feed("cnn-brasil", "CNN Brasil", "https://www.cnnbrasil.com.br/feed/"),
  feed("metropoles", "Metrópoles", "https://www.metropoles.com/feed"),
  feed("poder360", "Poder360", "https://www.poder360.com.br/feed/"),
  feed("bbc-brasil", "BBC News Brasil", "https://feeds.bbci.co.uk/portuguese/rss.xml"),
  feed("exame", "Exame", "https://exame.com/feed/"),
  googleNoticias("eua", "Estados Unidos"),
  googleNoticias("trump", "Trump"),
  googleNoticias("casa-branca", "Casa Branca"),
  googleNoticias("fed", "Fed juros"),
  googleNoticias("wall-street", "Wall Street"),
];

/** As fontes do projeto mais as do radar, sem a mesma URL duas vezes. */
export function fontesDoRadar(doProjeto: NewsSourceConfig[]): NewsSourceConfig[] {
  const vistas = new Set(doProjeto.map((f) => f.url));
  return [...doProjeto, ...FEEDS_DO_RADAR.filter((f) => !vistas.has(f.url))];
}

export function modoDoRadar(projeto?: ProjetoComCapacidades | null): EstadoDaCapacidade {
  return resolverCapacidade("radar", () => "off", projeto);
}

export type DesfechoDoRadar = {
  ok: boolean;
  modo: EstadoDaCapacidade;
  lidas: number;
  novas: number;
  gravadas: number;
  erros: string[];
  maisNova?: string;
};

export type DependenciasDoRadar = {
  coletar?: () => Promise<NewsCandidate[]>;
  store?: CandidatosStore;
  client?: Pick<SupabaseClient, "from"> | null;
  fetcher?: typeof fetch;
};

export function paraGravar(c: NewsCandidate) {
  return {
    storyId: gerarStoryId({ url: c.url, titulo: c.title }),
    url: c.url,
    // Pelo agregador, o domínio é o do veículo que escreveu (`<source url>`).
    sourceDomain: (c.publisher_url && dominioDe(c.publisher_url)) || dominioDe(c.url),
    title: c.title,
    summary: c.description?.slice(0, 600),
    publishedAt: c.published_at,
    status: "collected" as const,
    metadata: { origem: "radar", fonte: c.source_name },
  };
}

export async function rodarRadar(
  projeto: ProjetoComCapacidades & { id: string },
  deps: DependenciasDoRadar = {},
): Promise<DesfechoDoRadar> {
  const modo = modoDoRadar(projeto);
  const vazio: DesfechoDoRadar = { ok: true, modo, lidas: 0, novas: 0, gravadas: 0, erros: [] };
  if (modo === "off") return vazio;

  try {
    const candidatas = deps.coletar
      ? await deps.coletar()
      : (await collectAllNews(fontesDoRadar(await getProjectNewsSources(projeto.id)), deps.fetcher ?? fetch)).candidates;
    const store = deps.store ?? criarCandidatosStore((deps.client ?? getSupabaseAdminClient()) as SupabaseClient);

    const maisNova = candidatas.map((c) => c.published_at).sort().at(-1);
    const linhas = candidatas.filter((c) => c.url && c.title).map(paraGravar);

    if (modo === "dry_run") {
      const existentes = await store.buscarDaJanela(projeto.id, 3);
      const novas = linhas.filter((l) => !existentes.has(l.url)).length;
      return { ...vazio, lidas: candidatas.length, novas, maisNova };
    }

    const gravacao = await store.gravarNovas(projeto.id, linhas);
    return {
      ok: gravacao.erros.length === 0,
      modo,
      lidas: candidatas.length,
      novas: gravacao.gravadas,
      gravadas: gravacao.gravadas,
      erros: gravacao.erros.slice(0, 5),
      maisNova,
    };
  } catch (erro) {
    return { ...vazio, ok: false, erros: [erro instanceof Error ? erro.message.slice(0, 200) : String(erro)] };
  }
}
