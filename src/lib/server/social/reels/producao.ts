import type { SupabaseClient } from "@supabase/supabase-js";
import { envDoInstagram } from "@/lib/server/credenciais-do-projeto";
import { EVENTO_DO_TERMOMETRO } from "@/lib/server/editorial/termometro-do-dia";
import { getMetaConfig } from "@/lib/server/social/instagram/meta-client";
import { criarPerfisStore } from "@/lib/server/social/perfis-referencia/store";
import type { DepsDaDescoberta } from "./descoberta";
import type { LinhaDoRanking, VideoOrdenado } from "./ordem";

export const TABELA_DOS_CANDIDATOS = "reels_candidatos";

/** A linha de `reels_candidatos` de um vídeo achado. */
export function linhaDoCandidato(projectId: string, v: VideoOrdenado): Record<string, unknown> {
  return {
    project_id: projectId,
    fonte: v.fonte,
    origem_id: v.origemId,
    permalink: v.permalink || null,
    url_video: v.urlVideo,
    autor: v.autor || null,
    titulo: v.titulo || null,
    legenda: v.legenda || null,
    publicado_em: v.publicadoEm || null,
    metricas: { ...v.metricas, notaDaFonte: v.notaDaFonte, calorDoAssunto: v.calorDoAssunto, historia: v.historia },
    nota: v.nota,
    estado: "nova",
  };
}

/** O ranking que o radar gravou por último: o termômetro sem recalcular vetor nenhum. */
export async function rankingGravado(client: SupabaseClient, projectId: string): Promise<LinhaDoRanking[]> {
  const { data, error } = await client
    .from("platform_events")
    .select("payload")
    .eq("event_type", EVENTO_DO_TERMOMETRO)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const ranking = ((data?.[0] as { payload?: { ranking?: unknown } } | undefined)?.payload?.ranking ?? []) as Array<{
    titulo?: unknown;
    calor?: unknown;
  }>;
  return ranking
    .map((l) => ({ titulo: String(l.titulo ?? ""), calor: Number(l.calor ?? 0) }))
    .filter((l) => l.titulo && Number.isFinite(l.calor));
}

export function depsDeProducao(
  client: SupabaseClient,
  projectId: string,
  env: Record<string, string | undefined> = process.env,
): DepsDaDescoberta {
  return {
    async credencialDoInstagram() {
      const { accountId, accessToken } = getMetaConfig(await envDoInstagram(projectId, env));
      return { accountId, accessToken };
    },
    async perfisDeReferencia() {
      return (await criarPerfisStore(client).listar(projectId, true)).map((p) => p.handle);
    },
    ranking: () => rankingGravado(client, projectId),
    chaveDoYoutube: env.YOUTUBE_API_KEY?.trim() ?? "",
    async gravar(videos) {
      // A mesma origem não volta: o candidato descartado ontem continua descartado.
      const { data, error } = await client
        .from(TABELA_DOS_CANDIDATOS)
        .upsert(videos.map((v) => linhaDoCandidato(projectId, v)), {
          onConflict: "project_id,fonte,origem_id",
          ignoreDuplicates: true,
        })
        .select("id");
      return { gravados: (data ?? []).length, erro: error?.message ?? null };
    },
  };
}
