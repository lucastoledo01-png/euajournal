import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { aguardar } from "@/lib/server/mcp/dia/servico";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `aguardar`: espera o dono aprovar o plano, até 50 segundos, e devolve o próximo passo. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "aguardar", (acesso) => aguardar(acesso, corpo, getSupabaseAdminClient()));
}

export const maxDuration = 90;
