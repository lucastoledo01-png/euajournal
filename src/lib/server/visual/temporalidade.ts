import type { AssetVisual, EntidadeVisual } from "./tipos";
import { ehPessoa } from "./tipos";

/**
 * A foto certa da entidade errada, e a foto certa do momento errado.
 *
 * O resolvedor da fase 2 respondia bem a uma pergunta só: esta imagem é desta
 * entidade. Duas coisas passaram por baixo disso em produção.
 *
 * A primeira foi uma fotografia de 1937 do Bureau of Labor Statistics,
 * domínio público, autoria conhecida, entidade correta, ilustrando uma notícia
 * sobre criação de emprego. O arquivo se chama "1,500,000 drop in employment".
 * Entidade certíssima, sentido oposto.
 *
 * A segunda foi o retrato oficial de um chefe de Estado escolhido para uma
 * pauta institucional em que ele não era o assunto. Retrato de presidente é a
 * imagem mais fácil de achar no Wikimedia para qualquer pauta de governo, e
 * quase nunca é sobre quem a matéria fala.
 *
 * As duas têm a mesma raiz: correspondência de entidade não é relevância.
 */

export type MotivoTemporal =
  | "HISTORICAL_EVENT_MISMATCH"
  | "SEMANTIC_CONTEXT_MISMATCH"
  | "TEMPORAL_MISMATCH"
  | "NON_CENTRAL_PUBLIC_FIGURE";

function normalizar(texto: string): string {
  return ` ${(texto || "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const ANO_MINIMO = 1826;

/**
 * A data da obra, quando o acervo declara uma.
 *
 * A ordem de confiança é a da fonte: o campo declarado vence a descrição, que
 * vence o nome do arquivo. `DateTime` do Commons é a data do UPLOAD e fica
 * fora de propósito: ela diz quando alguém digitalizou, não quando a foto foi
 * feita, e usar as duas como equivalentes rejuvenesce todo acervo histórico.
 */
export function dataDoAsset(asset: Pick<AssetVisual, "sourceAssetId" | "metadata">): {
  ano: number | null;
  origem: string;
} {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const agora = new Date().getFullYear();

  const primeiroAno = (texto: string): number | null => {
    for (const m of String(texto).matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)) {
      const n = Number(m[1]);
      if (n >= ANO_MINIMO && n <= agora) return n;
    }
    return null;
  };

  const candidatos: Array<[string, string]> = [
    ["data declarada", String(meta.data ?? "")],
    ["descrição", String(meta.descricao ?? "")],
    ["título do arquivo", String(meta.titulo ?? "")],
    ["nome do arquivo", asset.sourceAssetId ?? ""],
    ["categorias", String(meta.categorias ?? "")],
  ];

  for (const [origem, texto] of candidatos) {
    const ano = primeiroAno(texto);
    if (ano !== null) return { ano, origem };
  }

  return { ano: null, origem: "sem data" };
}

/**
 * Sinais de que o arquivo veio de acervo histórico.
 *
 * Serve para separar "foto antiga" de "foto de acontecimento antigo". Uma
 * fachada fotografada em 2005 é antiga e continua sendo a fachada; um registro
 * do Harris & Ewing Collection é outra coisa.
 */
const MARCAS_DE_ACERVO = [
  "library of congress",
  "national archives",
  "harris ewing",
  "bettmann",
  "collection",
  "colecao",
  "historical",
  "historic",
  "pd us no notice",
  "pd old",
  "pd 1996",
  "archival",
];

/**
 * Vocabulário de acontecimento específico.
 *
 * Nenhum termo decide sozinho, pelo mesmo motivo do detector de página de
 * bloqueio: "hearing" aparece em legenda de foto institucional, e "told"
 * aparece em qualquer lugar. O que decide é o acúmulo.
 */
const MARCAS_DE_EVENTO = [
  "hearing", "testimony", "testified", "told", "estimated", "announced", "said",
  "rally", "protest", "march", "strike", "riot", "parade", "ceremony", "signing",
  "inauguration", "funeral", "crash", "disaster", "collapse", "landing", "summit",
  "conference", "trial", "verdict", "sworn in", "swearing", "committee",
  "audiencia", "depoimento", "manifestacao", "greve", "comicio", "cerimonia",
  "posse", "acidente", "desastre", "julgamento", "veredicto",
];

export type LeituraHistorica = {
  acervo: boolean;
  eventoEspecifico: boolean;
  pontos: number;
  evidencias: string[];
};

export function lerContextoHistorico(
  asset: Pick<AssetVisual, "sourceAssetId" | "metadata">,
  idadeEmAnos: number | null,
): LeituraHistorica {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const bruto = [
    asset.sourceAssetId ?? "",
    String(meta.titulo ?? ""),
    String(meta.descricao ?? ""),
    String(meta.categorias ?? ""),
  ].join(" ");
  const texto = normalizar(bruto);

  const evidencias: string[] = [];
  const acervo = MARCAS_DE_ACERVO.some((m) => texto.includes(m));
  if (acervo) evidencias.push("marcado como acervo");

  let pontos = 0;

  const marcas = MARCAS_DE_EVENTO.filter((m) => texto.includes(` ${m} `));
  if (marcas.length > 0) {
    pontos += 1;
    evidencias.push(`vocabulário de acontecimento: ${marcas.slice(0, 3).join(", ")}`);
  }

  // Mês com dia é data de acontecimento; ano solto é data de obra.
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i.test(bruto)) {
    pontos += 2;
    evidencias.push("data específica no material");
  }

  // Quantidade com separador de milhar: "1,500,000 drop in employment".
  if (/\d{1,3}(?:[.,]\d{3})+/.test(bruto)) {
    pontos += 1;
    evidencias.push("quantidade específica no material");
  }

  const velha = idadeEmAnos !== null && idadeEmAnos >= 20;
  if (velha) evidencias.push(`${idadeEmAnos} anos de idade`);

  /*
   * Narrativa de acontecimento só vira "histórico específico" quando o
   * material também é antigo ou de acervo. Uma foto de 2019 de alguém
   * discursando é foto de arquivo recente, e continua servindo.
   */
  const eventoEspecifico = pontos >= 3 && (velha || acervo);

  return { acervo, eventoEspecifico, pontos, evidencias };
}

/**
 * Eixos de sentido, cada um com os dois lados.
 *
 * O conflito só existe DENTRO de um eixo: a pauta diz alta e a imagem diz
 * queda. Comparar eixos diferentes acusaria conflito onde há só assunto
 * diferente, e o alarme que toca sempre não é alarme.
 */
const EIXOS: Array<{ nome: string; positivo: string[]; negativo: string[] }> = [
  {
    nome: "alta x queda",
    positivo: [
      "criam", "cria", "criacao", "criados", "aumenta", "aumento", "alta", "cresce",
      "crescimento", "expansao", "ganho", "ganhos", "contratac", "rise", "rises",
      "increase", "growth", "grew", "gain", "gains", "surge", "boom", "hiring",
      "hired", "added", "recovery", "rebound",
    ],
    negativo: [
      "queda", "cai", "caiu", "baixa", "retracao", "recessao", "desemprego",
      "demissao", "demissoes", "perde", "perdeu", "perda", "perdas", "fechamento",
      "corte", "cortes", "drop", "drops", "fall", "falls", "fell", "decline",
      "decrease", "loss", "losses", "lost", "plunge", "slump", "crash", "recession",
      "depression", "unemployment", "unemployed", "layoff", "layoffs", "downturn",
      "jobless", "breadline",
    ],
  },
  {
    nome: "aprovacao x rejeicao",
    positivo: ["aprova", "aprovado", "aprovacao", "sancionou", "promulgou", "autoriza", "approve", "approved", "approval", "passed", "enacted", "granted", "upheld"],
    negativo: ["rejeita", "rejeitado", "rejeicao", "nega", "negado", "indeferido", "veta", "vetado", "veto", "derruba", "barrado", "reject", "rejected", "denied", "vetoed", "struck down", "blocked", "overturned"],
  },
  {
    nome: "vigor x suspensao",
    positivo: ["em vigor", "vigor", "valendo", "implementado", "effective", "takes effect", "took effect", "in force", "reinstated", "resumed"],
    negativo: ["suspende", "suspenso", "suspensa", "suspensao", "liminar", "bloqueia", "paralisado", "halted", "suspended", "paused", "injunction", "stayed", "frozen"],
  },
  {
    nome: "abertura x fechamento",
    positivo: ["abre", "abertura", "inaugura", "lanca", "lancamento", "reabre", "opens", "opening", "launch", "launched", "inaugurated"],
    negativo: ["fecha", "fechamento", "encerra", "shutdown", "closes", "closure", "closed", "shuttered"],
  },
  {
    nome: "expansao x restricao",
    positivo: ["amplia", "ampliac", "facilita", "flexibiliza", "expande", "libera", "expands", "eases", "relaxes", "broadens", "streamlines"],
    negativo: ["restringe", "restricao", "endurece", "limita", "proibe", "proibicao", "restricts", "restriction", "tightens", "curbs", "bans", "crackdown"],
  },
];

function polaridade(texto: string, eixo: (typeof EIXOS)[number]): "positivo" | "negativo" | null {
  const p = eixo.positivo.filter((t) => texto.includes(` ${t}`)).length;
  const n = eixo.negativo.filter((t) => texto.includes(` ${t}`)).length;
  if (p === n) return null;
  return p > n ? "positivo" : "negativo";
}

export type ConflitoSemantico = { eixo: string; pauta: string; imagem: string } | null;

export function contradicaoSemantica(textoDaPauta: string, textoDaImagem: string): ConflitoSemantico {
  const pauta = normalizar(textoDaPauta);
  const imagem = normalizar(textoDaImagem);

  for (const eixo of EIXOS) {
    const a = polaridade(pauta, eixo);
    const b = polaridade(imagem, eixo);
    if (a && b && a !== b) return { eixo: eixo.nome, pauta: a, imagem: b };
  }

  return null;
}

/** Pautas em que foto de outro ciclo engana mesmo sendo da mesma instituição. */
const PAUTA_SENSIVEL =
  / emprego| empregos | desemprego| inflac| juros | dolar | cambio | pib | bolsa de valores | economia | fed | recessao| indicador| payroll | folha de pagamento | mercado de trabalho | relatorio mensal /;

export function pautaSensivelAoTempo(titulo: string, resumo = ""): boolean {
  return PAUTA_SENSIVEL.test(normalizar(`${titulo} ${resumo}`));
}

/** Tolerância de idade por tipo de imagem, em anos. */
const TOLERANCIA: Record<string, { ok: number; limite: number }> = {
  // Retrato é da pessoa como ela está hoje (14/10/2026): ver LIMITE_DO_RETRATO.
  official_portrait: { ok: 2, limite: 8 },
  entity_portrait: { ok: 2, limite: 8 },
  institution: { ok: 15, limite: 45 },
  company: { ok: 15, limite: 45 },
  place: { ok: 20, limite: 50 },
  conceptual: { ok: 25, limite: 60 },
  exact_event: { ok: 1, limite: 5 },
  historical_event: { ok: 0, limite: 1 },
};

/**
 * Retrato de pessoa com data conhecida e mais de cinco anos é recusado
 * (14/10/2026). A newsletter de 15/10 saiu com um Lula do começo dos anos 2000,
 * da Agência Senado, numa pauta de decreto de 2026, e o dono pediu "uma foto
 * do Lula de 2026". A régua antiga aceitava retrato de até 35 anos e só
 * recusava idade em pauta de indicador. Sem data, continua sem recusa.
 */
export const LIMITE_DO_RETRATO = 5;
const TIPOS_DE_RETRATO = new Set(["official_portrait", "entity_portrait"]);

export type AnaliseTemporal = {
  assetDate: number | null;
  assetDateOrigem: string;
  assetAgeYears: number | null;
  temporalRelevanceScore: number;
  semanticContextFit: number;
  archiveImage: boolean;
  historicalEventSpecific: boolean;
  recusa: MotivoTemporal | null;
  detalhe: string;
  evidencias: string[];
};

export type ContextoDaPautaVisual = {
  titulo: string;
  resumo?: string;
  /** Entidade escolhida como assunto visual. */
  entidade: EntidadeVisual;
  /** A entidade é central na pauta, ou apenas citada? */
  centralidade?: number;
};

export function analisarTemporalidade(
  asset: Pick<AssetVisual, "sourceAssetId" | "metadata" | "imageContextType">,
  pauta: ContextoDaPautaVisual,
  agoraAno = new Date().getFullYear(),
): AnaliseTemporal {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const { ano, origem } = dataDoAsset(asset);
  const idade = ano === null ? null : Math.max(0, agoraAno - ano);

  const historico = lerContextoHistorico(asset, idade);
  const sensivel = pautaSensivelAoTempo(pauta.titulo, pauta.resumo);

  const textoDaImagem = [
    asset.sourceAssetId ?? "",
    String(meta.titulo ?? ""),
    String(meta.descricao ?? ""),
  ].join(" ");

  const conflito = contradicaoSemantica(`${pauta.titulo} ${pauta.resumo ?? ""}`, textoDaImagem);

  const evidencias = [...historico.evidencias];
  if (ano !== null) evidencias.push(`datada de ${ano} (${origem})`);
  if (sensivel) evidencias.push("pauta de indicador, tolerância reduzida");

  const tipo = asset.imageContextType ?? "conceptual";
  const t = TOLERANCIA[tipo] ?? TOLERANCIA.conceptual;
  const ok = sensivel ? Math.ceil(t.ok / 2) : t.ok;
  const limite = sensivel ? Math.min(t.limite, 25) : t.limite;

  let temporal: number;
  if (idade === null) {
    // Sem data não é motivo de recusa. Uma foto institucional sem data no
    // acervo é comum, e presumir o pior descartaria material bom.
    temporal = 65;
  } else if (idade <= ok) {
    temporal = 100;
  } else if (idade >= limite) {
    temporal = 20;
  } else {
    temporal = Math.round(100 - ((idade - ok) / (limite - ok)) * 60);
  }

  const semantico = conflito ? 0 : historico.eventoEspecifico ? 30 : 100;

  /*
   * A ordem das recusas é a ordem do dano.
   *
   * Registro de acontecimento histórico é o pior: ele afirma visualmente que
   * algo aconteceu, e não foi este algo. Contradição de sentido vem em
   * seguida. Idade sozinha é a mais branda e só recusa em pauta de indicador,
   * onde foto de outro ciclo econômico engana de verdade.
   */
  let recusa: MotivoTemporal | null = null;
  let detalhe = "";

  if (historico.eventoEspecifico) {
    recusa = "HISTORICAL_EVENT_MISMATCH";
    detalhe =
      `o material registra um acontecimento específico e antigo (${historico.evidencias.join("; ")}), ` +
      `e não há como provar que é o fato desta pauta`;
  } else if (conflito) {
    recusa = "SEMANTIC_CONTEXT_MISMATCH";
    detalhe =
      `eixo "${conflito.eixo}": a pauta é ${conflito.pauta} e a imagem é ${conflito.imagem}`;
  } else if (TIPOS_DE_RETRATO.has(tipo) && idade !== null && idade > LIMITE_DO_RETRATO) {
    recusa = "TEMPORAL_MISMATCH";
    detalhe = `retrato de ${idade} anos, acima do teto de ${LIMITE_DO_RETRATO}: a pessoa aparece como está hoje`;
  } else if (sensivel && idade !== null && idade > limite) {
    recusa = "TEMPORAL_MISMATCH";
    detalhe = `pauta de indicador com imagem de ${idade} anos, acima do teto de ${limite}`;
  }

  return {
    assetDate: ano,
    assetDateOrigem: origem,
    assetAgeYears: idade,
    temporalRelevanceScore: temporal,
    semanticContextFit: semantico,
    archiveImage: (idade ?? 0) >= 3 || historico.acervo,
    historicalEventSpecific: historico.eventoEspecifico,
    recusa,
    detalhe,
    evidencias,
  };
}

/**
 * Retrato de figura pública que não é o assunto.
 *
 * O caso: o resolvedor escolheu retratos oficiais de presidentes para pautas
 * institucionais em que eles não eram o assunto. Não é acaso: retrato de chefe
 * de Estado é a imagem mais bem catalogada do Wikimedia para qualquer coisa
 * ligada a governo, então ela ganha por disponibilidade, não por pertinência.
 *
 * A régua é a centralidade que a fase 2 já calcula. Foto de pessoa exige que a
 * pessoa seja o assunto, não que ela apareça.
 */

/**
 * Palavras que fazem um par capitalizado NÃO ser nome de pessoa.
 *
 * "Federal Register", "Diversity Visa", "Supreme Court", "New York" e
 * "United States" têm exatamente a forma de nome próprio de gente. Sem esta
 * lista, qualquer foto institucional seria acusada de conter uma pessoa.
 */
const NAO_E_NOME_DE_PESSOA = new Set([
  "federal", "register", "department", "state", "states", "united", "supreme", "court", "courthouse",
  "bureau", "office", "agency", "service", "services", "administration", "commission", "committee",
  "senate", "congress", "house", "white", "capitol", "embassy", "consulate", "immigration",
  "citizenship", "customs", "border", "protection", "security", "homeland", "labor", "statistics",
  "diversity", "visa", "green", "card", "national", "law", "review", "new", "york", "washington",
  "los", "angeles", "san", "francisco", "district", "northern", "southern", "eastern", "western",
  "california", "texas", "florida", "america", "american", "january", "february", "march", "april",
  "may", "june", "july", "august", "september", "october", "november", "december", "annual",
  "meeting", "conference", "summit", "panel", "session", "press", "briefing", "headquarters",
  "university", "institute", "college", "school", "center", "centre", "museum", "library",
  "airport", "terminal", "station", "bridge", "park", "plaza", "hall", "building", "tower",
  "images", "collection", "photographs", "file", "jpg", "jpeg", "png",
  /*
   * Lugar e instituição em português (06/10/2026). Com os bancos oficiais
   * brasileiros, a legenda chega em português, e "Esplanada dos Ministérios"
   * e "Palácio do Planalto" têm a forma de nome de gente: no primeiro replay,
   * toda foto de fachada da Esplanada foi recusada como "figura não central".
   * Cargo ("Presidente", "Senador") NÃO entra aqui de propósito: ele vem
   * colado ao nome ("Presidente Davi Alcolumbre"), e descartar o trecho
   * esconderia a pessoa que a régua precisa ver.
   */
  "esplanada", "ministerios", "ministerio", "palacio", "planalto", "alvorada", "congresso", "nacional",
  "camara", "deputados", "tribunal", "supremo", "superior", "praca", "poderes", "plenario", "comissao",
  "republica", "agencia", "brasil", "brasilia", "receita", "banco", "central", "itamaraty", "eixo",
]);

/**
 * Palavras que revelam lugar batizado com nome de gente.
 *
 * "Harry S. Truman Building" é prédio, não pessoa, e a diferença é a palavra
 * seguinte. Sem isto, toda foto de fachada de órgão americano seria recusada,
 * porque nos Estados Unidos quase todo prédio público leva nome de alguém.
 */
const SUFIXO_DE_LUGAR = new Set([
  "building", "hall", "center", "centre", "library", "airport", "bridge", "school", "university",
  "institute", "memorial", "park", "plaza", "terminal", "courthouse", "hospital", "stadium",
  "highway", "boulevard", "avenue", "street", "tunnel", "dam", "base", "monument", "museum",
]);

function normal(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Nomes de pessoa que o CATÁLOGO declara estarem na imagem.
 *
 * Isto não olha a imagem, e é de propósito: inferir quem está na foto pela
 * aparência é o que o projeto não faz. O que se lê aqui é o que o acervo
 * escreveu no nome do arquivo, na descrição e nas categorias, que é onde o
 * Commons registra as pessoas identificáveis de uma foto.
 *
 * O caso que motivou: uma pauta sobre dado de emprego recebeu
 * "ASSA 2026 - David Wessel, Loretta Mester, Jason Furman, Karen Dynan.jpg",
 * classificada como `institution`. Quatro pessoas identificáveis, nenhuma
 * delas assunto da pauta, e `retratoNaoCentral` não alcançava porque só olhava
 * `official_portrait` e `entity_portrait`.
 */
export function pessoasDeclaradasNaImagem(asset: {
  sourceAssetId?: string;
  metadata?: Record<string, unknown>;
}): string[] {
  const partes = [
    String(asset.sourceAssetId ?? "").replace(/^File:/i, "").replace(/\.(jpe?g|png|gif|webp|svg)$/i, ""),
    String((asset.metadata?.descricao as string) ?? ""),
    String((asset.metadata?.categorias as string) ?? ""),
  ].join(" | ");

  const achados = new Set<string>();

  // Dois ou três tokens capitalizados seguidos, aceitando inicial com ponto
  // ("Harry S. Truman") e partícula minúscula ("Ursula von der Leyen").
  const padrao = /\b([A-Z][a-zà-ÿ]+|[A-Z]\.)(?:\s+(?:von|van|de|da|dos|del|di|la|le))?\s+([A-Z][a-zà-ÿ]+|[A-Z]\.)(?:\s+([A-Z][a-zà-ÿ]+))?/g;

  for (const m of partes.matchAll(padrao)) {
    const bruto = m[0].trim();
    const tokens = bruto.split(/\s+/).map((t) => normal(t.replace(/\.$/, "")));

    // Todo token estrutural desqualifica: sobra nome de órgão, de lugar ou de
    // evento, não de gente.
    if (tokens.some((t) => NAO_E_NOME_DE_PESSOA.has(t))) continue;

    // Lugar batizado com nome de gente: a palavra seguinte denuncia.
    const depois = partes.slice(partes.indexOf(bruto) + bruto.length).trim().split(/[\s|,.]+/)[0];
    if (depois && SUFIXO_DE_LUGAR.has(normal(depois))) continue;

    // Nome de pessoa tem pelo menos um sobrenome escrito por extenso.
    if (!tokens.some((t) => t.length >= 3)) continue;

    achados.add(bruto);
  }

  return [...achados];
}

/** A pessoa declarada na imagem é assunto da pauta? */
function nomeCasaComAPauta(nome: string, referencias: string[]): boolean {
  const alvo = normal(nome);
  const sobrenomes = alvo.split(/\s+/).filter((t) => t.length >= 4);

  return referencias.some((r) => {
    const ref = normal(r);
    if (ref.includes(alvo) || alvo.includes(ref)) return true;
    // Sobrenome basta: a pauta escreve "Rubio" e o arquivo "Marco Rubio".
    return sobrenomes.some((s) => new RegExp(`\\b${s}\\b`).test(ref));
  });
}

/**
 * Pessoa identificável na imagem que não é assunto da pauta.
 *
 * Vale para QUALQUER `image_context_type`, e é essa a diferença em relação a
 * `retratoNaoCentral`: uma foto de painel de congresso, de fachada com gente
 * na frente ou de evento de empresa carrega pessoas identificáveis mesmo
 * classificada como `institution`, `place`, `company` ou `event`. O leitor não
 * vê o campo `image_context_type`; ele vê o rosto.
 *
 * A regra é a mesma que o dono do produto já deu para o caso do retrato: a
 * imagem tem que ser DO assunto. Se o catálogo declara alguém na foto e essa
 * pessoa não aparece na pauta, a foto não ilustra a pauta.
 */
export function figuraNaoCentralNaImagem(
  asset: { sourceAssetId?: string; metadata?: Record<string, unknown>; imageContextType?: string },
  referenciasDaPauta: string[],
): { recusa: MotivoTemporal | null; detalhe: string } {
  const pessoas = pessoasDeclaradasNaImagem(asset);
  if (pessoas.length === 0) return { recusa: null, detalhe: "" };

  const centrais = pessoas.filter((p) => nomeCasaComAPauta(p, referenciasDaPauta));
  if (centrais.length > 0) return { recusa: null, detalhe: "" };

  return {
    recusa: "NON_CENTRAL_PUBLIC_FIGURE",
    detalhe:
      `o acervo declara ${pessoas.length === 1 ? "" : `${pessoas.length} pessoas, `}` +
      `${pessoas.slice(0, 4).join(", ")} na imagem, e ${pessoas.length === 1 ? "essa pessoa" : "nenhuma delas"} ` +
      `aparece na pauta. Contexto declarado: ${asset.imageContextType ?? "n/d"}. ` +
      `Quem vê o post vê o rosto, não o campo image_context_type.`,
  };
}

export function retratoNaoCentral(
  asset: Pick<AssetVisual, "imageContextType">,
  entidade: EntidadeVisual,
  centralidade: number | undefined,
  minimo = 60,
): { recusa: MotivoTemporal | null; detalhe: string } {
  const ehRetrato =
    asset.imageContextType === "official_portrait" || asset.imageContextType === "entity_portrait";

  if (!ehRetrato || !ehPessoa(entidade.tipo)) return { recusa: null, detalhe: "" };
  if (centralidade === undefined) return { recusa: null, detalhe: "" };

  if (centralidade < minimo) {
    return {
      recusa: "NON_CENTRAL_PUBLIC_FIGURE",
      detalhe:
        `${entidade.nome} tem centralidade ${centralidade}, abaixo de ${minimo}: aparece na pauta ` +
        `e não é o assunto dela. Retrato de figura pública ganha por estar bem catalogado, não por ser pertinente.`,
    };
  }

  return { recusa: null, detalhe: "" };
}
