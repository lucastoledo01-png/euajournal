import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID, getProjectById } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { EVENTO_DO_RADAR, rodarRadar } from "@/lib/server/newsroom/radar";

export const maxDuration = 120;

/**
 * O radar de notícias (28/10/2026): chamado de 15 em 15 minutos pelo crontab,
 * lê os feeds e grava o que é novo. Ver `newsroom/radar.ts`. Capacidade
 * `radar` ausente ou `off`: responde sem tocar na rede. Só grava evento
 * quando entrou matéria nova ou deu erro, para não encher a tabela com 96
 * linhas por dia sem nada a dizer.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const projeto = await getProjectById(DEFAULT_PROJECT_ID).catch(() => null);
  if (!projeto) return NextResponse.json({ ok: false, error: "projeto ilegível" }, { status: 503 });

  const desfecho = await rodarRadar(projeto);
  if (desfecho.modo !== "off" && (desfecho.gravadas > 0 || !desfecho.ok)) {
    try {
      await getSupabaseAdminClient().from("platform_events").insert({
        event_type: EVENTO_DO_RADAR,
        project_id: projeto.id,
        payload: desfecho,
      });
    } catch {
      /* o evento é só rastro */
    }
  }
  return NextResponse.json(desfecho, { status: desfecho.ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
