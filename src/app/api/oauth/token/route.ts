import { NextResponse } from "next/server";
import { lojaOAuthSupabase, token } from "@/lib/server/mcp/oauth";
import { acessosDoMcp } from "@/lib/server/mcp/tokens";

/** Troca o código (PKCE) por chaves, ou renova. Corpo em `application/x-www-form-urlencoded`. */
export async function POST(req: Request) {
  const tipo = req.headers.get("content-type") ?? "";
  const corpo: Record<string, string> = tipo.includes("application/json")
    ? ((await req.json().catch(() => ({}))) as Record<string, string>)
    : Object.fromEntries(new URLSearchParams(await req.text()));
  const semCache = { "Cache-Control": "no-store", Pragma: "no-cache" };
  try {
    const r = await token(lojaOAuthSupabase(), acessosDoMcp, corpo);
    if (!r.ok) return NextResponse.json(r.erro, { status: 400, headers: semCache });
    return NextResponse.json(r.chaves, { headers: semCache });
  } catch (erro) {
    console.error("[OAUTH] token:", erro);
    return NextResponse.json({ error: "server_error", error_description: "falha ao emitir" }, { status: 500, headers: semCache });
  }
}
