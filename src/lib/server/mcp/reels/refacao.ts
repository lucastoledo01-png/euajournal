import type { SupabaseClient } from "@supabase/supabase-js";
import type { Etapa } from "@/lib/server/aprovacao/contrato";
import type { ContextoDaRefacao, GanchoDeEtapa, GanchosDeRefazer, ResultadoDaEtapa } from "@/lib/server/aprovacao/refazer";

/**
 * A reprovação do Reel volta para o Claude (28/10/2026, fase 4 do plano).
 *
 * O Reel não tem gerador na plataforma: quem escreve é o Claude, pelo MCP. Então
 * reprovar o texto, a imagem ou a arte de um Reel reabre a tarefa
 * `escrever_reel` em `reparar`, com o motivo do dono, e a peça fica em
 * `refazendo` (`com_o_claude`). O Claude reescreve (pode trocar o molde e o
 * corte), o worker renderiza de novo, e a versão nova volta a `aguardando` com
 * hash novo. A terceira reprovação descarta, pela regra da fila.
 *
 * A seleção não tem o que reescrever: o vídeo é o que foi recusado.
 */

const ETAPAS_DO_POST: Etapa[] = ["selecao", "texto", "imagem", "arte"];

async function candidatoDoPost(client: SupabaseClient, postId: string): Promise<string | null> {
  const { data, error } = await client.from("social_posts").select("content_json").eq("id", postId).maybeSingle();
  if (error) throw new Error(`social_posts, leitura falhou: ${error.message}`);
  const conteudo = ((data as { content_json?: Record<string, unknown> } | null)?.content_json ?? {}) as {
    formato?: unknown;
    reel?: { candidato_id?: unknown };
  };
  if (conteudo.formato !== "reel") return null;
  return typeof conteudo.reel?.candidato_id === "string" ? conteudo.reel.candidato_id : "";
}

/** Devolve o desfecho do Reel, ou `null` quando a peça não é Reel e vale o gancho de sempre. */
export async function refazerReel(ctx: ContextoDaRefacao, client: SupabaseClient): Promise<ResultadoDaEtapa | null> {
  const candidatoId = await candidatoDoPost(client, ctx.aprovacao.pecaId);
  if (candidatoId === null) return null;
  if (!candidatoId) return { ok: false, motivo: "o Reel não guardou o candidato de origem: cancele a peça" };
  if (ctx.etapa === "selecao") {
    return { ok: false, motivo: "no Reel a seleção é o vídeo: cancele a peça e peça outro ao Claude (reels_sugeridos)" };
  }

  const [{ candidatosSupabase }, { tarefasSupabase }, { reabrirEscritaDoReel }] = await Promise.all([
    import("@/lib/server/social/reels/candidatos"),
    import("../tarefas-store"),
    import("./tarefa"),
  ]);
  const candidatos = candidatosSupabase(client);
  const candidato = await candidatos.porId(candidatoId);
  if (!candidato) return { ok: false, motivo: `o candidato ${candidatoId} do Reel não existe mais` };
  const motivo = `${ctx.etapa === "texto" ? "texto" : ctx.etapa === "imagem" ? "corte do vídeo" : "arte (molde)"}: ${ctx.motivo}`;
  const tarefa = await reabrirEscritaDoReel(candidato, motivo, { candidatos, tarefas: tarefasSupabase(client) });
  if (!tarefa) return { ok: false, motivo: "a tarefa de texto deste Reel não existe mais: cancele a peça" };
  return {
    ok: true,
    assincrona: `voltou ao Claude (tarefa ${tarefa.id}): a versão nova entra na fila quando ele reescrever e o worker renderizar`,
  };
}

/** Os ganchos do post com o Reel na frente: Reel vai ao Claude, o resto segue como sempre. */
export function comReel(ganchos: GanchosDeRefazer, client: () => SupabaseClient): GanchosDeRefazer {
  const post: Partial<Record<Etapa, GanchoDeEtapa>> = {};
  for (const etapa of ETAPAS_DO_POST) {
    const original = ganchos.post?.[etapa];
    post[etapa] = async (ctx) => {
      const reel = await refazerReel(ctx, client());
      if (reel) return reel;
      if (!original) return { ok: false, motivo: `ETAPA_SEM_REGENERACAO: a etapa "${etapa}" do post ainda não tem regeneração automática` };
      return original(ctx);
    };
  }
  return { ...ganchos, post };
}
