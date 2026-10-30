/**
 * Publica uma imagem estática (feed) feita à mão no Instagram, num horário marcado.
 *
 *   npx tsx src/scripts/_publicar-imagem-manual.ts --imagem post.png --legenda post.txt --nome imposto-tcu --quando 2026-10-29T21:00:00Z
 *
 * Igual ao _publicar-reel-manual.ts: sobe para o Storage público (public_assets),
 * espera até `--quando` (o computador e este processo precisam ficar abertos),
 * cria o container IMAGE e publica.
 */
import { readFileSync } from "node:fs";
import { carregarEnv } from "./artigos-comum";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const imagem = arg("imagem");
  const legendaPath = arg("legenda");
  const nome = arg("nome");
  const quando = arg("quando");
  if (!imagem || !legendaPath || !nome) throw new Error("--imagem, --legenda e --nome são obrigatórios");
  carregarEnv();

  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const { getMetaConfig, waitForContainerReady, publishContainer } = await import(
    "../lib/server/social/instagram/meta-client"
  );
  const { accountId, accessToken, isConfigured } = getMetaConfig();
  if (!isConfigured || !accountId || !accessToken) throw new Error("credenciais do Instagram ausentes");

  const legenda = readFileSync(legendaPath, "utf8").trim();
  const buffer = readFileSync(imagem);
  const caminho = `posts-manuais/${nome}.png`;
  const client = getSupabaseAdminClient();
  const { error } = await client.storage.from("public_assets").upload(caminho, buffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload falhou: ${error.message}`);
  const url = client.storage.from("public_assets").getPublicUrl(caminho).data.publicUrl;
  const conferido = await fetch(url);
  if (!conferido.ok || (await conferido.arrayBuffer()).byteLength !== buffer.byteLength) throw new Error("arquivo no Storage não confere");
  console.log("no ar no Storage:", url);

  if (quando) {
    const falta = Date.parse(quando) - Date.now();
    console.log(`esperando até ${quando} (${Math.round(falta / 60000)} min)`);
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  }

  const params = new URLSearchParams({ image_url: url, caption: legenda, access_token: accessToken });
  const r = await fetch(`https://graph.facebook.com/v22.0/${accountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!r.ok || !j.id) throw new Error(`container recusado: ${j.error?.message ?? r.status}`);
  console.log("container", j.id);
  const pronto = await waitForContainerReady(j.id, process.env, fetch, { timeoutMs: 300_000, intervalMs: 5_000 });
  if (!pronto.ok) throw new Error(`container não ficou pronto: ${pronto.error}`);
  const pub = await publishContainer(j.id);
  if (!pub.ok) throw new Error(`publicação falhou: ${pub.error}`);
  console.log("PUBLICADO", nome, pub.mediaId);
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
