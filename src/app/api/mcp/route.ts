import type { NextRequest } from "next/server";
import { backendDireto, responderMcp } from "@/lib/server/mcp/online";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";

/**
 * O MCP online do eua.journal (Streamable HTTP, sem sessão).
 *
 * Para conectar o Claude Code, no Mac ou no Windows:
 *
 *   claude mcp add --transport http euajournal https://<site>/api/mcp \
 *     --header "Authorization: Bearer <token>"
 *
 * O token sai de `src/scripts/criar-token-do-mcp.ts`. Ver `docs/mcp.md`.
 */

async function atender(req: NextRequest): Promise<Response> {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  return responderMcp(req, backendDireto(auth.acesso));
}

export const POST = atender;
export const GET = atender;
export const DELETE = atender;

// `montar_post` e `agendar_post` abrem o Chromium.
export const maxDuration = 120;
