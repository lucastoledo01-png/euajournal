/**
 * Agenda Reels feitos à mão pela fila de aprovação do projeto, para o worker da
 * VPS publicar na hora marcada. Sem o computador de quem produziu ligado.
 *
 *   npx tsx src/scripts/_agendar-reels-manual.ts --dia producao-manual/2026-10-31/reels            (ensaio)
 *   npx tsx src/scripts/_agendar-reels-manual.ts --dia producao-manual/2026-10-31/reels --valendo  (grava)
 *
 * A pasta traz `reels.json` (a manchete de cada Reel), `reel_<id>.mp4`,
 * `legenda_<id>.txt` (a legenda final, com hashtags e crédito) e `agenda.json`:
 *
 *   [{ "ordem": 1, "reel": "r6", "slug": "trump-flavio", "horaBrasilia": "08:00",
 *      "publicarEmUtc": "2026-10-31T11:00:00Z" }]
 *
 * O caminho é o do próprio projeto, o mesmo de `_agendar-posts-manual.ts`:
 *   1. sobe o vídeo para o Storage e guarda o SHA-256 dos bytes enviados;
 *   2. grava a linha de `social_posts` no formato do social-v2, em `draft`,
 *      com `content_json.formato = "reel"`;
 *   3. `enfileirar` e `aprovar` (decisor: o dono, pelo chat), que promovem a
 *      linha para `scheduled` no horário planejado. Quem publica é o worker.
 *
 * O Social Guard NÃO é rodado nestes posts. Isso fica escrito na linha
 * (`social_guard_reasons.manual`) e como aviso na fila, e não escondido.
 *
 * `post_type` vai como `reels_script`: é o valor do CHECK da tabela que mais se
 * aproxima de Reel, e evita uma migration. Quem decide o ramo do worker é
 * `content_json.formato`, nunca `post_type`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { carregarEnv } from "./artigos-comum";

type Agendamento = {
  ordem: number;
  reel: string;
  slug: string;
  horaBrasilia: string;
  publicarEmUtc: string;
};

type ReelDaPasta = { h: string; cat?: string };

const PROJETO_ID = "00000000-0000-4000-8000-000000000001";
const DECISOR = "Lucas Toledo (dono), aprovado pelo chat com o Claude";
const BUCKET_DE_VIDEO = "public_videos";
const BUCKET_DE_IMAGEM = "public_assets";
/** O bucket de vídeo limita a 10 MB; a margem evita descobrir isso no upload. */
const TETO_DO_VIDEO = 9.5 * 1024 * 1024;

const SEM_TAGS = (html: string) => html.replace(/<[^>]+>/g, "");

async function main() {
  const args = process.argv.slice(2);
  const dia = args[args.indexOf("--dia") + 1];
  const valendo = args.includes("--valendo");
  if (!dia || dia.startsWith("--")) throw new Error("--dia <pasta dos reels> é obrigatório");
  carregarEnv();

  const reels = (JSON.parse(readFileSync(path.join(dia, "reels.json"), "utf8")) as {
    reels: Record<string, ReelDaPasta>;
  }).reels;
  const agenda = (JSON.parse(readFileSync(path.join(dia, "agenda.json"), "utf8")) as Agendamento[]).sort(
    (a, b) => a.ordem - b.ordem,
  );

  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const { sha256De } = await import("../lib/server/social/artefato");
  const { hashDoPostDaLinha } = await import("../lib/server/aprovacao/hash");
  const { depsDaFila, projetoDaFila } = await import("../lib/server/aprovacao/integracao");
  const { enfileirar, aprovar } = await import("../lib/server/aprovacao/fila");

  const client = getSupabaseAdminClient();
  const { data: projetoRow, error: erroProjeto } = await client
    .from("projects")
    .select("id, timezone, settings")
    .eq("id", PROJETO_ID)
    .single();
  if (erroProjeto || !projetoRow) throw new Error(`projeto não encontrado: ${erroProjeto?.message}`);
  const projeto = projetoDaFila(projetoRow as never, PROJETO_ID);
  if (!projeto) throw new Error("projeto da fila indisponível");

  for (const item of agenda) {
    const reel = reels[item.reel];
    if (!reel) throw new Error(`reel ${item.reel} não está em reels.json`);

    const arquivo = path.join(dia, `reel_${item.reel}.mp4`);
    const arquivoLegenda = path.join(dia, `legenda_${item.reel}.txt`);
    if (!existsSync(arquivo)) throw new Error(`falta o arquivo ${arquivo}`);
    if (!existsSync(arquivoLegenda)) throw new Error(`falta o arquivo ${arquivoLegenda}`);

    const video = readFileSync(arquivo);
    if (video.byteLength > TETO_DO_VIDEO) {
      throw new Error(`${arquivo} tem ${(video.byteLength / 1024 / 1024).toFixed(1)} MB, acima do limite do bucket`);
    }
    // A legenda é a final, com hashtags e crédito já escritos: vai como está.
    const caption = readFileSync(arquivoLegenda, "utf8").trim();
    const headline = SEM_TAGS(reel.h);
    const edicao = item.publicarEmUtc.slice(0, 10);
    const storyId = `manual-reel-${edicao}-${item.slug}`;
    const chave = `social-v2-${edicao}-${storyId}`;
    const sha = sha256De(video);

    console.log(`\n=== ${item.ordem}. ${item.slug} | ${item.horaBrasilia} (publicar em ${item.publicarEmUtc})`);
    console.log(headline);
    console.log(`vídeo: ${path.basename(arquivo)} ${(video.byteLength / 1024 / 1024).toFixed(2)} MB, sha ${sha.slice(0, 12)}`);
    console.log("--- legenda ---\n" + caption + "\n---------------");

    if (!valendo) continue;

    const { data: existente } = await client
      .from("social_posts")
      .select("id, status")
      .eq("project_id", PROJETO_ID)
      .eq("idempotency_key", chave)
      .maybeSingle();
    if (existente) {
      console.log(`já existe (${existente.id}, ${existente.status}); pulando`);
      continue;
    }

    // 1. o vídeo no Storage, e a prova de que o que está no ar é o que foi aprovado
    const caminho = `reels-manuais/${edicao}/${item.slug}.mp4`;
    const { error: erroUpload } = await client.storage
      .from(BUCKET_DE_VIDEO)
      .upload(caminho, video, { contentType: "video/mp4", upsert: true });
    if (erroUpload) throw new Error(`falha ao subir ${caminho}: ${erroUpload.message}`);
    const url = client.storage.from(BUCKET_DE_VIDEO).getPublicUrl(caminho).data.publicUrl;
    const resposta = await fetch(url);
    const baixado = Buffer.from(await resposta.arrayBuffer());
    if (!resposta.ok || sha256De(baixado) !== sha) {
      throw new Error(`o arquivo em ${url} não confere com o enviado (hash divergente)`);
    }

    // 2. um quadro do vídeo, só para o painel da fila mostrar o que vai ao ar
    const pastaTemp = mkdtempSync(path.join(os.tmpdir(), "reel-poster-"));
    const poster = path.join(pastaTemp, "poster.jpg");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", arquivo, "-frames:v", "1", "-vf", "scale=540:-1", poster]);
    const caminhoPoster = `reels-manuais/${edicao}/${item.slug}-poster.jpg`;
    const { error: erroPoster } = await client.storage
      .from(BUCKET_DE_IMAGEM)
      .upload(caminhoPoster, readFileSync(poster), { contentType: "image/jpeg", upsert: true });
    if (erroPoster) throw new Error(`falha ao subir ${caminhoPoster}: ${erroPoster.message}`);
    const urlDoPoster = client.storage.from(BUCKET_DE_IMAGEM).getPublicUrl(caminhoPoster).data.publicUrl;

    const artefato = {
      index: 1,
      url,
      path: caminho,
      filename: `${item.slug}.mp4`,
      mime: "video/mp4",
      sha256: sha,
      bytes: video.byteLength,
    };

    const linha = {
      project_id: PROJETO_ID,
      edition_date: edicao,
      platform: "instagram",
      post_type: "reels_script",
      status: "draft",
      dry_run: false,
      idempotency_key: chave,
      title: headline.slice(0, 300),
      caption,
      slides_manifest: [{ ...artefato, provider_child_id: null }],
      asset_paths: [url],
      scheduled_at: item.publicarEmUtc,
      scheduled_slot: `manual-reel-${edicao}-${item.ordem}`,
      generation_version: "social-v2",
      story_id: storyId,
      origin_channel: "social",
      social_guard_status: "passed",
      social_guard_reasons: {
        finalDecision: "publicar",
        attempts: 0,
        issues: [],
        reparosAplicados: [],
        manual: true,
        observacao:
          "O Social Guard não foi rodado neste Reel. Texto, fontes e fotos foram conferidos no chat e o dono autorizou o agendamento.",
      },
      content_json: {
        format: "noticia",
        formato: "reel",
        hashtags: (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).slice(0, 5),
        origem: "feito à mão, aprovado pelo dono no chat",
        arte: { versao: "v2", artefato },
      },
    };

    const { data: inserido, error: erroInsert } = await client.from("social_posts").insert(linha).select("id").single();
    if (erroInsert || !inserido) throw new Error(`não consegui gravar o Reel ${item.slug}: ${erroInsert?.message}`);
    const id = (inserido as { id: string }).id;
    console.log(`gravado ${id} (draft)`);

    // 3. a fila: enfileira a versão exata (hash) e o dono aprova
    const deps = depsDaFila(client, projeto);
    const hash = hashDoPostDaLinha({ caption, slides_manifest: linha.slides_manifest, content_json: linha.content_json });
    const aprovacao = await enfileirar(
      projeto,
      {
        ramo: "post",
        pecaId: id,
        hash,
        publicarEm: item.publicarEmUtc,
        avisos: [
          {
            codigo: "SOCIAL_GUARD_NAO_RODADO",
            detalhe: "Reel feito à mão: o Social Guard não foi rodado. O dono conferiu e autorizou no chat.",
          },
        ],
        resumo: { titulo: headline, texto: caption, imagens: [urlDoPoster], fonteUrl: null },
      },
      deps,
    );
    if (!aprovacao) throw new Error(`a fila não registrou o Reel ${item.slug}`);
    const decisao = await aprovar(projeto, aprovacao.id, DECISOR, deps);
    console.log(
      decisao.ok
        ? `aprovado por ${DECISOR}; liberação: ${decisao.liberacao?.detalhe ?? "sem detalhe"}`
        : `NÃO aprovado: ${decisao.motivo}`,
    );
  }

  if (!valendo) console.log("\n(ensaio: nada foi gravado. Use --valendo para gravar.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
