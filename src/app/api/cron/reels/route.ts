import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID, getProjectById, getProjectBySlug } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import {
  EVENTO_DA_RODADA_DE_REELS,
  configDosReels,
  horaDaRodada,
  modoDosReels,
  rodarDescoberta,
} from "@/lib/server/social/reels/descoberta";
import { depsDeProducao } from "@/lib/server/social/reels/producao";

export const maxDuration = 120;

/**
 * A descoberta dos Reels (28/10/2026). Ver `social/reels/descoberta.ts`.
 *
 * `?relogio=1`: o crontab chama de 15 em 15 minutos e a rodada só roda na
 * primeira chamada de cada hora entre `settings.reels.inicio` e `fim` (padrão
 * 9h e 17h, hora do projeto). Capacidade `reels` em `off`: responde sem tocar
 * na rede, então a linha do crontab pode entrar antes de a capacidade ser
 * ligada. Toda rodada que rodou grava o desfecho em `platform_events`
 * (`reels_rodada`). Nada aqui baixa vídeo nem publica.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const slug = req.nextUrl.searchParams.get("projeto")?.trim();
  const projeto = slug
    ? await getProjectBySlug(slug).catch(() => null)
    : await getProjectById(DEFAULT_PROJECT_ID).catch(() => null);
  if (!projeto) return NextResponse.json({ ok: false, error: "projeto ilegível" }, { status: 503 });

  if (modoDosReels(projeto) === "off") {
    return NextResponse.json({ ok: true, rodou: false, motivo: "OFF" });
  }
  if (req.nextUrl.searchParams.get("relogio") === "1") {
    const hora = horaDaRodada(configDosReels(projeto), new Date(), projeto.timezone);
    if (!hora.naJanela) return NextResponse.json({ ok: true, rodou: false, motivo: "FORA_DO_HORARIO", ...hora });
  }

  const client = getSupabaseAdminClient();
  const desfecho = await rodarDescoberta(projeto, depsDeProducao(client, projeto.id));
  try {
    await client.from("platform_events").insert({
      event_type: EVENTO_DA_RODADA_DE_REELS,
      project_id: projeto.id,
      payload: desfecho,
    });
  } catch {
    /* o evento é só rastro */
  }
  return NextResponse.json({ rodou: true, ...desfecho }, { status: desfecho.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
