import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { projectToday, type Project } from "@/lib/server/projects";

/**
 * O que as rotas do MCP têm em comum: a data pedida e o erro sem segredo.
 *
 * A data é a da EDIÇÃO, no fuso do projeto. Sem data, é hoje no projeto, e
 * nunca `new Date()` em UTC: depois das 21h em São Paulo, UTC já é amanhã. É a
 * armadilha de "Data em UTC gravava o dia seguinte".
 */
export function dataDoPedido(req: NextRequest, projeto: Pick<Project, "timezone">): string | null {
  const bruta = req.nextUrl.searchParams.get("data");
  if (!bruta) return projectToday(projeto);
  return /^\d{4}-\d{2}-\d{2}$/.test(bruta) ? bruta : null;
}

export function erroDaRota(rotulo: string, erro: unknown) {
  console.error(`[MCP] ${rotulo}:`, erro);
  return NextResponse.json(
    { ok: false, error: erro instanceof Error ? erro.message : `Falha em ${rotulo}.` },
    { status: 500 },
  );
}

export function dataInvalida() {
  return NextResponse.json({ ok: false, error: "data inválida: use AAAA-MM-DD" }, { status: 400 });
}

/** O corpo JSON do pedido, ou objeto vazio. */
export async function corpoDoPedido(req: NextRequest): Promise<Record<string, unknown>> {
  const corpo = (await req.json().catch(() => null)) as unknown;
  return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
}

/** A pauta e a data de um pedido de post, com a data no fuso do projeto quando falta. */
export function pedidoDePost(
  corpo: Record<string, unknown>,
  projeto: Pick<Project, "timezone">,
): { storyId: string; data: string } | null {
  const storyId = typeof corpo.story_id === "string" ? corpo.story_id.trim() : "";
  const data = typeof corpo.data === "string" && corpo.data ? corpo.data : projectToday(projeto);
  if (!storyId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  return { storyId, data };
}

export function pedidoInvalido(mensagem: string) {
  return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
}
