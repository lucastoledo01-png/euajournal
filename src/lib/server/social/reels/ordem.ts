import { casaComNicho, nomesDoTitulo } from "@/lib/server/editorial/termometro";
import type { VideoAchado } from "./tipos";

/**
 * A ordem dos vídeos achados (28/10/2026).
 *
 * Três sinais, e nenhum chama modelo: a nota da fonte (o quanto o vídeo rende
 * lá), o calor do assunto no termômetro (o ranking que o radar grava em
 * `platform_events` a cada 15 minutos) e o nicho. Fora do nicho não entra: o
 * vídeo viral de futebol rende muito e não é do eua.journal.
 *
 * O assunto casa com uma história do termômetro por NOME próprio em comum
 * (`nomesDoTitulo`), dois ou mais, ou um só quando ele aparece no título do
 * vídeo. Vetor ficaria mais fino, mas o motor Claude não chama OpenAI.
 */

export type LinhaDoRanking = { titulo: string; calor: number };

export type VideoOrdenado = VideoAchado & { nota: number; calorDoAssunto: number; historia: string | null };

export function calorDoAssunto(video: Pick<VideoAchado, "titulo" | "legenda">, ranking: LinhaDoRanking[]): { calor: number; historia: string | null } {
  const doTitulo = nomesDoTitulo(video.titulo);
  const doTexto = new Set([...doTitulo, ...nomesDoTitulo(video.legenda.slice(0, 500))]);
  let melhor: { calor: number; historia: string | null } = { calor: 0, historia: null };
  for (const linha of ranking) {
    const nomes = nomesDoTitulo(linha.titulo);
    const comuns = [...nomes].filter((n) => doTexto.has(n));
    const casa = comuns.length >= 2 || comuns.some((n) => doTitulo.has(n));
    if (casa && linha.calor > melhor.calor) melhor = { calor: linha.calor, historia: linha.titulo };
  }
  return melhor;
}

export function ordenarVideos(videos: VideoAchado[], ranking: LinhaDoRanking[]): { ordenados: VideoOrdenado[]; foraDoNicho: VideoAchado[] } {
  const foraDoNicho: VideoAchado[] = [];
  const ordenados: VideoOrdenado[] = [];
  for (const v of videos) {
    if (!casaComNicho(`${v.titulo}\n${v.legenda.slice(0, 500)}`)) {
      foraDoNicho.push(v);
      continue;
    }
    const assunto = calorDoAssunto(v, ranking);
    ordenados.push({
      ...v,
      calorDoAssunto: assunto.calor,
      historia: assunto.historia,
      nota: Math.round(0.6 * v.notaDaFonte + 0.4 * assunto.calor),
    });
  }
  ordenados.sort((a, b) => b.nota - a.nota);
  return { ordenados, foraDoNicho };
}

/**
 * As buscas do YouTube da rodada: os termos do projeto e os nomes das duas
 * histórias mais quentes do termômetro, até quatro (o teto da cota).
 */
export function consultasDoYoutube(termos: string[], ranking: LinhaDoRanking[], maximo = 4): string[] {
  const dasHistorias = [...ranking]
    .sort((a, b) => b.calor - a.calor)
    .slice(0, 2)
    .map((l) => [...nomesDoTitulo(l.titulo)].slice(0, 3).join(" "))
    .filter(Boolean);
  const vistas = new Set<string>();
  return [...dasHistorias, ...termos]
    .map((t) => t.trim())
    .filter((t) => t && !vistas.has(t.toLowerCase()) && vistas.add(t.toLowerCase()))
    .slice(0, maximo);
}
