import { z } from "zod";
import type { Project } from "@/lib/server/projects";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import { aceitarClaims, montarSystemDeClaims, montarUserDeClaims } from "@/lib/server/editorial/claims-semanticas";
import { RespostaDeClaimsSchema } from "@/lib/server/editorial/claims-semanticas";
import { pautaAvaliadaDoContexto } from "@/lib/server/aprovacao/contexto-de-producao";
import {
  aceitarCopy,
  CopyDoPostSchema,
  instrucaoDeReparoDaCopy,
  montarLegenda,
  montarSystemDaCopy,
  montarUserDaCopy,
  type CopyDoPost,
  type MarcaSocial,
} from "@/lib/server/social/copy";
import { auditarEstatico } from "@/lib/server/social/carrossel/semantica";
import { maximoDeReparos } from "@/lib/server/social/gerador";
import { avaliarPostSocial, type ContextoDoPost, type VeredictoDoPost } from "@/lib/server/social/social-guard";
import type { MaterialDoPost } from "./material";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * O post do Claude, da pauta à peça pronta para montar (27/10/2026).
 *
 * É o laço de `gerarPostDaPauta` (`social/gerador.ts`) com o modelo do lado de
 * fora: em vez de chamar a OpenAI e esperar, a plataforma abre uma tarefa e
 * volta quando o Claude entrega. A ordem é a mesma da esteira:
 *
 *   escrever_post ─► auditar_post ─► guarda ─┬─ passou: pronto para montar
 *         ▲                                  ├─ reparar: volta para escrever
 *         └──────────── até 2 reparos ───────┴─ descartar: tarefa cancelada
 *
 * O texto que o Claude recebe é o MESMO que a OpenAI receberia
 * (`montarSystemDaCopy`, `montarUserDaCopy`, o reparo de `instrucaoDeReparoDaCopy`),
 * montado dentro das instruções vigentes do projeto e com a voz e a memória
 * do canal do post. A entrega passa pela MESMA limpeza (`aceitarCopy`), pela
 * MESMA auditoria (`auditarEstatico`, com o Claude no lugar do auditor) e pela
 * MESMA guarda (`avaliarPostSocial`).
 *
 * A auditoria é uma tarefa separada, com material isolado: só o pacote e o
 * texto, nada do raciocínio da escrita. O MCP não enxerga a conversa, então
 * não consegue OBRIGAR outro contexto; a ferramenta recomenda auditar numa
 * conversa nova, e quem entregou fica gravado.
 */

/** O que a tarefa de escrita guarda além do material: a marca, para a entrega ler a mesma keyword. */
export type MaterialDaEscrita = MaterialDoPost & { keyword: string; hashtags: boolean };

export type ResultadoDaEscrita = {
  copy: CopyDoPost;
  /**
   * Quantas reescritas a guarda já pediu. Contado à parte, e não por
   * `tentativas`, que conta toda entrega, inclusive a que nem coube no esquema.
   */
  reparos: number;
  /** Preenchido quando a auditoria e a guarda passaram. Só aí o post pode ser montado. */
  pronto?: { auditoria: string; em: string };
};

export type DepsDoPost = {
  tarefas: TarefasStore;
  marca: (projeto: Project) => Promise<MarcaSocial>;
  comInstrucoes: <T>(projeto: Project, fn: () => Promise<T>) => Promise<T>;
  candidata: (projectIdDaFonte: string, storyId: string) => Promise<CandidataPersistida | null>;
  material: (projeto: Project, storyId: string, data: string) => Promise<{ ok: true; material: MaterialDoPost } | { ok: false; motivo: string }>;
  env?: Record<string, string | undefined>;
  agora?: () => Date;
};

export const ESQUEMA_DA_COPY = z.toJSONSchema(CopyDoPostSchema, { io: "input" }) as Record<string, unknown>;
export const ESQUEMA_DA_AUDITORIA = z.toJSONSchema(RespostaDeClaimsSchema, { io: "input" }) as Record<string, unknown>;

export const ORIENTACAO_DA_ESCRITA =
  "Responda SÓ com o JSON do esquema, seguindo a instrução (system e user) ao pé da letra. " +
  "Você escreve; a plataforma confere com as mesmas guardas da esteira e devolve o que corrigir.";

export const ORIENTACAO_DA_AUDITORIA =
  "Audite como se não tivesse escrito este texto: de preferência numa conversa nova. " +
  "Julgue só pelo pacote factual que vem aqui, e responda SÓ com o JSON do esquema.";

type Desfecho =
  | { desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }
  | { desfecho: "auditar"; tarefa: Tarefa }
  | { desfecho: "pronto"; storyId: string }
  | { desfecho: "descartado"; storyId: string; motivos: string[] };

export type ResultadoDaEntrega = { ok: true } & Desfecho;

function erro(mensagem: string) {
  return { ok: false as const, error: mensagem };
}

/** Abre a escrita de um post. Pauta que já tem escrita no dia devolve a tarefa que existe. */
export async function iniciarPost(
  projeto: Project,
  pedido: { storyId: string; data: string },
  deps: DepsDoPost,
): Promise<{ ok: true; tarefa: Tarefa } | { ok: false; error: string }> {
  const m = await deps.material(projeto, pedido.storyId, pedido.data);
  if (!m.ok) return erro(m.motivo);

  const candidata = await deps.candidata(m.material.origem.projectId, pedido.storyId);
  const marca = await deps.marca(projeto);
  const pauta = pautaAvaliadaDoContexto(m.material.pauta, candidata);

  const instrucao = await deps.comInstrucoes(projeto, async () => ({
    system: montarSystemDaCopy(marca),
    user: montarUserDaCopy(pauta, m.material.pacote),
    orientacao: ORIENTACAO_DA_ESCRITA,
  }));

  const material: MaterialDaEscrita = { ...m.material, keyword: marca.keyword, hashtags: marca.hashtags === true };
  const tarefa = await deps.tarefas.abrir({
    projectId: projeto.id,
    editionDate: pedido.data,
    tipo: "escrever_post",
    chave: pedido.storyId,
    instrucao,
    material,
    esquema: ESQUEMA_DA_COPY,
  });
  return { ok: true, tarefa };
}

async function contextoDaGuarda(material: MaterialDaEscrita, deps: DepsDoPost): Promise<ContextoDoPost> {
  const candidata = await deps.candidata(material.origem.projectId, material.pauta.storyId);
  return {
    pauta: pautaAvaliadaDoContexto(material.pauta, candidata),
    pacote: material.pacote,
    candidata,
    keyword: material.keyword,
    fechamentoDaNewsletter: (deps.env ?? process.env).NEWSLETTER_FINAL_LINE,
    hashtags: material.hashtags,
  };
}

function motivosDo(veredicto: VeredictoDoPost): string[] {
  return veredicto.issues.map((p) => `[${p.motivo}] ${p.detalhe}`);
}

async function entregarEscrita(tarefa: Tarefa, resultado: unknown, quem: string, deps: DepsDoPost): Promise<ResultadoDaEntrega> {
  const material = tarefa.material as MaterialDaEscrita;
  let copy: CopyDoPost;
  try {
    copy = aceitarCopy(resultado, material.posicao, material.keyword);
  } catch (e) {
    const motivos = [`a resposta não cabe no esquema da copy: ${e instanceof Error ? e.message : String(e)}`];
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }

  const reparos = (tarefa.resultado as Partial<ResultadoDaEscrita> | null)?.reparos ?? 0;
  const entregue = await deps.tarefas.entregar(tarefa.id, { copy, reparos } satisfies ResultadoDaEscrita, quem);
  const auditoria = await deps.tarefas.abrir({
    projectId: tarefa.projectId,
    editionDate: tarefa.editionDate,
    tipo: "auditar_post",
    // Uma auditoria por versão da copy: o reparo abre outra.
    chave: `${tarefa.chave}#${entregue.tentativas}`,
    instrucao: {
      system: montarSystemDeClaims({ comEscopo: true }),
      user: montarUserDeClaims([{ indice: 0, titulo: copy.headline, texto: montarLegenda(copy), pacote: material.pacote }]),
      orientacao: ORIENTACAO_DA_AUDITORIA,
    },
    material: { escrita: tarefa.id, storyId: tarefa.chave },
    esquema: ESQUEMA_DA_AUDITORIA,
  });
  return { ok: true, desfecho: "auditar", tarefa: auditoria };
}

async function entregarAuditoria(tarefa: Tarefa, resultado: unknown, quem: string, deps: DepsDoPost): Promise<ResultadoDaEntrega> {
  const aceita = aceitarClaims(resultado);
  if ("erro" in aceita) {
    const motivos = [`a resposta não cabe no esquema da auditoria: ${aceita.erro}`];
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  await deps.tarefas.entregar(tarefa.id, resultado, quem);

  const escritaId = String((tarefa.material as { escrita?: unknown }).escrita ?? "");
  const escrita = await deps.tarefas.porId(escritaId);
  if (!escrita) throw new Error(`a escrita ${escritaId} desta auditoria não existe`);
  const material = escrita.material as MaterialDaEscrita;
  const { copy, reparos: reparosGastos } = escrita.resultado as ResultadoDaEscrita;

  // A auditoria da esteira, com o veredito do Claude no lugar da chamada à OpenAI.
  const auditoria = await auditarEstatico(
    { titulo: copy.headline, texto: montarLegenda(copy), pacote: material.pacote },
    { auditor: async () => ({ ...aceita, custoUsd: 0, tokens: 0, erro: null }) },
  );

  const contexto = await contextoDaGuarda(material, deps);
  const veredicto = avaliarPostSocial(copy, { ...contexto, problemasDoFormato: auditoria.problemas }, reparosGastos);

  if (veredicto.passed) {
    const em = (deps.agora ? deps.agora() : new Date()).toISOString();
    await deps.tarefas.anotar(escrita.id, { copy, reparos: reparosGastos, pronto: { auditoria: tarefa.id, em } } satisfies ResultadoDaEscrita);
    return { ok: true, desfecho: "pronto", storyId: escrita.chave };
  }

  const motivos = motivosDo(veredicto);
  const teto = maximoDeReparos(deps.env ?? process.env);
  if (veredicto.finalDecision === "reparar" && reparosGastos < teto) {
    const original = escrita.instrucao as { system?: string; user?: string; orientacao?: string };
    // A mesma montagem do reparo da esteira: o pedido original, com o que corrigir no fim.
    const userOriginal = String(original.user ?? "").split("\n\n\nO texto abaixo foi recusado.")[0];
    const instrucao = {
      ...original,
      user: `${userOriginal}\n\n${instrucaoDeReparoDaCopy(copy, veredicto.repairableIssues)}`,
    };
    return {
      ok: true,
      desfecho: "reparar",
      motivos,
      tarefa: await deps.tarefas.pedirReparo(
        escrita.id,
        { copy, reparos: reparosGastos + 1 } satisfies ResultadoDaEscrita,
        motivos,
        quem,
        instrucao,
      ),
    };
  }

  await deps.tarefas.cancelar(escrita.id, motivos);
  return { ok: true, desfecho: "descartado", storyId: escrita.chave, motivos };
}

/**
 * Recebe a entrega de uma tarefa do post. O que não cabe no esquema volta
 * como reparo da própria tarefa, nunca como exceção: o Claude precisa saber o
 * que corrigir.
 */
export async function entregarTarefaDoPost(
  projeto: Project,
  pedido: { id: string; resultado: unknown; quem: string },
  deps: DepsDoPost,
): Promise<ResultadoDaEntrega | { ok: false; error: string }> {
  const tarefa = await deps.tarefas.porId(pedido.id);
  if (!tarefa || tarefa.projectId !== projeto.id) return erro("tarefa não encontrada neste projeto");
  if (tarefa.estado !== "aberta" && tarefa.estado !== "reparar") {
    return erro(`a tarefa está "${tarefa.estado}" e não aceita entrega`);
  }
  if (tarefa.tipo === "escrever_post") return entregarEscrita(tarefa, pedido.resultado, pedido.quem, deps);
  if (tarefa.tipo === "auditar_post") return entregarAuditoria(tarefa, pedido.resultado, pedido.quem, deps);
  return erro(`a entrega de "${tarefa.tipo}" ainda não existe`);
}
