import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { motorDoProjeto } from "@/lib/server/mcp/motor";
import { autorizar, conferirPedido, lojaOAuthSupabase, negar, type PedidoDeAutorizacao } from "@/lib/server/mcp/oauth";
import { rotuloValido } from "@/lib/server/mcp/tokens";
import { listProjects } from "@/lib/server/projects";

/**
 * A tela "Autorizar o Claude" (27/10/2026): exige a sessão do painel. O GET
 * confere o pedido e lista os projetos com motor Claude; o POST autoriza ou
 * nega e devolve para onde o navegador volta.
 */

function pedidoDe(p: URLSearchParams | Record<string, unknown>): PedidoDeAutorizacao {
  const ler = (k: string) => String((p instanceof URLSearchParams ? p.get(k) : p[k]) ?? "");
  return {
    clientId: ler("client_id"),
    redirectUri: ler("redirect_uri"),
    codeChallenge: ler("code_challenge"),
    codeChallengeMethod: ler("code_challenge_method"),
    state: ler("state"),
    responseType: ler("response_type"),
  };
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const r = await conferirPedido(lojaOAuthSupabase(), pedidoDe(req.nextUrl.searchParams));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro.error_description }, { status: 400 });
  const projetos = (await listProjects()).filter((p) => motorDoProjeto(p) === "claude_mcp");
  return NextResponse.json({
    ok: true,
    cliente: r.cliente.nome || "Claude",
    projetos: projetos.map((p) => ({ id: p.id, slug: p.slug, nome: p.name })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const pedido = pedidoDe(corpo);
  const loja = lojaOAuthSupabase();
  const conferido = await conferirPedido(loja, pedido);
  if (!conferido.ok) return NextResponse.json({ ok: false, error: conferido.erro.error_description }, { status: 400 });

  if (corpo.acao !== "autorizar") return NextResponse.json({ ok: true, redirecionar: negar(pedido) });

  const projeto = (await listProjects()).find((p) => p.id === corpo.projeto && motorDoProjeto(p) === "claude_mcp");
  if (!projeto) return NextResponse.json({ ok: false, error: "escolha um projeto com o motor Claude" }, { status: 400 });

  const r = await autorizar(loja, {
    ...pedido,
    projectId: projeto.id,
    rotulo: rotuloValido(conferido.cliente.nome) ?? "claude",
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro.error_description }, { status: 400 });
  return NextResponse.json({ ok: true, redirecionar: r.redirecionar });
}
