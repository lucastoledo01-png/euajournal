import { escapeHtml } from "../html";
import { linkDaVarianteNaNewsletter } from "@/lib/visamatch";
import type { DiaDaSemana } from "../cadencia";

/**
 * O bloco do VisaMatch na newsletter, que muda de FORMATO a cada edição.
 *
 * A decisão do dono, de 05/10/2026: o bloco fica, mas "diluído de forma
 * criativa, alternando a cada edição, igual o The News". Até essa data ele era
 * o mesmo cartão escuro em toda edição ("Você pode morar nos Estados Unidos
 * legalmente?"), e bloco que se repete igual todo dia vira paisagem: o leitor
 * para de ver.
 *
 * Três regras, e o motivo de cada uma:
 *
 *   1. **Formato diferente, não só palavra diferente.** Menção de uma linha,
 *      caixa de "Você sabia?", pergunta rápida, checklist, dúvida comum,
 *      cartão discreto, P.S. e o cartão escuro de antes. É o formato que faz
 *      o olho parar de novo.
 *   2. **Ferramenta de parceiro, rotulada, curta, nunca o assunto.** A
 *      newsletter é sobre os Estados Unidos e não sobre imigração (decisão de
 *      05/10/2026): o bloco é um aviso de parceiro no fim, e diz que é. Sem
 *      promessa ("garantido", "aprovado"), sem número inventado, sem
 *      travessão, na voz de conversa da publicação.
 *   3. **O mesmo link, com a variante no utm_content.** Assim o painel do
 *      VisaMatch responde qual formato converte. A edição vai no utm_term.
 *
 * A rotação é determinística pela DATA da edição e pelos dias de publicação
 * da newsletter (a cadência do projeto): cada dia de publicação é uma vaga, e
 * a vaga N leva a variante N módulo o total. Duas edições seguidas nunca
 * repetem, e todas passam antes de alguma voltar. Sorteio foi recusado pelo
 * mesmo motivo de sempre no projeto: dois dias iguais seguidos seriam
 * indistinguíveis de defeito.
 *
 * Projeto pode fixar uma variante ou mudar a ordem em
 * `settings.visamatch` (`{ "variante": "quiz" }` ou `{ "ordem": [...] }`).
 * Valor desconhecido é ignorado, e vale o padrão.
 */

export type PosicaoDoBloco = "antes-do-fechamento" | "depois-do-fechamento";

export type CoresDoBloco = {
  fonte: string;
  tinta: string;
  tintaSuave: string;
  linha: string;
  /** A cor da marca, para acento: fio, rótulo, botão. */
  cor: string;
  /** O azul-marinho da marca, para o cartão escuro. */
  tintaEscura: string;
  semBorda: string;
};

export type VarianteDoVisaMatch = {
  id: string;
  /** O formato, em palavras, para o painel e para quem lê o código. */
  formato: string;
  posicao: PosicaoDoBloco;
  /** O rótulo impresso que diz que é de parceiro. */
  rotulo: string;
  /** Todo texto visível da variante, para as conferências de voz. */
  textos: string[];
  renderizar: (link: string, c: CoresDoBloco) => string;
};

const rotuloHtml = (texto: string, c: CoresDoBloco, cor = c.tintaSuave) =>
  `<div style="font-family:${c.fonte};font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${cor};margin:0 0 8px 0;">${escapeHtml(texto)}</div>`;

/*
 * O botão nunca quebra em duas linhas (dono, 06/10/2026: a pílula vermelha em
 * duas linhas no celular "fica muito feia"). Por isso `white-space:nowrap` e
 * um rótulo curto, que cabe numa linha na menor tela comum (320px de largura
 * menos as margens do e-mail). Rótulo de botão novo passa pelo teto
 * `ROTULO_MAXIMO_DO_BOTAO`, conferido no teste.
 */
export const ROTULO_DO_BOTAO = "Fazer meu diagnóstico";
export const ROTULO_MAXIMO_DO_BOTAO = 22;

const botao = (link: string, texto: string, c: CoresDoBloco) =>
  `<a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;white-space:nowrap;background:${c.cor};color:#FFFFFF;font-family:${c.fonte};font-size:15px;font-weight:800;padding:12px 24px;border-radius:999px;text-decoration:none;">${escapeHtml(texto)}</a>`;

const linkEmTexto = (link: string, texto: string, c: CoresDoBloco) =>
  `<a href="${escapeHtml(link)}" target="_blank" style="color:${c.tinta};font-weight:700;text-decoration:underline;">${escapeHtml(texto)}</a>`;

const paragrafo = (html: string, c: CoresDoBloco, margem = "0 0 14px 0", tamanho = 16) =>
  `<p style="font-family:${c.fonte};font-size:${tamanho}px;line-height:1.6;color:${c.tintaSuave};margin:${margem};">${html}</p>`;

/** Caixa clara com fio de cor à esquerda: o desenho comum das variantes de meio. */
const caixa = (conteudo: string, c: CoresDoBloco) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${c.semBorda};margin:0 0 32px 0;">
              <tr><td style="background:#F7F7F8;border-left:3px solid ${c.cor};border-radius:10px;padding:20px 20px 22px 20px;">${conteudo}</td></tr>
            </table>`;

const MENCAO: VarianteDoVisaMatch = {
  id: "mencao-no-fechamento",
  formato: "menção de uma linha, antes da despedida",
  posicao: "antes-do-fechamento",
  rotulo: "Parceiro",
  textos: [
    "Parceiro",
    "Pensando em trabalhar nos EUA um dia? O",
    "VisaMatch",
    "mostra em poucos minutos quais caminhos de visto conversam com o seu perfil.",
  ],
  renderizar: (link, c) =>
    paragrafo(
      `<strong style="color:${c.cor};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Parceiro</strong> ` +
        `Pensando em trabalhar nos EUA um dia? O ${linkEmTexto(link, "VisaMatch", c)} mostra em poucos minutos ` +
        `quais caminhos de visto conversam com o seu perfil.`,
      c,
      "0 0 28px 0",
      15,
    ),
};

const VOCE_SABIA: VarianteDoVisaMatch = {
  id: "voce-sabia",
  formato: "caixa de \"Você sabia?\"",
  posicao: "antes-do-fechamento",
  rotulo: "Você sabia? · Parceiro",
  textos: [
    "Você sabia? · Parceiro",
    "Não existe um visto de trabalho para os Estados Unidos, existem vários. Cada um olha para uma coisa: formação, experiência, oferta de emprego ou investimento.",
    "O VisaMatch, ferramenta de um parceiro nosso, cruza essas regras com o seu perfil e mostra por onde começar.",
    ROTULO_DO_BOTAO,
  ],
  renderizar: (link, c) =>
    caixa(
      rotuloHtml("Você sabia? · Parceiro", c, c.cor) +
        paragrafo(
          "Não existe um visto de trabalho para os Estados Unidos, existem vários. Cada um olha para uma coisa: " +
            "formação, experiência, oferta de emprego ou investimento.",
          c,
        ) +
        paragrafo(
          "O VisaMatch, ferramenta de um parceiro nosso, cruza essas regras com o seu perfil e mostra por onde começar.",
          c,
          "0 0 16px 0",
        ) +
        botao(link, ROTULO_DO_BOTAO, c),
      c,
    ),
};

/*
 * Reescritas pelo dono em 14/10/2026: "por lá" e "uma oferta de emprego" não
 * diziam onde, e "alguns anos" não dizia quantos. Cada opção agora fala dos
 * EUA e dá o número que separa um caminho do outro.
 */
const OPCOES_DO_QUIZ = [
  "Tenho graduação e mais de 5 anos de experiência",
  "Quero abrir ou comprar um negócio nos EUA",
  "Tenho ou posso ter uma oferta de emprego nos EUA",
  "Ainda não sei, quero entender as opções",
];
const PERGUNTA_DO_QUIZ = "Qual destes caminhos para os EUA combina mais com você?";
const INSTRUCAO_DO_QUIZ = "Toque em uma das opções.";
const RODAPE_DO_QUIZ =
  "Escolha uma resposta e faça uma análise de perfil sem custo com o VisaMatch, da Imigrar EUA, parceira do eua.journal, e descubra em poucos minutos qual visto se encaixa no seu perfil.";

const QUIZ: VarianteDoVisaMatch = {
  id: "quiz",
  formato: "pergunta rápida com respostas clicáveis",
  posicao: "antes-do-fechamento",
  rotulo: "Pergunta rápida · Ferramenta de parceiro",
  textos: [
    "Pergunta rápida · Ferramenta de parceiro",
    PERGUNTA_DO_QUIZ,
    INSTRUCAO_DO_QUIZ,
    ...OPCOES_DO_QUIZ,
    RODAPE_DO_QUIZ,
  ],
  renderizar: (link, c) =>
    caixa(
      rotuloHtml("Pergunta rápida · Ferramenta de parceiro", c, c.cor) +
        `<div style="font-family:${c.fonte};font-size:19px;line-height:1.3;font-weight:800;color:${c.tinta};margin:0 0 4px 0;">${PERGUNTA_DO_QUIZ}</div>` +
        `<div style="font-family:${c.fonte};font-size:13px;line-height:1.4;color:${c.tintaSuave};margin:0 0 12px 0;">${INSTRUCAO_DO_QUIZ}</div>` +
        OPCOES_DO_QUIZ.map(
          (o) =>
            `<a href="${escapeHtml(link)}" target="_blank" style="display:block;font-family:${c.fonte};font-size:15px;line-height:1.4;color:${c.tinta};background:#FFFFFF;border:1px solid ${c.linha};border-radius:10px;padding:11px 14px;margin:0 0 8px 0;text-decoration:none;">${escapeHtml(o)}</a>`,
        ).join("") +
        paragrafo(
          RODAPE_DO_QUIZ,
          c,
          "8px 0 0 0",
          13,
        ),
      c,
    ),
};

/*
 * O passo a passo da conversa (06/10/2026). A versão anterior era "tenha isto
 * em mãos" (diploma, anos de experiência), e o dono apontou que ela dava a
 * impressão de que a pessoa precisa juntar papel e mandar currículo. O
 * VisaMatch é uma conversa: a pessoa responde no próprio chat e recebe, no
 * fim, um diagnóstico dos vistos que combinam com o perfil dela. Nenhum
 * documento, nenhum envio. `visamatch-na-edicao.test.ts` recusa as palavras
 * do formato antigo.
 */
const ITENS_DO_CHECKLIST = [
  "Você conversa com a ferramenta, como num chat",
  "Conta da sua formação, do seu trabalho e do que quer fazer nos EUA",
  "No fim, recebe um diagnóstico dos vistos que combinam com o seu perfil",
];

const CHECKLIST: VarianteDoVisaMatch = {
  id: "checklist",
  formato: "passo a passo em três itens",
  posicao: "antes-do-fechamento",
  rotulo: "Como funciona · Parceiro",
  textos: [
    "Como funciona · Parceiro",
    "Qual visto combina com você? Descubra numa conversa",
    ...ITENS_DO_CHECKLIST,
    "O VisaMatch é uma ferramenta de um parceiro nosso, e a conversa leva poucos minutos.",
    ROTULO_DO_BOTAO,
  ],
  renderizar: (link, c) =>
    caixa(
      rotuloHtml("Como funciona · Parceiro", c, c.cor) +
        `<div style="font-family:${c.fonte};font-size:18px;line-height:1.3;font-weight:800;color:${c.tinta};margin:0 0 12px 0;">Qual visto combina com você? Descubra numa conversa</div>` +
        ITENS_DO_CHECKLIST.map(
          (i, n) =>
            `<p style="font-family:${c.fonte};font-size:15px;line-height:1.5;color:${c.tintaSuave};margin:0 0 8px 0;"><span style="color:${c.cor};font-weight:800;">${n + 1}.</span>&nbsp; ${escapeHtml(i)}</p>`,
        ).join("") +
        paragrafo(
          "O VisaMatch é uma ferramenta de um parceiro nosso, e a conversa leva poucos minutos.",
          c,
          "12px 0 16px 0",
          15,
        ) +
        botao(link, ROTULO_DO_BOTAO, c),
      c,
    ),
};

/*
 * "Dúvida comum", e não "Pergunta do leitor": não há leitor nenhum por trás
 * desta pergunta, e apresentá-la como carta de leitor seria inventar um
 * registro. O formato é o mesmo; o rótulo diz a verdade.
 */
const DUVIDA_COMUM: VarianteDoVisaMatch = {
  id: "duvida-comum",
  formato: "pergunta e resposta, no estilo da coluna do leitor",
  posicao: "antes-do-fechamento",
  rotulo: "Dúvida comum · Parceiro",
  textos: [
    "Dúvida comum · Parceiro",
    "Dá para trabalhar nos EUA sem uma empresa me contratar antes?",
    "Depende do caminho. Alguns vistos pedem oferta de emprego; outros olham para a sua trajetória ou para um investimento.",
    "O VisaMatch, ferramenta de um parceiro nosso, ajuda a ver quais fazem sentido para o seu caso.",
    "Descobrir no VisaMatch",
  ],
  renderizar: (link, c) =>
    caixa(
      rotuloHtml("Dúvida comum · Parceiro", c, c.cor) +
        `<div style="font-family:${c.fonte};font-size:18px;line-height:1.35;font-weight:800;color:${c.tinta};margin:0 0 10px 0;">"Dá para trabalhar nos EUA sem uma empresa me contratar antes?"</div>` +
        paragrafo(
          "Depende do caminho. Alguns vistos pedem oferta de emprego; outros olham para a sua trajetória ou para um investimento.",
          c,
        ) +
        paragrafo(
          `O VisaMatch, ferramenta de um parceiro nosso, ajuda a ver quais fazem sentido para o seu caso. ${linkEmTexto(link, "Descobrir no VisaMatch", c)}`,
          c,
          "0",
        ),
      c,
    ),
};

const CARTAO_DISCRETO: VarianteDoVisaMatch = {
  id: "cartao-de-parceiro",
  formato: "cartão discreto de conteúdo de parceiro",
  posicao: "antes-do-fechamento",
  rotulo: "Conteúdo de parceiro",
  textos: [
    "Conteúdo de parceiro",
    "VisaMatch: quais caminhos de visto existem para você",
    "Converse com a ferramenta sobre sua formação, seu trabalho e seus planos, e receba um diagnóstico dos vistos que combinam com você. Leva poucos minutos.",
    ROTULO_DO_BOTAO,
  ],
  renderizar: (link, c) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${c.semBorda};margin:0 0 32px 0;">
              <tr><td style="border:1px solid ${c.linha};border-radius:12px;padding:18px 20px;">
                ${rotuloHtml("Conteúdo de parceiro", c, "#8A8A8F")}
                <div style="font-family:${c.fonte};font-size:17px;line-height:1.35;font-weight:800;color:${c.tinta};margin:0 0 6px 0;">VisaMatch: quais caminhos de visto existem para você</div>
                ${paragrafo("Converse com a ferramenta sobre sua formação, seu trabalho e seus planos, e receba um diagnóstico dos vistos que combinam com você. Leva poucos minutos.", c, "0 0 10px 0", 15)}
                ${paragrafo(linkEmTexto(link, ROTULO_DO_BOTAO, c), c, "0", 15)}
              </td></tr>
            </table>`,
};

/*
 * O cartão escuro de antes de 05/10/2026, agora UMA das variantes, e com o
 * rótulo de parceiro que não tinha. O desenho é o mais forte da peça, e por
 * isso mesmo não pode ser o de todo dia.
 */
const CARTAO_ESCURO: VarianteDoVisaMatch = {
  id: "convite-escuro",
  formato: "cartão escuro com botão",
  posicao: "antes-do-fechamento",
  rotulo: "Parceiro · Análise de perfil",
  textos: [
    "Parceiro · Análise de perfil",
    "Você pode morar nos Estados Unidos legalmente?",
    "Converse com a ferramenta sobre sua formação e seu trabalho e receba um diagnóstico dos vistos que combinam com o seu perfil. Leva poucos minutos.",
    ROTULO_DO_BOTAO,
  ],
  renderizar: (link, c) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${c.semBorda};margin:0 0 32px 0;">
              <tr><td align="center" style="background:${c.tintaEscura};border-radius:14px;padding:30px 26px;">
                ${rotuloHtml("Parceiro · Análise de perfil", c, "#9DB4D8")}
                <div style="font-family:${c.fonte};font-size:21px;line-height:1.3;font-weight:800;color:#FFFFFF;margin:0 0 10px 0;">
                  Você pode morar nos Estados Unidos legalmente?
                </div>
                <p style="font-family:${c.fonte};font-size:15px;line-height:1.6;color:#C8D6EC;margin:0 0 20px 0;">
                  Converse com a ferramenta sobre sua formação e seu trabalho e receba
                  um diagnóstico dos vistos que combinam com o seu perfil. Leva poucos minutos.
                </p>
                ${botao(link, ROTULO_DO_BOTAO, c)}
              </td></tr>
            </table>`,
};

const PS: VarianteDoVisaMatch = {
  id: "ps",
  formato: "P.S. depois da despedida",
  posicao: "depois-do-fechamento",
  rotulo: "Parceiro",
  textos: [
    "P.S.: se morar nos EUA é um plano, mesmo que distante, o",
    "VisaMatch",
    "mostra quais caminhos de visto existem para o seu perfil. É uma ferramenta de um parceiro nosso.",
  ],
  renderizar: (link, c) =>
    paragrafo(
      `<strong style="color:${c.tinta};">P.S.:</strong> se morar nos EUA é um plano, mesmo que distante, o ` +
        `${linkEmTexto(link, "VisaMatch", c)} mostra quais caminhos de visto existem para o seu perfil. ` +
        `É uma ferramenta de um parceiro nosso.`,
      c,
      "0 0 32px 0",
      15,
    ),
};

/**
 * A ordem padrão da rotação. Alterna peso: um formato forte nunca encosta em
 * outro forte, e a menção de uma linha aparece entre eles.
 */
export const VARIANTES_DO_VISAMATCH: readonly VarianteDoVisaMatch[] = [
  CARTAO_ESCURO,
  MENCAO,
  QUIZ,
  PS,
  CHECKLIST,
  VOCE_SABIA,
  CARTAO_DISCRETO,
  DUVIDA_COMUM,
];

const POR_ID = new Map(VARIANTES_DO_VISAMATCH.map((v) => [v.id, v]));

/** Terça a sexta, a cadência padrão da newsletter (`cadencia.ts`). */
const DIAS_PADRAO: DiaDaSemana[] = [2, 3, 4, 5];

/** Uma segunda-feira qualquer, como marco zero das vagas. Mudar reembaralha a rotação. */
const MARCO_ZERO = Date.UTC(2026, 0, 5);
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Quantos dias de publicação existem do marco zero até a data, sem contá-la.
 *
 * É o número da vaga da edição. Conta por aritmética, sem laço, e funciona
 * para data anterior ao marco (vaga negativa). Edição num dia que não é de
 * publicação divide a vaga com o próximo dia de publicação: caso raro, de
 * rodada manual, e o único efeito é repetir o formato uma vez.
 */
export function vagaDaEdicao(dataIso: string, dias: readonly DiaDaSemana[] = DIAS_PADRAO): number {
  const validos = [...new Set(dias)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const lista = validos.length > 0 ? validos : DIAS_PADRAO;
  const t = Date.parse(`${dataIso}T00:00:00Z`);
  if (!Number.isFinite(t)) return 0;
  const corridos = Math.round((t - MARCO_ZERO) / DIA_MS);
  const semanas = Math.floor(corridos / 7);
  const resto = corridos - semanas * 7;
  const diaDoMarco = new Date(MARCO_ZERO).getUTCDay();
  let noResto = 0;
  for (let k = 0; k < resto; k += 1) {
    if (lista.includes(((diaDoMarco + k) % 7) as DiaDaSemana)) noResto += 1;
  }
  return semanas * lista.length + noResto;
}

/** O que o projeto pode declarar em `settings.visamatch`. */
export type ConfigDoVisaMatch = {
  /** Fixa uma variante em toda edição, pelo `id`. */
  variante?: string;
  /** Troca a ordem da rotação, por `id`. Os desconhecidos são ignorados. */
  ordem?: string[];
  /** Os dias de publicação da newsletter, da cadência do projeto. */
  dias?: readonly DiaDaSemana[];
};

/** Lê `settings.visamatch` do projeto, ignorando o que não for do formato. */
export function configDoVisaMatch(settings: unknown): Pick<ConfigDoVisaMatch, "variante" | "ordem"> {
  const bruto = (settings as { visamatch?: unknown } | null | undefined)?.visamatch;
  if (!bruto || typeof bruto !== "object") return {};
  const o = bruto as Record<string, unknown>;
  return {
    ...(typeof o.variante === "string" ? { variante: o.variante } : {}),
    ...(Array.isArray(o.ordem) ? { ordem: o.ordem.filter((x): x is string => typeof x === "string") } : {}),
  };
}

export function varianteDaEdicao(dataIso: string, config: ConfigDoVisaMatch = {}): VarianteDoVisaMatch {
  const fixa = config.variante ? POR_ID.get(config.variante) : undefined;
  if (fixa) return fixa;
  const ordem = [...new Set(config.ordem ?? [])]
    .map((id) => POR_ID.get(id))
    .filter((v): v is VarianteDoVisaMatch => Boolean(v));
  const lista = ordem.length > 0 ? ordem : VARIANTES_DO_VISAMATCH;
  const vaga = vagaDaEdicao(dataIso, config.dias);
  return lista[((vaga % lista.length) + lista.length) % lista.length];
}

/** O bloco da edição, já com o link da variante, separado por posição. */
export function blocoDoVisaMatch(
  dataIso: string,
  cores: CoresDoBloco,
  config: ConfigDoVisaMatch = {},
  env: Record<string, string | undefined> = process.env,
): { variante: VarianteDoVisaMatch; antesDoFechamento: string; depoisDoFechamento: string } {
  const variante = varianteDaEdicao(dataIso, config);
  const html = variante.renderizar(linkDaVarianteNaNewsletter(dataIso, variante.id, env), cores);
  return {
    variante,
    antesDoFechamento: variante.posicao === "antes-do-fechamento" ? html : "",
    depoisDoFechamento: variante.posicao === "depois-do-fechamento" ? html : "",
  };
}
