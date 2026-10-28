import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { pautaAvaliadaDoContexto, pautaDaCandidata } from "@/lib/server/aprovacao/contexto-de-producao";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import { aceitarClaims, montarSystemDeClaims, montarUserDeClaims, RespostaDeClaimsSchema } from "@/lib/server/editorial/claims-semanticas";
import { limparVicios } from "@/lib/server/newsroom/anti-vicios";
import {
  ArtigoSchema,
  auditarArtigo,
  concluirArtigo,
  instrucaoDeReparoDoArtigo,
  montarSystemDoArtigo,
  montarUserDoArtigo,
  temVariasFontes,
  textoAuditavelDoArtigo,
  type Artigo,
  type MarcaDoArtigo,
} from "@/lib/server/ramos/artigo";
import { montarPeca } from "@/lib/server/ramos/peca";
import type { ConteudoDoArtigo } from "@/lib/server/ramos/portal";
import { materiaDaPauta } from "@/lib/server/ramos/ramo-do-portal";
import type { ResultadoVisual } from "@/lib/server/visual/tipos";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * A matéria do portal pelo Claude (29/10/2026). O ramo do portal da esteira,
 * com o modelo do lado de fora, peça por peça:
 *
 *   escrever_artigo ─► auditar_artigo ─► auditarArtigo (as conferências da
 *        ▲                                esteira, com o veredito do Claude)
 *        └──── um reparo, como a esteira ────┘ ─► poda ─► matéria ─► fila
 *
 * O system e o user são os da esteira (`montarSystemDoArtigo`,
 * `montarUserDoArtigo`), o reparo é o dela (`instrucaoDeReparoDoArtigo`), e a
 * matéria é montada e gravada pelos mesmos caminhos (`materiaDaPauta`,
 * `gravarArtigosAgendados`, a fila). O que fica de fora: juntar outras fontes
 * do mesmo fato, que pede uma extração por fonte (fica para depois), e a
 * descrição da capa pela visão da OpenAI, que vem da conferência do Claude.
 */

export const ESQUEMA_DO_ARTIGO = z.toJSONSchema(ArtigoSchema, { io: "input" }) as Record<string, unknown>;
export const ESQUEMA_DA_AUDITORIA_DO_ARTIGO = z.toJSONSchema(RespostaDeClaimsSchema, { io: "input" }) as Record<string, unknown>;
const REPAROS_DA_ESTEIRA = 1;

export type MaterialDoArtigo = {
  storyId: string;
  data: string;
  publicarEm: string;
  candidata: CandidataPersistida;
  foto: ResultadoVisual | null;
};

export type DepsDoArtigo = {
  tarefas: TarefasStore;
  comInstrucoes: <T>(projeto: Project, fn: () => Promise<T>) => Promise<T>;
  marca: (projeto: Project) => Promise<MarcaDoArtigo>;
  /** Grava a matéria em `articles` e a põe na fila. Devolve o slug. */
  gravar: (projeto: Project, conteudo: ConteudoDoArtigo, avisos: string[]) => Promise<{ ok: true; slug: string } | { ok: false; motivo: string }>;
  buscarRelacionadas?: (projeto: Project, alvo: { slug: string; categoria: string; texto: string }) => Promise<Array<{ slug: string; titulo: string }>>;
};

type Resultado =
  | { ok: true; desfecho: "auditar"; tarefa: Tarefa }
  | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }
  | { ok: true; desfecho: "pronto"; storyId: string; slug: string }
  | { ok: true; desfecho: "descartado"; storyId: string; motivos: string[] };

function pacoteDe(m: MaterialDoArtigo) {
  const p = m.candidata.factualPackage;
  if (!p) throw new Error(`a pauta ${m.storyId} não tem pacote factual`);
  return p;
}

export async function iniciarArtigo(projeto: Project, material: MaterialDoArtigo, deps: DepsDoArtigo): Promise<Tarefa> {
  const pacote = pacoteDe(material);
  const pauta = pautaAvaliadaDoContexto(pautaDaCandidata(material.candidata), material.candidata);
  const marca = await deps.marca(projeto);
  const instrucao = await deps.comInstrucoes(projeto, async () => ({
    system: montarSystemDoArtigo(marca, { variasFontes: temVariasFontes(pacote) }),
    user: montarUserDoArtigo(pauta, pacote),
    orientacao: "Responda SÓ com o JSON do esquema.",
    reparos: 0,
  }));
  return deps.tarefas.abrir({
    projectId: projeto.id,
    editionDate: material.data,
    tipo: "escrever_artigo",
    chave: material.storyId,
    instrucao,
    material: material as unknown as Record<string, unknown>,
    esquema: ESQUEMA_DO_ARTIGO,
  });
}

async function entregarEscrita(tarefa: Tarefa, resultado: unknown, quem: string, deps: DepsDoArtigo): Promise<Resultado> {
  const material = tarefa.material as unknown as MaterialDoArtigo;
  const lido = ArtigoSchema.safeParse(limparVicios(resultado));
  if (!lido.success) {
    const motivos = [`a resposta não cabe no esquema da matéria: ${lido.error.issues[0]?.message ?? ""}`];
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  const entregue = await deps.tarefas.entregar(tarefa.id, lido.data, quem);
  const auditoria = await deps.tarefas.abrir({
    projectId: tarefa.projectId,
    editionDate: tarefa.editionDate,
    tipo: "auditar_artigo",
    chave: `${tarefa.chave}#${entregue.tentativas}`,
    instrucao: {
      system: montarSystemDeClaims(),
      user: montarUserDeClaims([{ indice: 0, titulo: lido.data.titulo, texto: textoAuditavelDoArtigo(lido.data), pacote: pacoteDe(material) }]),
      orientacao: "Audite como se não tivesse escrito este texto, de preferência numa conversa nova. Responda SÓ com o JSON do esquema.",
    },
    material: { escrita: tarefa.id, storyId: material.storyId },
    esquema: ESQUEMA_DA_AUDITORIA_DO_ARTIGO,
  });
  return { ok: true, desfecho: "auditar", tarefa: auditoria };
}

async function entregarAuditoria(projeto: Project, tarefa: Tarefa, resultado: unknown, quem: string, deps: DepsDoArtigo): Promise<Resultado> {
  const aceita = aceitarClaims(resultado);
  if ("erro" in aceita) {
    const motivos = [`a resposta não cabe no esquema da auditoria: ${aceita.erro}`];
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  await deps.tarefas.entregar(tarefa.id, resultado, quem);
  const escritaId = String((tarefa.material as { escrita?: unknown }).escrita ?? "");
  const escrita = await deps.tarefas.porId(escritaId);
  if (!escrita) throw new Error(`a escrita ${escritaId} desta auditoria não existe`);
  const material = escrita.material as unknown as MaterialDoArtigo;
  const pacote = pacoteDe(material);
  const artigo = escrita.resultado as Artigo;

  const veredicto = await auditarArtigo(artigo, pacote, {
    auditor: async () => ({ ...aceita, custoUsd: 0, tokens: 0, erro: null }),
  });
  const reparos = Number((escrita.instrucao as { reparos?: unknown }).reparos ?? 0);
  if (!veredicto.aprovado && reparos < REPAROS_DA_ESTEIRA) {
    const original = escrita.instrucao as { system?: string; user?: string; orientacao?: string };
    const userOriginal = String(original.user ?? "").split("\n\nA matéria abaixo foi reprovada")[0];
    const motivos = veredicto.bloqueios;
    return {
      ok: true,
      desfecho: "reparar",
      motivos,
      tarefa: await deps.tarefas.pedirReparo(escrita.id, artigo, motivos, quem, {
        ...original,
        user: `${userOriginal}\n\n${instrucaoDeReparoDoArtigo(veredicto.bloqueios, artigo)}`,
        reparos: reparos + 1,
      }),
    };
  }

  // Depois do reparo da esteira, o que não se sustenta é podado; só não sai a matéria que a poda não resolve.
  const r = concluirArtigo(artigo, veredicto, pacote, reparos + 1);
  if (!r.artigo || r.veredicto.bloqueios.length) {
    await deps.tarefas.cancelar(escrita.id, r.veredicto.bloqueios);
    return { ok: true, desfecho: "descartado", storyId: material.storyId, motivos: r.veredicto.bloqueios };
  }

  const pauta = pautaAvaliadaDoContexto(pautaDaCandidata(material.candidata), material.candidata);
  const linhas: string[] = [];
  const descricao = material.foto?.asset?.conferenciaVisual?.descricao ?? null;
  const conteudo = await materiaDaPauta(
    {
      data: material.data,
      pool: [pauta],
      fotos: {
        resultado: async () => ({ visual: material.foto }),
        temFoto: async () => material.foto?.status === "SELECTED",
        jaResolvido: () => material.foto,
      },
      // A descrição da capa é a que o Claude escreveu ao escolher a foto; a ancoragem decide se ela vira legenda.
      descreverCapa: async () => descricao,
      buscarRelacionadas: deps.buscarRelacionadas ? (alvo) => deps.buscarRelacionadas!(projeto, alvo) : undefined,
    },
    pauta,
    pacote,
    { ...r, artigo: r.artigo },
    material.publicarEm,
    linhas,
  );
  const g = await deps.gravar(projeto, conteudo, r.veredicto.avisos);
  if (!g.ok) throw new Error(`a matéria não foi gravada: ${g.motivo}`);
  await deps.tarefas.anotar(escrita.id, { artigo: r.artigo, slug: g.slug, pronto: true });
  return { ok: true, desfecho: "pronto", storyId: material.storyId, slug: g.slug };
}

export async function entregarTarefaDoArtigo(projeto: Project, tarefa: Tarefa, resultado: unknown, quem: string, deps: DepsDoArtigo): Promise<Resultado> {
  if (tarefa.tipo === "escrever_artigo") return entregarEscrita(tarefa, resultado, quem, deps);
  return entregarAuditoria(projeto, tarefa, resultado, quem, deps);
}

/** A gravação de verdade: `articles` e a fila, os mesmos da esteira. */
export async function gravarMateriaDoClaude(
  client: SupabaseClient,
  projeto: Project,
  conteudo: ConteudoDoArtigo,
  avisos: string[],
): Promise<{ ok: true; slug: string } | { ok: false; motivo: string }> {
  const [{ gravarArtigosAgendados }, { levarPecaDoRamoAFila, localizadorSupabase }, { depsDaFila, projetoDaFila }] = await Promise.all([
    import("@/lib/server/ramos/portal"),
    import("@/lib/server/aprovacao/ramos-na-fila"),
    import("@/lib/server/aprovacao/integracao"),
  ]);
  const peca = montarPeca({
    ramo: "artigo",
    referenciaId: conteudo.slug,
    storyIds: conteudo.origem ? [conteudo.origem.storyId] : [],
    titulo: conteudo.artigo.titulo,
    conteudo,
    avisos,
    aprovadaPeloAuditor: true,
    bloqueios: [],
  });
  const g = await gravarArtigosAgendados(client, projeto.id, [peca]);
  if (g.erros.length) return { ok: false, motivo: g.erros.join(" | ") };
  const p = projetoDaFila(projeto, projeto.id);
  if (!p) return { ok: false, motivo: "projeto ilegível para a fila" };
  const r = await levarPecaDoRamoAFila(p, peca, { ...depsDaFila(client, p), localizar: localizadorSupabase(client, projeto.id) });
  if (r.acao === "sem_linha" || r.acao === "fila_desligada") return { ok: false, motivo: r.acao === "sem_linha" ? r.motivo : "a fila está desligada" };
  return { ok: true, slug: conteudo.slug };
}
