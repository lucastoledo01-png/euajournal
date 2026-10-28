import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverCapacidade, type EstadoDaCapacidade, type ProjetoComCapacidades } from "../capacidades";
import type { PautaAvaliada } from "./guarda";
import { criarProvedorOpenAI, type Vetor } from "./embeddings";
import { coletarTendencias } from "./tendencias";
import { agenteDaWikimedia } from "../visual/wikidata";
import {
  LIMIAR_DE_VEICULOS_DO_CALOR,
  bonusDoCalor,
  andamentoDaHistoria,
  contarVeiculos,
  dominiosDaPauta,
  horasDesde,
  nomesDaPauta,
  numeroForte,
  pontuarCalor,
  tendenciasQueCasam,
  type Calor,
  type TermoEmAlta,
  type Vizinha,
} from "./calor";

/**
 * O calor aplicado ao dia: de onde vêm os sinais, quando ele manda e o que
 * fica gravado (06/10/2026).
 *
 * A capacidade é `settings.capacidades.calor`, sem fallback de ambiente:
 *
 *   ausente ou `off`  nada é calculado, nenhuma chamada sai; é o dia de antes
 *   `dry_run`         calcula, grava em `platform_events` (`calor_da_selecao`)
 *                     o calor de cada pauta e a seleção que SAIRIA, e não muda
 *                     a seleção
 *   `enforce`         soma o calor à nota no pool do Instagram e põe a pauta
 *                     mais quente na abertura da newsletter
 *
 * Toda fonte de sinal é opcional. Uma fonte que falha vira aviso e o sinal
 * dela vale zero: o calor é ordem, nunca requisito, e um dia sem Google Trends
 * precisa ser um dia com menos calor, não um dia sem post.
 */

export const EVENTO_DO_CALOR = "calor_da_selecao";

export function modoDoCalor(projeto?: ProjetoComCapacidades | null): EstadoDaCapacidade {
  return resolverCapacidade("calor", () => "off", projeto);
}

/** De onde vêm os sinais. Cada um é injetável, para o teste não sair para a rede. */
export type FontesDoCalor = {
  termosEmAlta: () => Promise<TermoEmAlta[]>;
  /** O que todos os veículos publicaram nas últimas 24h: título, domínio e data. */
  publicadasNoDia: () => Promise<Array<{ titulo: string; dominio: string; publicadoEm: string }>>;
  /** Vetores de títulos, na ordem recebida. */
  vetores: (textos: string[]) => Promise<Vetor[]>;
  /** Em quantas Wikipédias o nome tem artigo, ou `null` quando o Wikidata não o conhece. */
  fama: (nome: string) => Promise<{ nome: string; sitelinks: number } | null>;
};

export type CalorDoDia = {
  porStory: Map<string, Calor>;
  avisos: string[];
  linhas: string[];
};

export type OpcoesDoCalor = {
  fontes: FontesDoCalor;
  agoraMs?: number;
  /** O limiar de "mesmo fato" para contar veículos. Ausente, `LIMIAR_DE_VEICULOS_DO_CALOR` (0.65). */
  limiar?: number;
  /**
   * Quantas pautas, das de maior nota, perguntam a fama ao Wikidata. As de
   * baixo ganham os outros quatro sinais, que são de graça: o teto existe
   * para o dia de pool cheio não fazer cem consultas.
   */
  maximoParaFama?: number;
};

async function tentar<T>(nome: string, f: () => Promise<T>, avisos: string[], vazio: T): Promise<T> {
  try {
    return await f();
  } catch (erro) {
    avisos.push(`${nome}: ${(erro as Error)?.message ?? String(erro)}`.slice(0, 200));
    return vazio;
  }
}

export async function calcularCalorDoDia(pool: PautaAvaliada[], opcoes: OpcoesDoCalor): Promise<CalorDoDia> {
  const agoraMs = opcoes.agoraMs ?? Date.now();
  const limiar = opcoes.limiar ?? LIMIAR_DE_VEICULOS_DO_CALOR;
  const avisos: string[] = [];
  const porStory = new Map<string, Calor>();
  if (pool.length === 0) return { porStory, avisos, linhas: [] };

  const [termos, publicadas] = await Promise.all([
    tentar("tendencias", opcoes.fontes.termosEmAlta, avisos, [] as TermoEmAlta[]),
    tentar("publicadas_no_dia", opcoes.fontes.publicadasNoDia, avisos, []),
  ]);

  /*
   * O vetor é o do TÍTULO, dos dois lados. O vetor gravado em
   * `news_candidates.embedding` é título mais resumo e só existe para a
   * aprovada; a vizinha recusada não tem nenhum. Comparar título com título,
   * com o mesmo modelo, é o que dá para fazer com todas as matérias do dia.
   */
  const titulos = [...pool.map((p) => p.grupo.primary.title), ...publicadas.map((v) => v.titulo)];
  const vetores = await tentar("vetores", () => opcoes.fontes.vetores(titulos), avisos, [] as Vetor[]);
  const vetorDaPauta = (i: number): Vetor | null => (vetores.length === titulos.length ? vetores[i] : null);
  const vizinhas: Vizinha[] =
    vetores.length === titulos.length
      ? publicadas.map((v, i) => ({ dominio: v.dominio, publicadoEm: v.publicadoEm, vetor: vetores[pool.length + i] }))
      : [];

  const porNota = [...pool].sort((a, b) => b.pontuacao.total - a.pontuacao.total);
  const comFama = new Set(porNota.slice(0, opcoes.maximoParaFama ?? 30).map((p) => p.storyId));
  const famaPorNome = new Map<string, { nome: string; sitelinks: number } | null>();
  let falhasDeFama = 0;

  for (let i = 0; i < pool.length; i += 1) {
    const p = pool[i];
    const titulo = p.grupo.primary.title;
    const texto = [titulo, p.grupo.primary.description ?? "", (p.classificacao.atores ?? []).join(" ")].join(" ");

    let fama: { nome: string; sitelinks: number } | null = null;
    if (comFama.has(p.storyId)) {
      for (const nome of nomesDaPauta(p)) {
        if (!famaPorNome.has(nome)) {
          try {
            famaPorNome.set(nome, await opcoes.fontes.fama(nome));
          } catch {
            falhasDeFama += 1;
            famaPorNome.set(nome, null);
          }
        }
        const f = famaPorNome.get(nome) ?? null;
        if (f && (!fama || f.sitelinks > fama.sitelinks)) fama = f;
      }
    }

    const andamento = andamentoDaHistoria(
      vetorDaPauta(i),
      p.grupo.primary.published_at,
      dominiosDaPauta(p),
      vizinhas,
      limiar,
      agoraMs,
    );
    porStory.set(
      p.storyId,
      pontuarCalor({
        veiculos: contarVeiculos(vetorDaPauta(i), dominiosDaPauta(p), vizinhas, limiar, agoraMs),
        veiculos3h: andamento.veiculos3h,
        superada: andamento.superada,
        tendencias: tendenciasQueCasam(texto, termos),
        fama,
        horas: horasDesde(p.grupo.primary.published_at, agoraMs),
        numeroForte: numeroForte(titulo),
      }),
    );
  }
  if (falhasDeFama > 0) avisos.push(`wikidata: ${falhasDeFama} consulta(s) falharam`);

  const linhas = [
    `[CALOR] ${pool.length} pauta(s), ${termos.length} termo(s) em alta, ${publicadas.length} matéria(s) do dia para contar veículos`,
    ...avisos.map((a) => `[CALOR] aviso: ${a}`),
  ];
  return { porStory, avisos, linhas };
}

/**
 * A pauta com o calor somado à nota.
 *
 * Clona, como `penalizarPautaAvaliada`: a mesma pauta é lida pelos outros
 * canais, e o calor do Instagram não pode mudar a nota do portal. Pauta sem
 * calor calculado volta intacta.
 */
export function aquecerPauta(p: PautaAvaliada, calor: Calor | undefined): PautaAvaliada {
  const bonus = calor ? bonusDoCalor(calor) : 0;
  if (bonus <= 0) return p;
  return {
    ...p,
    pontuacao: {
      ...p.pontuacao,
      total: p.pontuacao.total + bonus,
      explicacao: `${p.pontuacao.explicacao} + ${bonus} (${calor!.explicacao})`,
    },
  };
}

export function aquecerPool(pool: PautaAvaliada[], porStory: Map<string, Calor>): PautaAvaliada[] {
  return pool.map((p) => aquecerPauta(p, porStory.get(p.storyId)));
}

/**
 * A abertura da newsletter: a pauta mais quente vai para o topo, e o resto
 * mantém a ordem.
 *
 * A seleção da newsletter NÃO muda: são as mesmas pautas, com as mesmas
 * regras de quantidade, acontecimento e foto. Muda quem abre o e-mail, que é
 * a pauta que o assunto e a capa contam. Empate fica com a de cima, para dia
 * sem sinal nenhum sair igual a antes.
 */
export function liderPeloCalor(
  escolhidas: PautaAvaliada[],
  porStory: Map<string, Calor>,
): { pautas: PautaAvaliada[]; mudou: boolean; antes: string | null; depois: string | null } {
  if (escolhidas.length < 2) {
    const t = escolhidas[0]?.grupo.primary.title ?? null;
    return { pautas: escolhidas, mudou: false, antes: t, depois: t };
  }
  let melhor = 0;
  for (let i = 1; i < escolhidas.length; i += 1) {
    const a = porStory.get(escolhidas[i].storyId)?.total ?? 0;
    const b = porStory.get(escolhidas[melhor].storyId)?.total ?? 0;
    if (a > b) melhor = i;
  }
  const antes = escolhidas[0].grupo.primary.title;
  if (melhor === 0) return { pautas: escolhidas, mudou: false, antes, depois: antes };
  const pautas = [escolhidas[melhor], ...escolhidas.filter((_, i) => i !== melhor)];
  return { pautas, mudou: true, antes, depois: pautas[0].grupo.primary.title };
}

/** O que vai para o banco de cada pauta: curto, legível, sem vetor. */
export function registroDoCalor(pool: PautaAvaliada[], porStory: Map<string, Calor>, maximo = 25) {
  return [...pool]
    .map((p) => ({ p, c: porStory.get(p.storyId) }))
    .filter((x) => x.c)
    .sort((a, b) => b.c!.total - a.c!.total)
    .slice(0, maximo)
    .map(({ p, c }) => ({
      storyId: p.storyId,
      titulo: p.grupo.primary.title.slice(0, 140),
      nota: p.pontuacao.total,
      calor: c!.total,
      notaComCalor: p.pontuacao.total + bonusDoCalor(c!),
      partes: c!.partes,
      veiculos: c!.sinais.veiculos,
      veiculos3h: c!.sinais.veiculos3h ?? 0,
      superada: c!.sinais.superada ?? false,
      tendencias: c!.sinais.tendencias.slice(0, 3),
      fama: c!.sinais.fama,
      horas: c!.sinais.horas === null ? null : Math.round(c!.sinais.horas * 10) / 10,
      numero: c!.sinais.numeroForte,
    }));
}

export async function gravarCalor(
  client: Pick<SupabaseClient, "from"> | null | undefined,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  if (!client) return "sem cliente do banco";
  try {
    const { error } = await client.from("platform_events").insert({ event_type: EVENTO_DO_CALOR, project_id: projectId, payload });
    return error ? error.message : null;
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

/*
 * As fontes de verdade.
 *
 * Os caches são do PROCESSO e servem a uma coisa: o ciclo do dia calcula o
 * calor duas vezes (Instagram e abertura da newsletter) sobre pools que se
 * sobrepõem, e a segunda vez não deve pagar de novo nem a rede nem o modelo.
 */
const UMA_HORA = 3600 * 1000;
let termosEmCache: { em: number; termos: TermoEmAlta[] } | null = null;
const famaEmCache = new Map<string, { nome: string; sitelinks: number } | null>();
const vetorEmCache = new Map<string, Vetor>();
const AGENTE = "eua.journal/1.0 (+https://casaloti.ia.br)";

/**
 * Os mais lidos da Wikipédia em PORTUGUÊS, que `coletarTendencias` não lê.
 *
 * Medido em 06/10/2026: a de inglês trazia "2026 Brazilian general election"
 * no meio de séries e filmes; a de português trazia Flávio Bolsonaro, Nikolas
 * Ferreira, Erika Hilton e Lula nas dez primeiras, que são exatamente as
 * pessoas dos posts mais curtidos do Not Journal naquele dia.
 */
async function maisLidosEmPortugues(fetcher: typeof fetch, ontem: string): Promise<TermoEmAlta[]> {
  const r = await fetcher(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/pt.wikipedia/all-access/${ontem.replace(/-/g, "/")}`,
    { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(10_000) },
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const dados = (await r.json()) as { items?: Array<{ articles?: Array<{ article: string }> }> };
  return (dados.items?.[0]?.articles ?? [])
    .map((a) => a.article)
    .filter((a) => !/^(Wikipédia|Especial|Special|Portal|Ajuda):/.test(a) && !a.includes("Página_principal"))
    .slice(0, 30)
    .map((a) => ({ termo: a.replace(/_/g, " "), fonte: "wikipedia_pt" }));
}

export function fontesPadraoDoCalor(entrada: {
  client: Pick<SupabaseClient, "from"> | null | undefined;
  projectId: string;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  agoraMs?: number;
}): FontesDoCalor {
  const env = entrada.env ?? process.env;
  const fetcher = entrada.fetcher ?? fetch;
  const agoraMs = entrada.agoraMs ?? Date.now();
  const ontem = new Date(agoraMs - 24 * 3600 * 1000).toISOString().slice(0, 10);

  return {
    async termosEmAlta() {
      if (termosEmCache && agoraMs - termosEmCache.em < UMA_HORA) return termosEmCache.termos;
      const [gerais, pt] = await Promise.all([
        coletarTendencias({ fetcher, ontem }),
        maisLidosEmPortugues(fetcher, ontem).catch(() => [] as TermoEmAlta[]),
      ]);
      // O Hacker News é manchete inteira, não assunto: ele serve à busca do
      // dia, e aqui só casaria por acaso.
      const termos = [
        ...gerais.tendencias.filter((t) => t.fonte !== "hacker_news").map((t) => ({ termo: t.termo, fonte: t.fonte })),
        ...pt,
      ];
      termosEmCache = { em: agoraMs, termos };
      return termos;
    },

    async publicadasNoDia() {
      if (!entrada.client) return [];
      const desde = new Date(agoraMs - 24 * 3600 * 1000).toISOString();
      const { data, error } = await (entrada.client as SupabaseClient)
        .from("news_candidates")
        .select("title,source_domain,url,published_at")
        .eq("project_id", entrada.projectId)
        .gte("published_at", desde)
        .limit(3000);
      if (error) throw new Error(error.message);
      return (data ?? []).map((l: Record<string, unknown>) => ({
        titulo: String(l.title ?? ""),
        dominio: String(l.source_domain ?? "") || dominioSimples(String(l.url ?? "")),
        publicadoEm: String(l.published_at ?? ""),
      }));
    },

    async vetores(textos) {
      const faltam = [...new Set(textos.filter((t) => !vetorEmCache.has(t)))];
      if (faltam.length > 0) {
        const gerados = await criarProvedorOpenAI(env, fetcher).gerar(faltam);
        faltam.forEach((t, i) => vetorEmCache.set(t, gerados[i]));
      }
      return textos.map((t) => vetorEmCache.get(t) ?? []);
    },

    async fama(nome) {
      const chave = nome.toLowerCase();
      if (famaEmCache.has(chave)) return famaEmCache.get(chave) ?? null;
      const resposta = await famaNoWikidata(nome, fetcher, agenteDaWikimedia(env));
      famaEmCache.set(chave, resposta);
      return resposta;
    },
  };
}

function dominioSimples(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const PROJETOS_QUE_NAO_SAO_WIKIPEDIA = new Set([
  "commonswiki",
  "specieswiki",
  "metawiki",
  "wikidatawiki",
  "mediawikiwiki",
  "sourceswiki",
  "outreachwiki",
  "incubatorwiki",
]);

function palavras(t: string): string[] {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3);
}

/**
 * O artigo achado é do nome procurado? Alguma palavra do nome tem que abrir
 * uma palavra do título. Medido em 06/10/2026: a busca de texto da Wikipédia
 * devolve "Gato" para "Neko Health" e Nassim Taleb para "Pesquisadores da
 * Wharton"; os dois caem aqui. "Fed" continua casando com "Sistema de Reserva
 * Federal", e "Trump" com "Donald Trump".
 */
export function tituloCasaComNome(titulo: string, nome: string): boolean {
  const doTitulo = palavras(titulo);
  return palavras(nome).some((n) => doTitulo.some((t) => t.startsWith(n) || n.startsWith(t)));
}

async function temPropriedade(
  qid: string,
  propriedade: string,
  fetcher: typeof fetch,
  cabecalho: Record<string, string>,
): Promise<string[]> {
  const u = new URL("https://www.wikidata.org/w/api.php");
  u.searchParams.set("action", "wbgetclaims");
  u.searchParams.set("entity", qid);
  u.searchParams.set("property", propriedade);
  u.searchParams.set("format", "json");
  const r = await fetcher(u, { headers: cabecalho, signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`wikidata ${r.status}`);
  const corpo = (await r.json()) as {
    claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } | string } } }>>;
  };
  return (corpo.claims?.[propriedade] ?? []).map((c) => {
    const v = c.mainsnak?.datavalue?.value;
    return typeof v === "string" ? v : (v?.id ?? "");
  });
}

/**
 * Fama é de PESSOA ou de ORGANIZAÇÃO, nunca de lugar nem de conceito.
 *
 * Medido no ensaio de 06/10/2026: sem esta régua, "Virgínia Ocidental" (192
 * Wikipédias) virava a pessoa famosa de uma pauta sobre indenização, e
 * "Economista" a de uma pauta de inflação. Estado, país e palavra comum têm
 * artigo em toda língua e não são o rosto de ninguém. Pessoa é instância de
 * ser humano (Q5); organização é o que declara sede (P159) ou setor (P452),
 * que é o que empresa, órgão e banco central declaram e lugar não declara.
 */
async function tipoDaEntidade(
  qid: string,
  fetcher: typeof fetch,
  cabecalho: Record<string, string>,
): Promise<TipoDaEntidade> {
  if ((await temPropriedade(qid, "P31", fetcher, cabecalho)).includes("Q5")) return "pessoa";
  if ((await temPropriedade(qid, "P159", fetcher, cabecalho)).length > 0) return "organizacao";
  return (await temPropriedade(qid, "P452", fetcher, cabecalho)).length > 0 ? "organizacao" : "outro";
}

export type TipoDaEntidade = "pessoa" | "organizacao" | "outro";

/** O que a Wikipédia sabe de um nome: o artigo, em quantas línguas, e se é gente. */
export type EntidadeNaWikipedia = { nome: string; sitelinks: number; tipo: TipoDaEntidade };

/**
 * Em quantas Wikipédias o nome tem artigo.
 *
 * O nome passa primeiro pela busca de texto da Wikipédia em português (depois
 * em inglês), e não pela busca do Wikidata. Medido em 06/10/2026: o
 * classificador escreve "Trump" (210 vezes em sete dias) e "Lula" (100), e a
 * busca do Wikidata devolve o sobrenome Trump, com 6 Wikipédias, e a LULA, o
 * molusco, com 94. A busca da Wikipédia ordena por relevância e links, e
 * devolveu Donald Trump, Lula da Silva, Elon Musk, Flávio Bolsonaro e
 * Alexandre de Moraes para os nomes soltos.
 *
 * O homônimo continua possível, e é por isso que este número só ORDENA pauta
 * que a linha já aprovou: nunca escolhe foto nem aparece no texto. Quem decide
 * a entidade da foto continua sendo o resolvedor, com as réguas dele.
 */
export async function famaNoWikidata(
  nome: string,
  fetcher: typeof fetch,
  agente: string,
): Promise<{ nome: string; sitelinks: number } | null> {
  const e = await entidadeNaWikipedia(nome, fetcher, agente);
  return e && e.tipo !== "outro" ? { nome: e.nome, sitelinks: e.sitelinks } : null;
}

/**
 * A mesma busca de `famaNoWikidata`, devolvendo também o TIPO (06/10/2026).
 *
 * O piso de alcance (`alcance.ts`) precisa saber se o protagonista é uma
 * pessoa: o calor só quer um número para ordenar, e o alcance quer saber se
 * quem está no centro da pauta é gente que o país conhece. `null` é "não há
 * artigo com este nome"; erro de rede LANÇA, para quem chama não confundir
 * "não consegui olhar" com "não existe".
 */
export async function entidadeNaWikipedia(
  nome: string,
  fetcher: typeof fetch,
  agente: string,
): Promise<EntidadeNaWikipedia | null> {
  const cabecalho = { "User-Agent": agente, Accept: "application/json" };
  for (const wiki of ["pt", "en"]) {
    const busca = new URL(`https://${wiki}.wikipedia.org/w/api.php`);
    busca.searchParams.set("action", "query");
    busca.searchParams.set("format", "json");
    busca.searchParams.set("generator", "search");
    busca.searchParams.set("gsrsearch", nome);
    busca.searchParams.set("gsrlimit", "1");
    busca.searchParams.set("prop", "pageprops");
    busca.searchParams.set("ppprop", "wikibase_item");
    const r = await fetcher(busca, { headers: cabecalho, signal: AbortSignal.timeout(8_000) });
    if (!r.ok) throw new Error(`wikipedia ${r.status}`);
    const paginas = ((await r.json()) as {
      query?: { pages?: Record<string, { title?: string; pageprops?: { wikibase_item?: string } }> };
    }).query?.pages;
    const achado = Object.values(paginas ?? {})[0];
    const qid = achado?.pageprops?.wikibase_item;
    if (!achado?.title || !qid || !tituloCasaComNome(achado.title, nome)) continue;

    const detalhe = new URL("https://www.wikidata.org/w/api.php");
    detalhe.searchParams.set("action", "wbgetentities");
    detalhe.searchParams.set("ids", qid);
    detalhe.searchParams.set("props", "sitelinks");
    detalhe.searchParams.set("format", "json");
    const r2 = await fetcher(detalhe, { headers: cabecalho, signal: AbortSignal.timeout(8_000) });
    if (!r2.ok) throw new Error(`wikidata ${r2.status}`);
    const corpo = (await r2.json()) as { entities?: Record<string, { sitelinks?: Record<string, unknown> }> };
    const links = corpo.entities?.[qid]?.sitelinks ?? {};
    const tipo = await tipoDaEntidade(qid, fetcher, cabecalho);
    // Só as Wikipédias: commons, wikiquote e afins inflariam a conta.
    const sitelinks = Object.keys(links).filter((k) => /wiki$/.test(k) && !PROJETOS_QUE_NAO_SAO_WIKIPEDIA.has(k)).length;
    return { nome: achado.title, sitelinks, tipo };
  }
  return null;
}
