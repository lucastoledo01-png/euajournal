import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { motorDoProjeto } from "@/lib/server/mcp/motor";
import { criarToken, listarTokens, revogarToken, rotuloValido } from "@/lib/server/mcp/tokens";
import { getProjectById } from "@/lib/server/projects";

/**
 * "Conectar ao Claude" no painel (27/10/2026): gera o token de quem vai usar o
 * Claude Code com este projeto, lista os conectados e revoga.
 *
 * O token sai UMA vez, na resposta do POST, para o painel montar o comando de
 * instalação. Depois disso só existe o resumo no banco.
 */

async function projetoDoPedido(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return getProjectById(id);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const projeto = await projetoDoPedido(ctx);
  if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, motor: motorDoProjeto(projeto), tokens: await listarTokens(projeto.id) });
  } catch (erro) {
    return NextResponse.json({ ok: false, error: erro instanceof Error ? erro.message : "falha ao ler" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const projeto = await projetoDoPedido(ctx);
  if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
  if (motorDoProjeto(projeto) !== "claude_mcp") {
    return NextResponse.json({ ok: false, error: "este projeto não está com o motor Claude via MCP" }, { status: 409 });
  }
  const corpo = (await req.json().catch(() => ({}))) as { rotulo?: unknown };
  const rotulo = rotuloValido(corpo.rotulo);
  if (!rotulo) return NextResponse.json({ ok: false, error: "dê um nome de 2 a 40 letras ou números" }, { status: 400 });
  try {
    const { id, token } = await criarToken(projeto.id, rotulo);
    return NextResponse.json({ ok: true, id, rotulo, token });
  } catch (erro) {
    return NextResponse.json({ ok: false, error: erro instanceof Error ? erro.message : "falha ao gravar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const projeto = await projetoDoPedido(ctx);
  if (!projeto) return NextResponse.json({ ok: false, error: "projeto não encontrado" }, { status: 404 });
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ ok: false, error: "informe o token" }, { status: 400 });
  try {
    await revogarToken(projeto.id, token);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return NextResponse.json({ ok: false, error: erro instanceof Error ? erro.message : "falha ao revogar" }, { status: 500 });
  }
}
