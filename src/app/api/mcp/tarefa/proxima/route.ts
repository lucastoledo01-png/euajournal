import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { erroDaRota, pedidoInvalido } from "@/lib/server/mcp/rota";
import { ehTipoDeTarefa, tarefasSupabase } from "@/lib/server/mcp/tarefas-store";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * `proxima_tarefa`: a tarefa mais antiga que espera o Claude, reparo antes de
 * nova. Vem com a instrução, o material, o esquema da resposta e, num reparo,
 * os motivos.
 */
export async function GET(req: NextRequest) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  const { projeto } = auth.acesso;

  const tipo = req.nextUrl.searchParams.get("tipo");
  if (tipo && !ehTipoDeTarefa(tipo)) return pedidoInvalido(`tipo de tarefa desconhecido: ${tipo}`);

  try {
    const tarefa = await tarefasSupabase(getSupabaseAdminClient()).proxima(projeto.id, tipo && ehTipoDeTarefa(tipo) ? tipo : undefined);
    return NextResponse.json({ ok: true, tarefa });
  } catch (erro) {
    return erroDaRota("próxima tarefa", erro);
  }
}
