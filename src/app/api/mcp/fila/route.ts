import type { NextRequest } from "next/server";
import { rotaDoMcp } from "@/lib/server/mcp/rota";
import { verFila } from "@/lib/server/mcp/servico";

/**
 * `ver_fila`: as peças na fila de aprovação, só leitura.
 *
 * Não há POST aqui, e não vai haver: aprovar, reprovar e cancelar são do
 * painel, por decisão do dono (27/10/2026).
 */
export async function GET(req: NextRequest) {
  return rotaDoMcp(req, "fila", (acesso) => verFila(acesso));
}
