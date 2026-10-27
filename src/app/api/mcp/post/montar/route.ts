import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { montar } from "@/lib/server/mcp/servico";

/** `montar_post`: a prévia da arte e da legenda, sem gravar nada. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "montar post", (acesso) => montar(acesso, corpo));
}

// O render abre o Chromium.
export const maxDuration = 120;
