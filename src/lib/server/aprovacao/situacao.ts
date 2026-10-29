import type { Aprovacao } from "./contrato";

/**
 * A situação de uma peça como o dono a enxerga (06/10/2026).
 *
 * O estado da fila sozinho mentia na tela. Com a fila em ensaio, a matéria das
 * 12:00 foi ao ar às 12:00, como deve ser no ensaio, e o cartão continuava
 * dizendo "aprovada" com um botão "Cancelar peça" que não cancelava nada: a
 * retirada não toca matéria publicada. A newsletter já tinha saído às 06:07 e
 * aparecia como "aprovada" também. A situação junta o estado da fila com o
 * que a tabela da peça diz, e "no ar" vence tudo: o que está publicado não
 * se decide mais.
 *
 * Puro, e o cliente importa: é a mesma regra no teste e na tela.
 */

export type SituacaoDaPeca = "aguardando" | "aprovada" | "refazendo" | "reprovada" | "publicada" | "fora";

export type FiltroDeStatus = "aguardando" | "aprovadas" | "reprovadas" | "publicadas";

/** `rotulo` cabe no botão do celular; `descricao` diz o que entra, para o estado vazio. */
export const FILTROS_DE_STATUS: ReadonlyArray<{ id: FiltroDeStatus; rotulo: string; descricao: string }> = [
  { id: "aguardando", rotulo: "Aguardando", descricao: "aguardando a sua decisão ou sendo refeita" },
  { id: "aprovadas", rotulo: "Aprovadas", descricao: "aprovada e ainda não publicada" },
  { id: "reprovadas", rotulo: "Reprovadas", descricao: "reprovada, cancelada ou descartada" },
  { id: "publicadas", rotulo: "Publicadas", descricao: "publicada" },
];

export function situacaoDaPeca(a: Pick<Aprovacao, "estado">, noAr: boolean): SituacaoDaPeca {
  if (noAr) return "publicada";
  switch (a.estado) {
    case "aguardando":
      return "aguardando";
    case "aprovada":
      return "aprovada";
    case "refazendo":
      return "refazendo";
    case "reprovada":
      return "reprovada";
    default:
      return "fora";
  }
}

export function filtroDaSituacao(s: SituacaoDaPeca): FiltroDeStatus {
  // A peça sendo refeita volta para a decisão do editor: fica onde ele a deixou, e não some em "Reprovadas" (29/10/2026).
  if (s === "aguardando" || s === "refazendo") return "aguardando";
  if (s === "aprovada") return "aprovadas";
  if (s === "publicada") return "publicadas";
  return "reprovadas";
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDaPeca, string> = {
  aguardando: "Aguardando você",
  aprovada: "Aprovada",
  refazendo: "Refazendo",
  reprovada: "Reprovada",
  publicada: "No ar",
  fora: "Fora do ar",
};

export type AcoesDaPeca = {
  aprovar: boolean;
  reprovar: boolean;
  editar: boolean;
  cancelar: boolean;
  /** Uma frase sobre o que as ações fazem nesta situação, quando não é o óbvio. */
  nota: string | null;
};

const NENHUMA: AcoesDaPeca = { aprovar: false, reprovar: false, editar: false, cancelar: false, nota: null };

/**
 * O que o dono pode fazer com a peça, espelhando o que o servidor aceita
 * (`fila.ts`): aprovar só o que aguarda; reprovar e editar o que aguarda ou
 * foi aprovado e ainda não saiu; cancelar até a liberação. Botão que o
 * servidor recusaria não aparece, que era o "Cancelar peça" da matéria no ar.
 *
 * A exceção é a peça que já saiu no ensaio: aprovar e reprovar continuam,
 * porque a decisão ensina o canal (exemplo aprovado de primeira, memória de
 * reprovação), mas editar e cancelar somem, porque mexeriam numa peça no ar.
 */
export function acoesDaPeca(
  a: Pick<Aprovacao, "estado" | "liberadoEm">,
  situacao: SituacaoDaPeca,
  modo: string,
): AcoesDaPeca {
  if (situacao === "publicada") {
    if (modo !== "enforce" && a.estado === "aguardando") {
      return {
        aprovar: true,
        reprovar: true,
        editar: false,
        cancelar: false,
        nota: "Já está no ar: a fila está em ensaio e não segura nada. Aprovar ou reprovar agora não muda a peça; registra a sua decisão para o canal aprender.",
      };
    }
    return NENHUMA;
  }
  if (situacao === "aguardando") return { aprovar: true, reprovar: true, editar: true, cancelar: true, nota: null };
  if (situacao === "aprovada") {
    if (a.liberadoEm) return { ...NENHUMA, nota: "Aprovada e liberada: o canal publica no horário." };
    return { aprovar: false, reprovar: true, editar: true, cancelar: true, nota: null };
  }
  if (situacao === "refazendo") return { ...NENHUMA, cancelar: true };
  return NENHUMA;
}
