import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { fazerODia } from "@/lib/server/mcp/dia/servico";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `fazer_o_dia`: o próximo passo do dia (tarefa, aguardar ou pronto). */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "fazer o dia", (acesso) => fazerODia(acesso, corpo, getSupabaseAdminClient()));
}

export const maxDuration = 120;
