import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { entregar } from "@/lib/server/mcp/servico";

/** `entregar_tarefa`: valida com as guardas da esteira e diz o que vem em seguida. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "entregar tarefa", (acesso) => entregar(acesso, corpo));
}
