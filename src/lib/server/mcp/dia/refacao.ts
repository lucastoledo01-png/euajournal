import type { SupabaseClient } from "@supabase/supabase-js";
import type { GanchosDeRefazer } from "@/lib/server/aprovacao/refazer";

/**
 * A reprovação do plano do dia volta ao Claude (29/10/2026): a tarefa
 * `propor_plano` reabre em `reparar` com o motivo do dono, e a fila espera a
 * versão nova (`com_o_claude`). O Claude refaz e a entrega devolve o plano à
 * fila com hash novo. A terceira reprovação descarta, pela regra da fila.
 */
export function comPlano(ganchos: GanchosDeRefazer, client: () => SupabaseClient): GanchosDeRefazer {
  return {
    ...ganchos,
    plano: {
      selecao: async (ctx) => {
        const [{ planosSupabase }, { tarefasSupabase }, { reabrirPlano }] = await Promise.all([
          import("./plano-store"),
          import("../tarefas-store"),
          import("./plano"),
        ]);
        const planos = planosSupabase(client());
        const plano = await planos.porId(ctx.aprovacao.pecaId);
        if (!plano) return { ok: false, motivo: "o plano não existe mais" };
        const tarefa = await reabrirPlano(plano, ctx.motivo, { planos, tarefas: tarefasSupabase(client()) });
        if (!tarefa) return { ok: false, motivo: "a tarefa do plano não existe mais: peça ao Claude um plano novo" };
        return { ok: true, assincrona: `voltou ao Claude (tarefa ${tarefa.id}): o plano novo entra aqui quando ele refizer` };
      },
    },
  };
}
