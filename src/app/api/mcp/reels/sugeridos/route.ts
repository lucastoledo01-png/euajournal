import type { NextRequest } from "next/server";
import { consultaDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { depsDoReelNoMcp, reelsSugeridos } from "@/lib/server/mcp/reels/servico";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `reels_sugeridos`: os vídeos achados pela descoberta, do melhor para o pior. Só leitura. */
export async function GET(req: NextRequest) {
  return rotaDoMcp(req, "reels sugeridos", (acesso) =>
    reelsSugeridos(acesso, consultaDoPedido(req), depsDoReelNoMcp(getSupabaseAdminClient())),
  );
}
