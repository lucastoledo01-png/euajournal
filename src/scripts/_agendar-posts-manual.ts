/**
 * Agenda os posts feitos à mão (27/10/2026) pela fila de aprovação do projeto.
 *
 *   npx tsx src/scripts/_agendar-posts-manual.ts --dia producao-manual/2026-10-27            (ensaio)
 *   npx tsx src/scripts/_agendar-posts-manual.ts --dia producao-manual/2026-10-27 --valendo  (grava)
 *
 * O caminho é o do próprio projeto, sem atalho no banco além da linha do post:
 *   1. sobe cada slide para o Storage e guarda o SHA-256 dos bytes enviados;
 *   2. grava a linha de `social_posts` no formato do social-v2, em `draft`;
 *   3. `enfileirar` e `aprovar` (decisor: o dono, pelo chat), que promovem a
 *      linha para `scheduled` no horário planejado e deixam o worker publicar.
 *
 * O Social Guard NÃO foi rodado nestes posts. Isso fica escrito na linha
 * (`social_guard_reasons.manual`) e como aviso na fila, e não escondido.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { carregarEnv } from "./artigos-comum";

type Foto = { arquivo: string; autor: string; licenca: string; pagina: string };
type PostDaArte = {
  id: string;
  eixo: string;
  headline: string;
  destaque: string;
  capa: Foto;
  bolhaDaCapa?: { foto: Foto };
  slides: Array<{ foto: Foto; bolha?: { foto: Foto } }>;
};
type Agendamento = {
  ordem: number;
  slug: string;
  post: string;
  horaBrasilia: string;
  publicarEmUtc: string;
  corpo: string;
  hashtags: string[];
};

const PROJETO_ID = "00000000-0000-4000-8000-000000000001";
const DECISOR = "Lucas Toledo (dono), aprovado pelo chat com o Claude em 27/10/2026";
const NOMES_DE_CONTA: Record<string, string> = {
  "Lula Oficial": "Lula Oficial",
  "Agência Senado": "Agência Senado",
  "Banco Central do Brasil": "Banco Central",
  "Casa Branca": "Casa Branca",
  "Departamento de Estado": "Departamento de Estado",
};

/** Só o primeiro nome de quem fez a foto; contas e instituições ficam na forma curta. */
function nomeCurto(autor: string): string {
  if (NOMES_DE_CONTA[autor]) return NOMES_DE_CONTA[autor];
  const antesDaBarra = autor.split("/")[0].trim();
  return antesDaBarra.split(/\s+/)[0];
}

function linhaDeCredito(fotos: Foto[]): string {
  const nomes = [...new Set(fotos.map((f) => nomeCurto(f.autor)))];
  if (nomes.length === 1) return `Foto: ${nomes[0]}`;
  if (nomes.length <= 3) return `Fotos: ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `Fotos: ${nomes.slice(0, 3).join(", ")} e outros`;
}

function urlDoArquivo(pagina: string): string {
  const nome = decodeURIComponent(pagina.split("File:")[1] ?? "");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(nome)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dia = args[args.indexOf("--dia") + 1];
  const valendo = args.includes("--valendo");
  if (!dia) throw new Error("--dia <pasta> é obrigatório");
  carregarEnv();

  const posts = JSON.parse(readFileSync(path.join(dia, "posts.json"), "utf8")) as PostDaArte[];
  const agenda = (JSON.parse(readFileSync(path.join(dia, "agenda.json"), "utf8")) as Agendamento[]).sort(
    (a, b) => a.ordem - b.ordem,
  );

  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const { sha256De, LIMITE_INTERNO_DE_BYTES } = await import("../lib/server/social/artefato");
  const { legendaDoInstagram } = await import("../lib/server/social/legenda-final");
  const { varianteDaCapa } = await import("../lib/server/social/arte");
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

  const edicao = "2026-10-27";

  for (const item of agenda) {
    const post = posts.find((p) => p.id === item.post);
    if (!post) throw new Error(`post ${item.post} não está em posts.json`);

    const todasAsFotos: Foto[] = [
      post.capa,
      ...(post.bolhaDaCapa ? [post.bolhaDaCapa.foto] : []),
      ...post.slides.flatMap((s) => [s.foto, ...(s.bolha ? [s.bolha.foto] : [])]),
    ];
    const credito = linhaDeCredito(todasAsFotos);

    const texto = `${item.corpo}\n\n${item.hashtags.join(" ")}`;
    const caption = legendaDoInstagram(texto, { hashtags: "manter", credito });

    const pastaArtes = path.join(dia, "artes", item.post);
    const arquivos = [1, 2, 3, 4].map((n) => {
      const png = path.join(pastaArtes, `slide-${n}.png`);
      const jpg = path.join(pastaArtes, `slide-${n}.jpg`);
      if (!existsSync(png)) throw new Error(`falta o arquivo ${png}`);
      // Acima do limite interno o PNG não publica; vale o JPEG do mesmo desenho.
      return readFileSync(png).byteLength > LIMITE_INTERNO_DE_BYTES && existsSync(jpg) ? jpg : png;
    });

    const storyId = `manual-${edicao}-${item.slug}`;
    const chave = `social-v2-${edicao}-${storyId}`;
    console.log(`\n=== ${item.ordem}. ${item.slug} | ${item.horaBrasilia} (publicar em ${item.publicarEmUtc})`);
    console.log(post.headline);
    console.log("--- legenda ---\n" + caption + "\n---------------");

    const artefatosPreparados = arquivos.map((a, i) => {
      const buffer = readFileSync(a);
      if (buffer.byteLength > LIMITE_INTERNO_DE_BYTES) {
        throw new Error(`${a} tem ${buffer.byteLength} bytes, acima do limite interno`);
      }
      const n = String(i + 1).padStart(2, "0");
      const ext = a.endsWith(".jpg") ? "jpg" : "png";
      const mime = ext === "jpg" ? "image/jpeg" : "image/png";
      return { index: i + 1, buffer, mime, sha256: sha256De(buffer), bytes: buffer.byteLength, filename: `social-v2-${n}.${ext}`, path: `desbuguei/${edicao}/social-v2-manual-${item.slug}/social-v2-${n}.${ext}` };
    });
    console.log(`slides: ${artefatosPreparados.map((a) => `${a.filename} ${(a.bytes / 1024 / 1024).toFixed(2)}MB`).join(" | ")}`);

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

    const artefatos: Array<Record<string, unknown>> = [];
    for (const a of artefatosPreparados) {
      // Sobe com o tipo certo: o helper do projeto fixa image/png, o que erraria o JPEG.
      const { error: erroUpload } = await client.storage
        .from("public_assets")
        .upload(a.path, a.buffer, { contentType: a.mime, upsert: true });
      if (erroUpload) throw new Error(`falha ao subir ${a.path}: ${erroUpload.message}`);
      const url = client.storage.from("public_assets").getPublicUrl(a.path).data.publicUrl;
      // Confere que o que está no ar no Storage é o arquivo aprovado.
      const resposta = await fetch(url);
      const baixado = Buffer.from(await resposta.arrayBuffer());
      if (!resposta.ok || sha256De(baixado) !== a.sha256) {
        throw new Error(`o arquivo em ${url} não confere com o enviado (hash divergente)`);
      }
      artefatos.push({
        index: a.index,
        url,
        path: a.path,
        filename: a.filename,
        mime: a.mime,
        sha256: a.sha256,
        bytes: a.bytes,
        largura: 2160,
        altura: 2880,
        otimizado: a.mime === "image/jpeg",
      });
    }

    const capaFoto = post.capa;
    const copy = {
      headline: post.headline,
      destaque: post.destaque,
      gancho: item.corpo.split(".")[0] + ".",
      fato_principal: "",
      contexto: "",
      informacao_util: "",
      ressalva: "",
      cta: "",
      hashtags: item.hashtags,
      paragrafos: item.corpo.split("\n\n"),
    };

    const linha = {
      project_id: PROJETO_ID,
      edition_date: edicao,
      platform: "instagram",
      post_type: "carousel",
      status: "draft",
      dry_run: false,
      idempotency_key: chave,
      title: post.headline.slice(0, 300),
      caption,
      slides_manifest: artefatos.map((a) => ({
        index: a.index,
        url: a.url,
        filename: a.filename,
        sha256: a.sha256,
        bytes: a.bytes,
        provider_child_id: null,
      })),
      asset_paths: artefatos.map((a) => a.url),
      scheduled_at: item.publicarEmUtc,
      scheduled_slot: `manual-${edicao}-${item.ordem}`,
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
          "O Social Guard não foi rodado neste post. Texto, números, fontes e fotos foram conferidos no chat em 27/10/2026 e o dono autorizou o agendamento.",
      },
      content_json: {
        format: "noticia",
        formato: "carousel",
        copy,
        hashtags: item.hashtags,
        origem: "feito à mão, aprovado pelo dono no chat",
        arte: {
          versao: "v2",
          variante: varianteDaCapa(true, "jornal"),
          gramatica: "jornal",
          eixo: post.eixo,
          chapeu: post.eixo === "imigracao" ? "IMIGRAÇÃO" : "ECONOMIA",
          artefato: artefatos[0],
          artefatos,
          bolha: Boolean(post.bolhaDaCapa),
        },
        visual: {
          source: "wikimedia_commons",
          sourceAssetId: decodeURIComponent(capaFoto.pagina.split("File:")[1] ?? ""),
          sourcePageUrl: capaFoto.pagina,
          author: capaFoto.autor,
          license: capaFoto.licenca,
          attribution: `Foto: ${nomeCurto(capaFoto.autor)}`,
          atribuicaoImpressa: false,
          creditoNaLegenda: credito,
          creditosDasFotos: [...new Set(todasAsFotos.map((f) => `Foto: ${nomeCurto(f.autor)}`))],
          rightsStatement: capaFoto.licenca,
          rightsStatus: "verified",
          imageUrl: urlDoArquivo(capaFoto.pagina),
          imageContextType: "manual",
        },
      },
    };

    const { data: inserido, error: erroInsert } = await client.from("social_posts").insert(linha).select("id").single();
    if (erroInsert || !inserido) throw new Error(`não consegui gravar o post ${item.slug}: ${erroInsert?.message}`);
    const id = (inserido as { id: string }).id;
    console.log(`gravado ${id} (draft)`);

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
            detalhe: "Post feito à mão: o Social Guard não foi rodado. O dono conferiu e autorizou no chat.",
          },
        ],
        resumo: {
          titulo: post.headline,
          texto: caption,
          imagens: artefatos.map((a) => a.url as string),
          fonteUrl: null,
        },
      },
      deps,
    );
    if (!aprovacao) throw new Error(`a fila não registrou o post ${item.slug}`);
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
