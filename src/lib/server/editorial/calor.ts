import { cosseno, type Vetor } from "./embeddings";
import { dominioDe } from "./url-canonica";
import type { PautaAvaliada } from "./guarda";

/**
 * O CALOR da pauta: o quanto o assunto está sendo falado agora (06/10/2026).
 *
 * O dono leu o feed e disse que a seleção estava "muito fria". Os últimos
 * posts eram "Quem tem status de elite na Delta ou American recebe 90 dias na
 * United" e "Quem deposita dinheiro para garantir immigration bonds recebe
 * juros de 3%", enquanto o Not Journal, no mesmo dia, publicava Trump, Musk,
 * Bezos e o resultado da eleição. A medição de 200 posts dele, em
 * `docs/auditorias/noticia-quente-2026-10-06.md`, mostrou o porquê: a nota da
 * pauta (`pontuacao.ts`) mede o quanto o fato muda a vida do leitor, e nada
 * nela mede se alguém está falando dele.
 *
 * O calor não substitui a relevância, SOMA a ela, e só dentro da linha: ele é
 * calculado sobre o pool que a guarda já aprovou, então pauta de imigração,
 * notícia ruim dos EUA e o que a linha recusa continuam fora. O que muda é a
 * ORDEM entre o que passou.
 *
 * Os cinco sinais são deterministas, e quatro deles não custam modelo nenhum:
 *
 *   veículos    quantos domínios distintos contaram o mesmo fato nas últimas
 *               24h (vetor do título, limiar de 0.65 desde 06/10/2026;
 *               ver `LIMIAR_DE_VEICULOS_DO_CALOR`)
 *   tendência   o assunto aparece no Google Trends (EUA e Brasil) ou entre os
 *               mais lidos da Wikipédia (inglês e português)
 *   fama        a pessoa, empresa ou instituição no centro tem muitas línguas
 *               na Wikipédia (sitelinks do Wikidata, um indicador público e
 *               barato de quanto o mundo conhece aquele nome)
 *   recência    horas desde a publicação
 *   número      a manchete gira em torno de um número forte
 *
 * Pesos somam 100. A combinação com a nota é `PESO_DO_CALOR` vezes o calor,
 * somado ao total: com 0.35, o calor máximo vale 35 pontos, o mesmo que a
 * diferença entre uma pauta de relevância 9 e uma de relevância 1 (32). É o
 * bastante para a pauta quente passar a fria de nota parecida, e não para uma
 * pauta irrelevante passar uma importante.
 */

export const PESOS_DO_CALOR = { veiculos: 25, tendencia: 20, fama: 20, recencia: 10, numero: 10, velocidade: 15 } as const;

/** O que uma pauta perde quando já há um capítulo mais novo da mesma história (28/10/2026). */
export const FATOR_DE_ETAPA_SUPERADA = 0.5;
/** Horas de diferença para o capítulo novo valer: "viaja" e "chega" saem com horas de distância. */
export const HORAS_PARA_SUPERAR = 2;
/** Parecido demais é o mesmo fato noticiado de novo, e não o capítulo seguinte. */
export const LIMITE_DE_MESMO_FATO = 0.9;
export const PESO_DO_CALOR = 0.35;

/**
 * O limiar de "mesmo fato" para CONTAR VEÍCULOS, e só para isso (06/10/2026).
 *
 * Decisão do dono sobre a medição da auditoria: no vetor só do título, que é
 * o que existe para toda candidata, o 0.70 é mais severo do que no vetor de
 * título mais resumo em que foi medido. Nas 127 aprovadas da semana, 0.70 via
 * 7 histórias com três veículos ou mais e 0.65 via 14; a faixa de 0.65 a 0.70
 * era quase toda o mesmo fato ("Trump, top AI leaders agree to voluntary AI
 * standards" e "AI firms agree to 'morally binding' self-policing", 0.685), e
 * a de 0.60 a 0.65 já misturava vizinhos.
 *
 * NÃO é o limiar da composição: o agrupamento das pautas do mesmo dia
 * (`EDITORIAL_LIMIAR_AGRUPAMENTO`, 0.70) e a repetição histórica (0.85)
 * continuam onde estão. Errar aqui custa uma pauta um pouco mais quente do que
 * devia; errar lá custa a edição dizendo a mesma coisa duas vezes.
 */
export const LIMIAR_DE_VEICULOS_DO_CALOR = 0.65;

export function limiarDeVeiculosDoCalor(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CALOR_LIMIAR_VEICULOS);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : LIMIAR_DE_VEICULOS_DO_CALOR;
}

export type SinaisDeCalor = {
  /** Domínios distintos com o mesmo fato em 24h, contando o da própria pauta. */
  veiculos: number;
  /** Os termos em alta que casaram, com a fonte. */
  tendencias: Array<{ termo: string; fonte: string }>;
  /** A entidade mais conhecida entre as citadas, e quantas Wikipédias a têm. */
  fama: { nome: string; sitelinks: number } | null;
  /** Horas desde a publicação. `null` quando a data não é legível. */
  horas: number | null;
  /** O número forte da manchete, quando há. */
  numeroForte: string | null;
  /** Domínios distintos que contaram o fato nas últimas 3h: a aceleração. */
  veiculos3h?: number;
  /** Existe um capítulo mais novo da mesma história (a pauta ficou para trás). */
  superada?: boolean;
};

export type Calor = {
  total: number;
  partes: { veiculos: number; tendencia: number; fama: number; recencia: number; numero: number; velocidade: number };
  sinais: SinaisDeCalor;
  explicacao: string;
};

export function pontosDeVeiculos(n: number): number {
  if (n >= 5) return PESOS_DO_CALOR.veiculos;
  if (n === 4) return 20;
  if (n === 3) return 15;
  if (n === 2) return 8;
  return 0;
}

/** Quatro veículos em 3 horas é o assunto acelerando; o mesmo número em 24 horas é só o dia. */
export function pontosDeVelocidade(n: number | undefined): number {
  const v = n ?? 0;
  if (v >= 4) return PESOS_DO_CALOR.velocidade;
  if (v === 3) return 11;
  if (v === 2) return 6;
  return 0;
}

/**
 * Duas fontes de tendência diferentes valem mais que uma. Um termo do Google
 * Trends sozinho pode ser ruído de esporte que a linha já cortou; o mesmo
 * nome no Trends e nos mais lidos da Wikipédia é o país inteiro olhando.
 */
export function pontosDeTendencia(t: SinaisDeCalor["tendencias"]): number {
  const fontes = new Set(t.map((x) => x.fonte));
  if (fontes.size >= 2) return PESOS_DO_CALOR.tendencia;
  if (fontes.size === 1) return 14;
  return 0;
}

/**
 * Faixas medidas no Wikidata em 06/10/2026 (`docs/auditorias/noticia-quente-2026-10-06.md`):
 * Trump tem 266 Wikipédias, Bill Gates 180, Musk 164, Netanyahu 133, Bernie
 * Sanders 119, Bezos 101; Milei 78, Delta Air Lines 70, Sam Altman 66; Jensen
 * Huang 48; Flávio Bolsonaro 27, Erika Hilton 16, Tarcísio 10. A régua premia
 * o nome que o leitor reconhece sem legenda.
 *
 * O político brasileiro do dia tem POUCAS línguas (é conhecido aqui, não no
 * mundo), e quem o pega é a tendência: os mais lidos da Wikipédia em
 * português traziam Flávio, Nikolas e Erika Hilton nas dez primeiras.
 */
export function pontosDeFama(f: SinaisDeCalor["fama"]): number {
  const n = f?.sitelinks ?? 0;
  if (n >= 150) return PESOS_DO_CALOR.fama;
  if (n >= 90) return 15;
  if (n >= 40) return 10;
  if (n >= 15) return 5;
  return 0;
}

export function pontosDeRecencia(horas: number | null): number {
  if (horas === null || horas < 0) return 0;
  if (horas <= 2) return PESOS_DO_CALOR.recencia;
  if (horas <= 6) return 8;
  if (horas <= 12) return 5;
  if (horas <= 24) return 2;
  return 0;
}

export function pontuarCalor(sinais: SinaisDeCalor): Calor {
  const partes = {
    veiculos: pontosDeVeiculos(sinais.veiculos),
    tendencia: pontosDeTendencia(sinais.tendencias),
    fama: pontosDeFama(sinais.fama),
    recencia: pontosDeRecencia(sinais.horas),
    numero: sinais.numeroForte ? PESOS_DO_CALOR.numero : 0,
    velocidade: pontosDeVelocidade(sinais.veiculos3h),
  };
  const bruto = partes.veiculos + partes.tendencia + partes.fama + partes.recencia + partes.numero + partes.velocidade;
  const total = sinais.superada ? Math.round(bruto * FATOR_DE_ETAPA_SUPERADA) : bruto;
  const explicacao =
    `calor ${total} = veic ${partes.veiculos} (${sinais.veiculos}) + tend ${partes.tendencia}` +
    (sinais.tendencias.length ? ` (${sinais.tendencias.map((t) => t.termo).slice(0, 2).join(", ")})` : "") +
    ` + fama ${partes.fama}` +
    (sinais.fama ? ` (${sinais.fama.nome}, ${sinais.fama.sitelinks})` : "") +
    ` + rec ${partes.recencia} + num ${partes.numero} + vel ${partes.velocidade}` +
    (sinais.superada ? ` ×${FATOR_DE_ETAPA_SUPERADA} (etapa superada: já há capítulo mais novo)` : "");
  return { total, partes, sinais, explicacao };
}

/** O bônus que o calor soma à nota da pauta. Inteiro, para a explicação ler limpo. */
export function bonusDoCalor(calor: Pick<Calor, "total">): number {
  return Math.round(Math.max(0, Math.min(100, calor.total)) * PESO_DO_CALOR);
}

export function normalizarTexto(t: string): string {
  return ` ${(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/**
 * O número que vira manchete: percentual, dinheiro com escala, recorde, ou
 * contagem grande.
 *
 * Ano não é número forte ("em 2026" está em toda manchete), e número miúdo
 * sem unidade também não ("3 estados"). A lista é de FORMA, não de assunto.
 */
export function numeroForte(titulo: string): string | null {
  const t = titulo || "";
  const padroes: RegExp[] = [
    /\b\d+(?:[.,]\d+)?\s?%/,
    /(?:US\$|R\$|\$|€|£)\s?\d[\d.,]*\s?(?:bi|bilh\w*|mi\b|milh\w*|tri\w*|billion|million|trillion|bn|[kmbt]\b)?/i,
    /\b\d[\d.,]*\s?(?:bilh\w*|milh\w*|trilh\w*|billion|million|trillion)\b/i,
    /\brecorde\b|\brecord\b|\bmaior da hist[oó]ria\b|\ball-time high\b/i,
  ];
  for (const p of padroes) {
    const m = t.match(p);
    if (m) return m[0].trim();
  }
  // Contagem grande, mas não ano: 670 bancos, 1.950 pessoas.
  for (const m of t.matchAll(/\b\d{1,3}(?:[.,]\d{3})+\b|\b\d{3,}\b/g)) {
    const n = Number(m[0].replace(/[.,]/g, ""));
    if (n >= 1900 && n <= 2100 && !/[.,]/.test(m[0])) continue;
    if (n >= 100) return m[0];
  }
  return null;
}

const PALAVRAS_VAZIAS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "are", "was", "how", "who", "why", "vs",
  "dos", "das", "com", "por", "para", "que", "uma", "nos", "nas", "pelo", "pela", "sobre", "como",
  "film", "series", "season", "episode", "news", "today", "game", "live", "2026", "2025", "2027",
]);

/**
 * O termo em alta casa com a pauta quando TODAS as palavras significativas
 * dele aparecem no texto, como palavra inteira.
 *
 * Substring pura já custou caro aqui ("ice" dentro de "justice"). E exigir
 * todas, e não uma, é o que impede "2026 Brazilian general election" de casar
 * com qualquer pauta que diga "general".
 */
export function termoCasa(termo: string, textoNormalizado: string): boolean {
  const palavras = normalizarTexto(termo)
    .trim()
    .split(" ")
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p));
  if (palavras.length === 0) return false;
  if (!palavras.some((p) => p.length >= 4)) return false;
  return palavras.every((p) => textoNormalizado.includes(` ${p} `));
}

export type TermoEmAlta = { termo: string; fonte: string };

export function tendenciasQueCasam(texto: string, termos: TermoEmAlta[]): TermoEmAlta[] {
  const alvo = normalizarTexto(texto);
  const vistos = new Set<string>();
  const saida: TermoEmAlta[] = [];
  for (const t of termos) {
    const chave = `${t.fonte}:${t.termo.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    if (termoCasa(t.termo, alvo)) {
      vistos.add(chave);
      saida.push(t);
    }
  }
  return saida;
}

/** Uma matéria publicada em qualquer veículo nas últimas 24h, já com o vetor do título. */
export type Vizinha = { dominio: string; vetor: Vetor; publicadoEm: string };

const AGREGADORES = new Set(["news.google.com", "google.com"]);

/**
 * Quantos veículos distintos contaram o mesmo fato.
 *
 * Conta DOMÍNIO, e não matéria: o mesmo jornal publicando três notas sobre o
 * assunto é um veículo insistindo, não o país falando. O agregador não conta,
 * pela regra de sempre. A pauta conta a si mesma, e as fontes secundárias que
 * a deduplicação já juntou a ela também.
 */
export function contarVeiculos(
  vetor: Vetor | null,
  dominiosProprios: string[],
  vizinhas: Vizinha[],
  limiar: number,
  agoraMs: number,
): number {
  const dominios = new Set(dominiosProprios.map((d) => d.toLowerCase()).filter((d) => d && !AGREGADORES.has(d)));
  if (vetor && vetor.length > 0 && limiar > 0) {
    for (const v of vizinhas) {
      const t = Date.parse(v.publicadoEm);
      if (Number.isFinite(t) && agoraMs - t > 24 * 3600 * 1000) continue;
      const d = v.dominio.toLowerCase();
      if (!d || AGREGADORES.has(d) || dominios.has(d)) continue;
      if (v.vetor.length !== vetor.length) continue;
      if (cosseno(vetor, v.vetor) >= limiar) dominios.add(d);
    }
  }
  return Math.max(1, dominios.size);
}

/**
 * Quantos veículos contaram o fato nas últimas 3 horas, e se já existe um
 * capítulo MAIS NOVO da mesma história (28/10/2026).
 *
 * O dono viu "Flávio rumo aos EUA" no topo quando os portais já diziam que ele
 * tinha chegado. O calor media o assunto, e não a etapa. A heurística: uma
 * matéria parecida com a pauta (acima do limiar de mesmo assunto), mas NÃO
 * quase igual (abaixo de `LIMITE_DE_MESMO_FATO`), publicada ao menos
 * `HORAS_PARA_SUPERAR` horas depois, é o capítulo seguinte. Quase igual é o
 * mesmo fato republicado, e esse não supera nada.
 */
export function andamentoDaHistoria(
  vetor: Vetor | null,
  publicadoEm: string | undefined,
  dominiosProprios: string[],
  vizinhas: Vizinha[],
  limiar: number,
  agoraMs: number,
): { veiculos3h: number; superada: boolean } {
  const t0 = Date.parse(publicadoEm ?? "");
  const recentes = new Set<string>();
  let superada = false;
  if (Number.isFinite(t0) && agoraMs - t0 <= 3 * 3600 * 1000) {
    for (const d of dominiosProprios) if (d && !AGREGADORES.has(d.toLowerCase())) recentes.add(d.toLowerCase());
  }
  if (!vetor || vetor.length === 0 || limiar <= 0) return { veiculos3h: recentes.size, superada };
  for (const v of vizinhas) {
    if (v.vetor.length !== vetor.length) continue;
    const t = Date.parse(v.publicadoEm);
    if (!Number.isFinite(t)) continue;
    const d = v.dominio.toLowerCase();
    if (!d || AGREGADORES.has(d)) continue;
    const sim = cosseno(vetor, v.vetor);
    if (sim < limiar) continue;
    if (agoraMs - t <= 3 * 3600 * 1000) recentes.add(d);
    if (sim < LIMITE_DE_MESMO_FATO && Number.isFinite(t0) && t - t0 >= HORAS_PARA_SUPERAR * 3600 * 1000) superada = true;
  }
  return { veiculos3h: recentes.size, superada };
}

export function horasDesde(publicadoEm: string | undefined, agoraMs: number): number | null {
  const t = Date.parse(publicadoEm ?? "");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (agoraMs - t) / 3600000);
}

/** Os domínios que a pauta já carrega: a fonte principal e as que a deduplicação juntou. */
export function dominiosDaPauta(p: PautaAvaliada): string[] {
  const urls = [p.grupo.primary.url, ...(p.grupo.secondary_urls ?? [])];
  return [...new Set(urls.map((u) => dominioDe(u)).filter(Boolean))];
}

/**
 * Os nomes cuja fama vale perguntar: os atores da classificação, na ordem.
 * O classificador põe pessoa, empresa e órgão no mesmo campo, e o primeiro é
 * o protagonista.
 */
export function nomesDaPauta(p: PautaAvaliada, maximo = 3): string[] {
  const nomes = [...(p.classificacao.atores ?? [])]
    .map((n) => String(n ?? "").trim())
    .filter((n) => n.length >= 3);
  return [...new Set(nomes)].slice(0, maximo);
}
