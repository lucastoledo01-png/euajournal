import type { NextRequest } from "next/server";
import { consultaDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { pautas } from "@/lib/server/mcp/servico";

/** `pautas_disponiveis`: as pautas com pacote factual e foto (`?dias=`, padrão 30). */
export async function GET(req: NextRequest) {
  return rotaDoMcp(req, "pautas", (acesso) => pautas(acesso, consultaDoPedido(req)));
}
