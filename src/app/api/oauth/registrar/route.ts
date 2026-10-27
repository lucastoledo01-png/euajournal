import { NextResponse } from "next/server";
import { lojaOAuthSupabase, registrarCliente } from "@/lib/server/mcp/oauth";

/** Registro dinâmico do cliente (RFC 7591): o Claude se cadastra sozinho, sem segredo. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await registrarCliente(lojaOAuthSupabase(), corpo);
    if (!r.ok) return NextResponse.json(r.erro, { status: 400 });
    return NextResponse.json(r.cliente, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    console.error("[OAUTH] registro:", erro);
    return NextResponse.json({ error: "server_error", error_description: "falha ao registrar" }, { status: 500 });
  }
}
