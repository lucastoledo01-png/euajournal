import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverCapacidade, type EstadoDaCapacidade, type ProjetoComCapacidades } from "../capacidades";
import { criarCandidatosStore, type CandidatosStore } from "../editorial/candidatos-store";
import { gerarStoryId } from "../editorial/history";
import { dominioDe } from "../editorial/url-canonica";
import { getSupabaseAdminClient } from "../supabase-admin";
import { getProjectNewsSources } from "../projects";
import { collectAllNews, type NewsCandidate } from "./collector";

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
    sourceDomain: dominioDe(c.url),
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
      : (await collectAllNews(await getProjectNewsSources(projeto.id), deps.fetcher ?? fetch)).candidates;
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
