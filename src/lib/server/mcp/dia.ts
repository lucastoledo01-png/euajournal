import { ENDERECO_DO_SITE } from "@/lib/marca";
import type { Aprovacao } from "@/lib/server/aprovacao/contrato";
import type { EstadoDaCapacidade } from "@/lib/server/capacidades";
import type { EstadoDaTarefa, Tarefa, TipoDeTarefa } from "./tarefas-store";

/**
 * O que o Claude Desktop vê quando pergunta "como está o dia?" (27/10/2026).
 *
 * Duas fontes, as duas só lidas: as tarefas que esperam o Claude e a fila de
 * aprovação. A ordem da resposta é a ordem do trabalho: primeiro o que o dono
 * reprovou (é correção de peça que já existia), depois tarefa em reparo, depois
 * tarefa nova. Nada aqui decide nada; o MCP não aprova, não reprova e não
 * cancela, por decisão do dono. Isso é só do painel.
 */

export type PecaNaFila = {
  id: string;
  ramo: Aprovacao["ramo"];
  estado: Aprovacao["estado"];
  titulo: string | null;
  publicarEm: string | null;
  /** O motivo escrito pelo dono, quando reprovou. */
  motivo: string | null;
  etapaReprovada: Aprovacao["etapaCulpada"];
  refacoes: number;
  /** Onde o dono vê e decide. O MCP só mostra o caminho. */
  painel: string;
};

export type ResumoDoDia = {
  data: string;
  fila: {
    modo: EstadoDaCapacidade;
    /** Sem a fila em `enforce`, nada do Claude é agendado (`agendar_post` recusa). */
    aceitaEntregas: boolean;
    aguardando: number;
    refazendo: number;
    aprovadas: number;
  };
  tarefas: Partial<Record<TipoDeTarefa, Partial<Record<EstadoDaTarefa, number>>>>;
  proximoPasso: string;
};

export function linkDoPainel(slug: string): string {
  return `${ENDERECO_DO_SITE}/admin/${slug}/aprovacao`;
}

export function pecasDaFila(fila: Aprovacao[], slug: string): PecaNaFila[] {
  return fila.map((a) => ({
    id: a.id,
    ramo: a.ramo,
    estado: a.estado,
    titulo: a.resumo?.titulo ?? null,
    publicarEm: a.publicarEm,
    motivo: a.motivo,
    etapaReprovada: a.etapaCulpada,
    refacoes: a.refazimentos,
    painel: linkDoPainel(slug),
  }));
}

function contarTarefas(tarefas: Tarefa[]): ResumoDoDia["tarefas"] {
  const saida: ResumoDoDia["tarefas"] = {};
  for (const t of tarefas) {
    const porEstado = (saida[t.tipo] ??= {});
    porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
  }
  return saida;
}

export function resumoDoDia(entrada: {
  data: string;
  modoDaFila: EstadoDaCapacidade;
  fila: Aprovacao[];
  tarefas: Tarefa[];
}): ResumoDoDia {
  const contar = (estado: Aprovacao["estado"]) => entrada.fila.filter((a) => a.estado === estado).length;
  const aceitaEntregas = entrada.modoDaFila === "enforce";
  const reparar = entrada.tarefas.filter((t) => t.estado === "reparar").length;
  const abertas = entrada.tarefas.filter((t) => t.estado === "aberta").length;
  const refazendo = contar("refazendo");

  let proximoPasso: string;
  if (!aceitaEntregas) {
    proximoPasso =
      "A fila de aprovação do projeto não está em enforce. Nada do que o Claude produzir será agendado até o dono ligar a fila no painel.";
  } else if (refazendo > 0) {
    proximoPasso = `Há ${refazendo} peça(s) reprovada(s) pelo dono. Comece pelas correções.`;
  } else if (reparar > 0) {
    proximoPasso = `Há ${reparar} tarefa(s) devolvida(s) para reparo. Peça a próxima tarefa.`;
  } else if (abertas > 0) {
    proximoPasso = `Há ${abertas} tarefa(s) aberta(s). Peça a próxima tarefa.`;
  } else {
    proximoPasso = "Nenhuma tarefa aberta para este dia.";
  }

  return {
    data: entrada.data,
    fila: {
      modo: entrada.modoDaFila,
      aceitaEntregas,
      aguardando: contar("aguardando"),
      refazendo,
      aprovadas: contar("aprovada"),
    },
    tarefas: contarTarefas(entrada.tarefas),
    proximoPasso,
  };
}
