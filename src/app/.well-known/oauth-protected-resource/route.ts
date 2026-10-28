import { NextResponse } from "next/server";
import { metadadosDoRecurso } from "@/lib/server/mcp/oauth";
import { origemDoPedido } from "@/lib/server/mcp/origem";

/** O MCP e quem autoriza o acesso a ele (RFC 9728). O 401 de `/api/mcp` aponta para cá. */
export function GET(req: Request) {
  return NextResponse.json(metadadosDoRecurso(origemDoPedido(req)));
}
