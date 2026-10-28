import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Resposta } from "./servico";
import { requireTokenDoMcp, type AcessoDoMcp } from "./tokens";

/**
 * O que as rotas `/api/mcp/<ferramenta>` têm em comum: o token, o erro sem
 * segredo e a tradução da resposta do serviço em HTTP. A lógica mora em
 * `servico.ts`, que o MCP online também chama.
 */

export function erroDaRota(rotulo: string, erro: unknown) {
  console.error(`[MCP] ${rotulo}:`, erro);
  return NextResponse.json(
    { ok: false, error: erro instanceof Error ? erro.message : `Falha em ${rotulo}.` },
    { status: 500 },
  );
}

/** O corpo JSON do pedido, ou objeto vazio. */
export async function corpoDoPedido(req: NextRequest): Promise<Record<string, unknown>> {
  const corpo = (await req.json().catch(() => null)) as unknown;
  return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
}

/** Os parâmetros da URL como objeto, para as ferramentas de leitura. */
export function consultaDoPedido(req: NextRequest): Record<string, string> {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

export async function rotaDoMcp(
  req: NextRequest,
  rotulo: string,
  fn: (acesso: AcessoDoMcp) => Promise<Resposta>,
) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  try {
    const r = await fn(auth.acesso);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (erro) {
    return erroDaRota(rotulo, erro);
  }
}
