import type { NextRequest } from "next/server";
import { consultaDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { depsDoReelNoMcp, verReel } from "@/lib/server/mcp/reels/servico";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `ver_reel`: a etapa do Reel e a folha de quadros. Só leitura. */
export async function GET(req: NextRequest) {
  return rotaDoMcp(req, "ver reel", (acesso) => verReel(acesso, consultaDoPedido(req), depsDoReelNoMcp(getSupabaseAdminClient())));
}
