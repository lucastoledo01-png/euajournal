/**
 * Publica um Reel feito à mão (27/10/2026), fora da esteira de carrossel.
 *
 *   npx tsx src/scripts/_publicar-reel-manual.ts --video <arquivo.mp4> --legenda <legenda.txt> [--valendo]
 *
 * Sobe o vídeo para o Storage público, cria o container REELS, espera a Meta
 * processar e publica. Sem `--valendo` só confere os arquivos e a legenda.
 */
import { readFileSync } from "node:fs";
import { carregarEnv } from "./artigos-comum";

async function main() {
  const args = process.argv.slice(2);
  const pega = (n: string) => args[args.indexOf(n) + 1];
  const video = pega("--video");
  const legendaArq = pega("--legenda");
  const valendo = args.includes("--valendo");
  if (!video || !legendaArq) throw new Error("--video e --legenda são obrigatórios");
  carregarEnv();

  const legenda = readFileSync(legendaArq, "utf8").trim();
  const buffer = readFileSync(video);
  console.log(`vídeo: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB\n--- legenda ---\n${legenda}\n---------------`);
  if (!valendo) return console.log("(ensaio: nada foi enviado)");

  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const { getMetaConfig, waitForContainerReady, publishContainer } = await import("../lib/server/social/instagram/meta-client");
  const client = getSupabaseAdminClient();
  const caminho = `reels/2026-10-27/pf-flavio-bolsonaro.mp4`;
  const { error } = await client.storage.from("public_videos").upload(caminho, buffer, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`upload falhou: ${error.message}`);
  const url = client.storage.from("public_videos").getPublicUrl(caminho).data.publicUrl;
  const conferido = await fetch(url, { method: "HEAD" });
  console.log(`no ar em ${url} (${conferido.status}, ${conferido.headers.get("content-type")})`);

  const { accountId, accessToken } = getMetaConfig();
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: url,
    caption: legenda,
    share_to_feed: "true",
    access_token: accessToken as string,
  });
  const r = await fetch(`https://graph.facebook.com/v22.0/${accountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!r.ok || !j.id) throw new Error(`container recusado: ${j.error?.message ?? r.status}`);
  console.log(`container ${j.id}`);

  const pronto = await waitForContainerReady(j.id, process.env, fetch, { timeoutMs: 300_000, intervalMs: 5_000 });
  if (!pronto.ok) throw new Error(`container não ficou pronto: ${pronto.error}`);
  const pub = await publishContainer(j.id);
  if (!pub.ok) throw new Error(`publicação falhou: ${pub.error}`);
  console.log(`PUBLICADO. Media ID: ${pub.mediaId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
