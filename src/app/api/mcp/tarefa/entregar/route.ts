import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { depsDoPost } from "@/lib/server/mcp/post/deps";
import { entregarTarefaDoPost } from "@/lib/server/mcp/post/fluxo";
import { corpoDoPedido, erroDaRota, pedidoInvalido } from "@/lib/server/mcp/rota";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * `entregar_tarefa`: valida a entrega com as guardas da esteira e diz o que
 * acontece em seguida (auditar, reparar, pronto ou descartado).
 */
export async function POST(req: NextRequest) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  const { projeto, quem } = auth.acesso;

  const corpo = await corpoDoPedido(req);
  const id = typeof corpo.id === "string" ? corpo.id : "";
  if (!id || !("resultado" in corpo)) return pedidoInvalido("informe id e resultado");

  try {
    const r = await entregarTarefaDoPost(projeto, { id, resultado: corpo.resultado, quem }, depsDoPost(getSupabaseAdminClient()));
    if (!r.ok) return NextResponse.json(r, { status: 422 });
    return NextResponse.json(r);
  } catch (erro) {
    return erroDaRota("entregar tarefa", erro);
  }
}
