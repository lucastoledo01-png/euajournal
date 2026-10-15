import type { InstagramCarouselContent } from "./instagram/schemas";
import { CTA_DA_LEGENDA, fecharLegenda } from "./legenda-final";

/**
 * A legenda que sai no Instagram, e o que ela nunca pode carregar.
 *
 * A newsletter e o Instagram compartilhavam a mesma ideia de "fechamento da
 * marca", e o resultado foi "Até amanhã. Equipe imigra.us." embaixo do CTA de
 * um post. Numa newsletter diária isso é a despedida do dia; num perfil que
 * publica várias vezes por dia é um erro de canal, e o leitor percebe.
 *
 * A correção de verdade está no prompt, que deixou de receber a assinatura da
 * newsletter. Este módulo é a garantia: se o modelo escrever mesmo assim, ou
 * se um projeto novo configurar outro fechamento, o texto não chega ao
 * Instagram. Mesma divisão de sempre aqui: pedido reduz a frequência, código
 * fecha o caminho.
 *
 * O outro trabalho daqui é a hashtag. Ela é campo separado no JSON e nunca era
 * costurada na legenda publicada, então bastava o modelo esquecer de repeti-la
 * dentro de `full_caption` para o post sair sem nenhuma. Aqui ela volta, no
 * fim, e derivada da pauta em vez de um conjunto fixo repetido todo dia.
 *
 * ATUALIZADO em 06/10/2026: a legenda segue o método do Not Journal, que não
 * usa hashtag, e termina sempre com "Siga @eua.journal". O conjunto continua
 * sendo calculado (vai para `caption.hashtags`, que o schema do caminho legado
 * exige), mas só entra no TEXTO com `settings.instagram.hashtags` ligado. O
 * fecho, o crédito que nunca entra e o resto da forma final moram em
 * `legenda-final.ts`.
 */

export const MOTIVOS_DA_LEGENDA = {
  FECHAMENTO_DE_NEWSLETTER: "REJECT_SOCIAL_CAPTION",
  SEM_HASHTAG: "MISSING_HASHTAGS",
  CTA_DUPLICADO: "DUPLICATE_CTA",
  HASHTAG_NO_MEIO: "HASHTAGS_INLINE",
} as const;

export type MotivoDaLegenda = (typeof MOTIVOS_DA_LEGENDA)[keyof typeof MOTIVOS_DA_LEGENDA];

export type ProblemaDaLegenda = { motivo: MotivoDaLegenda; detalhe: string };

export type ContextoDaLegenda = {
  titulo: string;
  resumo?: string;
  categoria?: string;
  /** "BR" ou "US" quando a classificação sabe. Sem isso, é inferido do texto. */
  pais?: string;
  /** Atores, órgãos e lugares da pauta, quando a classificação já os extraiu. */
  entidades?: string[];
  /** Palavra que o CTA pede no comentário. */
  keyword: string;
  /**
   * Fechamento da newsletter DESTE projeto.
   *
   * Entra como coisa a remover, nunca como coisa a escrever. É o que torna a
   * proteção multi-projeto: a assinatura de outra marca também é barrada sem
   * ninguém precisar acrescentar padrão nenhum aqui.
   */
  fechamentoDaNewsletter?: string;
  /**
   * `settings.instagram.hashtags` do projeto. Desligado (o padrão) a legenda
   * sai sem hashtag nenhuma, e a falta delas deixa de ser problema.
   */
  hashtags?: boolean;
};

/**
 * De três a cinco (regra do dono, 14/10/2026: "mínimo de 3 e máximo de 5").
 * Era piso de três e alvo de quatro a sete.
 *
 * O piso existe só porque o schema da legenda exige três. Ele não é meta: uma
 * quarta hashtag inventada para fechar a conta é exatamente o que colocou
 * "#EstadosUnidos" embaixo de uma notícia sobre a Polícia Federal.
 */
const MINIMO_DE_HASHTAGS = 3;
export const MAXIMO_DE_HASHTAGS = 5;
export const MINIMO_DE_HASHTAGS_DA_LEGENDA = MINIMO_DE_HASHTAGS;
const LIMITE_DA_LEGENDA = 2000;

function normalizar(texto: string): string {
  return (texto || "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fechamentos de e-mail que não pertencem a um feed.
 *
 * A lista é de despedidas, não de palavras. "amanhã" sozinho é informação
 * legítima numa pauta sobre prazo; "até amanhã" é a assinatura do boletim.
 */
const FECHAMENTOS_DE_NEWSLETTER = [
  "ate amanha",
  "ate a proxima",
  "ate a proxima edicao",
  "ate breve",
  "ate segunda",
  "nos vemos amanha",
  "nos vemos na proxima",
  "nos vemos por aqui",
  "boa leitura",
  "obrigado por ler",
  "obrigada por ler",
  "na edicao de amanha",
  "no e mail de amanha",
  "na newsletter de amanha",
  "voce recebeu este e mail",
  "cancelar sua inscricao",
  "para descadastrar",
  "agora voce esta desbugado",
];

/**
 * Quebra em frases mantendo a pontuação, para remover só a despedida.
 *
 * O ponto entre caracteres não termina frase. Sem isso, "Equipe imigra.us."
 * virava "Equipe imigra." mais "us.", a primeira metade era removida como
 * assinatura e a segunda ficava solta na legenda. Vale para qualquer marca com
 * ponto no nome, que é justamente o formato de domínio que este projeto usa.
 */
function separarFrases(bloco: string): string[] {
  const frases: string[] = [];
  let atual = "";

  for (let i = 0; i < bloco.length; i += 1) {
    const c = bloco[i];
    atual += c;
    if (c !== "." && c !== "!" && c !== "?") continue;

    const proximo = bloco[i + 1];
    if (proximo && /[^\s.!?]/.test(proximo)) continue;

    // Consome a pontuação repetida ("...", "!?") na mesma frase.
    while (bloco[i + 1] && /[.!?]/.test(bloco[i + 1])) {
      atual += bloco[i + 1];
      i += 1;
    }

    frases.push(atual);
    atual = "";
  }

  if (atual.trim().length > 0) frases.push(atual);

  return frases.filter((f) => f.trim().length > 0);
}

function ehFechamento(frase: string, extras: string[]): boolean {
  const n = normalizar(frase);
  if (!n) return false;

  if (FECHAMENTOS_DE_NEWSLETTER.some((f) => n.includes(f))) return true;
  if (extras.some((e) => e.length > 3 && n.includes(e))) return true;

  // "Equipe imigra.us." sozinha, sem verbo e sem informação, é assinatura.
  if (/^equipe\b/.test(n) && n.split(" ").length <= 4) return true;

  return false;
}

/**
 * Todas as formas do fechamento configurado, para casar mesmo picotado.
 *
 * O modelo copia a assinatura inteira ou só o pedaço final dela, então o
 * conjunto tem a linha completa e cada frase dentro dela.
 */
function variacoesDoFechamento(fechamento?: string): string[] {
  const bruto = (fechamento || "").trim();
  if (!bruto) return [];

  const inteiro = normalizar(bruto);
  const frases = separarFrases(bruto).map(normalizar);

  return [inteiro, ...frases].filter((v) => v.length > 3);
}

export type LimpezaDeFechamento = { texto: string; removidos: string[] };

/** Tira as despedidas de e-mail do texto, preservando o resto. */
export function removerFechamentoDeNewsletter(
  texto: string,
  fechamentoDoProjeto?: string,
): LimpezaDeFechamento {
  const extras = variacoesDoFechamento(fechamentoDoProjeto);
  const removidos: string[] = [];

  const linhas = (texto || "").split("\n").map((linha) => {
    const frases = separarFrases(linha);
    if (frases.length === 0) return linha;

    const mantidas = frases.filter((frase) => {
      if (!ehFechamento(frase, extras)) return true;
      removidos.push(frase.trim());
      return false;
    });

    return mantidas.join(" ").replace(/\s+/g, " ").trim();
  });

  const limpo = linhas
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { texto: limpo, removidos };
}

const TOKEN_DE_HASHTAG = /#[\p{L}\p{N}_]+/gu;

/** Deixa a hashtag num formato estável: sem acento, sem pontuação, com "#". */
export function normalizarHashtag(bruta: string): string | null {
  const corpo = (bruta || "")
    .trim()
    .replace(/^#+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_]/g, "");

  return corpo.length >= 2 ? `#${corpo}` : null;
}

function unicas(tags: string[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];

  for (const t of tags) {
    const limpa = normalizarHashtag(t);
    if (!limpa) continue;
    const chave = limpa.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(limpa);
  }

  return saida;
}

export type SeparacaoDeHashtags = { corpo: string; tags: string[]; noMeio: boolean };

/**
 * Separa o texto das hashtags.
 *
 * `noMeio` marca a hashtag que aparece antes do fim do texto. Ela não quebra
 * nada tecnicamente, mas atravessa a leitura da legenda no feed, e a ordem
 * pedida é conteúdo primeiro, marcação depois.
 */
export function separarHashtags(texto: string): SeparacaoDeHashtags {
  const linhas = (texto || "").split("\n");
  const tags: string[] = [];

  // Onde termina o conteúdo de verdade: a última linha que não é só hashtag.
  let ultimaDeConteudo = -1;
  linhas.forEach((linha, i) => {
    const semTags = linha.replace(TOKEN_DE_HASHTAG, "").trim();
    if (semTags.length > 0) ultimaDeConteudo = i;
  });

  let noMeio = false;
  const corpo = linhas
    .map((linha, i) => {
      const achadas = linha.match(TOKEN_DE_HASHTAG);
      if (achadas) {
        tags.push(...achadas);
        if (i < ultimaDeConteudo || linha.replace(TOKEN_DE_HASHTAG, "").trim().length > 0) {
          noMeio = true;
        }
      }
      return linha.replace(TOKEN_DE_HASHTAG, "").replace(/[ \t]+/g, " ").trim();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { corpo, tags: unicas(tags), noMeio };
}

type RegraDeHashtag = {
  padrao: RegExp;
  /** Uma tag, ou uma por país quando o nome muda de lado da fronteira. */
  tag: string | { BR: string; US: string };
  /** Quando esta casa, aquelas saem: #EB2NIW já diz o que #EB2 diria. */
  substitui?: string[];
  /** A pauta fala de processo migratório, e não só de um assunto qualquer. */
  imigracao?: boolean;
};

/**
 * De que a pauta trata, em hashtag.
 *
 * A lista é de assunto, não de marca. O conjunto fixo que saía em todo post
 * ("#ImigracaoEUA #GreenCard #VistoAmericano") não descrevia a pauta: descrevia
 * a conta. Hashtag que não muda com o assunto não é encontrada por ninguém.
 *
 * Cada regra é um gatilho de texto. Nenhuma hashtag entra por ser boa para a
 * marca: ou o assunto dela está no título, no resumo, nas entidades ou na
 * categoria, ou ela não entra.
 */
const REGRAS: RegraDeHashtag[] = [
  { padrao: /\bniw\b|\beb 2 niw\b|\beb2niw\b/, tag: "#EB2NIW", substitui: ["#EB2"], imigracao: true },
  { padrao: /\beb 2\b|\beb2\b/, tag: "#EB2", imigracao: true },
  { padrao: /\beb 1\b|\beb1\b|\beb 1a\b|\beb1a\b/, tag: "#EB1A", imigracao: true },
  { padrao: /\beb 3\b|\beb3\b/, tag: "#EB3", imigracao: true },
  { padrao: /\beb 5\b|\beb5\b|\bvisto de investidor\b/, tag: "#EB5", imigracao: true },
  { padrao: /\bh 1b\b|\bh1b\b/, tag: "#H1B", imigracao: true },
  { padrao: /\bl 1\b|\bl1\b|\bl 1a\b|\bl 1b\b/, tag: "#VistoL1", imigracao: true },
  { padrao: /\bo 1\b|\bo1\b/, tag: "#VistoO1", imigracao: true },
  { padrao: /\bvisto e 2\b|\be2 visa\b/, tag: "#VistoE2", imigracao: true },
  { padrao: /\bf 1\b|\bvisto f1\b/, tag: "#VistoF1", substitui: ["#VistoDeEstudante"], imigracao: true },
  { padrao: /\bvisto de estudante\b/, tag: "#VistoDeEstudante", imigracao: true },
  { padrao: /\bvisto de turismo\b|\bb1 b2\b|\bb 1 b 2\b|\bturista\b/, tag: "#VistoDeTurista", imigracao: true },
  {
    /*
     * "residente permanente" é a mesma coisa que "residência permanente".
     *
     * A flexão faltava, e o efeito apareceu num tópico cujo resumo é "virar
     * residente permanente sem precisar sair dos Estados Unidos": assunto de
     * green card do começo ao fim, e nenhuma hashtag de green card.
     */
    padrao: /\bgreen card\b|\bgreencard\b|\bresidencia permanente\b|\bresidente permanente\b|\bresidentes permanentes\b/,
    tag: "#GreenCard",
    imigracao: true,
  },
  { padrao: /\basilo\b|\brefugio\b|\brefugiad/, tag: "#Asilo", imigracao: true },
  { padrao: /\bcidadania\b|\bnaturalizac/, tag: "#CidadaniaAmericana", imigracao: true },
  { padrao: /\bloteria de vistos\b|\bdiversity visa\b/, tag: "#LoteriaDeVistos", imigracao: true },
  { padrao: /\buscis\b/, tag: "#USCIS", imigracao: true },
  { padrao: /\bice\b|\bimmigration and customs\b/, tag: "#ICE", imigracao: true },
  { padrao: /\bcbp\b|\balfandega\b/, tag: "#CBP", imigracao: true },
  { padrao: /\bconsulado\b|\bembaixada\b|\bdepartamento de estado\b/, tag: "#Consulado", imigracao: true },
  { padrao: /\bfronteira\b|\bdeportac|\bdetenc/, tag: "#Fronteira", imigracao: true },
  { padrao: /\bsuprema corte\b|\bsupreme court\b/, tag: "#SupremaCorte" },
  { padrao: /\bstf\b|\bsupremo tribunal federal\b/, tag: "#STF" },
  { padrao: /\bpolicia federal\b|\bpf\b/, tag: "#PoliciaFederal" },
  {
    padrao: /\bministro\b|\bministros\b|\bjustica\b|\btribunal\b|\bprocurador|\binquerito\b|\bjulgamento\b/,
    tag: { BR: "#Justica", US: "#JusticaAmericana" },
  },
  { padrao: /\bcongresso\b|\bsenado\b|\bcamara\b/, tag: { BR: "#Congresso", US: "#CongressoAmericano" } },
  {
    padrao: /\bemprego|\bempregos\b|\bvaga\b|\bvagas\b|\bcontratac|\bpayroll\b|\bdesemprego\b|\bfolha de pagamento\b|\bmercado de trabalho\b/,
    tag: "#MercadoDeTrabalho",
  },
  {
    padrao: /\binflac|\bjuros\b|\bdolar\b|\bcambio\b|\bpib\b|\bbolsa de valores\b|\bibovespa\b|\bnasdaq\b|\bdow jones\b|\beconomia\b|\bfed\b|\brecessao\b|\bindicador|\bemprego/,
    tag: { BR: "#EconomiaBrasil", US: "#EconomiaEUA" },
  },
  { padrao: /\bimposto|\btarifa|\btributar|\btaxac/, tag: { BR: "#Impostos", US: "#ImpostosNosEUA" } },
  { padrao: /\bempreended|\bstartup\b|\bnegocio|\bfranquia\b|\babrir empresa\b/, tag: "#EmpreenderNosEUA" },
  { padrao: /\bmoradia\b|\baluguel\b|\bimovel\b|\bimoveis\b|\bcasa propria\b/, tag: "#MorarNosEUA" },
  { padrao: /\bsaude\b|\bseguro saude\b|\bplano de saude\b/, tag: "#SaudeNosEUA" },
];

/**
 * Os sinais da pauta, que autorizam ou barram cada família de hashtag.
 *
 * Existem porque a inferência larga errou duas vezes do mesmo jeito: "mestrado
 * e doutorado" numa pauta de EB-2 NIW virou #EstudarNosEUA, e uma pauta sobre
 * o STF virou #BrasileirosNosEUA. Nos dois casos a palavra estava lá e o
 * assunto não estava. Diploma é qualificação profissional, não vida de
 * estudante; e um despacho da Polícia Federal não fala com quem mora fora.
 */
type Sinais = {
  pais: "BR" | "US";
  imigracao: boolean;
  visto: boolean;
  estudo: boolean;
  trabalho: boolean;
  profissao: boolean;
  eua: boolean;
  brasil: boolean;
  brasileirosNosEua: boolean;
  politica: boolean;
  moradia: boolean;
};

const GATILHOS = {
  /*
   * Processo migratório citado, não "os EUA" como assunto.
   *
   * As flexões estavam incompletas: "imigrac" e "imigrant" deixavam de fora
   * "imigrar" e, principalmente, "migratório", que é como se escreve quando se
   * fala de "caminhos migratórios". Cinco tópicos do catálogo evergreen usam
   * exatamente essa palavra e nenhum era reconhecido como assunto de imigração.
   *
   * "petição" ficou fora de propósito: no Brasil é peça de processo judicial, e
   * um despacho do STF não é assunto de imigração.
   *
   * "morar nos eua" e "mudar para os eua" saíram em 05/10/2026. Desde que o
   * leitor passou a ser quem SONHA com os EUA, essa é a frase do post comum, e
   * ela marcava como imigração, com #ImigracaoEUA, um post sobre salário.
   */
  imigracao:
    /\bimigra[cnrv]|\bmigrator|\bvisto\b|\bvistos\b|\bgreen card\b|\bgreencard\b|\bresidencia permanente\b|\bresidente permanente\b|\bresidentes permanentes\b|\bcidadania\b|\bnaturalizac|\bdeportac|\basilo\b|\buscis\b|\bconsulado\b|\bembaixada\b|\bfronteira\b|\bniw\b|\beb 1\b|\beb 2\b|\beb 3\b|\beb 5\b|\bh1b\b|\bh 1b\b|\bo 1\b/,
  visto: /\bvisto\b|\bvistos\b|\bvisa\b|\bconsulado\b|\bembaixada\b|\buscis\b|\bgreen card\b|\bgreencard\b|\bniw\b/,
  /*
   * Estudo é vida de estudante, não diploma no currículo.
   *
   * "mestrado" e "doutorado" saíram daqui de propósito: numa pauta de EB-2 NIW
   * eles descrevem a qualificação do profissional que pede o green card, e
   * #EstudarNosEUA num post sobre cirurgião fala com o público errado.
   */
  estudo:
    /\bf 1\b|\bvisto de estudante\b|\bestudante|\bestudantes\b|\bintercambio\b|\buniversidade|\bfaculdade|\bcollege\b|\bcampus\b|\bbolsa de estudo|\bmatricula\b|\bcurso\b|\bcursos\b|\bgraduac|\bpos graduac/,
  trabalho:
    /\bemprego|\bempregos\b|\bvaga\b|\bvagas\b|\bcontratac|\bpayroll\b|\bdesemprego\b|\bmercado de trabalho\b|\bfolha de pagamento\b|\bsalario/,
  /** Quem a pauta descreve: a profissão, não o mercado em agregado. */
  profissao:
    /\bmedic|\bcirurgi|\benfermeir|\bengenheir|\bprofessor|\bpesquisador|\bcientista|\bdesenvolvedor|\bprogramador|\barquitet|\badvogad|\bdentista|\bmestrado\b|\bdoutorado\b|\bqualificac|\bcarreira\b|\bprofissional|\bprofissionais\b|\bespecialista/,
  eua: /\beua\b|\bestados unidos\b|\bamericano|\bamericana|\bwashington\b|\bcasa branca\b|\buscis\b|\bnos eua\b/,
  brasil: /\bbrasil\b|\bbrasileir|\bbrasilia\b|\bstf\b|\bsupremo tribunal federal\b|\bcongresso nacional\b|\bplanalto\b|\bpolicia federal\b/,
  brasileiros: /\bbrasileir/,
  politica:
    /\bgoverno\b|\bpresidente\b|\bministro\b|\bministros\b|\bcongresso\b|\bsenado\b|\bcamara\b|\beleic|\bpartido\b|\bstf\b|\bpolitic|\binquerito\b|\bpolicia federal\b/,
  moradia: /\bmorar\b|\bmoradia\b|\baluguel\b|\bimovel\b|\bimoveis\b|\bmudanca\b|\bcasa propria\b/,
};

function paisDaPauta(texto: string, declarado?: string): "BR" | "US" {
  const d = normalizar(declarado || "");
  if (d.includes("br") || d.includes("brasil")) return "BR";
  if (d.includes("us") || d.includes("eua") || d.includes("estados unidos")) return "US";

  const temBrasil = GATILHOS.brasil.test(texto);
  const temEua = GATILHOS.eua.test(texto);

  if (temBrasil && !temEua) return "BR";
  return "US";
}

function lerSinais(texto: string, declarado?: string): Sinais {
  const eua = GATILHOS.eua.test(texto);
  const imigracao = GATILHOS.imigracao.test(texto);

  return {
    pais: paisDaPauta(texto, declarado),
    imigracao,
    visto: GATILHOS.visto.test(texto),
    estudo: GATILHOS.estudo.test(texto),
    trabalho: GATILHOS.trabalho.test(texto),
    profissao: GATILHOS.profissao.test(texto),
    eua,
    brasil: GATILHOS.brasil.test(texto),
    // Só fala com quem está lá fora se a pauta mencionar brasileiros E o
    // destino. "STF" e "brasileiros nos EUA" não são a mesma coisa.
    brasileirosNosEua: GATILHOS.brasileiros.test(texto) && (eua || imigracao),
    politica: GATILHOS.politica.test(texto),
    moradia: GATILHOS.moradia.test(texto),
  };
}

/**
 * As hashtags de enquadramento, cada uma com a condição que a justifica.
 *
 * Antes eram três listas fixas por país, escolhidas em bloco. O efeito era
 * exatamente o que não se quer: hashtag de EUA numa pauta institucional
 * brasileira porque o projeto se chama imigra.us.
 */
const REGRAS_DE_CONTEXTO: Array<{ tag: string; quando: (s: Sinais) => boolean }> = [
  { tag: "#ImigracaoEUA", quando: (s) => s.imigracao },
  { tag: "#VistoAmericano", quando: (s) => s.visto },
  { tag: "#EstudarNosEUA", quando: (s) => s.estudo && (s.eua || s.imigracao) },
  { tag: "#EstudanteInternacional", quando: (s) => s.estudo && s.imigracao },
  { tag: "#ProfissionaisNosEUA", quando: (s) => s.profissao && (s.eua || s.imigracao) },
  { tag: "#Carreira", quando: (s) => s.profissao && s.pais === "BR" && !s.eua && !s.imigracao },
  { tag: "#MorarNosEUA", quando: (s) => s.moradia && (s.eua || s.imigracao) },
  { tag: "#PoliticaBrasileira", quando: (s) => s.brasil && s.politica && !s.eua },
  { tag: "#BrasileirosNosEUA", quando: (s) => s.brasileirosNosEua },
  { tag: "#EstadosUnidos", quando: (s) => s.eua },
  { tag: "#Brasil", quando: (s) => s.brasil },
];

/** Hashtag de visto só entra quando a pauta fala de visto. */
const TAGS_DE_VISTO = new Set([
  "#eb2niw", "#eb2", "#eb1a", "#eb3", "#eb5", "#h1b", "#vistol1", "#vistoo1",
  "#vistoe2", "#vistodeestudante", "#vistodeturista", "#greencard", "#asilo",
  "#cidadaniaamericana", "#loteriadevistos", "#vistoamericano", "#imigracaoeua",
  "#imigracao", "#uscis", "#consulado",
]);

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "no", "nos", "na", "nas", "e", "para", "com", "em"]);

/**
 * A hashtag que o modelo sugeriu tem base na pauta?
 *
 * O modelo escreve tags específicas boas ("#Cirurgioes" numa pauta de médicos)
 * e também tags de marca que não descrevem nada do que foi publicado. A régua
 * é a mesma das regras: o assunto precisa aparecer no título, no resumo, nas
 * entidades ou na categoria.
 */
function justificadaPeloTexto(tag: string, texto: string): boolean {
  const compacta = tag.replace(/^#/, "").toLowerCase();
  const textoCompacto = texto.replace(/ /g, "");
  if (compacta.length >= 3 && textoCompacto.includes(compacta)) return true;

  const palavras = (tag.replace(/^#/, "").match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? [])
    .map((p) => p.toLowerCase())
    .filter((p) => p.length >= 4 && !PALAVRAS_VAZIAS.has(p));

  if (palavras.length === 0) return false;

  /*
   * Radical em vez de palavra inteira.
   *
   * Plural em português nem sempre é sufixo: "cirurgioes" e "cirurgiao" só se
   * encontram cortando antes da terminação. Setenta por cento da palavra, com
   * piso de quatro letras, casa flexão sem casar palavra diferente.
   */
  return palavras.every((palavra) => {
    const radical = palavra.slice(0, Math.max(4, Math.ceil(palavra.length * 0.7)));
    return texto.includes(radical);
  });
}

/** A editoria da pauta (eixo da classificação) em hashtag, para completar o piso. */
const HASHTAG_DA_EDITORIA: Record<string, string> = {
  economia: "#Economia",
  trabalho: "#Trabalho",
  tecnologia: "#Tecnologia",
  custo_de_vida: "#CustoDeVida",
  politica: "#Politica",
  brasil: "#Brasil",
  cultura: "#Cultura",
  seguranca: "#Seguranca",
};

/**
 * As hashtags desta pauta.
 *
 * A ordem é: o que é específico do assunto primeiro, depois o que o modelo
 * sugeriu e o texto sustenta, e o enquadramento por último. Assim dois posts
 * do mesmo dia não terminam iguais, que era a reclamação de origem.
 *
 * Saem de três a cinco. Se a pauta só sustenta três, saem três: uma quarta
 * inventada é justamente o que fez "#EstadosUnidos" aparecer embaixo de uma
 * notícia sobre a Polícia Federal.
 */
export function hashtagsDaPauta(contexto: ContextoDaLegenda, sugeridas: string[] = []): string[] {
  const texto = normalizar(
    [
      contexto.titulo,
      contexto.resumo ?? "",
      (contexto.entidades ?? []).join(" "),
      contexto.categoria ?? "",
    ].join(" "),
  );

  const sinais = lerSinais(texto, contexto.pais);

  const especificas: string[] = [];
  const removidas = new Set<string>();
  let falaDeImigracao = sinais.imigracao;

  for (const regra of REGRAS) {
    if (!regra.padrao.test(texto)) continue;
    if (regra.imigracao) falaDeImigracao = true;
    especificas.push(typeof regra.tag === "string" ? regra.tag : regra.tag[sinais.pais]);
    for (const fora of regra.substitui ?? []) removidas.add(fora.toLowerCase());
  }

  /*
   * Sem menção a processo migratório, hashtag de visto não entra.
   *
   * É o caso da pauta econômica: ela interessa a quem quer se mudar, e ainda
   * assim "#GreenCard" embaixo de um dado de emprego é isca, não assunto.
   */
  const permitida = (t: string) => {
    const chave = t.toLowerCase();
    if (removidas.has(chave)) return false;
    if (!falaDeImigracao && TAGS_DE_VISTO.has(chave)) return false;
    return true;
  };

  const doModelo = unicas(sugeridas).filter((t) => justificadaPeloTexto(t, texto));
  const contextuais = REGRAS_DE_CONTEXTO.filter((r) => r.quando(sinais)).map((r) => r.tag);

  const escolhidas = unicas([...especificas, ...doModelo, ...contextuais])
    .filter(permitida)
    .slice(0, MAXIMO_DE_HASHTAGS);

  /*
   * O único complemento admitido é o país da pauta.
   *
   * Ele não é palpite: sai da classificação, que é uma das fontes de
   * justificativa. Qualquer outra coisa aqui seria hashtag de marca.
   */
  const doPais = sinais.pais === "BR" ? "#Brasil" : "#EstadosUnidos";
  /*
   * O piso de três é regra do dono desde 14/10/2026. Os complementos, nesta
   * ordem, saem da classificação e nunca de palpite: o país da pauta, a
   * editoria dela e, só se ainda faltar, "#Noticias".
   */
  const editoria = HASHTAG_DA_EDITORIA[normalizar(contexto.categoria ?? "").replace(/\s+/g, "_")];
  for (const extra of [doPais, editoria, "#Noticias"]) {
    if (escolhidas.length >= MINIMO_DE_HASHTAGS) break;
    if (!extra || !permitida(extra)) continue;
    if (!escolhidas.some((t) => t.toLowerCase() === extra.toLowerCase())) escolhidas.push(extra);
  }

  return escolhidas.slice(0, MAXIMO_DE_HASHTAGS);
}

/** Frases que pedem o comentário da palavra-chave. */
function frasesDeCta(corpo: string, keyword: string): { frases: string[]; texto: string } {
  const alvo = normalizar(keyword);
  if (!alvo) return { frases: [], texto: corpo };

  const encontradas: string[] = [];

  const linhas = corpo.split("\n").map((linha) => {
    const frases = separarFrases(linha);
    if (frases.length === 0) return linha;

    const mantidas = frases.filter((frase) => {
      const n = normalizar(frase);
      const pede = /\bcoment|\bcomente\b|\bescreva\b|\bmande\b/.test(n) && n.includes(alvo);
      if (!pede) return true;
      encontradas.push(frase.trim());
      return false;
    });

    return mantidas.join(" ").replace(/\s+/g, " ").trim();
  });

  return {
    frases: encontradas,
    texto: linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

/** O que está errado nesta legenda, sem consertar nada. */
export function validarLegendaSocial(
  caption: { full_caption: string; cta_call?: string },
  contexto: ContextoDaLegenda,
): ProblemaDaLegenda[] {
  const problemas: ProblemaDaLegenda[] = [];
  const texto = caption.full_caption || "";

  const limpeza = removerFechamentoDeNewsletter(texto, contexto.fechamentoDaNewsletter);
  if (limpeza.removidos.length > 0) {
    problemas.push({
      motivo: MOTIVOS_DA_LEGENDA.FECHAMENTO_DE_NEWSLETTER,
      detalhe: `fechamento de newsletter na legenda: "${limpeza.removidos.join(" / ")}"`,
    });
  }

  const separacao = separarHashtags(texto);
  // Sem hashtag é o padrão desde 06/10/2026; a falta só é problema com o projeto pedindo.
  if (contexto.hashtags === true && separacao.tags.length === 0) {
    problemas.push({
      motivo: MOTIVOS_DA_LEGENDA.SEM_HASHTAG,
      detalhe: "a legenda publicada não tem nenhuma hashtag",
    });
  }
  if (separacao.noMeio) {
    problemas.push({
      motivo: MOTIVOS_DA_LEGENDA.HASHTAG_NO_MEIO,
      detalhe: "hashtag no meio do texto, e não no bloco final",
    });
  }

  const cta = frasesDeCta(separacao.corpo, contexto.keyword);
  if (cta.frases.length > 1) {
    problemas.push({
      motivo: MOTIVOS_DA_LEGENDA.CTA_DUPLICADO,
      detalhe: `o CTA aparece ${cta.frases.length} vezes`,
    });
  }

  return problemas;
}

export type ReparoDaLegenda = {
  caption: InstagramCarouselContent["caption"];
  problemas: ProblemaDaLegenda[];
  reparos: string[];
};

/**
 * Deixa a legenda publicável: sem despedida de e-mail, sem crédito de foto, sem
 * o convite de comentário, e com "Siga @eua.journal" na última linha.
 *
 * A ordem final é o lide e os parágrafos, como o modelo escreveu, e o fecho.
 * Com `settings.instagram.hashtags` ligado, as hashtags entram num bloco logo
 * antes do fecho, porque o fecho é a última linha sempre (regra do dono,
 * 06/10/2026).
 *
 * O convite "Comente NEWS" saiu da legenda nesta data, trocado pelo fecho fixo.
 * O funil de comentário continua vivo onde ele mora de verdade: a automação do
 * OpenReply escuta o comentário, e o último slide do carrossel continua
 * dizendo "Comente NEWS e receba o link" quando há keyword escutada. Por isso
 * `cta_call` passa a ser o fecho, e não a frase do comentário.
 */
export function repararLegendaSocial(
  caption: InstagramCarouselContent["caption"],
  contexto: ContextoDaLegenda,
): ReparoDaLegenda {
  const problemas = validarLegendaSocial(caption, contexto);
  const reparos: string[] = [];

  const semFechamento = removerFechamentoDeNewsletter(
    caption.full_caption || "",
    contexto.fechamentoDaNewsletter,
  );
  if (semFechamento.removidos.length > 0) {
    reparos.push(`fechamento removido: "${semFechamento.removidos.join(" / ")}"`);
  }

  const separacao = separarHashtags(semFechamento.texto);
  const cta = frasesDeCta(separacao.corpo, contexto.keyword);
  if (cta.frases.length > 0) reparos.push(`convite de comentário tirado da legenda (${cta.frases.length})`);

  /*
   * O conjunto é calculado mesmo desligado: ele vai para `caption.hashtags`,
   * que o schema do caminho legado exige com pelo menos três, e é o que a
   * chave do projeto liga de volta sem mudar código.
   */
  const tags = hashtagsDaPauta(contexto, separacao.tags);
  const ligadas = contexto.hashtags === true;
  if (ligadas && separacao.tags.length === 0) reparos.push(`hashtags ausentes, geradas ${tags.length}`);
  if (!ligadas && separacao.tags.length > 0) reparos.push(`hashtags tiradas da legenda (${separacao.tags.length})`);

  const fecho = fecharLegenda(cta.texto, {
    hashtags: ligadas ? tags : "remover",
    keyword: contexto.keyword,
    limite: LIMITE_DA_LEGENDA,
  });
  if (fecho.removidos.creditos.length > 0) reparos.push(`crédito de foto tirado da legenda (${fecho.removidos.creditos.length})`);
  if (fecho.removidos.fontes.length > 0) reparos.push(`linha de "Fonte:" tirada da legenda`);

  const intro = removerFechamentoDeNewsletter(
    caption.intro_summary || "",
    contexto.fechamentoDaNewsletter,
  );
  const introFinal = intro.texto.length >= 20 ? intro.texto : caption.intro_summary;

  return {
    caption: {
      ...caption,
      intro_summary: introFinal,
      cta_call: CTA_DA_LEGENDA,
      hashtags: tags,
      full_caption: fecho.texto,
    },
    problemas,
    reparos,
  };
}

/**
 * Ponto único por onde toda legenda de Instagram passa antes de ser gravada e
 * publicada.
 *
 * Os três formatos (notícia, tutorial e campanha) desembocam aqui de
 * propósito. Consertar em três lugares é como o fechamento da newsletter
 * chegou ao feed: dois caminhos, uma regra escrita em um só.
 */
export function garantirLegendaSocial(
  carousel: InstagramCarouselContent,
  contexto: ContextoDaLegenda,
): { carousel: InstagramCarouselContent; problemas: ProblemaDaLegenda[]; reparos: string[] } {
  const { caption, problemas, reparos } = repararLegendaSocial(carousel.caption, contexto);
  return { carousel: { ...carousel, caption }, problemas, reparos };
}

/*
 * `creditoParaLegenda` e `legendaComCredito` saíram em 06/10/2026, por regra do
 * dono: crédito de foto não entra na legenda do Instagram, nunca. Eles levavam
 * a atribuição para o fim da legenda desde 18/09/2026, quando a tira saiu da
 * arte. O crédito continua gravado no post (`content_json.visual.attribution` e
 * `content_json.creditos_das_fotos`), e `fecharLegenda` tira qualquer linha de
 * crédito que alguém ou algum modelo escreva. Não volte a costurá-los: a regra
 * vale em código justamente para não depender de quem lembra dela.
 */
