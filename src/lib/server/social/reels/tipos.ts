import type { FonteDoReel } from "./gravar";

/** Um vídeo achado numa fonte, antes de virar linha em `reels_candidatos`. */
export type VideoAchado = {
  fonte: FonteDoReel;
  /** O id na origem: o da mídia no Instagram, o do vídeo no YouTube. */
  origemId: string;
  permalink: string;
  /** O arquivo, quando a fonte entrega (Instagram). No YouTube quem baixa é o yt-dlp, pelo permalink. */
  urlVideo: string | null;
  autor: string;
  titulo: string;
  legenda: string;
  publicadoEm: string;
  metricas: Record<string, unknown>;
  /** De 0 a 100: o quanto o vídeo rende na própria fonte. */
  notaDaFonte: number;
};
