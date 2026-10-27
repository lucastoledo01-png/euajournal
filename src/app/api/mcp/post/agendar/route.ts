import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { agendar } from "@/lib/server/mcp/servico";

/**
 * `agendar_post`: congela a arte, grava o post e o põe na fila de aprovação.
 * Ele não vai ao ar daqui: espera alguém aprovar no painel.
 */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "agendar post", (acesso) => agendar(acesso, corpo));
}

export const maxDuration = 120;
