import type { NextRequest } from "next/server";
import { corpoDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { iniciar } from "@/lib/server/mcp/servico";

/** `iniciar_post`: abre a tarefa de escrita da pauta, com o pedido exato da esteira. */
export async function POST(req: NextRequest) {
  const corpo = await corpoDoPedido(req);
  return rotaDoMcp(req, "iniciar post", (acesso) => iniciar(acesso, corpo));
}
