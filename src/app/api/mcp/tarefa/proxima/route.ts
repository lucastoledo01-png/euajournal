import type { NextRequest } from "next/server";
import { consultaDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { proximaTarefa } from "@/lib/server/mcp/servico";

/** `proxima_tarefa`: a mais antiga que espera o Claude, reparo antes de nova. */
export async function GET(req: NextRequest) {
  return rotaDoMcp(req, "próxima tarefa", (acesso) => proximaTarefa(acesso, consultaDoPedido(req)));
}
