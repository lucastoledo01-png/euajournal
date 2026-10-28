import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { medidasDoVideo } from "./corte";
import type { FonteDoReel } from "./gravar";

/**
 * Baixar o vídeo escolhido e deixá-lo no tamanho do Reel (28/10/2026).
 *
 * Instagram: a Business Discovery entrega o arquivo (`media_url`), e o download
 * é um fetch. YouTube e link colado: o yt-dlp, que existe no contêiner do
 * worker (`Dockerfile.worker`). Arquivo local (`file://`) serve para ensaio.
 *
 * Depois, o ffmpeg corta nos primeiros `segundos` (60 por padrão): o Reel tem
 * teto de 90 s e o que segura a pessoa é o começo.
 */

export type VideoBaixado = { arquivo: string; largura: number; altura: number; segundos: number };

export async function baixarVideo(
  origem: { fonte: FonteDoReel; urlVideo: string | null; permalink: string | null },
  pasta: string,
  opcoes: { segundos?: number; fetcher?: typeof fetch } = {},
): Promise<VideoBaixado> {
  const bruto = path.join(pasta, "origem.mp4");
  const url = origem.urlVideo || origem.permalink || "";
  if (!url) throw new Error("o candidato não tem endereço de vídeo");

  if (url.startsWith("file://") || url.startsWith("/")) {
    const local = url.replace(/^file:\/\//, "");
    if (!existsSync(local)) throw new Error(`arquivo local não existe: ${local}`);
    copyFileSync(local, bruto);
  } else if (origem.fonte === "instagram" && origem.urlVideo) {
    const resposta = await (opcoes.fetcher ?? fetch)(origem.urlVideo, { signal: AbortSignal.timeout(120_000) });
    if (!resposta.ok) throw new Error(`o Instagram recusou o download do vídeo (${resposta.status}); o link expira, rode a descoberta de novo`);
    writeFileSync(bruto, Buffer.from(await resposta.arrayBuffer()));
  } else {
    /*
     * MP4 até 1080p e 200 MB. A versão do yt-dlp é a do `Dockerfile.worker`, e
     * precisa acompanhar o YouTube. O YouTube exige um interpretador de JS para
     * liberar os formatos; o node do contêiner serve (`--js-runtimes node`).
     */
    execFileSync(
      "yt-dlp",
      [
        "--no-playlist", "--no-progress", "--max-filesize", "200M",
        "--js-runtimes", "node",
        "-f", "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4][height<=1080]/b",
        "--merge-output-format", "mp4",
        "-o", path.join(pasta, "yt.%(ext)s"),
        url,
      ],
      { stdio: "pipe", timeout: 300_000 },
    );
    const baixado = readdirSync(pasta).find((f) => f.startsWith("yt."));
    if (!baixado) throw new Error("o yt-dlp terminou sem arquivo");
    copyFileSync(path.join(pasta, baixado), bruto);
  }

  const cortado = path.join(pasta, "video.mp4");
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", bruto, "-t", String(opcoes.segundos ?? 60),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", cortado,
  ]);
  return { arquivo: cortado, ...medidasDoVideo(cortado) };
}
