/**
 * O que está em alta agora, nos EUA e no Brasil.
 *
 * A coleta por feed é reativa: ela só enxerga o que uma das 32 fontes decidiu
 * publicar. Isso tem um limite estrutural, e o limite aparece no dia em que o
 * assunto do país inteiro não está em nenhuma delas. Tendência é o sinal que
 * vem do outro lado, o do público: não o que foi publicado, e sim o que está
 * sendo procurado.
 *
 * Três decisões que este arquivo carrega, e o porquê de cada uma:
 *
 * 1. **Só fonte sem chave.** O Twitter cobra caro e ficou de fora por decisão
 *    do dono. O Reddit devolve 403 sem autenticação, medido em 16/09/2026. O
 *    que sobrou responde 200 anônimo: Google Trends por país, os mais lidos da
 *    Wikipédia e a capa do Hacker News.
 *
 * 2. **Tendência crua é quase toda esporte e celebridade.** Medido no mesmo
 *    dia, o Google Trends dos EUA trazia "barca game", "aaron judge", "joe
 *    burrow" e "man u" entre os dez primeiros, e os mais lidos da Wikipédia
 *    começavam por Main_Page e Special:Search. Coletar sem limpar encheria a
 *    edição de ruído e, pior, pagaria classificação por cada item.
 *
 * 3. **Quem decide o que vira busca é uma triagem, e não uma lista de palavras
 *    proibidas.** Lista de palavras envelhece: em fevereiro o Super Bowl é
 *    pauta de economia, com o preço do anúncio e o gasto do consumidor, e a
 *    mesma palavra que hoje é ruído passa a valer. A pergunta certa é sobre o
 *    LEITOR, e é ela que a triagem faz.
 */

import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import { DESCRICAO_DO_LEITOR } from "./linha-editorial";

export type FonteDeTendencia =
  | "google_trends_us"
  | "google_trends_br"
  | "wikipedia_us"
  | "hacker_news"
  | "bluesky";

export type TendenciaBruta = {
  termo: string;
  fonte: FonteDeTendencia;
  /** Sinal de tamanho da fonte: buscas, visualizações ou pontos. Zero quando a fonte não informa. */
  peso: number;
  /**
   * Uma frase que diz do que se trata, quando a fonte entrega.
   *
   * Existe porque termo solto é ambíguo e a triagem erra com ele. "judge" pode
   * ser um jogador de beisebol ou uma decisão judicial, e só o contexto
   * separa os dois. O Google Trends entrega uma manchete associada ao termo, e
   * o Bluesky entrega uma descrição de uma linha.
   */
  contexto?: string;
};

const AGENTE = "eua.journal/1.0 (+https://casaloti.ia.br)";

/**
 * Desfaz as entidades HTML do título.
 *
 * O Google Trends devolve `what are donald trump&apos;s plans`, e esse termo
 * ia inteiro, com o `&apos;`, virar consulta de busca. O que volta de uma
 * busca assim não é o que se procurava.
 */
function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Extrai os títulos de um RSS raso. Sem dependência: o formato é estável. */
export function titulosDoRss(xml: string): Array<{ titulo: string; trafego: number; manchete: string }> {
  const itens = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  return itens
    .map((item) => {
      const t = item.match(/<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
      const tr = item.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i);
      /*
       * A manchete que o Google já associou ao termo.
       *
       * É o que desfaz a ambiguidade do termo solto: "judge" sozinho pode ser
       * um jogador de beisebol ou uma decisão de tribunal, e a triagem erra
       * nos dois sentidos sem isso.
       */
      const m = item.match(
        /<ht:news_item_title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/ht:news_item_title>/i,
      );
      return {
        titulo: decodificarEntidades((t?.[1] ?? t?.[2] ?? "").trim()),
        trafego: Number((tr?.[1] ?? "").replace(/[^0-9]/g, "")) || 0,
        manchete: decodificarEntidades((m?.[1] ?? m?.[2] ?? "").trim()),
      };
    })
    .filter((x) => x.titulo.length > 0);
}

/**
 * Páginas da Wikipédia que não são assunto.
 *
 * Main_Page e Special:Search lideram TODO dia, com milhões de visualizações, e
 * não dizem nada sobre o mundo. Sem este corte, os dois ocupam as duas
 * primeiras vagas de tendência para sempre.
 */
function ehPaginaDeServico(artigo: string): boolean {
  return (
    artigo === "Main_Page" ||
    artigo.startsWith("Special:") ||
    artigo.startsWith("Wikipedia:") ||
    artigo.startsWith("Portal:") ||
    artigo.startsWith("Help:") ||
    artigo.includes("Main_Page")
  );
}

/** Nome de artigo da Wikipédia vira termo legível. */
export function termoDoArtigo(artigo: string): string {
  return artigo.replace(/_/g, " ").trim();
}

async function tentar<T>(nome: string, f: () => Promise<T>, avisos: string[]): Promise<T | null> {
  try {
    return await f();
  } catch (erro) {
    avisos.push(`${nome}: ${(erro as Error).message}`);
    return null;
  }
}

/**
 * Coleta as quatro fontes em paralelo.
 *
 * Fonte que falha não derruba as outras e não derruba a edição: ela vira um
 * aviso. Tendência é enriquecimento do funil, nunca requisito dele, e um dia
 * sem Google Trends precisa ser um dia com menos busca extra, não um dia sem
 * newsletter.
 */
export async function coletarTendencias(
  opcoes: { fetcher?: typeof fetch; ontem?: string } = {},
): Promise<{ tendencias: TendenciaBruta[]; avisos: string[] }> {
  const fetcher = opcoes.fetcher ?? fetch;
  const avisos: string[] = [];
  const cabecalho = { "User-Agent": AGENTE };

  const googleTrends = async (geo: "US" | "BR"): Promise<TendenciaBruta[]> => {
    // `hl` não é cosmético: sem ele o feed do Brasil devolve as manchetes
    // associadas em inglês, e o contexto que serve para triar se perde.
    const idioma = geo === "BR" ? "&hl=pt-BR" : "&hl=en-US";
    const r = await fetcher(`https://trends.google.com/trending/rss?geo=${geo}${idioma}`, {
      headers: cabecalho,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return titulosDoRss(await r.text()).map((x) => ({
      termo: x.titulo,
      fonte: geo === "US" ? ("google_trends_us" as const) : ("google_trends_br" as const),
      peso: x.trafego,
      contexto: x.manchete,
    }));
  };

  const wikipedia = async (): Promise<TendenciaBruta[]> => {
    // O dia de ontem, porque o do dia corrente só fica completo depois da virada.
    const dia = (opcoes.ontem ?? "").replace(/-/g, "/");
    if (!dia) throw new Error("sem data de referência");
    const r = await fetcher(
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${dia}`,
      { headers: cabecalho },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const dados = (await r.json()) as { items?: Array<{ articles?: Array<{ article: string; views: number }> }> };
    return (dados.items?.[0]?.articles ?? [])
      .filter((a) => !ehPaginaDeServico(a.article))
      .slice(0, 25)
      .map((a) => ({ termo: termoDoArtigo(a.article), fonte: "wikipedia_us" as const, peso: a.views }));
  };

  const hackerNews = async (): Promise<TendenciaBruta[]> => {
    const r = await fetcher("https://hn.algolia.com/api/v1/search?tags=front_page", { headers: cabecalho });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const dados = (await r.json()) as { hits?: Array<{ title: string; points: number }> };
    return (dados.hits ?? [])
      .slice(0, 15)
      .map((h) => ({ termo: h.title, fonte: "hacker_news" as const, peso: h.points ?? 0 }));
  };

  /*
   * O Bluesky é o substituto direto da API paga do Twitter, e entrega MAIS.
   *
   * Cada assunto vem com nome legível, uma descrição de uma linha, a
   * categoria (business, politics, entertainment, sports) e o status (hot ou
   * cooling). O Google Trends entrega o termo e o volume; aqui vem o assunto
   * já explicado, que é o que a triagem precisa para não confundir o jogador
   * de beisebol com a decisão do tribunal.
   *
   * Endpoint público, sem chave. Fica marcado como `unspecced` na API deles, o
   * que quer dizer que pode mudar sem aviso, e é exatamente por isso que a
   * falha dele é tratada como a de qualquer outra fonte: vira aviso.
   */
  const bluesky = async (): Promise<TendenciaBruta[]> => {
    const r = await fetcher(
      "https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrends?limit=15",
      { headers: cabecalho },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const dados = (await r.json()) as {
      trends?: Array<{ displayName?: string; description?: string; postCount?: number; category?: string }>;
    };
    return (dados.trends ?? [])
      .filter((t) => (t.displayName ?? "").trim().length > 0)
      // Esporte e entretenimento já saem aqui: o Bluesky classifica sozinho, e
      // gastar uma linha da triagem com o que ele já nomeou seria desperdício.
      .filter((t) => t.category !== "sports" && t.category !== "entertainment")
      .map((t) => ({
        termo: (t.displayName ?? "").trim(),
        fonte: "bluesky" as const,
        peso: t.postCount ?? 0,
        contexto: [t.description, t.category].filter(Boolean).join(" | "),
      }));
  };

  const partes = await Promise.all([
    tentar("google_trends_us", () => googleTrends("US"), avisos),
    tentar("google_trends_br", () => googleTrends("BR"), avisos),
    tentar("wikipedia_us", wikipedia, avisos),
    tentar("hacker_news", hackerNews, avisos),
    tentar("bluesky", bluesky, avisos),
  ]);

  return { tendencias: partes.flat().filter((x): x is TendenciaBruta => x !== null), avisos };
}

/** Remove repetição e termo curto demais para virar busca. */
export function limparTendencias(brutas: TendenciaBruta[]): TendenciaBruta[] {
  const vistos = new Set<string>();
  const limpas: TendenciaBruta[] = [];

  for (const t of brutas) {
    const termo = t.termo.trim();
    // Uma palavra de três letras vira busca por qualquer coisa.
    if (termo.length < 4) continue;
    const chave = termo.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    limpas.push({ ...t, termo });
  }

  return limpas;
}

export type TendenciaTriada = {
  termo: string;
  /** Um dos eixos da publicação, ou vazio quando não serve. */
  eixo: string;
  /** Em português, o que procurar. A busca é feita em português e em inglês. */
  consulta: string;
  motivo: string;
};

// Sem `imigracao` desde 05/10/2026: assunto em alta sobre visto ou
// deportação virava busca extra para uma pauta que o classificador recusa.
const EIXOS = "economia, trabalho, custo_de_vida, politica, tecnologia, cultura, seguranca, brasil";

export function montarSystemDaTriagem(): string {
  return `
Você tria assuntos em alta para um jornal diário sobre os Estados Unidos escrito em português para brasileiros.

A pergunta é uma só: ${DESCRICAO_DO_LEITOR} quer ler sobre isso?

APROVE quando o assunto tocar em: ${EIXOS}.
REPROVE imigração (visto, green card, deportação, fronteira), resultado de jogo, fofoca de celebridade, lançamento de série, boato e assunto puramente local americano sem efeito fora dele.

Atenção ao contexto: "Super Bowl" reprovado como jogo pode ser aprovado como economia quando o assunto for preço de anúncio ou gasto do consumidor. Julgue o ASSUNTO, não a palavra.

Para cada assunto aprovado devolva:
- termo: o termo como veio
- eixo: um de ${EIXOS}
- consulta: o que buscar numa ferramenta de notícia, em 2 a 6 palavras, em inglês, sem aspas
- motivo: uma frase curta dizendo o que o leitor ganha

Assunto reprovado NÃO entra na lista.

Responda EXCLUSIVAMENTE com JSON: { "aprovados": [ { "termo": "", "eixo": "", "consulta": "", "motivo": "" } ] }
`.trim();
}

/**
 * A triagem, em uma chamada só.
 *
 * Uma chamada por dia, com trinta termos de uma vez, em vez de uma por termo:
 * o modelo julga melhor vendo o conjunto, e o custo fica na casa de um
 * centavo. O teto de aprovados existe porque cada aprovado vira uma busca
 * extra na coleta, e coleta extra custa classificação.
 */
export async function triarTendencias(
  brutas: TendenciaBruta[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  teto = 4,
): Promise<{ aprovadas: TendenciaTriada[]; erro: string | null }> {
  if (brutas.length === 0) return { aprovadas: [], erro: null };

  const config = getAIProviderConfig(env);
  const lista = brutas
    .slice(0, 40)
    .map((t) => `- ${t.termo} (${t.fonte})${t.contexto ? ` :: ${t.contexto}` : ""}`)
    .join("\n");

  try {
    const { data } = await callOpenAIJSON<{ aprovados?: TendenciaTriada[] }>(
      [
        { role: "system", content: montarSystemDaTriagem() },
        { role: "user", content: `ASSUNTOS EM ALTA HOJE:\n${lista}` },
      ],
      config.triageModel,
      env,
      fetcher,
    );

    const aprovadas = (data.aprovados ?? [])
      .filter((a) => a && typeof a.consulta === "string" && a.consulta.trim().length > 2)
      .slice(0, teto);

    return { aprovadas, erro: null };
  } catch (erro) {
    /*
     * Falha de triagem devolve lista vazia, e não a lista crua.
     *
     * Deixar passar o cru seria pior do que não ter tendência nenhuma: a
     * coleta buscaria "aaron judge" e "man u" e a edição gastaria
     * classificação com placar de futebol.
     */
    return { aprovadas: [], erro: (erro as Error).message };
  }
}
