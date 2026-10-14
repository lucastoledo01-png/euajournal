import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { envDoInstagram } from "@/lib/server/credenciais-do-projeto";
import { coletarMetricasDoInstagram } from "@/lib/server/social/metricas";
import { formatError, sendAlert } from "@/lib/server/alerts";

export const maxDuration = 120;

/**
 * As métricas do Instagram do dia (14/10/2026): alcance e salvamentos de cada
 * post dos últimos 30 dias e os seguidores da conta. O crontab chama uma vez
 * por noite. Responde com o relatório, inclusive as falhas por post.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const env = await envDoInstagram(DEFAULT_PROJECT_ID, process.env);
    const r = await coletarMetricasDoInstagram({ client: getSupabaseAdminClient(), projectId: DEFAULT_PROJECT_ID, env });
    return NextResponse.json({ ok: r.falhas.length === 0, ...r });
  } catch (err) {
    await sendAlert("warning", "Métricas do Instagram não coletadas", formatError(err));
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
