import { classificarErroDaGraph, type StatusDaLeitura } from "@/lib/server/social/perfis-referencia/graph";
import { mediana } from "@/lib/server/social/perfis-referencia/engajamento";
import type { VideoAchado } from "./tipos";

/**
 * Os vídeos que estão rendendo nos perfis do Instagram (28/10/2026).
 *
 * É a mesma Business Discovery dos perfis de referência, num caminho próprio:
 * aqueles foram desenhados para ler o ASSUNTO (sinal, não fonte) e não pedem
 * `media_url`. Aqui a fonte é o próprio vídeo, que vai ser baixado e
 * recortado, e o dono sabe do risco de direito de uso (decisão de 28/10/2026).
 *
 * A nota é o engajamento por hora do vídeo contra a mediana do perfil, para
 * um perfil grande não ganhar sempre só por ser grande.
 */

const GRAPH = "https://graph.facebook.com/v22.0";
const TIPOS_DE_VIDEO = new Set(["VIDEO", "REELS"]);

export type LeituraDeVideos = {
  handle: string;
  status: StatusDaLeitura;
  mensagem: string | null;
  videos: VideoAchado[];
};

type Midia = {
  id?: unknown;
  caption?: unknown;
  like_count?: unknown;
  comments_count?: unknown;
  timestamp?: unknown;
  media_type?: unknown;
  media_product_type?: unknown;
  media_url?: unknown;
  permalink?: unknown;
};

function horasDesde(iso: string, agoraMs: number): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0.5, (agoraMs - t) / 3_600_000) : null;
}

/** Pura: dos itens da Graph aos vídeos com nota. Exportada para o teste. */
export function videosDaMidia(
  handle: string,
  midia: Midia[],
  opcoes: { agoraMs: number; janelaHoras: number },
): VideoAchado[] {
  const porHora = (m: Midia, horas: number) =>
    ((typeof m.like_count === "number" ? m.like_count : 0) + 3 * (typeof m.comments_count === "number" ? m.comments_count : 0)) / horas;

  const todos = midia
    .map((m) => ({ m, horas: horasDesde(String(m.timestamp ?? ""), opcoes.agoraMs) }))
    .filter((x): x is { m: Midia; horas: number } => x.horas !== null);
  const base = mediana(todos.map((x) => porHora(x.m, x.horas))) || 1;

  return todos
    .filter(({ m, horas }) => {
      const tipo = String(m.media_type ?? "");
      return (TIPOS_DE_VIDEO.has(tipo) || m.media_product_type === "REELS") && horas <= opcoes.janelaHoras;
    })
    // Sem `media_url` não há o que baixar: a Meta omite o campo em vídeo com música licenciada.
    .filter(({ m }) => typeof m.media_url === "string" && m.media_url)
    .map(({ m, horas }) => ({
      fonte: "instagram" as const,
      origemId: String(m.id),
      permalink: String(m.permalink ?? ""),
      urlVideo: String(m.media_url),
      autor: handle,
      titulo: String(m.caption ?? "").split("\n")[0].slice(0, 200),
      legenda: String(m.caption ?? "").slice(0, 2000),
      publicadoEm: String(m.timestamp ?? ""),
      metricas: {
        curtidas: typeof m.like_count === "number" ? m.like_count : null,
        comentarios: typeof m.comments_count === "number" ? m.comments_count : 0,
        horas: Math.round(horas * 10) / 10,
        porHora: Math.round(porHora(m, horas)),
        medianaDoPerfil: Math.round(base),
      },
      notaDaFonte: Math.round(Math.min(100, (porHora(m, horas) / base) * 25)),
    }));
}

export async function videosDoPerfil(
  handle: string,
  credencial: { accountId?: string; accessToken?: string },
  opcoes: { agoraMs?: number; janelaHoras?: number; fetcher?: typeof fetch } = {},
): Promise<LeituraDeVideos> {
  const accountId = credencial.accountId?.trim() ?? "";
  const token = credencial.accessToken?.trim() ?? "";
  if (!accountId || !token) return { handle, status: "sem_credencial", mensagem: "conta ou token do Instagram ausentes", videos: [] };

  const campos =
    `business_discovery.username(${handle})` +
    `{media.limit(30){id,caption,like_count,comments_count,timestamp,media_type,media_product_type,media_url,permalink}}`;
  const url = `${GRAPH}/${encodeURIComponent(accountId)}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(token)}`;

  try {
    const resposta = await (opcoes.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(15_000) });
    const json = (await resposta.json().catch(() => ({}))) as { error?: Record<string, unknown>; business_discovery?: { media?: { data?: Midia[] } } };
    if (!resposta.ok || json.error) {
      const mensagem = String(json.error?.message ?? resposta.statusText).split(token).join("[redigido]").slice(0, 300);
      return { handle, status: classificarErroDaGraph(resposta.status, json.error), mensagem, videos: [] };
    }
    const videos = videosDaMidia(handle, json.business_discovery?.media?.data ?? [], {
      agoraMs: opcoes.agoraMs ?? Date.now(),
      janelaHoras: opcoes.janelaHoras ?? 48,
    });
    return { handle, status: "ok", mensagem: null, videos };
  } catch (e) {
    return { handle, status: "erro", mensagem: String((e as Error)?.message ?? e).split(token).join("[redigido]"), videos: [] };
  }
}
