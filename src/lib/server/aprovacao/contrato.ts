import type { OrigemDoArtigo } from "../ramos/portal";
import type { PacoteFactual } from "../editorial/pacote-factual";

/**
 * O contrato da fila de aprovação (RF-20 a RF-29), decidido em 05/10/2026.
 *
 * Até esta data o eua.journal publicava sozinho: não havia revisão humana entre
 * a pauta aprovada pela linha editorial e o ar. A fila é a peça que põe uma
 * pessoa nesse meio, e o contrato é UMA linha por peça e por projeto, em
 * `aprovacoes`, com o hash da versão exata que foi aprovada.
 *
 * O hash é o coração da regra. Aprovar "o post das 12h" não diz nada se o
 * arquivo puder mudar depois: o que se aprova é ESTE artefato, e quem publica
 * confere que o que vai ao ar ainda é ele. Ver `portao.ts`.
 */

export const RAMOS = ["newsletter", "artigo", "post"] as const;
export type Ramo = (typeof RAMOS)[number];

export const ESTADOS_DA_APROVACAO = [
  "aguardando",
  "aprovada",
  "reprovada",
  "refazendo",
  "descartada",
  "cancelada",
] as const;
export type EstadoDaAprovacao = (typeof ESTADOS_DA_APROVACAO)[number];

/**
 * As etapas que uma reprovação pode culpar (RF-22).
 *
 * A etapa é o que permite refazer SÓ o que estava errado: reprovar a imagem não
 * chama o redator, e reprovar o texto não troca a foto.
 */
export const ETAPAS = ["selecao", "texto", "imagem", "arte"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ROTULO_DA_ETAPA: Record<Etapa, string> = {
  selecao: "Seleção da pauta",
  texto: "Texto",
  imagem: "Imagem",
  arte: "Arte",
};

/**
 * Quais etapas existem em cada ramo.
 *
 * A newsletter e o artigo não têm "arte": não há peça desenhada, o e-mail é
 * HTML montado de template. Culpar a arte de um e-mail seria registrar um erro
 * que nenhuma etapa consegue refazer.
 */
export const ETAPAS_DO_RAMO: Record<Ramo, readonly Etapa[]> = {
  post: ["selecao", "texto", "imagem", "arte"],
  newsletter: ["selecao", "texto", "imagem"],
  artigo: ["selecao", "texto", "imagem"],
};

/**
 * Duas refações, e a terceira reprovação descarta.
 *
 * O número é do PRD validado (RF-22). Mais que isso é o editor reescrevendo a
 * peça por procuração, um prompt de cada vez, e o custo passa do que a peça vale.
 */
export const LIMITE_DE_REFAZIMENTOS = 2;

/** Quantas repetições do mesmo erro viram proposta de regra fixa (RF-29). */
export const REPETICOES_PARA_PROPOR_REGRA = 3;

/** Um aviso de QA que acompanha a peça até a fila. Nunca é escondido por um lote (RF-21). */
export type AvisoDaPeca = {
  codigo: string;
  detalhe: string;
};

/** A linha de `aprovacoes`, como o código a enxerga. */
export type Aprovacao = {
  id: string;
  projectId: string;
  ramo: Ramo;
  pecaId: string;
  hashArtefato: string;
  publicarEm: string | null;
  estado: EstadoDaAprovacao;
  automatica: boolean;
  decididoPor: string | null;
  decididoEm: string | null;
  motivo: string | null;
  etapaCulpada: Etapa | null;
  refazimentos: number;
  avisos: AvisoDaPeca[];
  resumo: ResumoDaPeca;
  avisadoEm: string | null;
  liberadoEm: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * O que o painel precisa para decidir sem abrir outra tela (RF-24).
 *
 * Fica gravado na linha, e não montado na hora, porque a decisão é sobre ESTA
 * versão: se a peça for refeita, o resumo é regravado junto com o hash.
 */
export type ResumoDaPeca = {
  titulo?: string;
  texto?: string;
  /** URLs das imagens da peça, na ordem de publicação. */
  imagens?: string[];
  /** O pacote factual em linhas curtas, para conferir sem sair do celular. */
  pacoteFactual?: string[];
  fonteUrl?: string | null;
  /** Ramo newsletter: a campanha no Listmonk que será disparada. */
  campanhaListmonk?: number | null;
  /** Ramo artigo: o endereço no portal. */
  slug?: string | null;
  /**
   * Ramo artigo: a linha fina, para a aprovação de primeira virar exemplo do
   * redator (06/10/2026, `aprendizado/exemplos.ts`). Ausente nas anteriores.
   */
  linhaFina?: string | null;
  /** Quando a refação não pôde rodar sozinha, o motivo vai aqui para o painel. */
  refacaoPendente?: string | null;
  /**
   * Ramo artigo: a pauta e o pacote factual de onde a matéria saiu.
   *
   * Entrou na integração de 05/10/2026 para a refação de texto e de imagem do
   * artigo poder rodar sem a pauta avaliada inteira, que não sobrevive ao
   * ciclo. Ver `ganchos-de-producao.ts`.
   */
  origemDoArtigo?: OrigemDoArtigo | null;
  /**
   * O que a refação de cada etapa precisa, gravado na hora de enfileirar
   * (06/10/2026). Ver `ContextoDeProducao`. Ausente nas peças anteriores a esta
   * data: aí a refação tenta reconstruir o contexto das tabelas do canal, e, se
   * não der, diz por quê no painel.
   */
  contexto?: ContextoDeProducao | null;
  /** O andamento da refação pedida, que roda fora do clique. Ver `EstadoDaRefacao`. */
  refacao?: EstadoDaRefacao | null;
  /** A última refação que deu certo, para o painel dizer o que mudou. */
  ultimaRefacao?: { etapa: Etapa; em: string; executadas: Etapa[]; detalhe?: string } | null;
  /** Seleção refeita: o id da aprovação que esta peça substituiu. */
  substituiu?: string | null;
  /** Seleção refeita: o id da aprovação da peça que entrou no lugar desta. */
  substituidaPor?: string | null;
};

/**
 * Uma pauta como a refação a enxerga, sem a pauta avaliada inteira (06/10/2026).
 *
 * A `PautaAvaliada` não sobrevive ao ciclo, e gravá-la inteira (vetor de 1536
 * números, texto de origem, veredito) em cada linha da fila pesaria a tela do
 * celular. Isto é o que os redatores, o resolvedor de imagem e o pacote
 * factual leem dela, e nada mais.
 */
export type PautaDoContexto = {
  storyId: string;
  titulo: string;
  url: string;
  fonteNome: string;
  publicadoEm: string;
  /** O texto que sustenta a pauta (o enriquecimento), cortado em 4000 caracteres como em `news_candidates.summary`. */
  resumo: string;
  categoria: string;
  eixo: string;
  pais: string;
  atores: string[];
  lugares: string[];
  acontecimento: string[];
  urlsSecundarias?: string[];
  fontesSecundarias?: string[];
};

/**
 * O contexto de produção de uma peça, para refazer só a etapa culpada.
 *
 * `pautas` é a pauta da peça (uma no artigo e no post, de 2 a 4 na
 * newsletter, na ordem da edição). `pacotes` é o pacote factual de cada uma,
 * por `storyId`: a única matéria-prima dos redatores. `pool` é a REFERÊNCIA ao
 * pool aprovado do dia, em ordem de nota, por `storyId`: a seleção refeita
 * relê essas candidatas em `news_candidates` e passa pela régua do ramo de
 * novo. `imagens` e `legendas` são da newsletter, por `storyId`, para
 * redesenhar o e-mail sem resolver de novo a foto que ninguém reprovou.
 */
export type ContextoDeProducao = {
  versao: 1;
  /** A data da edição ou do post, AAAA-MM-DD. */
  data: string;
  pautas: PautaDoContexto[];
  pacotes?: Record<string, PacoteFactual>;
  pool?: string[];
  imagens?: Record<string, string>;
  legendas?: Record<string, string>;
  /** Pautas que a seleção refeita já tirou desta vaga: não voltam na próxima troca. */
  recusadas?: string[];
  /** Post: a posição na leva do dia, que decide se a copy leva CTA. */
  posicao?: number;
  /** Preenchido quando o contexto foi remontado das tabelas, para peça antiga: de onde veio. */
  reconstruido?: string | null;
};

/**
 * O andamento de uma refação (06/10/2026).
 *
 * A reprovação só AGENDA: a refação de uma seleção custa pacote, redação,
 * auditoria, foto e arte, minutos que o clique do celular não pode esperar.
 * Quem roda é o relógio da fila (a cada minuto) ou o `after` da própria
 * reprovação, o que chegar primeiro, e a reivindicação é condicional para os
 * dois não rodarem a mesma refação.
 *
 *   na_fila     pedida, esperando o próximo giro
 *   rodando     um processo reivindicou e está refazendo
 *   impossivel  não dá para refazer sozinha, e `motivoImpossivel` diz por quê
 */
export type EstadoDaRefacao = {
  /**
   * `com_o_claude` (28/10/2026): a versão nova não sai daqui, sai do Claude
   * pelo MCP (o Reel). A peça fica em `refazendo` até ela chegar; quem a
   * devolve a `aguardando` é o `enfileirar` com o hash novo.
   */
  estado: "na_fila" | "rodando" | "impossivel" | "com_o_claude";
  etapa: Etapa;
  motivo: string;
  /** Newsletter: o `storyId` da pauta que o editor apontou, quando apontou. */
  alvo?: string | null;
  /** Qual refação é esta, de `LIMITE_DE_REFAZIMENTOS`. */
  tentativa: number;
  pedidaEm: string;
  iniciadaEm?: string | null;
  /** Quantas vezes um processo pegou esta refação (falha técnica volta para a fila). */
  execucoes: number;
  /** A última falha técnica, quando voltou para a fila. */
  erro?: string | null;
  motivoImpossivel?: string | null;
};

export function ehRamo(valor: unknown): valor is Ramo {
  return typeof valor === "string" && (RAMOS as readonly string[]).includes(valor);
}

export function ehEtapa(valor: unknown): valor is Etapa {
  return typeof valor === "string" && (ETAPAS as readonly string[]).includes(valor);
}

export function ehEstado(valor: unknown): valor is EstadoDaAprovacao {
  return typeof valor === "string" && (ESTADOS_DA_APROVACAO as readonly string[]).includes(valor);
}

/** Quem decide quando a decisão é da máquina (RF-25). O registro diz isso com todas as letras. */
export const DECISOR_AUTOMATICO = "sistema:aprovacao-automatica";

/**
 * Quanto cada refação costuma levar, em minutos, para o painel dizer quando
 * a peça volta (06/10/2026). É estimativa, e o painel diz que é: a seleção
 * paga pacote, redação, auditoria, foto e arte; a arte é só o render.
 */
export const MINUTOS_DA_REFACAO: Record<Ramo, Record<Etapa, number>> = {
  post: { selecao: 6, texto: 3, imagem: 3, arte: 1 },
  artigo: { selecao: 6, texto: 4, imagem: 2, arte: 1 },
  newsletter: { selecao: 8, texto: 6, imagem: 3, arte: 1 },
};

/** Uma refação `rodando` há mais que isto é de um processo que morreu: volta para a fila. */
export const MINUTOS_PARA_REFACAO_TRAVADA = 20;

/** Falha técnica volta para a fila; na terceira, a refação vira "não dá". */
export const EXECUCOES_MAXIMAS_DA_REFACAO = 3;
