export type MetaAccountInfo = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

export type MetaPublishItemResult = {
  ok: boolean;
  creationId?: string;
  error?: string;
};

export type MetaPublishCarouselResult = {
  ok: boolean;
  mediaId?: string;
  error?: string;
};

/**
 * Teto de tempo de toda chamada à Graph API.
 *
 * Nenhuma das chamadas deste arquivo tinha `AbortSignal`. Um giro do worker
 * podia ficar pendurado numa resposta que a Meta nunca terminava de mandar,
 * sem nada para interromper: o contêiner não tem limite de memória nem de
 * tempo, e o cron seguinte encontrava o processo anterior ainda vivo.
 *
 * O valor é generoso de propósito. Não é para cortar chamada lenta, é para
 * impedir chamada eterna.
 */
const TEMPO_LIMITE_MS = 30_000;

function tetoDeTempo(env: Record<string, string | undefined> = process.env): number {
  const bruto = Number(env.META_TIMEOUT_MS);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : TEMPO_LIMITE_MS;
}

export function getMetaConfig(env: Record<string, string | undefined> = process.env) {
  const accountId = env.INSTAGRAM_ACCOUNT_ID?.trim();
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();

  return {
    accountId,
    accessToken,
    isConfigured: Boolean(accountId && accessToken && accountId.length > 0 && accessToken.length > 0),
  };
}

export async function verifyMetaInstagramCredentials(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ ok: boolean; account?: MetaAccountInfo; error?: string }> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de INSTAGRAM_ACCOUNT_ID ou INSTAGRAM_ACCESS_TOKEN não configuradas no ambiente." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(tetoDeTempo(env)) });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errDetail = json.error?.message || response.statusText;
      return { ok: false, error: `Meta API error (${response.status}): ${errDetail}` };
    }

    return {
      ok: true,
      account: {
        id: json.id,
        username: json.username,
        name: json.name,
        profile_picture_url: json.profile_picture_url,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function createCarouselItemContainer(
  imageUrl: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<MetaPublishItemResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}/media`;
    const params = new URLSearchParams();
    params.set("image_url", imageUrl);
    params.set("is_carousel_item", "true");
    params.set("access_token", accessToken);

    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(tetoDeTempo(env)),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return { ok: false, error: json.error?.message || `Falha ao criar item de carrossel (${response.status})` };
    }

    return { ok: true, creationId: json.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Container de imagem única — post que não é carrossel.
 *
 * Difere do item de carrossel em duas coisas que precisam andar juntas: não
 * leva `is_carousel_item`, e a legenda vai aqui, porque não haverá container
 * pai para carregá-la. Mandar `is_carousel_item=true` num post solo cria uma
 * mídia que nunca aparece no feed — fica pendurada esperando um carrossel que
 * não vem.
 *
 * Usado pelo formato `noticia`, que é capa só.
 */
export async function createSingleImageContainer(
  imageUrl: string,
  caption: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<MetaPublishItemResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}/media`;
    const params = new URLSearchParams();
    params.set("image_url", imageUrl);
    params.set("caption", caption);
    params.set("access_token", accessToken);

    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(tetoDeTempo(env)),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return {
        ok: false,
        error: json.error?.message || `Falha ao criar container de imagem única (${response.status})`,
      };
    }

    return { ok: true, creationId: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Quantos filhos um carrossel aceita na Graph API.
 *
 * Mora aqui porque é fato da API da Meta, e não decisão editorial. Quantos
 * slides um post NOSSO tem é outra pergunta, respondida pelo gerador com um
 * teto menor.
 */
export const TETO_DE_FILHOS_DO_CARROSSEL = 10;

export async function createCarouselContainer(
  childrenIds: string[],
  caption: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<MetaPublishItemResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}/media`;
    const params = new URLSearchParams();
    params.set("media_type", "CAROUSEL");
    params.set("children", childrenIds.join(","));
    params.set("caption", caption);
    params.set("access_token", accessToken);

    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(tetoDeTempo(env)),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return { ok: false, error: json.error?.message || `Falha ao criar container de carrossel (${response.status})` };
    }

    return { ok: true, creationId: json.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Container de Reel: a Meta baixa o MP4 de `video_url` e processa em segundo
 * plano, então quem chama precisa esperar mais que na imagem antes de publicar.
 */
export async function createReelContainer(
  videoUrl: string,
  caption: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<MetaPublishItemResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const params = new URLSearchParams();
    params.set("media_type", "REELS");
    params.set("video_url", videoUrl);
    params.set("caption", caption);
    params.set("share_to_feed", "true");
    params.set("access_token", accessToken);

    const response = await fetcher(`https://graph.facebook.com/v22.0/${accountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(tetoDeTempo(env)),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return {
        ok: false,
        error: json.error?.message || `Falha ao criar container de Reel (${response.status})`,
      };
    }

    return { ok: true, creationId: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Aguarda o container terminar de ser processado antes da publicacao.
 *
 * A Graph API processa midia de forma assincrona. O codigo publicava logo apos
 * criar o container, o que produz falha intermitente sem causa aparente quando
 * a Meta ainda nao terminou de baixar e validar as imagens.
 */
export async function waitForContainerReady(
  creationId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<{ ok: boolean; error?: string }> {
  const { accessToken, isConfigured } = getMetaConfig(env);
  if (!isConfigured || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const limite = Date.now() + timeoutMs;

  while (Date.now() < limite) {
    const url = `https://graph.facebook.com/v22.0/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(tetoDeTempo(env)) });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: json.error?.message || `Falha ao consultar container (${response.status})` };
    }

    switch (json.status_code) {
      case "FINISHED":
        return { ok: true };
      case "ERROR":
        return { ok: false, error: json.status || "A Meta rejeitou a mídia do container." };
      case "EXPIRED":
        return { ok: false, error: "O container expirou antes da publicação." };
      default:
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return { ok: false, error: `Container não ficou pronto em ${Math.round(timeoutMs / 1000)}s.` };
}

/**
 * O estado bruto do container, incluindo `PUBLISHED`.
 *
 * `waitForContainerReady` existe para decidir se dá para publicar, e por isso
 * trata `PUBLISHED` como "ainda não é FINISHED" e continua o polling até
 * estourar. Esta função existe para a pergunta oposta, feita depois de uma
 * falha: aquele container que eu mandei publicar chegou a ir ao ar?
 *
 * É a única evidência remota disponível de que a publicação aconteceu quando a
 * gravação local não aconteceu. Sem ela, a única saída é republicar no escuro.
 */
export async function statusDoContainer(
  creationId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const { accessToken, isConfigured } = getMetaConfig(env);
  if (!isConfigured || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(tetoDeTempo(env)) });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: json.error?.message || `Falha ao consultar container (${response.status})` };
    }

    return { ok: true, status: String(json.status_code ?? "") };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}

/**
 * As últimas mídias publicadas na conta, com legenda e horário.
 *
 * Serve à reconciliação: quando o container já foi publicado mas o banco não
 * registrou o `media_id`, é aqui que ele é recuperado, casando pela legenda.
 * Recuperar o id importa mais do que parece: sem ele o post fica publicado no
 * Instagram e órfão no banco, sem insights e sem automação de Direct.
 */
export async function midiasRecentes(
  limite = 10,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; midias: Array<{ id: string; caption: string; timestamp: string }>; error?: string }> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);
  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, midias: [], error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url =
      `https://graph.facebook.com/v22.0/${accountId}/media?fields=id,caption,timestamp&limit=${limite}` +
      `&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(tetoDeTempo(env)) });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, midias: [], error: json.error?.message || `Falha ao listar mídias (${response.status})` };
    }

    const midias = (json.data ?? []).map((m: Record<string, unknown>) => ({
      id: String(m.id ?? ""),
      caption: String(m.caption ?? ""),
      timestamp: String(m.timestamp ?? ""),
    }));

    return { ok: true, midias };
  } catch (err) {
    return { ok: false, midias: [], error: (err as Error)?.message || String(err) };
  }
}

export async function publishContainer(
  creationId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<MetaPublishCarouselResult> {
  const { accountId, accessToken, isConfigured } = getMetaConfig(env);

  if (!isConfigured || !accountId || !accessToken) {
    return { ok: false, error: "Credenciais de Meta Instagram não configuradas." };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${accountId}/media_publish`;
    const params = new URLSearchParams();
    params.set("creation_id", creationId);
    params.set("access_token", accessToken);

    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(tetoDeTempo(env)),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || !json.id) {
      return { ok: false, error: json.error?.message || `Falha ao publicar container no Instagram (${response.status})` };
    }

    return { ok: true, mediaId: json.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export type MetaMediaInsights = {
  reach: number;
  saved: number;
  shares: number;
  comments: number;
  likes: number;
};

const METRICAS = ["reach", "saved", "shares", "comments", "likes"] as const;

/**
 * Insights de uma mídia publicada — alcance, salvamentos, compartilhamentos.
 *
 * A Meta recusa a chamada inteira quando **uma** das métricas pedidas não se
 * aplica àquele tipo de mídia, e o conjunto disponível muda entre imagem
 * única, carrossel e reels — além de mudar de versão para versão da API. Por
 * isso o fallback pede só `reach`: perder o detalhe é aceitável, perder o
 * alcance inviabiliza a pontuação do loop editorial, que é o que decide a
 * próxima pauta.
 *
 * Nunca lança: um relatório com número faltando é melhor que um cron que
 * morre no meio e deixa metade das campanhas sem retrato do dia.
 */
export async function fetchMediaInsights(
  mediaId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<MetaMediaInsights> {
  const vazio: MetaMediaInsights = { reach: 0, saved: 0, shares: 0, comments: 0, likes: 0 };
  const { accessToken, isConfigured } = getMetaConfig(env);
  if (!isConfigured || !accessToken || !mediaId) return vazio;

  async function pedir(metricas: readonly string[]): Promise<Record<string, number> | null> {
    try {
      const url =
        `https://graph.facebook.com/v22.0/${mediaId}/insights` +
        `?metric=${metricas.join(",")}&access_token=${encodeURIComponent(accessToken!)}`;

      const res = await fetcher(url, { signal: AbortSignal.timeout(tetoDeTempo(env)) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(json?.data)) return null;

      const out: Record<string, number> = {};
      for (const item of json.data) {
        const nome = String(item?.name ?? "");
        const valor = Number(item?.values?.[0]?.value ?? 0);
        if (nome) out[nome] = Number.isFinite(valor) ? valor : 0;
      }
      return out;
    } catch {
      return null;
    }
  }

  const lidos = (await pedir(METRICAS)) ?? (await pedir(["reach"]));
  if (!lidos) {
    console.warn(`[META INSIGHTS] Não foi possível ler insights da mídia ${mediaId}.`);
    return vazio;
  }

  return {
    reach: lidos.reach ?? 0,
    saved: lidos.saved ?? 0,
    shares: lidos.shares ?? 0,
    comments: lidos.comments ?? 0,
    likes: lidos.likes ?? 0,
  };
}
