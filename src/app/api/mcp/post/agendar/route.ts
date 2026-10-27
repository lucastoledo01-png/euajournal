import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { agendarPost } from "@/lib/server/mcp/post/agendar";
import { depsDoPost } from "@/lib/server/mcp/post/deps";
import { linkDoPainel } from "@/lib/server/mcp/dia";
import { corpoDoPedido, erroDaRota, pedidoDePost, pedidoInvalido } from "@/lib/server/mcp/rota";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * `agendar_post`: congela a arte, grava o post e o põe na fila de aprovação.
 * Ele não vai ao ar daqui: espera alguém aprovar no painel.
 */
export async function POST(req: NextRequest) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  const { projeto } = auth.acesso;

  const pedido = pedidoDePost(await corpoDoPedido(req), projeto);
  if (!pedido) return pedidoInvalido("informe story_id e, se quiser, data (AAAA-MM-DD)");

  try {
    const r = await agendarPost(projeto, pedido, depsDoPost(getSupabaseAdminClient()));
    if (!r.ok) return NextResponse.json(r, { status: 422 });
    return NextResponse.json({ ...r, painel: linkDoPainel(projeto.slug), aguardando: "aprovação no painel" });
  } catch (erro) {
    return erroDaRota("agendar post", erro);
  }
}

export const maxDuration = 120;
