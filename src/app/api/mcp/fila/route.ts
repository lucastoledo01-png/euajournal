import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { depsDaFila } from "@/lib/server/aprovacao/integracao";
import { visaoDaFila } from "@/lib/server/aprovacao/painel";
import { comoProjetoDaFila } from "@/lib/server/aprovacao/rotas";
import { linkDoPainel, pecasDaFila } from "@/lib/server/mcp/dia";
import { erroDaRota } from "@/lib/server/mcp/rota";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * `ver_fila`: as peças na fila de aprovação, só leitura.
 *
 * Não há POST aqui, e não vai haver: aprovar, reprovar e cancelar são do
 * painel, por decisão do dono (27/10/2026). O Claude vê o estado e o motivo de
 * uma reprovação; quem decide abre o link.
 */
export async function GET(req: NextRequest) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  const { projeto } = auth.acesso;

  try {
    const client = getSupabaseAdminClient();
    const p = comoProjetoDaFila(projeto);
    const visao = await visaoDaFila(p, depsDaFila(client, p));
    return NextResponse.json({
      ok: true,
      modo: visao.modo,
      painel: linkDoPainel(projeto.slug),
      pecas: pecasDaFila(visao.fila, projeto.slug),
    });
  } catch (erro) {
    return erroDaRota("fila", erro);
  }
}
