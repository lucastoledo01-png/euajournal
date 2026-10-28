import { cosseno, type Vetor } from "./embeddings";
import {
  acelerando,
  horasDesde,
  normalizarTexto,
  numeroForte,
  pontuarCalor,
  tendenciasQueCasam,
  type Calor,
  type TermoEmAlta,
} from "./calor";

/**
 * O termômetro de pauta (28/10/2026): "o que está mais quente AGORA, e em que
 * capítulo a história está?".
 *
 * O calor (`calor.ts`) olha uma pauta aprovada de cada vez. O termômetro olha
 * o dia inteiro, aprovado ou não: junta as matérias da mesma história pelo
 * vetor do título, liga os grupos que são capítulos da mesma história e acha o
 * capítulo mais novo. O caso que o motivou: "Flávio viaja rumo aos EUA" no
 * topo quando os portais já diziam que ele tinha chegado e pedido visto.
 *
 * Tudo aqui é determinístico e não chama modelo: os vetores chegam prontos
 * (os mesmos do calor) e as etapas saem de uma lista de palavras. O preço é
 * errar onde a lista não alcança, e isso está dito em cada função.
 */

export const LIMIAR_DO_GRUPO = 0.65;
/**
 * Capítulos da mesma história são parecidos, mas não tanto quanto o mesmo
 * fato. Medido no ensaio de 28/10/2026: com 0.5 a "história" Bolsonaro engolia
 * Flávio, Eduardo, Carlos e o Sóstenes falando da imprensa; com 0.6 e um nome
 * em comum, os capítulos de uma viagem continuam juntos e os vizinhos saem.
 */
export const LIMIAR_DA_HISTORIA = 0.6;
export const HORAS_DO_CAPITULO_NOVO = 2;

export type Materia = { titulo: string; dominio: string; publicadoEm: string; url?: string };

/**
 * As etapas que a lista conhece, por família, na ordem em que acontecem.
 *
 * Família é o tipo de história: uma viagem não "supera" um processo. Dentro
 * da família, a ordem maior é o capítulo mais adiante. A lista é curta de
 * propósito: a etapa que ela não conhece fica `null`, e `null` nunca trava
 * nada, só deixa de ajudar.
 */
type DefinicaoDeEtapa = { familia: string; ordem: number; rotulo: string; padrao: RegExp };

const ETAPAS: DefinicaoDeEtapa[] = [
  { familia: "viagem", ordem: 1, rotulo: "viaja", padrao: /\b(viaja\w*|embarca\w*|rumo a(os)?|deixa o pais|foge|fugiu|parte para)\b/ },
  { familia: "viagem", ordem: 2, rotulo: "chega", padrao: /\b(chega\w*|chegou|desembarca\w*|aterriss\w*|ja esta (em|nos))\b/ },
  { familia: "viagem", ordem: 3, rotulo: "visto", padrao: /\b(pede visto|pedido de visto|solicita visto|vistos?)\b/ },
  { familia: "viagem", ordem: 4, rotulo: "asilo", padrao: /\b(pede asilo|pedido de asilo|solicita asilo|asilo)\b/ },
  { familia: "viagem", ordem: 5, rotulo: "asilo concedido", padrao: /\b(asilo (concedido|aceito)|obtem asilo|recebe asilo|concede asilo)\b/ },
  { familia: "viagem", ordem: 6, rotulo: "volta", padrao: /\b(deportad\w*|extraditad\w*|volta ao brasil|retorna ao brasil)\b/ },

  { familia: "justica", ordem: 1, rotulo: "investigado", padrao: /\b(investigad\w*|investigacao|alvo de operacao|busca e apreensao|buscas)\b/ },
  { familia: "justica", ordem: 2, rotulo: "denunciado", padrao: /\b(denunciad\w*|indiciad\w*|denuncia)\b/ },
  { familia: "justica", ordem: 3, rotulo: "réu", padrao: /\b(vira reu|torna(-se)? reu|reu)\b/ },
  { familia: "justica", ordem: 4, rotulo: "preso", padrao: /\b(e preso|foi preso|prend\w*|prisao)\b/ },
  { familia: "justica", ordem: 5, rotulo: "condenado", padrao: /\b(condenad\w*|absolvid\w*)\b/ },

  { familia: "lei", ordem: 1, rotulo: "proposta", padrao: /\b(propoe|apresenta projeto|projeto de lei|proposta)\b/ },
  { familia: "lei", ordem: 2, rotulo: "aprovada", padrao: /\b(aprova\w*)\b/ },
  { familia: "lei", ordem: 3, rotulo: "sancionada", padrao: /\b(sanciona\w*|veta\w*|promulga\w*)\b/ },

  { familia: "cargo", ordem: 1, rotulo: "indicado", padrao: /\b(nomeia\w*|indica\w*|escolhid\w*)\b/ },
  { familia: "cargo", ordem: 2, rotulo: "posse", padrao: /\b(toma posse|empossad\w*)\b/ },
  { familia: "cargo", ordem: 3, rotulo: "saída", padrao: /\b(demite|demitid\w*|renuncia\w*|deixa o cargo|exonera\w*)\b/ },
];

export type Etapa = { familia: string; ordem: number; rotulo: string };

/**
 * A etapa mais adiante que o texto conta, ou `null`.
 *
 * Mais adiante, e não a primeira que aparece: "chegou aos EUA dois dias depois
 * de viajar" está no capítulo da chegada. O substantivo solto ("a fuga", "a
 * viagem") não conta: quem conta o capítulo usa o verbo, e o substantivo é
 * quase sempre a reação a ele. Onde erra: palavra solta fora do sentido ("o
 * processo foi aprovado na véspera" numa história de cargo), e história cuja
 * etapa não está na lista.
 */
/**
 * O que é CONTEXTO e não o fato da matéria: "após a fuga", "depois de
 * viajar", "silêncio sobre asilo". Medido no ensaio de 28/10/2026: sem isto a
 * trava seguraria "Perseguição implacável, diz vice de Flávio após fuga" (uma
 * reação, não o capítulo da viagem), e "EUA confirmam vistos, mas silêncio
 * sobre asilo" saía na etapa do asilo, quando o fato é o visto.
 */
const CONTEXTO_NAO_E_ETAPA = [
  /\b(apos|depois d[eoa]s?|antes d[eoa]s?|com a|diante d[ao]) (a |o )?\w+( de \w+)?/g,
  /\b(silencio|duvida|incerteza|especulac\w+|rumor\w*) sobre (o |a )?\w+/g,
  /\bsobre (o |a )?(asilo|visto|prisao)\b/g,
  /\bvisto que\b/g,
];

export function etapaDoTexto(texto: string): Etapa | null {
  let alvo = normalizarTexto(texto);
  for (const r of CONTEXTO_NAO_E_ETAPA) alvo = alvo.replace(r, " ");
  let melhor: Etapa | null = null;
  for (const e of ETAPAS) {
    if (!e.padrao.test(alvo)) continue;
    if (!melhor || (e.familia === melhor.familia ? e.ordem > melhor.ordem : false)) {
      melhor = { familia: e.familia, ordem: e.ordem, rotulo: e.rotulo };
    }
  }
  return melhor;
}

const NAO_SAO_NOMES = new Set([
  "governo", "justica", "policia", "camara", "senado", "presidente", "ministro", "ministra", "justiça",
  "the", "and", "with", "from", "after", "over", "como", "para", "sobre", "apos", "após", "veja", "entenda",
  "ao", "vivo", "brasil", "eua", "estados", "unidos", "entenda", "veja", "quem", "porque", "depois", "antes",
  "novo", "nova", "mais", "governo", "empresa", "pesquisa", "mercado", "dolar", "bolsa", "video", "fotos",
]);

/**
 * Os nomes próprios do título: palavra com maiúscula e sigla. É o que liga
 * capítulos: "Flávio" está no "viaja" e no "chega". A palavra que abre a frase
 * conta também, porque o título brasileiro abre muito pelo nome ("Flávio chega
 * a Miami"), e a lista de palavras comuns tira o "Governo" e o "Após". Onde
 * erra: título em inglês com toda palavra em maiúscula liga demais, e a
 * primeira palavra comum que a lista não conhece vira "nome".
 */
export function nomesDoTitulo(titulo: string): Set<string> {
  const saida = new Set<string>();
  const palavras = titulo.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  palavras.forEach((p) => {
    const sigla = /^\p{Lu}{2,6}$/u.test(p);
    const nome = /^\p{Lu}\p{Ll}{3,}$/u.test(p);
    const chave = p.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if ((sigla || nome) && !NAO_SAO_NOMES.has(chave)) saida.add(chave);
  });
  return saida;
}

const AGREGADORES = new Set(["news.google.com", "google.com"]);

const DOMINIOS_DO_BRASIL = new Set([
  "g1.globo.com", "oglobo.globo.com", "globo.com", "valor.globo.com", "folha.uol.com.br", "www1.folha.uol.com.br",
  "uol.com.br", "noticias.uol.com.br", "estadao.com.br", "cnnbrasil.com.br", "metropoles.com", "poder360.com.br",
  "exame.com", "infomoney.com.br", "bbc.com", "terra.com.br", "r7.com", "veja.abril.com.br", "cartacapital.com.br",
]);

export function dominioDoBrasil(dominio: string): boolean {
  const d = dominio.toLowerCase().replace(/^www\./, "");
  return d.endsWith(".br") || DOMINIOS_DO_BRASIL.has(d);
}

/** Ator, lugar ou governo dos EUA no centro do título. A lista é de nomes que o leitor reconhece. */
const SINAIS_DOS_EUA =
  /\b(eua|estados unidos|americano|americana|americanos|americanas|norte-americano\w*|trump|casa branca|washington|miami|nova york|new york|florida|california|texas|fed|federal reserve|wall street|pentagono|departamento de estado|rubio|vance|bessent|powell|congresso americano|senado americano|u\.s\.|united states|white house)\b/;

export function mencionaEua(texto: string): boolean {
  return SINAIS_DOS_EUA.test(normalizarTexto(texto));
}

const FORA_DO_NICHO = /\b(futebol|gol|gols|campeonato|brasileirao|libertadores|placar|rodada|novela|bbb|reality)\b/;

/** O nicho do eua.journal: os EUA no centro, e nada de placar ou novela. */
export function casaComNicho(texto: string): boolean {
  const t = normalizarTexto(texto);
  return SINAIS_DOS_EUA.test(t) && !FORA_DO_NICHO.test(t);
}

export type Grupo = {
  id: number;
  materias: Materia[];
  /** A matéria mais nova do grupo. */
  maisNova: Materia;
  etapa: Etapa | null;
  nomes: Set<string>;
  vetor: Vetor;
  historia: number;
};

function tempo(m: Materia): number {
  const t = Date.parse(m.publicadoEm);
  return Number.isFinite(t) ? t : 0;
}

/**
 * As matérias da mesma história juntas, pelo vetor do título.
 *
 * Guloso, da mais antiga para a mais nova: cada matéria entra no grupo cujo
 * primeiro título é parecido o bastante (`LIMIAR_DO_GRUPO`, o mesmo 0.65 do
 * calor), ou abre um grupo. Onde erra: dois fatos vizinhos com título quase
 * igual caem juntos, e o mesmo fato com títulos muito diferentes ("Flávio
 * desembarca" e "senador chega a Miami") pode cair em dois grupos; os dois
 * grupos ainda se ligam como capítulos pela história.
 */
export function agruparMaterias(materias: Materia[], vetores: Vetor[], limiar = LIMIAR_DO_GRUPO): Grupo[] {
  const ordem = materias.map((m, i) => ({ m, v: vetores[i] })).filter((x) => x.v && x.v.length > 0);
  ordem.sort((a, b) => tempo(a.m) - tempo(b.m));
  const grupos: Grupo[] = [];
  for (const { m, v } of ordem) {
    let alvo: Grupo | null = null;
    let melhor = limiar;
    for (const g of grupos) {
      if (g.vetor.length !== v.length) continue;
      const s = cosseno(g.vetor, v);
      if (s >= melhor) {
        melhor = s;
        alvo = g;
      }
    }
    if (alvo) {
      alvo.materias.push(m);
      alvo.maisNova = m;
      for (const n of nomesDoTitulo(m.titulo)) alvo.nomes.add(n);
    } else {
      grupos.push({ id: grupos.length, materias: [m], maisNova: m, etapa: null, nomes: nomesDoTitulo(m.titulo), vetor: v, historia: grupos.length });
    }
  }
  for (const g of grupos) g.etapa = etapaDoTexto(g.maisNova.titulo);
  ligarCapitulos(grupos);
  return grupos;
}

/**
 * Liga os grupos que são capítulos da mesma história: parecidos acima de
 * `LIMIAR_DA_HISTORIA` E com um nome próprio em comum. O nome em comum é o
 * que impede "Trump anuncia tarifa" e "Trump recebe Milei" de virarem uma
 * história só por serem os dois sobre Trump num dia de muito Trump; os dois
 * precisam ser parecidos também.
 */
function ligarCapitulos(grupos: Grupo[]): void {
  const raiz = (i: number): number => (grupos[i].historia === i ? i : (grupos[i].historia = raiz(grupos[i].historia)));
  for (let i = 0; i < grupos.length; i += 1) {
    for (let j = i + 1; j < grupos.length; j += 1) {
      const a = grupos[i];
      const b = grupos[j];
      if (a.vetor.length !== b.vetor.length) continue;
      if (![...a.nomes].some((n) => b.nomes.has(n))) continue;
      if (cosseno(a.vetor, b.vetor) < LIMIAR_DA_HISTORIA) continue;
      grupos[raiz(j)].historia = raiz(i);
    }
  }
  for (let i = 0; i < grupos.length; i += 1) grupos[i].historia = raiz(i);
}

/**
 * O capítulo mais novo da história do grupo, NA MESMA FAMÍLIA de etapa.
 *
 * Família, e não só história: uma história ligada por engano (dois fatos do
 * mesmo personagem no mesmo dia) não pode dizer que a viagem de alguém "está
 * em" uma votação. Grupo sem etapa reconhecida é o próprio capítulo atual: sem
 * etapa não há como saber o que veio depois, e a trava não segura no escuro.
 */
export function capituloAtual(grupo: Grupo, grupos: Grupo[]): Grupo {
  const familia = grupo.etapa?.familia;
  if (!familia) return grupo;
  return grupos
    .filter((g) => g.historia === grupo.historia && g.etapa?.familia === familia)
    .reduce((a, b) => (tempo(b.maisNova) > tempo(a.maisNova) ? b : a), grupo);
}

/**
 * O grupo ficou para trás: a mesma história já tem, na mesma família, um
 * capítulo de etapa MAIS ADIANTE e de pelo menos `HORAS_DO_CAPITULO_NOVO`
 * depois. "Chega" supera "viaja"; "viaja" de ontem não supera "asilo" de hoje;
 * e sem etapa reconhecida dos dois lados nada é superado aqui (o calor da
 * pauta aprovada ainda tem a régua por horário, em `andamentoDaHistoria`).
 */
export function superado(grupo: Grupo, grupos: Grupo[]): Grupo | null {
  const atual = capituloAtual(grupo, grupos);
  if (atual.id === grupo.id || !atual.etapa || !grupo.etapa) return null;
  if (atual.etapa.ordem <= grupo.etapa.ordem) return null;
  if (tempo(atual.maisNova) - tempo(grupo.maisNova) < HORAS_DO_CAPITULO_NOVO * 3600 * 1000) return null;
  return atual;
}

export type EstadoAtual = {
  /** O que a matéria mais nova da história diz, com a etapa quando a lista a reconhece. */
  linha: string;
  titulo: string;
  etapa: Etapa | null;
  em: string;
  dominio: string;
};

export function estadoAtual(grupo: Grupo, grupos: Grupo[]): EstadoAtual {
  const atual = capituloAtual(grupo, grupos);
  const m = atual.maisNova;
  const etapa = atual.etapa;
  return {
    linha: etapa ? `Etapa atual: ${etapa.rotulo}. Mais novo: "${m.titulo}" (${m.dominio})` : `Mais novo: "${m.titulo}" (${m.dominio})`,
    titulo: m.titulo,
    etapa,
    em: m.publicadoEm,
    dominio: m.dominio,
  };
}

/**
 * A trava antes de produzir: o texto contradiz o estado atual da história?
 *
 * Contradiz quando conta uma etapa ANTERIOR da mesma família ("viaja" quando
 * a história já está em "chega"). Texto sem etapa reconhecida não contradiz,
 * e estado sem etapa não trava: na dúvida a trava não segura. Onde erra: texto
 * que cita a etapa anterior como histórico ("depois de viajar, chegou") passa,
 * porque vale a etapa mais adiante do texto; e contradição que não é de etapa
 * (número, lugar) não é vista aqui, é da ancoragem.
 */
export function contradizEstadoAtual(texto: string, estado: EstadoAtual | null | undefined): string | null {
  if (!estado?.etapa) return null;
  const doTexto = etapaDoTexto(texto);
  if (!doTexto || doTexto.familia !== estado.etapa.familia) return null;
  if (doTexto.ordem >= estado.etapa.ordem) return null;
  return `o texto conta "${doTexto.rotulo}", mas a história já está em "${estado.etapa.rotulo}" (${estado.dominio}: "${estado.titulo}")`;
}

export type LinhaDoTermometro = {
  grupo: Grupo;
  calor: Calor;
  etapaAtual: string | null;
  /** Quantos grupos (o mesmo fato contado de jeitos diferentes) a linha junta. */
  grupos: number;
  veiculos3h: number;
  veiculosAntes3h: number;
  tituloMaisNovo: string;
  dominioMaisNovo: string;
  superadoPor: string | null;
  brasilEua: boolean;
  alerta: boolean;
};

function dominiosDistintos(materias: Materia[], filtro: (m: Materia) => boolean): Set<string> {
  return new Set(
    materias
      .filter(filtro)
      .map((m) => m.dominio.toLowerCase().replace(/^www\./, ""))
      .filter((d) => d && !AGREGADORES.has(d)),
  );
}

/**
 * O ranking do momento: um calor por grupo, com o capítulo atual.
 *
 * Os sinais são os do calor, contados sobre o grupo inteiro: veículos em 24h,
 * veículos nas últimas 3h contra as 3h anteriores, tendência casando com os
 * títulos, recência e número forte da matéria mais nova. A fama não entra:
 * ela pede uma consulta por nome, e o ranking roda de 15 em 15 minutos. O
 * grupo superado leva metade, e o alerta é para o que acelera, casa com o
 * nicho e não foi superado.
 */
export function rankingDoTermometro(
  grupos: Grupo[],
  entrada: { termos: TermoEmAlta[]; agoraMs: number; maximo?: number },
): LinhaDoTermometro[] {
  const { agoraMs } = entrada;
  const dentro = (horas: number, desde = 0) => (m: Materia) => {
    const idade = agoraMs - tempo(m);
    return idade >= desde * 3600 * 1000 && idade <= horas * 3600 * 1000;
  };
  const linhas = grupos.map((g) => {
    const veic24 = dominiosDistintos(g.materias, dentro(24));
    const veic3 = dominiosDistintos(g.materias, dentro(3));
    const antes3 = dominiosDistintos(g.materias, dentro(6, 3));
    const textos = g.materias.map((m) => m.titulo).join(" ");
    const tendencias = tendenciasQueCasam(textos, entrada.termos);
    const emAltaNoBrasil =
      [...veic24].filter(dominioDoBrasil).length >= 2 || tendencias.some((t) => t.fonte === "google_trends_br" || t.fonte === "wikipedia_pt");
    const brasilEua = emAltaNoBrasil && mencionaEua(textos);
    const porQuem = superado(g, grupos);
    const calor = pontuarCalor({
      veiculos: Math.max(1, veic24.size),
      veiculos3h: veic3.size,
      veiculosAntes3h: antes3.size,
      tendencias,
      fama: null,
      horas: horasDesde(g.maisNova.publicadoEm, agoraMs),
      numeroForte: numeroForte(g.maisNova.titulo),
      superada: Boolean(porQuem),
      brasilEua,
    });
    const atual = capituloAtual(g, grupos);
    return {
      grupo: g,
      calor,
      grupos: 1,
      etapaAtual: atual.etapa?.rotulo ?? null,
      veiculos3h: veic3.size,
      veiculosAntes3h: antes3.size,
      tituloMaisNovo: atual.maisNova.titulo,
      dominioMaisNovo: atual.maisNova.dominio,
      superadoPor: porQuem ? porQuem.maisNova.titulo : null,
      brasilEua,
      alerta: !porQuem && acelerando(veic3.size, antes3.size) && casaComNicho(textos),
    };
  });
  /*
   * Uma linha por história: o grupo mais quente fala por ela, e a linha diz
   * quantos grupos juntou. Sem isso o mesmo assunto, contado por veículos com
   * títulos diferentes, ocupava cinco das quinze posições.
   */
  const porHistoria = new Map<number, LinhaDoTermometro>();
  for (const l of linhas.sort((a, b) => b.calor.total - a.calor.total)) {
    const ja = porHistoria.get(l.grupo.historia);
    if (ja) {
      ja.grupos += 1;
      ja.alerta = ja.alerta || l.alerta;
    } else {
      porHistoria.set(l.grupo.historia, l);
    }
  }
  return [...porHistoria.values()].slice(0, entrada.maximo ?? porHistoria.size);
}

/**
 * O estado atual de cada pauta do pool, pelo grupo mais parecido do dia.
 * Pauta sem grupo parecido não tem estado, e sem estado a trava não segura.
 */
export function estadosDasPautas(
  pautas: Array<{ storyId: string; vetor: Vetor | null }>,
  grupos: Grupo[],
  limiar = LIMIAR_DO_GRUPO,
): Map<string, EstadoAtual> {
  const saida = new Map<string, EstadoAtual>();
  for (const p of pautas) {
    if (!p.vetor || p.vetor.length === 0) continue;
    let alvo: Grupo | null = null;
    let melhor = limiar;
    for (const g of grupos) {
      if (g.vetor.length !== p.vetor.length) continue;
      const s = cosseno(g.vetor, p.vetor);
      if (s >= melhor) {
        melhor = s;
        alvo = g;
      }
    }
    if (alvo) saida.set(p.storyId, estadoAtual(alvo, grupos));
  }
  return saida;
}
