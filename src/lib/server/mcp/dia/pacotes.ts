import { z } from "zod";
import type { Project } from "@/lib/server/projects";
import {
  citacoesLiterais,
  montarSystemDoExtrator,
  PacoteFactualSchema,
  type PacoteFactual,
} from "@/lib/server/editorial/pacote-factual";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * O pacote factual pelo Claude (29/10/2026): o extrator da esteira
 * (`montarPacoteFactual`) com o Claude no lugar da OpenAI. A plataforma lê a
 * matéria (o mesmo `buscarTextoDaFonte`, com o Internet Archive de reserva), o
 * Claude extrai, e a entrega passa pelas mesmas conferências: o esquema, pelo
 * menos um fato, e só a citação que está no texto. O pacote fica em
 * `news_candidates.factual_package` da pauta do projeto do Claude, que é de
 * onde a produção lê.
 */

export const TIPO_DO_PACOTE = "extrair_pacote" as const;

/** O user do extrator, idêntico ao da esteira. */
export function userDoExtrator(titulo: string, texto: string): string {
  return `Título: ${titulo}\n\nMatéria:\n${texto.slice(0, 8000)}`;
}

export type MaterialDoPacote = { storyId: string; titulo: string; url: string; texto: string };

const ESQUEMA = z.toJSONSchema(PacoteFactualSchema, { io: "input" }) as Record<string, unknown>;

export type DepsDoPacote = {
  tarefas: TarefasStore;
  gravarPacote: (projectId: string, storyId: string, pacote: PacoteFactual) => Promise<void>;
};

export async function abrirPacote(projeto: Project, data: string, material: MaterialDoPacote, tarefas: TarefasStore): Promise<Tarefa> {
  return tarefas.abrir({
    projectId: projeto.id,
    editionDate: data,
    tipo: TIPO_DO_PACOTE,
    chave: material.storyId,
    instrucao: {
      system: montarSystemDoExtrator(),
      user: userDoExtrator(material.titulo, material.texto),
      orientacao: "Responda SÓ com o JSON do esquema, mais o campo citacoes descrito na instrução.",
    },
    material: material as unknown as Record<string, unknown>,
    esquema: ESQUEMA,
  });
}

/** Pura: a entrega vira pacote, ou o motivo de não virar. */
export function pacoteDaEntrega(bruto: unknown, material: MaterialDoPacote): { ok: true; pacote: PacoteFactual } | { ok: false; motivo: string } {
  const lido = PacoteFactualSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, motivo: `a resposta não cabe no esquema do pacote: ${lido.error.issues[0]?.message ?? ""}` };
  // Pacote sem fato faz toda afirmação do texto parecer sem lastro: melhor recusar aqui.
  if (lido.data.verified_facts.length === 0) return { ok: false, motivo: "nenhum fato verificado: liste o que a matéria afirma" };
  const citacoes = citacoesLiterais((bruto as { citacoes?: unknown } | null)?.citacoes, material.texto);
  return {
    ok: true,
    pacote: { ...lido.data, source_urls: [material.url], texto_de_origem: material.texto, ...(citacoes.length ? { citacoes } : {}) },
  };
}

export async function entregarPacote(
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDoPacote,
): Promise<{ ok: true; desfecho: "pacote"; storyId: string; fatos: number } | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }> {
  const material = tarefa.material as unknown as MaterialDoPacote;
  const r = pacoteDaEntrega(resultado, material);
  if (!r.ok) {
    return { ok: true, desfecho: "reparar", motivos: [r.motivo], tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, [r.motivo], quem) };
  }
  await deps.gravarPacote(tarefa.projectId, material.storyId, r.pacote);
  await deps.tarefas.entregar(tarefa.id, resultado, quem);
  return { ok: true, desfecho: "pacote", storyId: material.storyId, fatos: r.pacote.verified_facts.length };
}
