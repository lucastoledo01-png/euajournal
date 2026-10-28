import { NextResponse } from "next/server";
import { metadadosDoServidor } from "@/lib/server/mcp/oauth";
import { origemDoPedido } from "@/lib/server/mcp/origem";

/** Onde o Claude faz login no MCP (RFC 8414). Ver `lib/server/mcp/oauth.ts`. */
export function GET(req: Request) {
  return NextResponse.json(metadadosDoServidor(origemDoPedido(req)));
}
