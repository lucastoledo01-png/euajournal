import type { NextRequest } from "next/server";
import { consultaDoPedido, rotaDoMcp } from "@/lib/server/mcp/rota";
import { estadoDoDia } from "@/lib/server/mcp/servico";

/** `estado_do_dia`: o que falta, por etapa, e o próximo passo. Só leitura. */
export async function GET(req: NextRequest) {
  return rotaDoMcp(req, "estado do dia", (acesso) => estadoDoDia(acesso, consultaDoPedido(req)));
}
