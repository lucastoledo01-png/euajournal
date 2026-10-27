import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { depsDoPost } from "@/lib/server/mcp/post/deps";
import { iniciarPost } from "@/lib/server/mcp/post/fluxo";
import { corpoDoPedido, erroDaRota, pedidoDePost, pedidoInvalido } from "@/lib/server/mcp/rota";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `iniciar_post`: abre a tarefa de escrita da pauta, com o pedido exato da esteira. */
export async function POST(req: NextRequest) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  const { projeto } = auth.acesso;

  const pedido = pedidoDePost(await corpoDoPedido(req), projeto);
  if (!pedido) return pedidoInvalido("informe story_id e, se quiser, data (AAAA-MM-DD)");

  try {
    const r = await iniciarPost(projeto, pedido, depsDoPost(getSupabaseAdminClient()));
    if (!r.ok) return NextResponse.json(r, { status: 422 });
    return NextResponse.json({ ok: true, tarefa: r.tarefa });
  } catch (erro) {
    return erroDaRota("iniciar post", erro);
  }
}
