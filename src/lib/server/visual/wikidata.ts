import type { EntidadeVisual, TipoDeEntidade } from "./tipos";
import { normalizarEntidade } from "./tipos";

/**
 * Quem é a entidade, e de que tipo ela é.
 *
 * O classificador já devolve atores e lugares por pauta, mas não diz se
 * "USCIS" é órgão, se "Deborah Boardman" é pessoa e se "Orlando" é cidade. Sem
 * isso não dá para aplicar a regra que mais importa: pessoa pública não aceita
 * foto conceitual no lugar.
 *
 * Em vez de gastar uma chamada de modelo para adivinhar isso, pergunta ao
 * Wikidata, que responde de graça, sem chave, e com dado estruturado:
 *
 *   P31  do que a entidade é instância (humano, cidade, agência, empresa)
 *   P18  a imagem principal declarada para ela
 *   P373 a categoria dela no Commons, que é o caminho mais preciso de busca
 *   P856 o site oficial, ponto de partida da camada de fonte oficial
 *
 * O P18 é o achado que muda o resultado: para figura pública conhecida, ele
 * aponta direto para o retrato oficial no Commons.
 */

const API = "https://www.wikidata.org/w/api.php";
const TEMPO_LIMITE_MS = 12_000;

/**
 * Um pedido à Wikimedia com UMA segunda tentativa quando ela pede calma (429)
 * ou está fora (5xx) (06/10/2026, "imagem certeira").
 *
 * No ensaio da fila de 07/10/2026 o Wikidata respondeu 429 no meio da rajada,
 * e a busca devolvia lista vazia como se o Caiado não existisse: a pauta virou
 * "sem entidade" e desceu para a cena. Agora a recusa é tentada de novo depois
 * de uma pausa curta e, se persistir, vira ERRO, que quem chama trata como
 * "não deu para saber", e não como "não existe".
 */
export async function pedirComPaciencia(
  fetcher: typeof fetch,
  url: URL | string,
  init: RequestInit,
  pausaMs = 1_500,
): Promise<Response> {
  const r = await fetcher(url, init);
  if (r.status !== 429 && r.status < 500) return r;
  const depois = Number(r.headers?.get?.("retry-after") ?? "");
  const espera = Number.isFinite(depois) && depois > 0 ? Math.min(depois * 1000, 5_000) : pausaMs;
  await new Promise((ok) => setTimeout(ok, espera));
  return fetcher(url, { ...init, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
}

/** Identifica o robô, como a política da Wikimedia pede. */
export function agenteDaWikimedia(env: Record<string, string | undefined> = process.env): string {
  const contato = env.WIKIMEDIA_CONTACT || "contato@lokta.com.br";
  return `imigra-us-newsroom/1.0 (https://casaloti.ia.br; ${contato})`;
}

/**
 * Do que a entidade é instância, traduzido para os nossos tipos.
 *
 * A lista é curta de propósito: cobre o que a publicação encontra. O que não
 * casar vira `institution` quando tem site oficial e `conceptual` quando não
 * tem, e o log diz qual QID não foi reconhecido, para a lista crescer com
 * dado em vez de com suposição.
 */
const INSTANCIA_PARA_TIPO: Record<string, TipoDeEntidade> = {
  Q5: "person",
  Q82955: "politician",
  Q30461: "politician",
  Q327333: "government_agency",
  Q2659904: "government_agency",
  Q1412224: "government_agency",
  Q43229: "institution",
  Q3918: "institution",
  Q2085381: "institution",
  Q41487: "institution",
  Q19832486: "institution",
  Q4830453: "company",
  Q241317: "company",
  Q1210425: "company",
  Q18388277: "company",
  Q783794: "company",
  Q6881511: "company",
  Q891723: "company",
  Q190752: "institution",
  Q895914: "institution",
  Q515: "place",
  Q1093829: "place",
  Q35657: "place",
  /*
   * País inteiro não é entidade visual.
   *
   * "Estados Unidos" como assunto da foto devolve bandeira ou mapa, que é
   * exatamente a imagem genérica que a fase 2 existe para eliminar. Cai em
   * conceitual, e aí o banco de imagem pode ilustrar o TEMA da pauta, que é
   * para o que ele serve.
   */
  Q6256: "conceptual",
  Q3624078: "conceptual",
  Q1549591: "place",
  Q3957: "place",
};

type Claims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;

function valores(claims: Claims, prop: string): string[] {
  return (claims[prop] ?? [])
    .map((c) => {
      const v = c.mainsnak?.datavalue?.value;
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && "id" in v) return String((v as { id: string }).id);
      return "";
    })
    .filter(Boolean);
}

export type ResolucaoDeEntidade = {
  entidade: EntidadeVisual | null;
  /** Toda tentativa, para o relatório dizer o que foi consultado. */
  nota: string;
  /** Duas leituras plausíveis e nada no contexto que decida. */
  ambigua?: boolean;
};

/**
 * Marcadores de contexto federal e diplomático.
 *
 * Quando a matéria fala de embaixada, governo federal, Congresso ou Casa
 * Branca, "Washington" é a capital, não o estado no noroeste. A lista descreve
 * o CONTEXTO, não o lugar, e por isso vale para qualquer país: em pauta
 * brasileira com os mesmos marcadores, a capital é Brasília.
 */
const CONTEXTO_DE_CAPITAL =
  /embaixad|consulad|diplomat|governo federal|casa branca|white house|congresso|senado|c[âa]mara|capitol|federal government|planalto|minist[ée]rio|supremo|department of state|secret[áa]rio de estado/i;

/** "estado de X" e "cidade de X" resolvem sozinhos, quando aparecem. */
const QUALIFICADOR_DE_ESTADO = /\bestado d[eo]\s+|\bstate of\s+/i;
const QUALIFICADOR_DE_CIDADE = /\bcidade d[eo]\s+|\bcity of\s+|\bmunic[íi]pio d[eo]\s+/i;

/** Capitais já resolvidas nesta execução, para não repetir a consulta. */
const capitaisEmCache = new Map<string, { qid: string; label: string } | null>();

/**
 * A capital do país, pelo próprio Wikidata (P36).
 *
 * Vale a consulta porque a capital NÃO aparece na busca por nome: procurar
 * "Washington" devolve o estado, condados e um sobrenome, e Washington D.C.
 * não está entre os resultados. Perguntar "qual é a capital dos Estados
 * Unidos" é a única forma de chegar nela sem escrever o nome no código.
 */
async function capitalDoPais(
  paisQid: string,
  fetcher: typeof fetch,
  cabecalho: Record<string, string>
): Promise<{ qid: string; label: string } | null> {
  if (capitaisEmCache.has(paisQid)) return capitaisEmCache.get(paisQid) ?? null;

  try {
    const url = new URL(API);
    url.searchParams.set("action", "wbgetentities");
    url.searchParams.set("ids", paisQid);
    url.searchParams.set("props", "claims");
    url.searchParams.set("format", "json");

    const r = await fetcher(url, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r.ok) return null;

    const corpo = (await r.json()) as { entities?: Record<string, { claims?: Claims }> };
    const qid = valores(corpo.entities?.[paisQid]?.claims ?? {}, "P36")[0];
    if (!qid) {
      capitaisEmCache.set(paisQid, null);
      return null;
    }

    const rotulo = new URL(API);
    rotulo.searchParams.set("action", "wbgetentities");
    rotulo.searchParams.set("ids", qid);
    rotulo.searchParams.set("props", "labels");
    rotulo.searchParams.set("languages", "pt|en");
    rotulo.searchParams.set("format", "json");

    const r2 = await fetcher(rotulo, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r2.ok) return null;

    const c2 = (await r2.json()) as {
      entities?: Record<string, { labels?: Record<string, { value?: string }> }>;
    };
    const labels = c2.entities?.[qid]?.labels ?? {};
    const label = labels.pt?.value || labels.en?.value || "";

    const achado = { qid, label };
    capitaisEmCache.set(paisQid, achado);
    return achado;
  } catch {
    return null;
  }
}

/** País esperado da pauta, para desempatar homônimo. */
const PAIS_PARA_QID: Record<string, string> = { EUA: "Q30", Brasil: "Q155" };

/**
 * Nota mínima para aceitar um candidato.
 *
 * Abaixo disto, a resposta correta é "sem entidade". Publicar sem imagem custa
 * um bloco vazio; publicar a entidade errada custa a credibilidade da matéria.
 */
const LIMIAR_DE_ACEITE = 55;

/** Os dois países que esta publicação cobre. */
const PAISES_DA_PUBLICACAO = ["Q30", "Q155"];

/**
 * A entidade declara um país, e ele não é nenhum dos dois que cobrimos.
 *
 * Só vale para quem DECLARA: `P17` ausente devolve `false` e o candidato
 * segue na disputa, porque a ausência do campo é comum e não é evidência
 * contra. O que este veto mata é o caso em que o Wikidata afirma, com todas as
 * letras, que a coisa fica em outro lugar.
 */
export function foraDaCobertura(c: { pais: string[] }): boolean {
  if (c.pais.length === 0) return false;
  return !c.pais.some((q) => PAISES_DA_PUBLICACAO.includes(q));
}

type Candidato = {
  id: string;
  label: string;
  descricao: string;
  instancias: string[];
  pais: string[];
  temImagem: boolean;
  temSiteOficial: boolean;
  temCategoria: boolean;
  claims: Claims;
};

/*
 * Por que não basta pegar o primeiro resultado.
 *
 * Buscar "ICE" no Wikidata devolve, em ordem: metanfetamina, trem alemão, água
 * congelada e motor de combustão. A agência de imigração não aparece nem entre
 * as dez primeiras. Buscar "AWS" em português devolve uma banda húngara antes
 * da Amazon Web Services.
 *
 * O primeiro resultado é o mais popular, e popular não é o que a notícia quer
 * dizer. Então os candidatos são pontuados: tipo que serve para ilustrar,
 * país que bate com o da pauta, existência de imagem declarada e igualdade com
 * o termo buscado. Quando nada pontua, a resposta correta é não ter entidade,
 * e não a foto de metanfetamina.
 */
function pontuarCandidato(c: Candidato, termo: string, paisEsperado: string | null): number {
  let nota = 0;

  const tipo = c.instancias.map((q) => INSTANCIA_PARA_TIPO[q]).find(Boolean);
  // Tipo reconhecido pesa mais que a soma dos sinais indiretos: sem isso, a
  // American Welding Society ganhava da Amazon Web Services na busca por
  // "AWS", e a cidade de Washington na Pensilvânia ganhava do estado.
  if (tipo) nota += 70;

  /*
   * Sinais que valem quando o P31 não está no mapa.
   *
   * Manter uma lista completa de "do que a entidade é instância" é jogo
   * perdido: o Wikidata tem milhares de tipos, e as entidades certas estavam
   * sendo recusadas por isso. O STF é instância de "suprema corte", a ICE é
   * instância de "agência federal americana", e nenhuma das duas estava no
   * mapa.
   *
   * Ter site oficial é evidência forte de organização real. Ter categoria no
   * Commons é evidência de assunto fotografado. Nenhum dos dois é verdade para
   * um composto químico ou uma música.
   */
  if (!tipo && c.temSiteOficial) nota += 35;
  if (!tipo && c.temCategoria) nota += 20;

  /*
   * País é o desempate mais forte para sigla.
   *
   * "ICE" numa pauta americana devolveu o InterCityExpress, o trem alemão:
   * ele tem site oficial, categoria no Commons e foto, e vencia por soma de
   * evidência. Entidade de OUTRO país numa pauta que declara o país é quase
   * sempre homônimo, e leva penalidade em vez de empate.
   */
  if (paisEsperado) {
    if (c.pais.includes(paisEsperado)) nota += 20;
    else if (c.pais.length > 0) nota -= 40;
  } else if (c.pais.length > 0 && !c.pais.some((q) => PAISES_DA_PUBLICACAO.includes(q))) {
    /*
     * Sem país declarado na pauta, ainda dá para descartar o que não é desta
     * publicação. Ela cobre Estados Unidos e Brasil; entidade sediada na
     * Alemanha ou na Suécia aparecendo numa busca por sigla é homônimo.
     *
     * Foi o que sobrou depois do primeiro ajuste: pautas sem lugar citado
     * continuavam devolvendo o trem alemão para "ICE".
     */
    nota -= 25;
  }
  if (c.temImagem) nota += 10;
  // Categoria no Commons vale sempre: entre dois itens do mesmo órgão, o que
  // tem categoria é o que tem foto para buscar. O Wikidata tem duplicata de
  // instituição, e a diferença entre elas costuma ser exatamente essa.
  if (c.temCategoria) nota += 10;
  if (c.label.trim().toLowerCase() === termo.trim().toLowerCase()) nota += 10;

  // Descrição que denuncia coisa que não se fotografa como entidade de
  // notícia: composto químico, gene, proteína, single musical.
  if (/compound|chemical|stimulant|gene|protein|single by|dog breed|cell line|webcomic/i.test(c.descricao)) {
    nota -= 60;
  }

  return nota;
}

async function buscarCandidatos(
  nome: string,
  idioma: string,
  fetcher: typeof fetch,
  cabecalho: Record<string, string>
): Promise<Array<{ id: string; label: string; descricao: string }>> {
  const busca = new URL(API);
  busca.searchParams.set("action", "wbsearchentities");
  busca.searchParams.set("search", nome);
  busca.searchParams.set("language", idioma);
  busca.searchParams.set("uselang", idioma);
  busca.searchParams.set("format", "json");
  busca.searchParams.set("limit", "6");

  const r = await pedirComPaciencia(fetcher, busca, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  // Recusa do servidor não é "não existe" (06/10/2026): sobe como erro, e a pauta não finge que ninguém foi nomeado.
  if (r.status === 429 || r.status >= 500) throw new Error(`Wikidata respondeu ${r.status}`);
  if (!r.ok) return [];

  const corpo = (await r.json()) as { search?: Array<{ id: string; label?: string; description?: string }> };
  return (corpo.search ?? []).map((s) => ({
    id: s.id,
    label: s.label ?? nome,
    descricao: s.description ?? "",
  }));
}

/**
 * Nomes que a busca do Wikidata resolve para a coisa errada (14/10/2026).
 *
 * "Federal Reserve" devolvia o Federal Reserve Bank of Minneapolis, um dos 12
 * bancos regionais, e a pauta do Fed ganhava a foto da sede de Minneapolis.
 * Aqui o nome aponta direto para o item certo, que passa pela mesma régua de
 * tipo e país dos outros candidatos.
 */
export const ENTIDADES_FIXAS: Record<string, { id: string; label: string }> = {
  "federal reserve": { id: "Q53536", label: "Federal Reserve" },
  "fed": { id: "Q53536", label: "Federal Reserve" },
  "federal reserve system": { id: "Q53536", label: "Federal Reserve" },
  "sistema de reserva federal": { id: "Q53536", label: "Federal Reserve" },
  "reserva federal": { id: "Q53536", label: "Federal Reserve" },
  "banco central americano": { id: "Q53536", label: "Federal Reserve" },
  "banco central dos eua": { id: "Q53536", label: "Federal Reserve" },
};

export async function resolverEntidadeNoWikidata(
  nome: string,
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    idioma?: string;
    /** "EUA" ou "Brasil", vindo da classificação da pauta. */
    paisDaPauta?: string;
    /** Título, resumo e entidades da pauta, para desambiguar lugar. */
    contexto?: string;
  } = {}
): Promise<ResolucaoDeEntidade> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const cabecalho = { "User-Agent": agenteDaWikimedia(env), Accept: "application/json" };
  const paisEsperado = opcoes.paisDaPauta ? (PAIS_PARA_QID[opcoes.paisDaPauta] ?? null) : null;

  try {
    // Os dois idiomas: sigla americana costuma resolver em inglês, órgão
    // brasileiro em português, e o custo de perguntar duas vezes é baixo.
    const idiomas = opcoes.idioma ? [opcoes.idioma] : ["pt", "en"];
    const achadosPorId = new Map<string, { id: string; label: string; descricao: string }>();
    const fixa = ENTIDADES_FIXAS[normalizarEntidade(nome)];
    if (fixa) achadosPorId.set(fixa.id, { ...fixa, descricao: "" });

    for (const idioma of fixa ? [] : idiomas) {
      for (const a of await buscarCandidatos(nome, idioma, fetcher, cabecalho)) {
        if (!achadosPorId.has(a.id)) achadosPorId.set(a.id, a);
      }
    }

    const achados = [...achadosPorId.values()].slice(0, 8);
    if (achados.length === 0) return { entidade: null, nota: `Wikidata não conhece "${nome}"` };

    const detalhe = new URL(API);
    detalhe.searchParams.set("action", "wbgetentities");
    detalhe.searchParams.set("ids", achados.map((a) => a.id).join("|"));
    detalhe.searchParams.set("props", "claims");
    detalhe.searchParams.set("format", "json");

    const r2 = await pedirComPaciencia(fetcher, detalhe, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r2.ok) return { entidade: null, nota: `Wikidata (claims) respondeu ${r2.status}` };

    const corpo = (await r2.json()) as { entities?: Record<string, { claims?: Claims }> };

    const candidatos: Candidato[] = achados.map((a) => {
      const claims = corpo.entities?.[a.id]?.claims ?? {};
      return {
        id: a.id,
        label: a.label,
        descricao: a.descricao,
        instancias: valores(claims, "P31"),
        pais: valores(claims, "P17"),
        temImagem: valores(claims, "P18").length > 0,
        temSiteOficial: valores(claims, "P856").length > 0,
        temCategoria: valores(claims, "P373").length > 0,
        claims,
      };
    });

    /*
     * País errado é veto, não desconto.
     *
     * A penalidade de pontos foi desenhada para DESEMPATAR quando existem dois
     * candidatos. Quando o homônimo estrangeiro é o único, não há empate para
     * desfazer, e a penalidade vira um pedágio que ele paga e segue.
     *
     * Foi o que aconteceu em 17/09/2026 com a sigla PERM, do programa de
     * certificação de trabalho do Departamento do Trabalho. O Wikidata devolveu
     * a cidade de Perm, na Rússia, e a conta fechou assim:
     *
     *     tipo reconhecido (cidade)            +70
     *     país declarado diferente             -40
     *     tem imagem (P18)                     +10
     *     tem categoria no Commons (P373)      +10
     *     rótulo idêntico ao termo             +10
     *                                          ---
     *                                           60   contra limiar 55
     *
     * O bônus de rótulo idêntico é o detalhe perverso: é um prêmio que TODO
     * homônimo ganha de graça, porque ser escrito igual é exatamente o que o
     * torna homônimo. A guarda de país funcionou na força máxima e perdeu por
     * cinco pontos.
     *
     * Um post sobre o Departamento do Trabalho americano foi para a fila
     * ilustrado com a Escola Superior de Economia de Perm, com letreiro em
     * cirílico. Por isso agora o candidato de fora sai da lista antes de
     * pontuar, e não há soma que o traga de volta.
     *
     * Entidade SEM P17 continua na disputa: boa parte das organizações não
     * declara país no Wikidata, e exigir o campo recusaria material legítimo.
     * Quem filtra esse caso é a conferência visual, adiante no resolvedor.
     */
    const daCobertura = candidatos.filter((c) => !foraDaCobertura(c));
    const vetadosPorPais = candidatos.length - daCobertura.length;

    const ranqueados = daCobertura
      .map((c) => ({ c, nota: pontuarCandidato(c, nome, paisEsperado) }))
      .sort((a, b) => b.nota - a.nota);

    const melhor = ranqueados[0];

    // Nenhum candidato com tipo utilizável é resposta legítima: melhor sem
    // entidade do que com a entidade errada.
    if (!melhor || melhor.nota < LIMIAR_DE_ACEITE) {
      return {
        entidade: null,
        nota:
          `nenhum candidato utilizável para "${nome}" ` +
          `(melhor: ${melhor?.c.id ?? "nenhum"} "${melhor?.c.descricao.slice(0, 40) ?? ""}", nota ${melhor?.nota ?? 0}` +
          `${vetadosPorPais > 0 ? `, ${vetadosPorPais} vetado(s) por país fora da cobertura` : ""})`,
      };
    }

    const escolhido = melhor.c;
    const tipoConhecido = escolhido.instancias.map((q) => INSTANCIA_PARA_TIPO[q]).find(Boolean);
    const siteOficial = valores(escolhido.claims, "P856")[0] ?? null;
    const tipo: TipoDeEntidade = tipoConhecido ?? (siteOficial ? "institution" : "conceptual");

    const evidencias: string[] = [
      `Wikidata ${escolhido.id}: ${escolhido.descricao || "sem descrição"}`,
      `nota ${melhor.nota} entre ${candidatos.length} candidato(s)`,
    ];
    if (escolhido.temImagem) evidencias.push("entidade declara imagem própria (P18)");
    if (escolhido.temCategoria) evidencias.push("entidade tem categoria no Commons (P373)");
    if (siteOficial) evidencias.push(`site oficial declarado (P856): ${siteOficial}`);
    if (paisEsperado && escolhido.pais.includes(paisEsperado)) {
      evidencias.push(`país da entidade bate com o da pauta (${opcoes.paisDaPauta})`);
    }

    const contexto = opcoes.contexto ?? "";

    /*
     * Lugar ambíguo.
     *
     * "Washington" devolve o estado. Numa matéria sobre embaixada, a resposta
     * certa é a capital, e ela nem aparece na busca por nome. Então a decisão
     * não sai da lista de candidatos: sai do contexto da pauta mais a capital
     * que o próprio Wikidata declara para o país.
     *
     * Sem contexto que decida, e havendo mais de um lugar plausível, a
     * resposta é ambígua e a pauta fica sem imagem. Lugar errado numa matéria
     * é pior que bloco sem foto.
     */
    if (tipo === "place") {
      const outrosLugares = ranqueados
        .slice(1)
        .filter((r) => r.nota >= LIMIAR_DE_ACEITE && r.c.instancias.some((q) => INSTANCIA_PARA_TIPO[q] === "place"));

      const pedeEstado = QUALIFICADOR_DE_ESTADO.test(contexto);
      const pedeCidade = QUALIFICADOR_DE_CIDADE.test(contexto);
      const pedeCapital = CONTEXTO_DE_CAPITAL.test(contexto);

      if (pedeCapital && paisEsperado) {
        const capital = await capitalDoPais(paisEsperado, fetcher, cabecalho);
        if (capital && normalizarEntidade(capital.label).includes(normalizarEntidade(nome))) {
          const det = new URL(API);
          det.searchParams.set("action", "wbgetentities");
          det.searchParams.set("ids", capital.qid);
          det.searchParams.set("props", "claims");
          det.searchParams.set("format", "json");

          const rc = await fetcher(det, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
          if (rc.ok) {
            const cc = (await rc.json()) as { entities?: Record<string, { claims?: Claims }> };
            const claimsCapital = cc.entities?.[capital.qid]?.claims ?? {};
            return {
              entidade: {
                nome: capital.label,
                normalizado: normalizarEntidade(capital.label),
                tipo: "place",
                qid: capital.qid,
                imagemPrincipal: valores(claimsCapital, "P18")[0] ?? null,
                categoriaCommons: valores(claimsCapital, "P373")[0] ?? null,
                siteOficial: valores(claimsCapital, "P856")[0] ?? null,
                origem: `capital de ${opcoes.paisDaPauta} (P36), escolhida pelo contexto institucional da pauta`,
                confianca: 85,
                evidencias: [
                  `"${nome}" é ambíguo e a pauta tem contexto federal ou diplomático`,
                  `capital declarada de ${opcoes.paisDaPauta} no Wikidata (P36): ${capital.label}`,
                ],
              },
              nota: `"${nome}" resolvido como capital ${capital.label} (${capital.qid}) pelo contexto`,
            };
          }
        }
      }

      if (outrosLugares.length > 0 && !pedeEstado && !pedeCidade && !pedeCapital) {
        return {
          entidade: null,
          ambigua: true,
          nota:
            `"${nome}" é ambíguo: ${[escolhido, ...outrosLugares.map((o) => o.c)]
              .slice(0, 3)
              .map((c) => `${c.id} (${c.descricao.slice(0, 30)})`)
              .join(" | ")}. Nada no contexto decide.`,
        };
      }

      if (pedeEstado) evidencias.push("a matéria diz \"estado de\"");
      if (pedeCidade) evidencias.push("a matéria diz \"cidade de\"");
    }

    const confianca = Math.max(30, Math.min(100, melhor.nota));

    return {
      entidade: {
        nome: escolhido.label || nome,
        normalizado: normalizarEntidade(escolhido.label || nome),
        tipo,
        qid: escolhido.id,
        imagemPrincipal: valores(escolhido.claims, "P18")[0] ?? null,
        categoriaCommons: valores(escolhido.claims, "P373")[0] ?? null,
        siteOficial,
        origem: `Wikidata ${escolhido.id}, nota ${melhor.nota} entre ${candidatos.length} candidatos`,
        confianca,
        evidencias,
      },
      nota: `${escolhido.id}: ${escolhido.descricao || "sem descrição"}, tipo ${tipo}, nota ${melhor.nota}`,
    };
  } catch (erro) {
    return { entidade: null, nota: `Wikidata falhou: ${(erro as Error).message}` };
  }
}

/**
 * O logotipo e quem representa uma organização, pelo próprio Wikidata
 * (06/10/2026, "imagem certeira").
 *
 * A regra do dono: pauta cuja manchete nomeia uma empresa mostra a MARCA (foto
 * com o nome legível, ou o logotipo) ou quem a representa. As duas coisas são
 * dado estruturado no Wikidata, de graça e sem palpite:
 *
 *   P154  o logotipo, um arquivo do Commons
 *   P169  o diretor-executivo (CEO)
 *   P112  o fundador
 *   P488  o presidente do conselho
 *
 * Declaração com data de fim (qualificador P582) é cargo que acabou, e sai: o
 * CEO de 2019 numa pauta de 2026 é a foto de outra gestão. Rank `preferred`
 * vai na frente, como o Wikidata pede para o valor atual.
 *
 * Pessoa morta (P570) não representa ninguém hoje (14/10/2026). O fundador da
 * Social Security Administration no Wikidata é Franklin Roosevelt, e o post do
 * reajuste de 2027 saiu com o retrato dele; o dono: "um cara nada a ver".
 * E órgão público quase nunca declara logotipo: a marca dele é o SELO (P158),
 * que entra quando não há P154.
 */
export type Representante = {
  qid: string;
  nome: string;
  papel: "ceo" | "fundador" | "presidente_do_conselho";
  /** O retrato declarado da pessoa (P18), que é a referência da conferência de identidade. */
  imagemPrincipal: string | null;
  categoriaCommons: string | null;
};

export type DadosDaMarca = {
  logotipo: string | null;
  representantes: Representante[];
  nota: string;
};

type DeclaracaoComQualificadores = {
  rank?: string;
  mainsnak?: { datavalue?: { value?: unknown } };
  qualifiers?: Record<string, unknown[]>;
};

/** Os valores vigentes de uma propriedade: sem data de fim, o preferido primeiro. */
export function valoresVigentes(
  claims: Record<string, DeclaracaoComQualificadores[] | undefined>,
  prop: string,
): string[] {
  const lista = (claims[prop] ?? []).filter((c) => c.rank !== "deprecated" && !c.qualifiers?.P582?.length);
  const ordenada = [...lista].sort((a, b) => Number(b.rank === "preferred") - Number(a.rank === "preferred"));
  return ordenada
    .map((c) => {
      const v = c.mainsnak?.datavalue?.value;
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && "id" in v) return String((v as { id: string }).id);
      return "";
    })
    .filter(Boolean);
}

export async function dadosDaMarca(
  qid: string,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<DadosDaMarca> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const cabecalho = { "User-Agent": agenteDaWikimedia(env), Accept: "application/json" };
  const pedir = async (ids: string[], props: string) => {
    const url = new URL(API);
    url.searchParams.set("action", "wbgetentities");
    url.searchParams.set("ids", ids.join("|"));
    url.searchParams.set("props", props);
    url.searchParams.set("languages", "pt|en");
    url.searchParams.set("format", "json");
    const r = await pedirComPaciencia(fetcher, url, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r.ok) throw new Error(`Wikidata respondeu ${r.status}`);
    return (await r.json()) as {
      entities?: Record<
        string,
        { claims?: Record<string, DeclaracaoComQualificadores[]>; labels?: Record<string, { value?: string }> }
      >;
    };
  };

  try {
    const corpo = await pedir([qid], "claims");
    const claims = corpo.entities?.[qid]?.claims ?? {};
    const logotipo = valoresVigentes(claims, "P154")[0] ?? valoresVigentes(claims, "P158")[0] ?? null;
    const papeis: Array<{ prop: string; papel: Representante["papel"] }> = [
      { prop: "P169", papel: "ceo" },
      { prop: "P112", papel: "fundador" },
      { prop: "P488", papel: "presidente_do_conselho" },
    ];
    const pedidos: Array<{ qid: string; papel: Representante["papel"] }> = [];
    for (const { prop, papel } of papeis) {
      for (const q of valoresVigentes(claims, prop).slice(0, 3)) {
        if (!pedidos.some((p) => p.qid === q)) pedidos.push({ qid: q, papel });
      }
    }

    const representantes: Representante[] = [];
    if (pedidos.length > 0) {
      const lote = pedidos.slice(0, 6);
      const pessoas = await pedir(
        lote.map((p) => p.qid),
        "claims|labels",
      );
      for (const p of lote) {
        const e = pessoas.entities?.[p.qid];
        if (!e) continue;
        // Só gente: o "fundador" de uma subsidiária costuma ser outra empresa.
        if (!valoresVigentes(e.claims ?? {}, "P31").includes("Q5")) continue;
        // Representante histórico não é rosto de notícia de hoje.
        if ((e.claims?.P570 ?? []).length > 0) continue;
        const nome = e.labels?.pt?.value || e.labels?.en?.value || "";
        if (!nome) continue;
        representantes.push({
          qid: p.qid,
          nome,
          papel: p.papel,
          imagemPrincipal: valoresVigentes(e.claims ?? {}, "P18")[0] ?? null,
          categoriaCommons: valoresVigentes(e.claims ?? {}, "P373")[0] ?? null,
        });
      }
    }

    return {
      logotipo,
      representantes,
      nota:
        `${qid}: logotipo (P154) ${logotipo ? `"${logotipo}"` : "não declarado"}; representantes ` +
        (representantes.map((r) => `${r.nome} (${r.papel})`).join(", ") || "nenhum"),
    };
  } catch (erro) {
    return { logotipo: null, representantes: [], nota: `marca de ${qid} não lida: ${(erro as Error).message}` };
  }
}
