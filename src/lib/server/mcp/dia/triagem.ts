import type { Project } from "@/lib/server/projects";
import type { CandidataParaGravar, CandidataPersistida, CandidatosStore } from "@/lib/server/editorial/candidatos-store";
import {
  decidirPauta,
  entidadesDaClassificacao,
  montarSystemDoClassificador,
  montarUserDoClassificador,
  RespostaDoClassificadorSchema,
  type Classificacao,
  type PautaClassificavel,
} from "@/lib/server/editorial/classificador";
import { carregarConfigEditorial } from "@/lib/server/editorial/config";
import { impressaoDoAcontecimento } from "@/lib/server/editorial/fingerprint";
import { linhaDoProjeto } from "@/lib/server/editorial/linha-do-projeto";
import { z } from "zod";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * A triagem do dia pelo Claude (29/10/2026): o classificador da esteira, com
 * o Claude no lugar da OpenAI.
 *
 * A coleta é a do projeto de onde vêm as pautas (`settings.mcp.pautas_de`,
 * ou o próprio projeto): o radar e a redação gravam as matérias em
 * `news_candidates`, sem modelo. Aqui elas passam por um pré-filtro
 * determinístico, viram lotes, e cada lote é uma tarefa `classificar` com o
 * system e o user EXATOS do classificador. A entrega passa pelo mesmo esquema
 * e pela mesma regra de decisão (`decidirPauta`), e vira linha do PROJETO DO
 * CLAUDE em `news_candidates`: o pool do Claude é dele, e não se mistura com a
 * classificação que a esteira faz da mesma coleta.
 */

export const TIPO_DA_TRIAGEM = "classificar" as const;
export const PAUTAS_POR_LOTE = 20;
export const TETO_DA_TRIAGEM = 80;

const AGREGADORES = /(^|\.)news\.google\.com$|(^|\.)google\.com$/;

/** O que o pré-filtro olha de uma matéria coletada. */
export type Coletada = Pick<CandidataPersistida, "storyId" | "url" | "title" | "summary" | "sourceDomain" | "status"> & {
  publishedAt: string;
};

function chaveDoTitulo(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 3)
    .slice(0, 8)
    .join(" ");
}

/**
 * Pura: as coletadas que valem uma classificação. Só o que chegou nas últimas
 * `horas`, sem agregador, sem o que o projeto do Claude já classificou, um
 * título por vez (o mesmo fato coletado de dois feeds), das mais novas para as
 * mais antigas, até o teto.
 */
export function preFiltrar(
  coletadas: Coletada[],
  jaClassificadas: Set<string>,
  opcoes: { agoraMs: number; horas?: number; teto?: number },
): Coletada[] {
  const desde = opcoes.agoraMs - (opcoes.horas ?? 24) * 3_600_000;
  const vistos = new Set<string>();
  return coletadas
    .filter((c) => Date.parse(c.publishedAt) >= desde)
    .filter((c) => !AGREGADORES.test((c.sourceDomain ?? "").toLowerCase()))
    .filter((c) => !jaClassificadas.has(c.url))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .filter((c) => {
      const k = chaveDoTitulo(c.title);
      if (!k || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, opcoes.teto ?? TETO_DA_TRIAGEM);
}

export type MaterialDaTriagem = {
  lote: number;
  pautas: Array<PautaClassificavel & { publicadoEm: string; dominio: string | null }>;
};

const ESQUEMA = z.toJSONSchema(RespostaDoClassificadorSchema, { io: "input" }) as Record<string, unknown>;

export type DepsDaTriagem = {
  tarefas: TarefasStore;
  candidatos: CandidatosStore;
  comInstrucoes: <T>(projeto: Project, fn: () => Promise<T>) => Promise<T>;
  env?: Record<string, string | undefined>;
};

/** Abre um lote por tarefa. Lote já aberto no dia é devolvido como está. */
export async function abrirTriagem(
  projeto: Project,
  data: string,
  coletadas: Coletada[],
  deps: DepsDaTriagem,
): Promise<Tarefa[]> {
  const system = await deps.comInstrucoes(projeto, async () => montarSystemDoClassificador(linhaDoProjeto(projeto)));
  const tarefas: Tarefa[] = [];
  for (let i = 0; i * PAUTAS_POR_LOTE < coletadas.length; i++) {
    const lote = coletadas.slice(i * PAUTAS_POR_LOTE, (i + 1) * PAUTAS_POR_LOTE);
    const pautas = lote.map((c) => ({
      id: c.storyId,
      titulo: c.title,
      descricao: c.summary ?? "",
      fonte: c.sourceDomain ?? "",
      url: c.url,
      publicadoEm: c.publishedAt,
      dominio: c.sourceDomain ?? null,
    }));
    const material: MaterialDaTriagem = { lote: i + 1, pautas };
    tarefas.push(
      await deps.tarefas.abrir({
        projectId: projeto.id,
        editionDate: data,
        tipo: TIPO_DA_TRIAGEM,
        chave: `triagem-${i + 1}`,
        instrucao: {
          system,
          user: montarUserDoClassificador(pautas),
          orientacao: "Classifique TODAS as notícias do lote, com o id de cada uma. Responda SÓ com o JSON do esquema.",
        },
        material: material as unknown as Record<string, unknown>,
        esquema: ESQUEMA,
      }),
    );
  }
  return tarefas;
}

/** Pura: da classificação entregue às linhas de `news_candidates` do projeto do Claude. */
export function linhasDaTriagem(
  material: MaterialDaTriagem,
  classificacoes: Classificacao[],
  projeto: Pick<Project, "settings">,
  env: Record<string, string | undefined> = process.env,
): { linhas: CandidataParaGravar[]; aprovadas: number; faltando: string[] } {
  const config = carregarConfigEditorial(env, projeto);
  const porId = new Map(classificacoes.map((c) => [c.id, c]));
  const linhas: CandidataParaGravar[] = [];
  const faltando: string[] = [];
  let aprovadas = 0;
  for (const p of material.pautas) {
    const c = porId.get(p.id);
    if (!c) {
      faltando.push(p.id);
      continue;
    }
    const decisao = decidirPauta(c, config);
    if (decisao.aprovada) aprovadas += 1;
    linhas.push({
      storyId: p.id,
      url: p.url,
      sourceDomain: p.dominio ?? undefined,
      title: p.titulo,
      summary: p.descricao.slice(0, 4000),
      publishedAt: p.publicadoEm,
      status: decisao.aprovada ? "approved" : "rejected",
      classificacao: c,
      eventFingerprint: impressaoDoAcontecimento(entidadesDaClassificacao(c)) || null,
      // A nota da esteira soma calor e ranking; na triagem vale a relevância, de 0 a 100.
      editorialScore: Math.round(Math.max(0, Math.min(10, c.relevancia)) * 10),
      decisionReason: decisao.motivo,
      metadata: { origem: "claude_triagem", explicacao: decisao.explicacao },
    });
  }
  return { linhas, aprovadas, faltando };
}

export type DesfechoDaTriagem =
  | { ok: true; desfecho: "classificado"; lote: number; aprovadas: number; recusadas: number }
  | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] };

export async function entregarTriagem(
  projeto: Project,
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDaTriagem,
): Promise<DesfechoDaTriagem> {
  const material = tarefa.material as unknown as MaterialDaTriagem;
  const lido = RespostaDoClassificadorSchema.safeParse(resultado);
  if (!lido.success) {
    const motivos = [`a resposta não cabe no esquema do classificador: ${lido.error.message.slice(0, 500)}`];
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  const { linhas, aprovadas, faltando } = linhasDaTriagem(material, lido.data.pautas, projeto, deps.env);
  // Pauta sem classificação seria recusada por precaução; antes disso, o Claude completa o lote.
  if (faltando.length && tarefa.tentativas < 2) {
    const motivos = [`faltou classificar ${faltando.length} notícia(s) do lote: ${faltando.join(", ")}`];
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  const gravacao = await deps.candidatos.gravarNovas(projeto.id, linhas);
  if (gravacao.erros.length) throw new Error(`triagem não gravada: ${gravacao.erros.join("; ")}`);
  await deps.tarefas.entregar(tarefa.id, resultado, quem);
  return { ok: true, desfecho: "classificado", lote: material.lote, aprovadas, recusadas: linhas.length - aprovadas };
}
