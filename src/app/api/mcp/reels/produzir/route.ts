import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { depsDoReelNoMcp, produzirReel } from "@/lib/server/mcp/reels/servico";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `produzir_reel`: escolhe o vídeo; o worker baixa, mede o corte e abre a tarefa de texto. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "produzir reel", (acesso) => produzirReel(acesso, corpo, depsDoReelNoMcp(getSupabaseAdminClient())));
}
