import type { VideoAchado } from "./tipos";

/**
 * Os vídeos curtos que estão rendendo no YouTube (28/10/2026), pela Data API
 * v3 com `YOUTUBE_API_KEY`.
 *
 * Custo da cota, que é de 10.000 unidades por dia: `search.list` custa 100 e
 * `videos.list` custa 1. Quatro buscas por rodada, nove rodadas por dia (9h às
 * 17h), dão cerca de 3.700. Quem baixa o arquivo é o yt-dlp no worker, pelo
 * permalink: a API não entrega o vídeo.
 */

const API = "https://www.googleapis.com/youtube/v3";

export type LeituraDoYoutube = { consulta: string; ok: boolean; mensagem: string | null; videos: VideoAchado[] };

/**
 * Português, e não humor (28/10/2026, primeira rodada real): a busca com
 * `relevanceLanguage=pt` ainda trouxe vídeo em espanhol, pegadinha feita com IA
 * e palavrão. O idioma vem do áudio declarado pelo canal; sem declaração, do
 * título, pelas marcas que só o português tem.
 */
const MARCAS_DO_PORTUGUES = /(ção|ções|ões|ã|õ|\b(não|você|são|está|também|após|até)\b)/i;
const NAO_E_NOTICIA = /(#ai\b|#ia\b|prank|pegadinha|com[eé]dia|comedy|humor|meme|par[oó]dia|parody|funny|engra[cç]ad|\*\*|#fun)/i;

export function serveParaOReel(v: { titulo: string; legenda: string; idioma: string | null }): boolean {
  if (NAO_E_NOTICIA.test(`${v.titulo} ${v.legenda.slice(0, 300)}`)) return false;
  if (v.idioma) return v.idioma.toLowerCase().startsWith("pt");
  return MARCAS_DO_PORTUGUES.test(v.titulo);
}

/** "PT1M5S" em segundos. */
export function segundosDaDuracao(iso: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** De 0 a 100 pelas visualizações por hora: 10 mil por hora vale 80. */
export function notaPorVisualizacoes(views: number, horas: number): number {
  const porHora = views / Math.max(0.5, horas);
  return Math.round(Math.min(100, 20 * Math.log10(porHora + 1)));
}

function redigir(texto: string, chave: string): string {
  return chave ? texto.split(chave).join("[redigido]") : texto;
}

export async function videosDoYoutube(
  consulta: string,
  chave: string,
  opcoes: { agoraMs?: number; janelaHoras?: number; fetcher?: typeof fetch; duracaoMaxima?: number } = {},
): Promise<LeituraDoYoutube> {
  if (!chave) return { consulta, ok: false, mensagem: "YOUTUBE_API_KEY ausente", videos: [] };
  const fetcher = opcoes.fetcher ?? fetch;
  const agoraMs = opcoes.agoraMs ?? Date.now();
  const janela = opcoes.janelaHoras ?? 48;

  const busca = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: consulta,
    regionCode: "BR",
    relevanceLanguage: "pt",
    videoDuration: "short",
    order: "viewCount",
    maxResults: "25",
    publishedAfter: new Date(agoraMs - janela * 3_600_000).toISOString(),
    key: chave,
  });

  try {
    const r1 = await fetcher(`${API}/search?${busca}`, { signal: AbortSignal.timeout(15_000) });
    const j1 = (await r1.json().catch(() => ({}))) as { error?: { message?: string }; items?: Array<{ id?: { videoId?: string } }> };
    if (!r1.ok || j1.error) return { consulta, ok: false, mensagem: redigir(String(j1.error?.message ?? r1.status), chave), videos: [] };
    const ids = (j1.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => Boolean(x));
    if (ids.length === 0) return { consulta, ok: true, mensagem: null, videos: [] };

    const detalhe = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.join(","), key: chave });
    const r2 = await fetcher(`${API}/videos?${detalhe}`, { signal: AbortSignal.timeout(15_000) });
    const j2 = (await r2.json().catch(() => ({}))) as {
      error?: { message?: string };
      items?: Array<{
        id: string;
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
          publishedAt?: string;
          defaultAudioLanguage?: string;
          defaultLanguage?: string;
        };
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
        contentDetails?: { duration?: string };
      }>;
    };
    if (!r2.ok || j2.error) return { consulta, ok: false, mensagem: redigir(String(j2.error?.message ?? r2.status), chave), videos: [] };

    const videos = (j2.items ?? [])
      .map((v) => {
        const publicado = v.snippet?.publishedAt ?? "";
        const horas = Math.max(0.5, (agoraMs - Date.parse(publicado)) / 3_600_000);
        const views = Number(v.statistics?.viewCount ?? 0);
        const segundos = segundosDaDuracao(v.contentDetails?.duration ?? "");
        return { v, publicado, horas, views, segundos };
      })
      .filter((x) => Number.isFinite(x.horas) && (x.segundos === null || x.segundos <= (opcoes.duracaoMaxima ?? 180)))
      .filter(({ v }) =>
        serveParaOReel({
          titulo: v.snippet?.title ?? "",
          legenda: v.snippet?.description ?? "",
          idioma: v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage ?? null,
        }),
      )
      .map(({ v, publicado, horas, views, segundos }) => ({
        fonte: "youtube" as const,
        origemId: v.id,
        permalink: `https://www.youtube.com/watch?v=${v.id}`,
        urlVideo: null,
        autor: v.snippet?.channelTitle ?? "",
        titulo: (v.snippet?.title ?? "").slice(0, 200),
        legenda: (v.snippet?.description ?? "").slice(0, 2000),
        publicadoEm: publicado,
        metricas: {
          visualizacoes: views,
          curtidas: Number(v.statistics?.likeCount ?? 0),
          comentarios: Number(v.statistics?.commentCount ?? 0),
          segundos,
          horas: Math.round(horas * 10) / 10,
          consulta,
        },
        notaDaFonte: notaPorVisualizacoes(views, horas),
      }));
    return { consulta, ok: true, mensagem: null, videos };
  } catch (e) {
    return { consulta, ok: false, mensagem: redigir(String((e as Error)?.message ?? e), chave), videos: [] };
  }
}
