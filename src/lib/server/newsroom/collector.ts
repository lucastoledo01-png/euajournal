import { NewsSourceConfig } from "./news-sources";

export type NewsCandidate = {
  id: string;
  url: string;
  title: string;
  source_name: string;
  company_name?: string;
  priority: 1 | 2;
  author?: string;
  published_at: string;
  description: string;
  content: string;
  category: string;
  image_url?: string;
  /**
   * O veículo de verdade quando o item vem de um agregador (28/10/2026). O
   * Google Notícias publica o link dele, e o `<source url>` diz quem escreveu:
   * é isso que deixa o termômetro contar veículos pela busca por assunto.
   */
  publisher_url?: string;
  score: number;
  dedupe_key: string;
  window_hours: number;
};

/*
 * Não existe reserva de capa aqui.
 *
 * Existia: seis fotos fixas, escolhidas por hash do título. Como o hash não
 * sabe do que a notícia trata, a matéria sobre custódia do ICE saiu com uma
 * placa de circuito e a do USCIS com uma estante de livros, sempre as mesmas
 * seis, repetidas semana após semana. Trocar as seis fotos por outras seis
 * seria o mesmo mecanismo com outra cara.
 *
 * Sem imagem no feed, o campo fica vazio. Quem procura foto pelo ASSUNTO da
 * pauta é o pipeline, no banco de imagens. Vazio é um estado honesto; foto
 * errada é informação errada.
 */

/**
 * Desfaz as entidades antes de tirar as tags.
 *
 * O feed do Google News entrega a descrição com o HTML JÁ ESCAPADO:
 * `&lt;a href="..."&gt;Título&lt;/a&gt;&amp;nbsp;&lt;font&gt;Veículo&lt;/font&gt;`.
 * O removedor de tags não via tag nenhuma ali, então essa sopa inteira passava
 * adiante como se fosse o resumo da notícia. Ela virou o texto enviado ao
 * classificador, ao gerador de vetor e ao redator, o que explica as edições
 * dizendo "a fonte não informa" em toda pauta: a fonte informava, o que chegou
 * ao modelo é que era marcação.
 */
function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // O & fica por último, senão desfaz as próprias entidades acima.
    .replace(/&amp;/g, "&");
}

function cleanText(html: string): string {
  if (!html) return "";
  // Duas passadas: a primeira desfaz o escape, a segunda pega o que estava
  // escapado dentro do escape, que é o caso do Google News.
  return decodificarEntidades(decodificarEntidades(html))
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O que sobra da descrição depois de tirar o que é repetição do título.
 *
 * Agregador devolve descrição que é o título de novo mais o nome do veículo.
 * Isso não é resumo: é a manchete escrita duas vezes. Deixar passar como se
 * fosse conteúdo faz o classificador julgar pelo título achando que leu a
 * matéria, e faz o redator escrever "a fonte não informa" parágrafo após
 * parágrafo.
 *
 * Devolve vazio nesse caso. Vazio é verdade, e quem lê o vazio decide o que
 * fazer com ele.
 */
export function corpoUtil(descricao: string, titulo: string): string {
  const limpo = descricao.trim();
  if (!limpo) return "";

  const normalizar = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const semTitulo = normalizar(limpo).replace(normalizar(titulo), "").trim();
  // Sobrando menos que meia dúzia de palavras, o que ficou é o nome do
  // veículo e resto de marcação, não informação.
  if (semTitulo.split(" ").filter(Boolean).length < 6) return "";

  return limpo;
}

function generateDedupeKey(title: string, url: string): string {
  const cleanTitle = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `${host}-${cleanTitle.slice(0, 40)}`;
  } catch {
    return cleanTitle.slice(0, 50);
  }
}

/**
 * Lê os itens do feed. Não recebe mais a fonte: ela só era usada para
 * escolher a foto de reserva por hash do título, que deixou de existir.
 */
export function parseRSSItems(
  xml: string
): Array<{ title: string; url: string; publishedAt: string; description: string; content: string; author?: string; imageUrl?: string; publisherUrl?: string }> {
  const items: Array<{ title: string; url: string; publishedAt: string; description: string; content: string; author?: string; imageUrl?: string; publisherUrl?: string }> = [];

  const itemMatches = xml.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) || [];

  for (const rawItem of itemMatches) {
    const titleMatch = rawItem.match(/<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
    const rawTitle = titleMatch ? (titleMatch[1] || titleMatch[2] || "").trim() : "";

    const linkMatch = rawItem.match(/<link[^>]*href=["']([^"']+)["'][^>]*>|<link[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/i);
    const rawLink = linkMatch ? (linkMatch[1] || linkMatch[2] || linkMatch[3] || "").trim() : "";

    const dateMatch = rawItem.match(/<(?:pubDate|published|updated|dc:date)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:pubDate|published|updated|dc:date)>/i);
    const rawDate = dateMatch ? (dateMatch[1] || dateMatch[2] || "").trim() : "";

    const descMatch = rawItem.match(/<(?:description|summary|content:encoded)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:description|summary|content:encoded)>/i);
    const rawDesc = descMatch ? (descMatch[1] || descMatch[2] || "").trim() : "";

    const authorMatch = rawItem.match(/<(?:dc:creator|author|name)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:dc:creator|author|name)>/i);
    const rawAuthor = authorMatch ? (authorMatch[1] || authorMatch[2] || "").trim() : undefined;

    // Extração de imagem oficial (media:content, enclosure, og:image ou img src).
    // media:content/enclosure também é usada por feeds pra anexar vídeo (ex: blog
    // da AWS manda um .mp4 nessa mesma tag) — sem checar type="image/..." ou a
    // extensão, um <img src> acabava recebendo um link de vídeo e quebrando.
    const mediaTagMatch = rawItem.match(/<(?:media:content|enclosure)\b[^>]*>/i);
    let extractedImgUrl: string | undefined;
    if (mediaTagMatch) {
      const mediaTag = mediaTagMatch[0];
      const urlMatch = mediaTag.match(/url=["']([^"']+)["']/i);
      const typeMatch = mediaTag.match(/type=["']([^"']+)["']/i);
      const url = urlMatch?.[1];
      const declaredType = typeMatch?.[1]?.toLowerCase() ?? "";
      const looksLikeImage =
        declaredType.startsWith("image/") ||
        (!declaredType && url ? /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(url) : false);
      if (url && looksLikeImage) {
        extractedImgUrl = url;
      }
    }
    if (!extractedImgUrl) {
      const imgMatch = rawItem.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["']/i);
      extractedImgUrl = imgMatch?.[1];
    }

    if (extractedImgUrl && !extractedImgUrl.startsWith("http")) {
      extractedImgUrl = undefined;
    }

    if (rawTitle && rawLink) {
      const validDate = lerDataDoFeed(rawDate) ?? new Date();
      const publicador = rawItem.match(/<source[^>]*\burl=["']([^"']+)["']/i)?.[1];

      const titulo = cleanText(rawTitle);
      const corpo = corpoUtil(cleanText(rawDesc), titulo);

      items.push({
        title: titulo,
        url: rawLink,
        publishedAt: validDate.toISOString(),
        description: corpo.slice(0, 600),
        content: corpo.slice(0, 1500),
        author: rawAuthor ? cleanText(rawAuthor) : undefined,
        imageUrl: extractedImgUrl || "",
        ...(publicador ? { publisherUrl: publicador } : {}),
      });
    }
  }

  return items;
}

const MESES_EM_PORTUGUES: Record<string, string> = {
  jan: "Jan", fev: "Feb", mar: "Mar", abr: "Apr", mai: "May", jun: "Jun",
  jul: "Jul", ago: "Aug", set: "Sep", out: "Oct", nov: "Nov", dez: "Dec",
};

/**
 * A data do item, também quando o feed escreve em português (28/10/2026).
 *
 * O UOL publica "Qua, 28 Out 2026 13:19:00 -0300", e `new Date()` não entende:
 * a matéria ficava com a hora da COLETA. Uma vez por dia isso passava; com o
 * radar de 15 em 15 minutos, toda matéria do UOL pareceria publicada agora, e
 * a velocidade e a recência do termômetro mentiriam. Traduz dia e mês para o
 * inglês do RFC 822 e tenta de novo. Ilegível continua `null`, e quem chama
 * decide (o coletor usa a hora da coleta, como antes).
 */
export function lerDataDoFeed(bruta: string): Date | null {
  const t = (bruta ?? "").trim();
  if (!t) return null;
  const direta = new Date(t);
  if (!Number.isNaN(direta.getTime())) return direta;
  const traduzida = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[A-Za-z]{3}[a-z]*,?\s*/, "")
    .replace(/\b([A-Za-z]{3})[a-z]*\b/g, (m, tres: string) => MESES_EM_PORTUGUES[tres.toLowerCase()] ?? m);
  const segunda = new Date(traduzida);
  return Number.isNaN(segunda.getTime()) ? null : segunda;
}

type RawItem = {
  title: string;
  url: string;
  publishedAt: string;
  description: string;
  content: string;
  author?: string;
  imageUrl?: string;
  publisherUrl?: string;
};

/**
 * Business Discovery: lê os posts recentes de OUTRA conta Instagram
 * Business/Criador pública, usando a nossa própria conta configurada
 * (INSTAGRAM_ACCOUNT_ID/INSTAGRAM_ACCESS_TOKEN) como ponto de acesso.
 * Não funciona para contas pessoais nem exige consentimento do alvo —
 * é um recurso público da Graph API, mas sujeito a limite de taxa.
 */
/**
 * O texto do feed no charset que ELE declara.
 *
 * `res.text()` decodifica tudo como UTF-8. A Folha publica em ISO-8859-1
 * (`<?xml ... encoding="ISO-8859-1"?>` com `content-type: text/xml` sem
 * charset), e por isso as manchetes dela chegavam ao banco com o caractere de
 * substituição no lugar de cada acento, em "Dólar fecha em queda" e "Preço do
 * diesel" (medido em 06/10/2026, na auditoria de notícia quente): o
 * classificador lia palavra quebrada e a busca por nome não casava. A ordem é o cabeçalho HTTP, depois a declaração do XML,
 * depois UTF-8. Charset que o `TextDecoder` não conhece cai em UTF-8, que é o
 * comportamento de antes.
 */
export function textoDoFeed(bytes: Uint8Array, contentType: string | null): string {
  const doCabecalho = (contentType ?? "").match(/charset=["']?([\w-]+)/i)?.[1];
  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const doXml = inicio.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1];
  const charset = (doCabecalho || doXml || "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function fetchInstagramProfilePosts(
  source: NewsSourceConfig,
  fetcher: typeof fetch
): Promise<RawItem[]> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const targetUsername = source.url.replace(/^@/, "").trim();

  if (!accountId || !accessToken) {
    console.warn(`[NEWSROOM] Fonte Instagram ${source.name}: INSTAGRAM_ACCOUNT_ID/ACCESS_TOKEN não configurados.`);
    return [];
  }
  if (!targetUsername) {
    console.warn(`[NEWSROOM] Fonte Instagram ${source.name}: nenhum @username configurado.`);
    return [];
  }

  const fields =
    `business_discovery.username(${encodeURIComponent(targetUsername)})` +
    `{username,media{caption,media_url,permalink,timestamp,media_type}}`;
  const url = `https://graph.facebook.com/v22.0/${accountId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = json?.error?.message || res.statusText;
    console.warn(`[NEWSROOM] Falha ao coletar perfil @${targetUsername} (${res.status}): ${detail}`);
    return [];
  }

  const media = json?.business_discovery?.media?.data as
    | Array<{ caption?: string; media_url?: string; permalink?: string; timestamp?: string; media_type?: string }>
    | undefined;

  if (!media) return [];

  return media
    .filter((m) => m.caption && m.permalink)
    .map((m) => {
      const caption = m.caption as string;
      const firstLine = caption.split("\n")[0].slice(0, 140) || caption.slice(0, 140);
      // Para posts de vídeo/reels, media_url aponta pro arquivo de vídeo, não
      // uma imagem — usá-lo como imageUrl quebraria o <img> no e-mail/portal.
      const isImage = m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM";
      return {
        title: firstLine,
        url: m.permalink as string,
        publishedAt: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
        description: caption.slice(0, 600),
        content: caption.slice(0, 1500),
        author: `@${targetUsername}`,
        imageUrl: isImage ? m.media_url : undefined,
      };
    });
}

function matchesKeywords(item: RawItem, keywords: string[] | undefined): boolean {
  if (!keywords || keywords.length === 0) return true;
  const haystack = `${item.title} ${item.description}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

export async function collectFromSource(
  source: NewsSourceConfig,
  fetcher: typeof fetch = fetch
): Promise<NewsCandidate[]> {
  if (!source.enabled) return [];

  try {
    const rawItems =
      source.type === "instagram_profile"
        ? await fetchInstagramProfilePosts(source, fetcher)
        : await (async () => {
            const res = await fetcher(source.url, {
              headers: {
                "User-Agent": "NewsroomBot/1.0 (+https://casaloti.ia.br)",
                Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml, text/html",
              },
              signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) {
              console.warn(`[NEWSROOM] Falha ao coletar fonte ${source.name} (${res.status})`);
              return [];
            }

            const xmlText = textoDoFeed(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type"));
            return parseRSSItems(xmlText);
          })();

    const filtered = rawItems.filter((item) => matchesKeywords(item, source.keywords));

    return filtered.map((item) => ({
      id: `cand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: item.url,
      title: item.title,
      source_name: source.name,
      company_name: source.companyName,
      priority: source.priority,
      author: item.author,
      published_at: item.publishedAt,
      description: item.description,
      content: item.content,
      category: source.category,
      image_url: item.imageUrl || "",
      ...("publisherUrl" in item && item.publisherUrl ? { publisher_url: item.publisherUrl } : {}),
      score: source.priority === 1 ? 75 : 60,
      dedupe_key: generateDedupeKey(item.title, item.url),
      window_hours: 24,
    }));
  } catch (err) {
    console.warn(`[NEWSROOM] Erro de timeout/conecção na fonte ${source.name}:`, err);
    return [];
  }
}

/**
 * Quanto tempo para trás cada fonte enxerga.
 *
 * A janela era uma só, de 24h, e só abria quando sobravam menos de QUATRO
 * candidatas no total. Como as buscas de fiscalização trazem sessenta itens
 * por dia sozinhas, o total nunca ficava abaixo de quatro, e a janela nunca
 * abria. O resultado é que fonte oficial, que publica a cada dois ou três
 * dias, ficava permanentemente de fora: no dia em que ela tinha algo, o
 * agregador já tinha enchido a cota.
 *
 * Agora a janela é da fonte. Órgão público entra com 72h porque publica devagar
 * e o que publica continua valendo; agregador fica em 24h porque o que ele tem
 * de ontem já foi visto.
 *
 * Isso não faz notícia velha ganhar da nova: a nota do frescor cai com as
 * horas, e uma pauta de 72h só é escolhida quando não há melhor.
 */
export function janelaDaFonte(source: NewsSourceConfig): number {
  const dominio = (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  // Agregador é o único que fica em 24h. Ele republica o dia inteiro e o que
  // tinha ontem já passou pela coleta de ontem.
  if (dominio === "news.google.com" || dominio === "news.yahoo.com") return 24;

  // O resto entra com 72h. Órgão público publica a cada dois ou três dias, e
  // escritório de imigração publica análise duas vezes por semana: com 24h,
  // essas fontes apareciam vazias em quase toda rodada, e são justamente as
  // que entregam texto de verdade. Veículo de alto volume também ganha as 72h
  // sem prejuízo, porque a deduplicação corta o repetido e a nota do frescor
  // coloca o que é de hoje na frente.
  return 72;
}

export async function collectAllNews(
  sources: NewsSourceConfig[],
  fetcher: typeof fetch = fetch
): Promise<{ candidates: NewsCandidate[]; sourcesAttempted: number; windowHours: number }> {
  const activeSources = sources.filter((s) => s.enabled);
  const results = await Promise.all(
    activeSources.map(async (source) => {
      const janela = janelaDaFonte(source);
      const itens = await collectFromSource(source, fetcher);
      return filterByWindow(itens, Date.now(), janela).map((c) => ({ ...c, window_hours: janela }));
    }),
  );

  const filtered = results.flat();
  const janelaMaxima = activeSources.reduce((maior, s) => Math.max(maior, janelaDaFonte(s)), 24);

  return {
    candidates: filtered,
    sourcesAttempted: activeSources.length,
    windowHours: janelaMaxima,
  };
}

function filterByWindow(items: NewsCandidate[], nowMs: number, windowHours: number): NewsCandidate[] {
  const windowMs = windowHours * 60 * 60 * 1000;
  return items.filter((item) => {
    const itemDate = new Date(item.published_at).getTime();
    if (isNaN(itemDate)) return false;
    const age = nowMs - itemDate;
    return age >= 0 && age <= windowMs;
  });
}
