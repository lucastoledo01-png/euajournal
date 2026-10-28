import type { Etapa, Ramo } from "../aprovacao/contrato";

/**
 * O aprendizado da fila de aprovação, por peça e por canal (06/10/2026).
 *
 * O dono, com estas palavras: "de nada adianta esse esforço manual se não
 * houver aprendizado". Até esta data a memória de reprovação (RF-29) chegava
 * só ao texto, e misturada: o erro apontado na legenda do post entrava na voz
 * da newsletter. Agora cada etapa aprende com a reprovação DELA, no canal
 * DELA:
 *
 *   selecao  a seleção do canal penaliza a pauta parecida com a recusada
 *            (fonte, ator, tema) e, depois de três recusas do mesmo padrão
 *            em trinta dias, tira a fonte ou o ator da seleção daquele canal
 *   texto    o redator do canal recebe os erros, as regras aprovadas e os
 *            exemplos aprovados sem retrabalho, só daquele canal
 *   imagem   o resolvedor do canal nunca mais escolhe a foto recusada ali, e
 *            a pergunta da cena recebe o motivo
 *   arte     o molde recusado três vezes sai da escolha do feed, e a refação
 *            troca a gramática recusada, com o motivo gravado na peça
 *
 * E a regra fixa continua sendo do dono: três reprovações iguais, ou um padrão
 * nas edições à mão, viram PROPOSTA, nunca regra.
 */

/** A janela do aprendizado. Um padrão que parou de acontecer há um mês não precisa de castigo. */
export const JANELA_DO_APRENDIZADO_DIAS = 30;

/**
 * Nada aprende com o que foi produzido antes da saída da imigração.
 *
 * A linha mudou em 05/10/2026 ("Imigração sai da pauta"), e um exemplo
 * aprovado de visto ensinaria ao redator exatamente a pauta que o produto
 * deixou. O filtro de conteúdo em `exemplos.ts` é a segunda trava.
 */
export const INICIO_SEM_IMIGRACAO = "2026-10-05T03:00:00.000Z";

/** Quantas recusas do mesmo padrão tiram a fonte ou o ator da seleção do canal. */
export const RECUSAS_PARA_BLOQUEAR = 3;

/** Quanto cada recusa anterior do mesmo padrão tira da nota da pauta, no canal. */
export const PENALIDADE_POR_RECUSA = 8;

/** O teto da penalidade: castigo não pode virar bloqueio por soma. */
export const PENALIDADE_MAXIMA = 24;

/** Quantos exemplos aprovados por tipo de texto entram na voz do canal. */
export const EXEMPLOS_POR_TIPO = 5;

/** O orçamento do bloco de exemplos, em caracteres (cerca de 400 tokens). */
export const ORCAMENTO_DOS_EXEMPLOS = 1600;

/** A pauta que a peça reprovada levava, no que a seleção consegue comparar. */
export type PautaRecusada = {
  storyId: string;
  titulo: string;
  /** O domínio da fonte, sem `www.`. */
  fonte: string;
  atores: string[];
  /** O eixo editorial da classificação (economia, tecnologia...). */
  eixo: string;
};

/** A decisão de arte que a peça reprovada tinha. Só o post tem arte. */
export type ArteRecusada = {
  /** O molde do feed, no vocabulário de `moldes-do-feed.ts`. */
  molde: "jornal" | "jornal_bolha" | "recorte" | "sem_foto" | null;
  gramatica: string | null;
  bolha: boolean | null;
};

/**
 * O que a reprovação guarda além do motivo, em `reprovacoes.detalhes`.
 *
 * Gravado na hora da reprovação, do que a peça TINHA: depois da refação a
 * linha da peça já tem outra foto e outra arte, e o que foi recusado se perde.
 */
export type DetalhesDaReprovacao = {
  pautas?: PautaRecusada[];
  /** As fotos de fundo (não a arte renderizada), por URL. */
  fotos?: string[];
  arte?: ArteRecusada;
};

/** Os tipos de texto que viram exemplo, por canal. Nunca cruzam canal. */
export const TIPOS_DE_EXEMPLO: Record<Ramo, ReadonlyArray<{ tipo: string; rotulo: string; teto: number }>> = {
  newsletter: [{ tipo: "assunto", rotulo: "Assuntos de e-mail aprovados", teto: 120 }],
  post: [
    { tipo: "manchete", rotulo: "Manchetes de post aprovadas", teto: 140 },
    { tipo: "legenda", rotulo: "Aberturas de legenda aprovadas", teto: 240 },
  ],
  artigo: [
    { tipo: "titulo", rotulo: "Títulos de matéria aprovados", teto: 140 },
    { tipo: "linha_fina", rotulo: "Linhas finas aprovadas", teto: 220 },
  ],
  plano: [],
};

export type ExemploAprovado = { tipo: string; texto: string; aprovadoEm: string };

export const ROTULO_DO_RAMO: Record<Ramo, string> = {
  newsletter: "Newsletter",
  artigo: "Portal",
  post: "Instagram",
  plano: "Plano do dia",
};

export type ChaveDaMemoria = { ramo: Ramo; etapa: Etapa };
