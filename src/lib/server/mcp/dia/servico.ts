import type { SupabaseClient } from "@supabase/supabase-js";
import { projectToday } from "@/lib/server/projects";
import { criarCandidatosStore } from "@/lib/server/editorial/candidatos-store";
import { gravarImagemDaPauta } from "@/lib/server/visual/acervo/imagem-da-pauta";
import { enfileirar } from "@/lib/server/aprovacao/fila";
import { depsDaFila, projetoDaFila } from "@/lib/server/aprovacao/integracao";
import { hashDoPlano } from "@/lib/server/aprovacao/hash";
import { candidatosSupabase } from "@/lib/server/social/reels/candidatos";
import { linkDoPainel } from "../dia";
import { entregarEscritaDoReel, TIPO_DA_ESCRITA_DO_REEL } from "../reels/tarefa";
import { tarefasSupabase, type Tarefa } from "../tarefas-store";
import type { AcessoDoMcp } from "../tokens";
import { entregarTarefaDoArtigo } from "../artigo/fluxo";
import { entregarTarefaDaNewsletter, TIPOS_DA_NEWSLETTER } from "../newsletter/fluxo";
import { depsDaNewsletter, depsDoArtigo, depsDoDiretor } from "./deps";
import { proximoPassoDoDia, type PassoDoDia } from "./diretor";
import { entregarFoto, TIPO_DA_FOTO, type MaterialDaFoto } from "./fotos";
import { entregarPacote, TIPO_DO_PACOTE } from "./pacotes";
import { entregarPlano, TIPO_DO_PLANO } from "./plano";
import { planosSupabase } from "./plano-store";
import { entregarTriagem, TIPO_DA_TRIAGEM } from "./triagem";
import { comInstrucoesDoProjeto } from "@/lib/server/instrucoes";

/**
 * O dia pelo Claude no MCP (29/10/2026): `fazer_o_dia`, `aguardar` e a entrega
 * de qualquer tarefa do dia. Toda resposta traz o próximo passo, para o Claude
 * seguir sozinho até o fim: tarefa, aguardar ou pronto.
 */

type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; error: string; status: number };
type Imagem = { mime: string; base64: string };

function dataOuHoje(data: unknown, acesso: AcessoDoMcp): string | null {
  if (data === undefined || data === null || data === "") return projectToday(acesso.projeto);
  return typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

async function baixarImagem(url: string): Promise<Imagem | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    // O Claude recusa imagem grande demais; a prévia do Commons já vem em 1280 px.
    if (buffer.byteLength > 4_500_000) return null;
    return { mime: r.headers.get("content-type")?.split(";")[0] ?? "image/jpeg", base64: buffer.toString("base64") };
  } catch {
    return null;
  }
}

/** A tarefa como o Claude a recebe: sem o peso que só a plataforma usa, e com as fotos como imagem. */
export async function tarefaParaOClaude(t: Tarefa): Promise<{ tarefa: Record<string, unknown>; imagens: Imagem[] }> {
  let material: unknown = t.material;
  const imagens: Imagem[] = [];
  if (t.tipo === TIPO_DA_FOTO) {
    const m = t.material as unknown as MaterialDaFoto;
    material = { storyId: m.storyId, titulo: m.titulo, candidatas: m.candidatas.map(({ indice, papel, fonte, credito }) => ({ indice, papel, fonte, credito })) };
    for (const c of m.candidatas) {
      const img = await baixarImagem(c.previa);
      if (img) imagens.push(img);
    }
  } else if (t.tipo === "escrever_artigo") {
    material = { storyId: (t.material as { storyId?: string }).storyId };
  }
  return {
    tarefa: { id: t.id, tipo: t.tipo, estado: t.estado, motivos: t.motivos, instrucao: t.instrucao, material, esquema: t.esquema },
    imagens,
  };
}

async function passoParaOClaude(passo: PassoDoDia, acesso: AcessoDoMcp): Promise<Record<string, unknown>> {
  if (passo.tipo === "tarefa") {
    const { tarefa, imagens } = await tarefaParaOClaude(passo.tarefa);
    return { passo: "tarefa", etapa: passo.etapa, resumo: passo.resumo, tarefa, imagens };
  }
  if (passo.tipo === "aguardar") {
    return { passo: "aguardar", etapa: passo.etapa, motivo: passo.motivo, painel: linkDoPainel(acesso.projeto.slug) };
  }
  return { passo: "pronto", resumo: passo.resumo, painel: linkDoPainel(acesso.projeto.slug) };
}

export async function fazerODia(acesso: AcessoDoMcp, args: { data?: unknown }, client: SupabaseClient): Promise<Resposta> {
  const data = dataOuHoje(args.data, acesso);
  if (!data) return { ok: false, status: 400, error: "data inválida: use AAAA-MM-DD" };
  const passo = await proximoPassoDoDia(acesso.projeto, data, depsDoDiretor(client));
  return { ok: true, data, ...(await passoParaOClaude(passo, acesso)) };
}

/** Espera o plano sair de `aguardando` no servidor, até `segundos` (no máximo 50), e devolve o próximo passo. */
export async function aguardar(acesso: AcessoDoMcp, args: { data?: unknown; segundos?: unknown }, client: SupabaseClient): Promise<Resposta> {
  const data = dataOuHoje(args.data, acesso);
  if (!data) return { ok: false, status: 400, error: "data inválida: use AAAA-MM-DD" };
  const teto = Math.min(50, Math.max(5, Number(args.segundos ?? 45) || 45)) * 1000;
  const planos = planosSupabase(client);
  const inicio = Date.now();
  while (Date.now() - inicio < teto) {
    const plano = await planos.doDia(acesso.projeto.id, data);
    if (plano.estado !== "aguardando") break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return fazerODia(acesso, { data }, client);
}

/** A entrega de uma tarefa do dia, roteada pelo tipo, e o próximo passo junto. */
export async function entregarDoDia(
  acesso: AcessoDoMcp,
  tarefa: Tarefa,
  resultado: unknown,
  client: SupabaseClient,
): Promise<Resposta | null> {
  const tarefas = tarefasSupabase(client);
  const projeto = acesso.projeto;
  const quem = acesso.quem;
  let desfecho: Record<string, unknown>;

  if (tarefa.tipo === TIPO_DA_TRIAGEM) {
    desfecho = await entregarTriagem(projeto, tarefa, resultado, quem, {
      tarefas,
      candidatos: criarCandidatosStore(client),
      comInstrucoes: (p, fn) => comInstrucoesDoProjeto(p, fn),
    });
  } else if (tarefa.tipo === TIPO_DO_PLANO) {
    const planos = planosSupabase(client);
    desfecho = await entregarPlano(tarefa, resultado, quem, {
      tarefas,
      planos,
      async enfileirar(plano) {
        const p = projetoDaFila(projeto, projeto.id);
        if (!p) throw new Error("projeto ilegível para a fila");
        const linha = await enfileirar(
          p,
          {
            ramo: "plano",
            pecaId: plano.id,
            hash: hashDoPlano(plano.itens),
            publicarEm: null,
            avisos: [],
            resumo: { titulo: `Plano do dia ${plano.data}`, texto: JSON.stringify(plano.itens) } as never,
          },
          depsDaFila(client, p),
        );
        if (!linha) throw new Error("a fila de aprovação está desligada: o plano precisa dela em enforce");
      },
    });
  } else if (tarefa.tipo === TIPO_DO_PACOTE) {
    desfecho = await entregarPacote(tarefa, resultado, quem, {
      tarefas,
      async gravarPacote(projectId, storyId, pacote) {
        const { error } = await client
          .from("news_candidates")
          .update({ factual_package: pacote, updated_at: new Date().toISOString() })
          .eq("project_id", projectId)
          .eq("story_id", storyId);
        if (error) throw new Error(`pacote não gravado: ${error.message}`);
      },
    });
  } else if (tarefa.tipo === TIPO_DA_FOTO) {
    desfecho = await entregarFoto(tarefa, resultado, quem, {
      tarefas,
      gravarFoto: (projectId, r) => gravarImagemDaPauta(client, projectId, r, true),
    });
  } else if (tarefa.tipo === "escrever_artigo" || tarefa.tipo === "auditar_artigo") {
    desfecho = await entregarTarefaDoArtigo(projeto, tarefa, resultado, quem, depsDoArtigo(client, tarefas));
  } else if ((TIPOS_DA_NEWSLETTER as readonly string[]).includes(tarefa.tipo)) {
    desfecho = await entregarTarefaDaNewsletter(projeto, tarefa, resultado, quem, depsDaNewsletter(client, tarefas));
  } else if (tarefa.tipo === TIPO_DA_ESCRITA_DO_REEL) {
    desfecho = await entregarEscritaDoReel(tarefa, resultado, quem, { tarefas, candidatos: candidatosSupabase(client) });
  } else {
    return null;
  }

  // A tarefa de reparo volta com as fotos, quando é foto; o resto, como o diretor mandar.
  const { tarefa: _t, ...semTarefa } = desfecho as { tarefa?: Tarefa };
  const proximo = await proximoPassoDoDia(projeto, tarefa.editionDate, depsDoDiretor(client));
  return { ok: true, ...semTarefa, proximo: await passoParaOClaude(proximo, acesso) };
}

/** O próximo passo do dia, só quando há um dia em produção (plano aprovado): a entrega do post manual não puxa a triagem. */
export async function proximoSeHouverDia(acesso: AcessoDoMcp, data: string, client: SupabaseClient): Promise<Record<string, unknown> | null> {
  const plano = await planosSupabase(client).doDia(acesso.projeto.id, data);
  if (plano.estado !== "aprovado") return null;
  return passoParaOClaude(await proximoPassoDoDia(acesso.projeto, data, depsDoDiretor(client)), acesso);
}
