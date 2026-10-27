import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { depsDaFila } from "@/lib/server/aprovacao/integracao";
import { modoDaFila } from "@/lib/server/aprovacao/modo";
import { visaoDaFila } from "@/lib/server/aprovacao/painel";
import { comoProjetoDaFila } from "@/lib/server/aprovacao/rotas";
import { resumoDoDia } from "@/lib/server/mcp/dia";
import { dataDoPedido, dataInvalida, erroDaRota } from "@/lib/server/mcp/rota";
import { tarefasSupabase } from "@/lib/server/mcp/tarefas-store";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/** `estado_do_dia`: o que falta, por etapa, e o próximo passo. Só leitura. */
export async function GET(req: NextRequest) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  const { projeto } = auth.acesso;

  const data = dataDoPedido(req, projeto);
  if (!data) return dataInvalida();

  try {
    const client = getSupabaseAdminClient();
    const p = comoProjetoDaFila(projeto);
    const [visao, tarefas] = await Promise.all([
      visaoDaFila(p, depsDaFila(client, p)),
      tarefasSupabase(client).doDia(projeto.id, data),
    ]);
    return NextResponse.json({
      ok: true,
      projeto: { slug: projeto.slug, nome: projeto.name },
      ...resumoDoDia({ data, modoDaFila: modoDaFila(p), fila: visao.fila, tarefas }),
    });
  } catch (erro) {
    return erroDaRota("estado do dia", erro);
  }
}
