/**
 * As métricas do Instagram, todo dia (14/10/2026).
 *
 * A métrica principal do projeto passou a ser seguidores e salvamentos no
 * Instagram (decisão do dono, fase 1 da reorganização). Até aqui nada era
 * gravado: `fetchMediaInsights` existia e só o loop do Sistema PROMPT a chamava.
 * Sem número, "qual comunicação funciona" não tinha resposta.
 *
 * Duas fotografias por dia, uma linha por dia e por coisa medida:
 * - de cada post publicado nos últimos `janelaEmDias`: alcance, salvamentos,
 *   compartilhamentos, comentários e curtidas, em `instagram_metricas_post`;
 * - da conta: seguidores, em `instagram_seguidores_dia`.
 * Rodar duas vezes no mesmo dia regrava a linha do dia (upsert), e a série
 * diária é o que permite ver o post crescer ou parar.
 *
 * Falha da Meta em um post não derruba os outros: ele entra na lista de
 * falhas, que a rota devolve.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetaConfig } from "./instagram/meta-client";
import type { MetaMediaInsights } from "./instagram/meta-client";

/*
 * A chave de métricas (14/10/2026). A chave que publica é de Login do Facebook
 * e não tem permissão de insights: a Meta respondia "objeto não existe ou
 * falta permissão" para todo post, e o cliente antigo devolvia ZERO, que ia
 * para o banco como se o post não tivesse alcance. A de métricas é de Login do
 * Instagram (`INSTAGRAM_INSIGHTS_TOKEN`, com instagram_business_manage_insights)
 * e fala com graph.instagram.com. Leitura que falha agora é falha, nunca zero.
 */
const API_DO_INSTAGRAM = "https://graph.instagram.com/v22.0";
const API_DO_FACEBOOK = "https://graph.facebook.com/v22.0";
const METRICAS_DO_POST = "reach,saved,shares,comments,likes";

function chaveDeMetricas(env: Record<string, string | undefined>): { base: string; token: string } | null {
  const doInstagram = env.INSTAGRAM_INSIGHTS_TOKEN?.trim();
  if (doInstagram) return { base: API_DO_INSTAGRAM, token: doInstagram };
  const { accessToken } = getMetaConfig(env);
  return accessToken ? { base: API_DO_FACEBOOK, token: accessToken } : null;
}

/** Métricas de um post, ou um erro com o motivo da Meta. Nunca zero inventado. */
export async function lerMetricasDoPost(
  mediaId: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): Promise<MetaMediaInsights> {
  const chave = chaveDeMetricas(env);
  if (!chave) throw new Error("sem chave de métricas do Instagram");
  const res = await fetcher(`${chave.base}/${mediaId}/insights?metric=${METRICAS_DO_POST}&access_token=${encodeURIComponent(chave.token)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: Array<{ name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }>; error?: { message?: string } };
  if (!res.ok || !Array.isArray(json.data)) throw new Error(`Meta ${res.status}: ${json.error?.message?.slice(0, 120) ?? "sem dados"}`);
  const v: Record<string, number> = {};
  for (const item of json.data) {
    const n = Number(item.values?.[0]?.value ?? item.total_value?.value ?? 0);
    if (item.name) v[item.name] = Number.isFinite(n) ? n : 0;
  }
  return { reach: v.reach ?? 0, saved: v.saved ?? 0, shares: v.shares ?? 0, comments: v.comments ?? 0, likes: v.likes ?? 0 };
}

export const TABELA_DAS_METRICAS_DO_POST = "instagram_metricas_post";
export const TABELA_DOS_SEGUIDORES = "instagram_seguidores_dia";

/** Um post de Instagram continua juntando salvamento por umas semanas; 30 dias cobre a curva. */
export const JANELA_PADRAO_EM_DIAS = 30;

export type DepsDasMetricas = {
  client: Pick<SupabaseClient, "from">;
  projectId: string;
  env: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  agora?: () => Date;
  janelaEmDias?: number;
  /** Para teste; o padrão é o cliente da Meta. */
  lerInsights?: (mediaId: string) => Promise<MetaMediaInsights>;
  lerSeguidores?: () => Promise<number | null>;
};

export type ResultadoDasMetricas = {
  dia: string;
  posts: number;
  gravados: number;
  seguidores: number | null;
  falhas: string[];
};

function diaEmSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Seguidores da conta, pelo Graph. `null` quando não deu para ler. */
export async function lerSeguidoresDaConta(
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  const chave = chaveDeMetricas(env);
  const { accountId } = getMetaConfig(env);
  if (!chave) return null;
  // Com a chave do Instagram a conta é "me"; com a do Facebook, o id da conta.
  const quem = chave.base === API_DO_INSTAGRAM ? "me" : accountId;
  if (!quem) return null;
  try {
    const url = `${chave.base}/${quem}?fields=followers_count&access_token=${encodeURIComponent(chave.token)}`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => ({}))) as { followers_count?: unknown };
    const n = Number(json.followers_count);
    return res.ok && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function coletarMetricasDoInstagram(d: DepsDasMetricas): Promise<ResultadoDasMetricas> {
  const agora = (d.agora ?? (() => new Date()))();
  const dia = diaEmSaoPaulo(agora);
  const desde = new Date(agora.getTime() - (d.janelaEmDias ?? JANELA_PADRAO_EM_DIAS) * 24 * 60 * 60 * 1000).toISOString();
  const lerInsights = d.lerInsights ?? ((id: string) => lerMetricasDoPost(id, d.env, d.fetcher));
  const lerSeguidores = d.lerSeguidores ?? (() => lerSeguidoresDaConta(d.env, d.fetcher));
  const falhas: string[] = [];

  const { data, error } = await d.client
    .from("social_posts")
    .select("id, provider_post_id, published_at")
    .eq("project_id", d.projectId)
    .eq("status", "published")
    .not("provider_post_id", "is", null)
    .gte("published_at", desde);
  if (error) throw new Error(`não consegui ler os posts publicados: ${error.message}`);
  const posts = (data ?? []) as Array<{ id: string; provider_post_id: string }>;

  const linhas: Array<Record<string, unknown>> = [];
  for (const p of posts) {
    try {
      const m = await lerInsights(p.provider_post_id);
      linhas.push({
        project_id: d.projectId,
        social_post_id: p.id,
        media_id: p.provider_post_id,
        dia,
        alcance: m.reach,
        salvamentos: m.saved,
        compartilhamentos: m.shares,
        comentarios: m.comments,
        curtidas: m.likes,
        lido_em: agora.toISOString(),
      });
    } catch (erro) {
      falhas.push(`${p.id}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  let gravados = 0;
  if (linhas.length > 0) {
    const { error: e } = await d.client
      .from(TABELA_DAS_METRICAS_DO_POST)
      .upsert(linhas, { onConflict: "social_post_id,dia" });
    if (e) falhas.push(`métricas dos posts não gravadas: ${e.message}`);
    else gravados = linhas.length;
  }

  const seguidores = await lerSeguidores();
  if (seguidores === null) {
    falhas.push("seguidores da conta não lidos");
  } else {
    const { error: e } = await d.client
      .from(TABELA_DOS_SEGUIDORES)
      .upsert([{ project_id: d.projectId, dia, seguidores, lido_em: agora.toISOString() }], { onConflict: "project_id,dia" });
    if (e) falhas.push(`seguidores não gravados: ${e.message}`);
  }

  return { dia, posts: posts.length, gravados, seguidores, falhas };
}
