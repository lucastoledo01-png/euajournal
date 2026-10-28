import type { SupabaseClient } from "@supabase/supabase-js";
import { depsDaFila } from "@/lib/server/aprovacao/integracao";
import { modoDaFila } from "@/lib/server/aprovacao/modo";
import { visaoDaFila } from "@/lib/server/aprovacao/painel";
import { comoProjetoDaFila } from "@/lib/server/aprovacao/rotas";
import { projectToday } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { linkDoPainel, pecasDaFila, resumoDoDia } from "./dia";
import { agendarPost, montarPost } from "./post/agendar";
import { depsDoPost, projetoDaFonte } from "./post/deps";
import { entregarTarefaDoPost, iniciarPost } from "./post/fluxo";
import { pautasDisponiveis } from "./post/material";
import { ehTipoDeTarefa, tarefasSupabase } from "./tarefas-store";
import { entregarEscritaDoReel, TIPO_DA_ESCRITA_DO_REEL } from "./reels/tarefa";
import { candidatosSupabase } from "@/lib/server/social/reels/candidatos";
import type { AcessoDoMcp } from "./tokens";

/**
 * O que cada ferramenta do MCP faz, num lugar só (27/10/2026).
 *
 * As ferramentas chegam por dois caminhos: as rotas `/api/mcp/<ferramenta>`,
 * que o servidor local (stdio) chama por HTTP, e o MCP online em `/api/mcp`,
 * que o Claude do usuário acessa direto, de Mac ou Windows, sem instalar nada.
 * Os dois chamam estas funções, então a regra é uma só.
 *
 * Toda função recebe o acesso já conferido (`requireTokenDoMcp`) e devolve o
 * corpo da resposta: `{ ok: true, ... }` ou `{ ok: false, error, status }`.
 * Nenhuma aprova, reprova ou cancela peça: isso é só do painel.
 */

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; error: string; status: number };

function recusa(status: number, error: string): Resposta {
  return { ok: false, error, status };
}

function dataOuHoje(data: unknown, acesso: AcessoDoMcp): string | null {
  if (data === undefined || data === null || data === "") return projectToday(acesso.projeto);
  return typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

function pedidoDePost(args: Record<string, unknown>, acesso: AcessoDoMcp): { storyId: string; data: string } | null {
  const storyId = typeof args.story_id === "string" ? args.story_id.trim() : "";
  const data = dataOuHoje(args.data, acesso);
  return storyId && data ? { storyId, data } : null;
}

const DATA_INVALIDA = "data inválida: use AAAA-MM-DD";
const POST_INVALIDO = "informe story_id e, se quiser, data (AAAA-MM-DD)";

export async function estadoDoDia(acesso: AcessoDoMcp, args: { data?: unknown }, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const data = dataOuHoje(args.data, acesso);
  if (!data) return recusa(400, DATA_INVALIDA);
  const p = comoProjetoDaFila(acesso.projeto);
  const [visao, tarefas] = await Promise.all([
    visaoDaFila(p, depsDaFila(client, p)),
    tarefasSupabase(client).doDia(acesso.projeto.id, data),
  ]);
  return {
    ok: true,
    projeto: { slug: acesso.projeto.slug, nome: acesso.projeto.name },
    ...resumoDoDia({ data, modoDaFila: modoDaFila(p), fila: visao.fila, tarefas }),
  };
}

export async function verFila(acesso: AcessoDoMcp, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const p = comoProjetoDaFila(acesso.projeto);
  const visao = await visaoDaFila(p, depsDaFila(client, p));
  return { ok: true, modo: visao.modo, painel: linkDoPainel(acesso.projeto.slug), pecas: pecasDaFila(visao.fila, acesso.projeto.slug) };
}

/**
 * As pautas com pacote factual e foto. No passo 2 do plano elas vêm dos posts
 * que a esteira produziu (`settings.mcp.pautas_de`), só lidas. A janela é de
 * 30 dias, de 1 a 60: os posts feitos à mão não guardam o pacote factual, e
 * numa semana só deles a janela curta voltava vazia.
 */
export async function pautas(acesso: AcessoDoMcp, args: { dias?: unknown }, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const fonte = await projetoDaFonte(acesso.projeto);
  if (!fonte) return recusa(404, "o projeto de pautas declarado não existe");
  const pedidos = Number(args.dias ?? 30);
  const dias = Number.isFinite(pedidos) ? Math.min(60, Math.max(1, Math.round(pedidos))) : 30;
  const desdeIso = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const lista = await pautasDisponiveis(client, { projectIdDaFonte: fonte.id, projectIdDoClaude: acesso.projeto.id, desdeIso });
  return { ok: true, fonte: fonte.slug, dias, pautas: lista };
}

export async function iniciar(acesso: AcessoDoMcp, args: Record<string, unknown>, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const pedido = pedidoDePost(args, acesso);
  if (!pedido) return recusa(400, POST_INVALIDO);
  const r = await iniciarPost(acesso.projeto, pedido, depsDoPost(client));
  return r.ok ? { ok: true, tarefa: r.tarefa } : recusa(422, r.error);
}

export async function proximaTarefa(acesso: AcessoDoMcp, args: { tipo?: unknown }, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const tipo = args.tipo;
  if (tipo !== undefined && tipo !== null && tipo !== "" && !ehTipoDeTarefa(tipo)) {
    return recusa(400, `tipo de tarefa desconhecido: ${String(tipo)}`);
  }
  const tarefa = await tarefasSupabase(client).proxima(acesso.projeto.id, ehTipoDeTarefa(tipo) ? tipo : undefined);
  return { ok: true, tarefa };
}

export async function entregar(acesso: AcessoDoMcp, args: { id?: unknown; resultado?: unknown }, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const id = typeof args.id === "string" ? args.id : "";
  if (!id || args.resultado === undefined) return recusa(400, "informe id e resultado");
  const tarefas = tarefasSupabase(client);
  const tarefa = await tarefas.porId(id);
  if (tarefa?.tipo === TIPO_DA_ESCRITA_DO_REEL) {
    if (tarefa.projectId !== acesso.projeto.id) return recusa(422, "tarefa não encontrada neste projeto");
    if (tarefa.estado !== "aberta" && tarefa.estado !== "reparar") return recusa(422, `a tarefa está "${tarefa.estado}" e não aceita entrega`);
    return { ...(await entregarEscritaDoReel(tarefa, args.resultado, acesso.quem, { tarefas, candidatos: candidatosSupabase(client) })) };
  }
  const r = await entregarTarefaDoPost(acesso.projeto, { id, resultado: args.resultado, quem: acesso.quem }, depsDoPost(client));
  return r.ok ? { ...r } : recusa(422, r.error);
}

export async function montar(acesso: AcessoDoMcp, args: Record<string, unknown>, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const pedido = pedidoDePost(args, acesso);
  if (!pedido) return recusa(400, POST_INVALIDO);
  const r = await montarPost(acesso.projeto, pedido, depsDoPost(client));
  if (!r.ok) return recusa(422, r.error);
  return { ok: true, manchete: r.manchete, legenda: r.legenda, imagem: { mime: "image/jpeg", base64: r.png.toString("base64") } };
}

export async function agendar(acesso: AcessoDoMcp, args: Record<string, unknown>, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const pedido = pedidoDePost(args, acesso);
  if (!pedido) return recusa(400, POST_INVALIDO);
  const r = await agendarPost(acesso.projeto, pedido, depsDoPost(client));
  if (!r.ok) return recusa(422, r.error);
  return { ...r, painel: linkDoPainel(acesso.projeto.slug), aguardando: "aprovação no painel" };
}
