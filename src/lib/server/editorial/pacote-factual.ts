import { z } from "zod";
import { callOpenAIJSON } from "../newsroom/ai-provider";
import { extrairNumeros, numeroCompativel, numerosDoMaterial } from "./numeros-com-sentido";

/**
 * O que o redator pode afirmar.
 *
 * A edição de validação inventou uma operação policial com nome próprio e o
 * sobrenome de um banqueiro. Nenhum dos dois estava no material. O QA pegou,
 * e pegar depois é a última linha de defesa, não a primeira.
 *
 * A primeira é esta: o redator recebe uma lista fechada de fatos, nomes,
 * organizações, lugares, datas e números extraídos da matéria, e a instrução
 * de que fora dessa lista não existe fato. Contexto e transição ele escreve;
 * fato, não inventa.
 */

const listaDeTexto = z.preprocess(
  (v) => {
    if (typeof v === "string") return v.trim() ? [v] : [];
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  },
  z.array(z.string()).default([])
);

export const PacoteFactualSchema = z.object({
  /** Frases do que aconteceu, cada uma sustentada pela matéria. */
  verified_facts: listaDeTexto,
  people: listaDeTexto,
  organizations: listaDeTexto,
  places: listaDeTexto,
  dates: listaDeTexto,
  numbers: listaDeTexto,
  /** O que a matéria explicitamente NÃO diz. Serve para o redator não supor. */
  gaps: listaDeTexto,
});

export type PacoteFactual = z.infer<typeof PacoteFactualSchema> & {
  source_urls: string[];
  /** Texto de origem, guardado para a verificação de ancoragem. */
  texto_de_origem: string;
  /**
   * O pacote de cada fonte, quando a matéria do portal juntou mais de uma
   * (06/10/2026, `ramos/fontes-da-materia.ts`). As listas de cima são a união
   * de todas; aqui cada fato continua preso a quem o deu, para "segundo X" ser
   * o X de verdade. Ausente no pacote de uma fonte só, que é o da camada comum.
   */
  fontes?: FonteDoPacote[];
  /**
   * As falas entre aspas da matéria, com o trecho ORIGINAL conferido letra a
   * letra contra o texto de origem (06/10/2026). Só entra aqui a citação cujo
   * original está no texto: é o que permite o formato de citação de famoso
   * sem abrir a porta para fala inventada. Ausente no pacote anterior a esta
   * data, e aí nenhuma fala entre aspas tem lastro.
   */
  citacoes?: CitacaoLiteral[];
};

export type CitacaoLiteral = {
  /** Quem falou, como a matéria escreve. */
  autor: string;
  /** O trecho como está na matéria, na língua dela. */
  original: string;
  /** A tradução fiel para o português; igual ao original se já for português. */
  traducao: string;
};

export type FonteDoPacote = z.infer<typeof PacoteFactualSchema> & {
  /** "F1", "F2"...: o id que o redator usa para pendurar o link. F1 é a principal. */
  id: string;
  nome: string;
  url: string;
  principal: boolean;
  /** O texto desta fonte só, para conferir a atribuição de um número a ela. */
  texto_de_origem: string;
  /** As falas conferidas desta fonte (06/10/2026). */
  citacoes?: CitacaoLiteral[];
};

export function montarSystemDoExtrator(): string {
  return `
Você extrai fatos de uma matéria jornalística. Não resume, não interpreta, não completa.

Devolva JSON com:

verified_facts: frases curtas, cada uma afirmando algo que ESTÁ ESCRITO na matéria. Uma informação por frase. Não junte duas informações numa frase. Não escreva nada que exija conhecimento externo.

people: nomes de pessoas citados, exatamente como aparecem.
organizations: órgãos, empresas, tribunais e entidades citados, exatamente como aparecem.
places: cidades, estados e países citados.
dates: datas e períodos citados, como aparecem ("31 de agosto", "2026", "nesta quinta-feira").
numbers: números citados com o que eles medem ("540 dias", "1,2 milhão de pedidos", "US$ 3 mil").
gaps: o que a matéria NÃO informa e um leitor perguntaria. Só liste lacuna real.
citacoes: as falas que a matéria traz ENTRE ASPAS, no máximo cinco, cada uma {"autor": "quem falou, como a matéria escreve", "original": "o trecho copiado letra por letra da matéria, sem as aspas", "traducao": "a tradução fiel para o português, sem resumir nem melhorar; igual ao original se já estiver em português"}. Só fala que está entre aspas na matéria; paráfrase não entra. Lista vazia quando não há.

Regras:
- Se um nome, número ou data não está na matéria, ele não entra. Não deduza, não converta, não estime.
- Não traduza nomes próprios de órgãos: mantenha como está escrito.
- Lista vazia é uma resposta válida e correta quando a matéria não traz aquilo.
`.trim();
}

export async function montarPacoteFactual(
  pauta: { titulo: string; texto: string; urls: string[] },
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ pacote: PacoteFactual; custoUsd: number; tokens: number }> {
  const modelo = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDoExtrator() },
      {
        role: "user",
        content: `Título: ${pauta.titulo}\n\nMatéria:\n${pauta.texto.slice(0, 8000)}`,
      },
    ],
    modelo,
    env,
    fetcher
  );

  const parsed = PacoteFactualSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Extrator devolveu formato inválido: ${parsed.error.issues[0]?.message ?? ""}`);
  }

  // As listas aceitam formato torto e viram vazio quando o modelo erra a
  // forma. Isso é bom para não perder o resto do pacote e péssimo se passar
  // despercebido: pacote sem fato nenhum faz TODA afirmação do texto parecer
  // não sustentada, e a edição inteira é recusada por um erro de extração.
  // Melhor falhar aqui, onde o motivo ainda é legível.
  if (parsed.data.verified_facts.length === 0) {
    throw new Error("Extrator não devolveu nenhum fato verificado para esta pauta.");
  }

  // As citações são conferidas aqui, e não confiadas ao modelo: a que não
  // está no texto de origem não entra no pacote (06/10/2026).
  const citacoes = citacoesLiterais((data as { citacoes?: unknown } | null)?.citacoes, pauta.texto);

  return {
    pacote: {
      ...parsed.data,
      source_urls: pauta.urls,
      texto_de_origem: pauta.texto,
      ...(citacoes.length ? { citacoes } : {}),
    },
    custoUsd: usage.estimatedCostUsd,
    tokens: usage.totalTokens,
  };
}

/* ------------------------------------------------------------------ */
/* Citações literais (06/10/2026)                                       */
/* ------------------------------------------------------------------ */

/**
 * Forma de comparar fala: sem caixa, sem acento, sem pontuação e com as aspas
 * de qualquer tipo iguais. A fala "literal" sobrevive a uma vírgula a mais; não
 * sobrevive a uma palavra trocada.
 */
export function normalizarFala(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Abaixo disso não é fala, é expressão ("morally binding"), e não se confere. */
export const PALAVRAS_MINIMAS_DA_FALA = 5;

/**
 * As citações que o extrator devolveu, só as que estão de fato no texto.
 *
 * O original precisa estar no texto de origem, inteiro, na forma normalizada.
 * Sem tradução, vale o original (a matéria já em português).
 */
export function citacoesLiterais(bruto: unknown, textoDeOrigem: string): CitacaoLiteral[] {
  if (!Array.isArray(bruto)) return [];
  const texto = normalizarFala(textoDeOrigem);
  const saida: CitacaoLiteral[] = [];
  for (const item of bruto.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const { autor, original, traducao } = item as Record<string, unknown>;
    if (typeof autor !== "string" || !autor.trim() || typeof original !== "string") continue;
    const o = normalizarFala(original);
    if (o.split(" ").length < 3 || !texto.includes(o)) continue;
    saida.push({
      autor: autor.trim(),
      original: original.trim(),
      traducao: typeof traducao === "string" && traducao.trim() ? traducao.trim() : original.trim(),
    });
  }
  return saida.slice(0, 5);
}

/** Os trechos entre aspas de um texto, com a posição. */
export function falasEntreAspas(texto: string): Array<{ fala: string; posicao: number }> {
  const saida: Array<{ fala: string; posicao: number }> = [];
  for (const m of texto.matchAll(/[“"«]([^”"»“\n]{3,400})[”"»]/g)) {
    saida.push({ fala: m[1].trim(), posicao: m.index ?? 0 });
  }
  return saida;
}

/**
 * A fala entre aspas tem lastro? Está no texto de origem, num original ou numa
 * tradução conferida. Reticências separam pedaços, e cada pedaço precisa estar
 * lá: cortar é permitido, emendar com palavra nova não é.
 */
export function falaSustentada(fala: string, pacote: Pick<PacoteFactual, "texto_de_origem" | "citacoes">): boolean {
  const material = [
    normalizarFala(pacote.texto_de_origem ?? ""),
    ...(pacote.citacoes ?? []).flatMap((c) => [normalizarFala(c.original), normalizarFala(c.traducao)]),
  ];
  const pedacos = fala
    .split(/\.\.\.|…|\(\s*\.\.\.\s*\)|\[\s*\.\.\.\s*\]/)
    .map((p) => normalizarFala(p))
    .filter((p) => p.length > 0);
  if (pedacos.length === 0) return true;
  return pedacos.every((p) => p.split(" ").length < 3 || material.some((m) => m.includes(p)));
}

/**
 * As falas do texto que casam com uma citação conferida e não nomeiam quem
 * falou em lugar nenhum do texto. É a regra do formato de citação de famoso:
 * literal, ATRIBUÍDA e com a foto da pessoa. Confere o post inteiro (manchete
 * mais legenda), porque é ali que o leitor precisa ler o nome.
 */
export function citacoesSemAtribuicao(
  texto: string,
  pacote: Pick<PacoteFactual, "citacoes">,
): Array<{ fala: string; autor: string }> {
  const citacoes = pacote.citacoes ?? [];
  if (citacoes.length === 0) return [];
  const todo = normalizarFala(texto);
  const saida: Array<{ fala: string; autor: string }> = [];
  for (const { fala } of falasEntreAspas(texto)) {
    const f = normalizarFala(fala);
    if (f.split(" ").length < PALAVRAS_MINIMAS_DA_FALA) continue;
    const dona = citacoes.find((c) => normalizarFala(c.original).includes(f) || normalizarFala(c.traducao).includes(f));
    if (!dona) continue;
    // Basta o sobrenome: "Huang" atribui a fala de Jensen Huang.
    const partes = normalizarFala(dona.autor).split(" ").filter((p) => p.length >= 3);
    const sobrenome = partes[partes.length - 1];
    if (sobrenome && !new RegExp(`\\b${sobrenome}\\b`).test(todo)) saida.push({ fala, autor: dona.autor });
  }
  return saida;
}

/* ------------------------------------------------------------------ */
/* Ancoragem                                                           */
/* ------------------------------------------------------------------ */

export type ClaimNaoSustentada = {
  tipo: "numero" | "data" | "nome" | "citacao";
  valor: string;
  onde: string;
  /**
   * Bloqueio ou aviso.
   *
   * Número, data e nome composto bloqueiam: foi assim que apareceram
   * "Operação Compliance Zero" e um sobrenome que não existia no material.
   *
   * Palavra isolada com inicial maiúscula fica em aviso, porque português
   * capitaliza no meio da frase o que não é nome de ninguém. A conferência
   * acusou "duas Casas" como entidade inventada; bloquear a edição por causa
   * disso seria trocar um erro por outro.
   */
  severidade: "bloqueio" | "aviso";
};

export type ResultadoDaAncoragem = {
  /** Falso só quando há claim de bloqueio. Aviso não derruba a edição. */
  ancorado: boolean;
  naoSustentadas: ClaimNaoSustentada[];
  conferidos: number;
};

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MESES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Palavras institucionais e genéricas que o português capitaliza sem nomear
 * ninguém em específico.
 *
 * Elas só chegam a ser conferidas quando NÃO estão no material: se a matéria
 * fala em Senado, "Senado" no texto casa e nada acontece. O que esta lista
 * decide é a severidade quando não casa. "Casas do Congresso" numa matéria que
 * dizia "Câmara e Senado" é paráfrase, não invenção; "Operação Compliance
 * Zero" numa matéria que não nomeia operação nenhuma é invenção.
 */
const GENERICAS = new Set([
  "casa", "casas", "congresso", "camara", "senado", "governo", "presidencia",
  "ministerio", "tribunal", "corte", "justica", "estado", "estados", "uniao",
  "republica", "federal", "lei", "projeto", "programa", "norte", "sul", "leste",
  "oeste", "pais", "paises", "cidade", "capital", "regiao", "poder", "poderes",
  "executivo", "legislativo", "judiciario", "operacao", "decreto", "portaria",
  "medida", "regra", "regras", "agencia", "orgao", "departamento", "servico",
]);

/**
 * Palavras que começam frase, viram título ou são o vocabulário da própria
 * publicação. Capitalizadas, e não são nome de nada.
 */
const IGNORAR = new Set([
  "a", "o", "as", "os", "um", "uma", "e", "ou", "mas", "se", "para", "por", "com", "sem",
  "no", "na", "nos", "nas", "do", "da", "dos", "das", "ao", "aos", "que", "quando", "onde",
  "isso", "isto", "ele", "ela", "eles", "elas", "este", "esta", "esse", "essa", "aquele",
  "bom", "boa", "dia", "hoje", "ontem", "amanha", "fonte", "leia", "veja", "segundo",
  "quem", "como", "porque", "ja", "ainda", "agora", "entao", "assim", "tambem", "so",
  "acompanhe", "confirme", "responda", "compartilhe", "nao", "sim", "the", "of", "in",
]);

/**
 * O texto gerado afirma só o que o pacote sustenta?
 *
 * Confere três classes, e cada uma erra de um jeito diferente:
 *
 *   números e datas   exatos. "540 dias" ou está no material ou foi inventado.
 *   nomes próprios    aceita casamento parcial, porque o redator escreve em
 *                     português sobre matéria em inglês e "Departamento de
 *                     Segurança Interna" é o "Department of Homeland Security"
 *                     da fonte. Exigir literalidade acusaria tradução como
 *                     invenção.
 *
 * O material de comparação é o pacote MAIS o texto de origem. O pacote é uma
 * extração e pode ter deixado algo de fora; o texto é o que existe.
 */
export function validarAncoragem(
  textoGerado: string,
  pacote: PacoteFactual
): ResultadoDaAncoragem {
  const palheiro = normalizar(
    [
      pacote.texto_de_origem,
      ...pacote.verified_facts,
      ...pacote.people,
      ...pacote.organizations,
      ...pacote.places,
      ...pacote.dates,
      ...pacote.numbers,
    ].join(" ")
  );

  const naoSustentadas: ClaimNaoSustentada[] = [];
  let conferidos = 0;

  /*
   * Números: valor E sentido, não só os dígitos.
   *
   * A conferência era `palheiro.includes(digitos)`, e por isso "INA 245(a)" no
   * material sustentava a frase inventada "o processo leva 245 dias". O 245
   * está lá mesmo, e é o número de uma norma. Agora cada número é classificado
   * pela vizinhança dele (duração, moeda, percentual, contagem, ano,
   * identificador de norma, de formulário ou de seção) e a compatibilidade
   * exige os dois lados.
   *
   * A extração roda sobre as peças CRUAS do material, e não sobre o palheiro
   * normalizado: `normalizar` derruba o "US$" e o "%", que são justamente o que
   * revela o tipo. E peça por peça para a vizinhança não vazar de uma para a
   * seguinte.
   */
  const numerosDaFonte = numerosDoMaterial([
    pacote.texto_de_origem,
    ...pacote.verified_facts,
    ...pacote.people,
    ...pacote.organizations,
    ...pacote.places,
    ...pacote.dates,
    ...pacote.numbers,
  ]);

  for (const numero of extrairNumeros(textoGerado)) {
    conferidos += 1;
    const r = numeroCompativel(numero, numerosDaFonte);
    if (!r.ok) {
      naoSustentadas.push({
        tipo: "numero",
        valor: numero.bruto,
        onde: `${r.motivo} (em: "${trecho(textoGerado, numero.posicao)}")`,
        severidade: "bloqueio",
      });
    }
  }

  // Datas por extenso.
  for (const m of textoGerado.matchAll(
    new RegExp(`\\b(\\d{1,2}\\s+de\\s+(?:${MESES.join("|")})|(?:${MESES.join("|")})\\s+de\\s+\\d{4})\\b`, "gi")
  )) {
    conferidos += 1;
    const valor = m[0];
    if (!palheiro.includes(normalizar(valor)) && !parteDaDataSustentada(valor, palheiro)) {
      naoSustentadas.push({
        tipo: "data",
        valor,
        onde: trecho(textoGerado, m.index ?? 0),
        severidade: "bloqueio",
      });
    }
  }

  // Nomes próprios: sequências de palavras capitalizadas, siglas incluídas.
  for (const m of textoGerado.matchAll(
    /\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]+)*|[A-Z]{2,}(?:-\d+)?)\b/g
  )) {
    const bruto = m[0].trim();
    const chave = normalizar(bruto);
    if (IGNORAR.has(chave)) continue;
    if (chave.length < 3) continue;
    // Início de frase capitaliza qualquer palavra. "Brasileiros que acompanham"
    // e "Desde a decisão" viraram avisos na conferência, e nenhum dos dois é
    // nome de coisa nenhuma.
    if (!chave.includes(" ") && comecaFrase(textoGerado, m.index ?? 0)) continue;

    conferidos += 1;
    if (!nomeSustentado(chave, palheiro)) {
      naoSustentadas.push({
        tipo: "nome",
        valor: bruto,
        onde: trecho(textoGerado, m.index ?? 0),
        severidade: severidadeDoNome(chave),
      });
    }
  }

  /*
   * Falas entre aspas (06/10/2026). Aspas dizem ao leitor "foi isto que a
   * pessoa disse", e a citação de famoso virou formato próprio: uma fala
   * inventada ou "melhorada" entre aspas é a pior forma de invenção, porque
   * vem com a assinatura de outra pessoa. Abaixo de cinco palavras é
   * expressão ou nome de obra, e não se confere.
   */
  for (const { fala, posicao } of falasEntreAspas(textoGerado)) {
    if (normalizarFala(fala).split(" ").length < PALAVRAS_MINIMAS_DA_FALA) continue;
    conferidos += 1;
    if (!falaSustentada(fala, pacote)) {
      naoSustentadas.push({
        tipo: "citacao",
        valor: fala.slice(0, 120),
        onde: `fala entre aspas que não está na fonte nem nas citações conferidas (em: "${trecho(textoGerado, posicao)}")`,
        severidade: "bloqueio",
      });
    }
  }

  const bloqueios = naoSustentadas.filter((c) => c.severidade === "bloqueio");
  return { ancorado: bloqueios.length === 0, naoSustentadas, conferidos };
}

function parteDaDataSustentada(valor: string, palheiro: string): boolean {
  const partes = normalizar(valor).split(/\s+de\s+/);
  return partes.every((p) => palheiro.includes(p));
}

/**
 * Palavra isolada é aviso: o português capitaliza no meio da frase o que não é
 * nome de ninguém, e a conferência chegou a acusar "duas Casas" como entidade
 * inventada. Nome composto é bloqueio, a menos que todas as suas palavras
 * sejam genéricas, que é o caso de "Casas do Congresso".
 */
function severidadeDoNome(chave: string): "bloqueio" | "aviso" {
  const palavras = chave.split(" ").filter((p) => p.length > 2 && !IGNORAR.has(p));
  if (palavras.length <= 1) return "aviso";
  return palavras.every((p) => GENERICAS.has(p)) ? "aviso" : "bloqueio";
}

/**
 * O mesmo lugar escrito de outro jeito (29/10/2026). O texto diz "Estados
 * Unidos" e a fonte diz "EUA", ou o contrário, ou em inglês: é o mesmo país, e
 * a conferência recusava o Reel por isso. A lista é curta e fechada de
 * propósito: equivalência larga demais vira porta para nome sem lastro.
 */
const EQUIVALENTES: ReadonlyArray<readonly string[]> = [
  ["estados unidos", "eua", "united states", "usa", "u.s.", "estados unidos da america", "america"],
  ["brasil", "brazil"],
  ["casa branca", "white house"],
  ["reino unido", "united kingdom", "uk"],
];

function contemPalavra(palheiro: string, termo: string): boolean {
  const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(palheiro);
}

function nomeSustentado(chave: string, palheiro: string): boolean {
  if (palheiro.includes(chave)) return true;
  const grupo = EQUIVALENTES.find((g) => g.includes(chave));
  if (grupo && grupo.some((alt) => contemPalavra(palheiro, alt))) return true;

  // Casamento parcial para nome composto: o redator traduz e reordena. Basta
  // uma palavra significativa aparecer na origem.
  const palavras = chave.split(" ").filter((p) => p.length > 3 && !IGNORAR.has(p));
  if (palavras.length === 0) return true;
  return palavras.some((p) => palheiro.includes(p));
}

function comecaFrase(texto: string, indice: number): boolean {
  const antes = texto.slice(0, indice).trimEnd();
  if (antes.length === 0) return true;
  return /[.!?:;]$/.test(antes) || antes.endsWith("\n");
}

function trecho(texto: string, indice: number): string {
  return texto.slice(Math.max(0, indice - 40), indice + 60).replace(/\s+/g, " ").trim();
}

/**
 * Um pacote por pauta selecionada.
 *
 * Roda só sobre o punhado que vai ser escrito, então é sequencial de
 * propósito: paralelizar duas ou três chamadas economiza segundos e complica
 * o tratamento de erro.
 *
 * Falha em uma pauta não derruba as outras. A pauta sem pacote chega ao
 * redator sem lista fechada de fatos e sem conferência de ancoragem, e quem
 * chama precisa tratar isso como risco, não como aprovação.
 */
export async function montarPacotesDasPautas(
  pautas: Array<{ url: string; titulo: string; texto: string; urls: string[] }>,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{
  pacotes: Map<string, PacoteFactual>;
  custoUsd: number;
  tokens: number;
  falhas: string[];
}> {
  const pacotes = new Map<string, PacoteFactual>();
  const falhas: string[] = [];
  let custoUsd = 0;
  let tokens = 0;

  for (const pauta of pautas) {
    try {
      const r = await montarPacoteFactual(
        { titulo: pauta.titulo, texto: pauta.texto, urls: pauta.urls },
        env,
        fetcher
      );
      pacotes.set(pauta.url, r.pacote);
      custoUsd += r.custoUsd;
      tokens += r.tokens;
    } catch (erro) {
      falhas.push(`${pauta.titulo.slice(0, 60)}: ${(erro as Error).message}`);
    }
  }

  return { pacotes, custoUsd, tokens, falhas };
}
