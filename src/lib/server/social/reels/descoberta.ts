import { resolverCapacidade, type EstadoDaCapacidade, type ProjetoComCapacidades } from "@/lib/server/capacidades";
import { normalizarHandle } from "@/lib/server/social/perfis-referencia/graph";
import { horaLocal } from "@/lib/server/social/quente-da-tarde";
import { videosDoPerfil, type LeituraDeVideos } from "./instagram";
import { consultasDoYoutube, ordenarVideos, type LinhaDoRanking, type VideoOrdenado } from "./ordem";
import type { VideoAchado } from "./tipos";
import { videosDoYoutube, type LeituraDoYoutube } from "./youtube";

/**
 * A rodada de descoberta dos Reels (28/10/2026): de hora em hora, das 9h às
 * 17h, lê os perfis do Instagram e as buscas do YouTube, ordena e grava os
 * candidatos. Nada aqui baixa vídeo nem publica: o vídeo só é baixado quando
 * o Claude escolhe um (`produzir_reel`).
 */

export const EVENTO_DA_RODADA_DE_REELS = "reels_rodada";

export function modoDosReels(projeto?: ProjetoComCapacidades | null): EstadoDaCapacidade {
  return resolverCapacidade("reels", () => "off", projeto);
}

export type ConfigDosReels = {
  /** Perfis do Instagram além dos perfis de referência do projeto. */
  perfisInstagram: string[];
  termosYoutube: string[];
  inicio: string;
  fim: string;
  janelaHoras: number;
  maximoPorRodada: number;
};

const PADRAO: ConfigDosReels = {
  perfisInstagram: [],
  termosYoutube: ["notícias Estados Unidos", "Trump hoje", "Casa Branca", "Wall Street hoje"],
  inicio: "09:00",
  fim: "17:00",
  janelaHoras: 48,
  maximoPorRodada: 20,
};

function lista(v: unknown): string[] | null {
  return Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : null;
}

function horario(v: unknown, padrao: string): string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : padrao;
}

/** `settings.reels` do projeto; campo ausente ou torto vale o padrão daquele campo. */
export function configDosReels(projeto?: { settings?: Record<string, unknown> | null } | null): ConfigDosReels {
  const o = ((projeto?.settings ?? {}) as { reels?: Record<string, unknown> }).reels ?? {};
  const n = (v: unknown, padrao: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
  return {
    perfisInstagram: (lista(o.perfis_ig) ?? PADRAO.perfisInstagram).map(normalizarHandle).filter((h): h is string => Boolean(h)),
    termosYoutube: lista(o.termos_youtube) ?? PADRAO.termosYoutube,
    inicio: horario(o.inicio, PADRAO.inicio),
    fim: horario(o.fim, PADRAO.fim),
    janelaHoras: n(o.janela_horas, PADRAO.janelaHoras, 6, 96),
    maximoPorRodada: Math.floor(n(o.maximo_por_rodada, PADRAO.maximoPorRodada, 1, 50)),
  };
}

/**
 * O relógio: o cron chama de 15 em 15 minutos, e a rodada só roda na primeira
 * chamada de cada hora cheia entre o início e o fim, na hora do projeto.
 */
export function horaDaRodada(config: ConfigDosReels, agora: Date, timezone: string): { naJanela: boolean; agoraLocal: string } {
  const { hora } = horaLocal(agora, timezone);
  const [h, m] = hora.split(":").map(Number);
  const [hi] = config.inicio.split(":").map(Number);
  const [hf] = config.fim.split(":").map(Number);
  return { naJanela: h >= hi && h <= hf && m < 15, agoraLocal: hora };
}

export type DepsDaDescoberta = {
  credencialDoInstagram: () => Promise<{ accountId?: string; accessToken?: string }>;
  perfisDeReferencia: () => Promise<string[]>;
  ranking: () => Promise<LinhaDoRanking[]>;
  chaveDoYoutube: string;
  gravar: (videos: VideoOrdenado[]) => Promise<{ gravados: number; erro: string | null }>;
  fetcher?: typeof fetch;
  agoraMs?: number;
};

export type DesfechoDaDescoberta = {
  modo: EstadoDaCapacidade;
  ok: boolean;
  achados: number;
  foraDoNicho: number;
  gravados: number;
  topo: Array<{ fonte: string; autor: string; titulo: string; nota: number; historia: string | null; permalink: string }>;
  instagram: Array<Pick<LeituraDeVideos, "handle" | "status" | "mensagem"> & { videos: number }>;
  youtube: Array<Pick<LeituraDoYoutube, "consulta" | "ok" | "mensagem"> & { videos: number }>;
  avisos: string[];
};

export async function rodarDescoberta(
  projeto: ProjetoComCapacidades & { settings?: Record<string, unknown> | null },
  deps: DepsDaDescoberta,
): Promise<DesfechoDaDescoberta> {
  const modo = modoDosReels(projeto);
  const config = configDosReels(projeto);
  const avisos: string[] = [];
  const desfecho: DesfechoDaDescoberta = {
    modo, ok: true, achados: 0, foraDoNicho: 0, gravados: 0, topo: [], instagram: [], youtube: [], avisos,
  };
  if (modo === "off") return desfecho;

  const agoraMs = deps.agoraMs ?? Date.now();
  const opcoes = { agoraMs, janelaHoras: config.janelaHoras, fetcher: deps.fetcher };
  const ranking = await deps.ranking().catch((e: unknown) => (avisos.push(`termômetro ilegível: ${(e as Error).message}`), []));

  const perfis = [
    ...new Set([...(await deps.perfisDeReferencia().catch(() => [] as string[])), ...config.perfisInstagram]),
  ];
  const credencial = await deps.credencialDoInstagram().catch(() => ({}));
  const achados: VideoAchado[] = [];
  // Em série, como os perfis de referência: são poucos, e paralelo é o jeito mais rápido de bater no limite da Meta.
  for (const handle of perfis) {
    const leitura = await videosDoPerfil(handle, credencial, opcoes);
    desfecho.instagram.push({ handle, status: leitura.status, mensagem: leitura.mensagem, videos: leitura.videos.length });
    achados.push(...leitura.videos);
  }

  if (deps.chaveDoYoutube) {
    for (const consulta of consultasDoYoutube(config.termosYoutube, ranking)) {
      const leitura = await videosDoYoutube(consulta, deps.chaveDoYoutube, opcoes);
      desfecho.youtube.push({ consulta, ok: leitura.ok, mensagem: leitura.mensagem, videos: leitura.videos.length });
      achados.push(...leitura.videos);
    }
  } else {
    avisos.push("YOUTUBE_API_KEY ausente: o YouTube ficou de fora");
  }

  const unicos = [...new Map(achados.map((v) => [`${v.fonte}:${v.origemId}`, v])).values()];
  const { ordenados, foraDoNicho } = ordenarVideos(unicos, ranking);
  const escolhidos = ordenados.slice(0, config.maximoPorRodada);
  desfecho.achados = unicos.length;
  desfecho.foraDoNicho = foraDoNicho.length;
  desfecho.topo = escolhidos.slice(0, 10).map((v) => ({
    fonte: v.fonte, autor: v.autor, titulo: v.titulo.slice(0, 120), nota: v.nota, historia: v.historia, permalink: v.permalink,
  }));

  if (modo === "enforce" && escolhidos.length > 0) {
    const r = await deps.gravar(escolhidos);
    desfecho.gravados = r.gravados;
    if (r.erro) {
      desfecho.ok = false;
      avisos.push(`candidatos não gravados: ${r.erro}`);
    }
  }
  return desfecho;
}
