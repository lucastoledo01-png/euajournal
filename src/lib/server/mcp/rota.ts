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
