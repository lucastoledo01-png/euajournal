import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { montarPost } from "@/lib/server/mcp/post/agendar";
import { depsDoPost } from "@/lib/server/mcp/post/deps";
import { corpoDoPedido, erroDaRota, pedidoDePost, pedidoInvalido } from "@/lib/server/mcp/rota";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `montar_post`: a prévia da arte e da legenda, sem gravar nada. */
export async function POST(req: NextRequest) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  const { projeto } = auth.acesso;

  const pedido = pedidoDePost(await corpoDoPedido(req), projeto);
  if (!pedido) return pedidoInvalido("informe story_id e, se quiser, data (AAAA-MM-DD)");

  try {
    const r = await montarPost(projeto, pedido, depsDoPost(getSupabaseAdminClient()));
    if (!r.ok) return NextResponse.json(r, { status: 422 });
    return NextResponse.json({
      ok: true,
      manchete: r.manchete,
      legenda: r.legenda,
      imagem: { mime: "image/jpeg", base64: r.png.toString("base64") },
    });
  } catch (erro) {
    return erroDaRota("montar post", erro);
  }
}

// O render abre o Chromium.
export const maxDuration = 120;
