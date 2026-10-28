import type { SupabaseClient } from "@supabase/supabase-js";
import { candidatosSupabase, type CandidatoDeReel, type CandidatosDeReel } from "@/lib/server/social/reels/candidatos";
import { modoDosReels } from "@/lib/server/social/reels/descoberta";
import { linkDoPainel } from "../dia";
import { tarefasSupabase, type TarefasStore } from "../tarefas-store";
import type { AcessoDoMcp } from "../tokens";

/**
 * As ferramentas do Reel no MCP (28/10/2026). Nenhuma publica nem aprova: o
 * Claude escolhe o vídeo, escreve o texto (pela tarefa `escrever_reel`) e olha
 * o resultado; o Reel só vai ao ar aprovado no painel.
 */

type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; error: string; status: number };

export type DepsDoReelNoMcp = {
  candidatos: CandidatosDeReel;
  tarefas: TarefasStore;
  baixarImagem: (url: string) => Promise<{ mime: string; base64: string } | null>;
};

export function depsDoReelNoMcp(client: SupabaseClient): DepsDoReelNoMcp {
  return {
    candidatos: candidatosSupabase(client),
    tarefas: tarefasSupabase(client),
    async baixarImagem(url) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!r.ok) return null;
        return { mime: r.headers.get("content-type") ?? "image/jpeg", base64: Buffer.from(await r.arrayBuffer()).toString("base64") };
      } catch {
        return null;
      }
    },
  };
}

function resumo(c: CandidatoDeReel) {
  return {
    id: c.id,
    fonte: c.fonte,
    autor: c.autor,
    titulo: c.titulo,
    link: c.permalink,
    nota: c.nota,
    publicado_em: c.publicadoEm,
    historia_do_termometro: c.metricas.historia ?? null,
    metricas: c.metricas,
  };
}

export async function reelsSugeridos(acesso: AcessoDoMcp, args: { limite?: unknown }, deps: DepsDoReelNoMcp): Promise<Resposta> {
  if (modoDosReels(acesso.projeto) === "off") {
    return { ok: false, status: 409, error: "os Reels estão desligados neste projeto (settings.capacidades.reels)" };
  }
  const limite = Math.min(20, Math.max(1, Number(args.limite ?? 8) || 8));
  const lista = await deps.candidatos.sugeridos(acesso.projeto.id, limite);
  return {
    ok: true,
    reels: lista.map(resumo),
    proximo_passo: lista.length
      ? "Escolha um e chame produzir_reel com o id. Abra o link para ver o vídeo de origem."
      : "Nenhum candidato novo. A descoberta roda de hora em hora, das 9h às 17h.",
  };
}

export async function produzirReel(acesso: AcessoDoMcp, args: { candidato_id?: unknown }, deps: DepsDoReelNoMcp): Promise<Resposta> {
  const id = typeof args.candidato_id === "string" ? args.candidato_id : "";
  const c = id ? await deps.candidatos.porId(id) : null;
  if (!c || c.projectId !== acesso.projeto.id) return { ok: false, status: 404, error: "candidato não encontrado neste projeto" };
  // O que falhou (download, render, sem vaga) tenta de novo com o preparo e o texto que já tinha.
  if (c.estado === "falhou") {
    if (!(await deps.candidatos.tentarDeNovo(id))) return { ok: false, status: 409, error: "outro pedido mexeu neste candidato antes" };
    return { ok: true, candidato_id: id, proximo_passo: "De volta ao worker, com o texto que você já entregou. Acompanhe com ver_reel." };
  }
  if (c.estado !== "nova") return { ok: false, status: 409, error: `o candidato está "${c.estado}"${c.motivo ? `: ${c.motivo}` : ""}` };
  if (!(await deps.candidatos.escolher(id))) return { ok: false, status: 409, error: "outro pedido escolheu este candidato antes" };
  return {
    ok: true,
    candidato_id: id,
    proximo_passo:
      "O worker baixa o vídeo, mede o corte e abre a tarefa escrever_reel, em cerca de um minuto. " +
      "Chame ver_reel para ver a folha de quadros com o corte, e proxima_tarefa com tipo escrever_reel para escrever.",
  };
}

export async function verReel(
  acesso: AcessoDoMcp,
  args: { candidato_id?: unknown },
  deps: DepsDoReelNoMcp,
): Promise<Resposta & { imagem?: { mime: string; base64: string } | null }> {
  const id = typeof args.candidato_id === "string" ? args.candidato_id : "";
  const c = id ? await deps.candidatos.porId(id) : null;
  if (!c || c.projectId !== acesso.projeto.id) return { ok: false, status: 404, error: "candidato não encontrado neste projeto" };

  const tarefa = c.preparo?.tarefaId ? await deps.tarefas.porId(c.preparo.tarefaId) : null;
  const etapa =
    c.estado === "pronta"
      ? "pronto: o Reel está na fila de aprovação do painel"
      : c.estado === "renderizando"
        ? "o worker está trabalhando neste vídeo"
        : c.estado === "escolhida" && !c.preparo
          ? "esperando o worker baixar e preparar"
          : c.estado === "escolhida" && !c.texto
            ? `esperando o texto: tarefa ${tarefa?.id ?? "?"} (${tarefa?.estado ?? "?"})`
            : c.estado === "escolhida"
              ? "texto aceito, esperando o render"
              : `${c.estado}${c.motivo ? `: ${c.motivo}` : ""}`;

  // A folha do Reel pronto quando há; antes disso, a do vídeo de origem com o corte proposto.
  const folha = (c.estado === "pronta" ? c.preparo?.folhaFinalUrl : null) ?? c.preparo?.folhaUrl ?? null;
  return {
    ok: true,
    ...resumo(c),
    estado: c.estado,
    etapa,
    texto: c.texto ? { molde: c.texto.molde, manchete: c.texto.manchete, legenda: c.texto.legenda, corte: c.texto.corte } : null,
    corte_proposto: c.preparo?.corte ?? null,
    tarefa: tarefa ? { id: tarefa.id, estado: tarefa.estado, motivos: tarefa.motivos } : null,
    painel: c.estado === "pronta" ? linkDoPainel(acesso.projeto.slug) : null,
    imagem: folha ? await deps.baixarImagem(folha) : null,
  };
}

