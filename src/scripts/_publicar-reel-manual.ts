/**
 * Publica um Reel feito à mão no Instagram, agora ou num horário marcado.
 *
 *   npx tsx src/scripts/_publicar-reel-manual.ts --video a.mp4 --legenda a.txt --nome flavio-chegou
 *   npx tsx src/scripts/_publicar-reel-manual.ts --video b.mp4 --legenda b.txt --nome ponto-de-vista --quando 2026-10-28T22:00:00Z
 *
 * Reel não passa pela fila de carrosséis. O arquivo sobe para o Storage
 * público, e o container REELS só é criado na hora de publicar (a Meta não
 * agenda Reel). Com `--quando`, o processo espera até lá: o computador precisa
 * ficar ligado e este processo, aberto.
 */
import { readFileSync } from "node:fs";
import { carregarEnv } from "./artigos-comum";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const video = arg("video");
  const legendaPath = arg("legenda");
  const nome = arg("nome");
  const quando = arg("quando");
  if (!video || !legendaPath || !nome) throw new Error("--video, --legenda e --nome são obrigatórios");
  carregarEnv();

  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const { getMetaConfig, waitForContainerReady, publishContainer } = await import(
    "../lib/server/social/instagram/meta-client"
  );
  const { accountId, accessToken, isConfigured } = getMetaConfig();
  if (!isConfigured || !accountId || !accessToken) throw new Error("credenciais do Instagram ausentes");

  const legenda = readFileSync(legendaPath, "utf8").trim();
  const buffer = readFileSync(video);
  const caminho = `reels-manuais/${nome}.mp4`;
  const client = getSupabaseAdminClient();
  const { error } = await client.storage.from("public_videos").upload(caminho, buffer, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`upload falhou: ${error.message}`);
  const url = client.storage.from("public_videos").getPublicUrl(caminho).data.publicUrl;
  const conferido = await fetch(url);
  if (!conferido.ok || (await conferido.arrayBuffer()).byteLength !== buffer.byteLength) throw new Error("arquivo no Storage não confere");
  console.log("no ar no Storage:", url);

  if (quando) {
    const falta = Date.parse(quando) - Date.now();
    console.log(`esperando até ${quando} (${Math.round(falta / 60000)} min)`);
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  }

  const params = new URLSearchParams({ media_type: "REELS", video_url: url, caption: legenda, share_to_feed: "true", access_token: accessToken });
  const r = await fetch(`https://graph.facebook.com/v22.0/${accountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!r.ok || !j.id) throw new Error(`container recusado: ${j.error?.message ?? r.status}`);
  console.log("container", j.id);
  const pronto = await waitForContainerReady(j.id, process.env, fetch, { timeoutMs: 600_000, intervalMs: 5_000 });
  if (!pronto.ok) throw new Error(`container não ficou pronto: ${pronto.error}`);
  const pub = await publishContainer(j.id);
  if (!pub.ok) throw new Error(`publicação falhou: ${pub.error}`);
  console.log("PUBLICADO", nome, pub.mediaId);
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
