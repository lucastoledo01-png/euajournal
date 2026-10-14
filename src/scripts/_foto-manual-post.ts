/**
 * Piloto da produção à mão (14/10/2026): troca a foto de UM post que está na
 * fila por uma foto escolhida e conferida à mão, e refaz a arte.
 *
 *   npx tsx src/scripts/_foto-manual-post.ts --aprovacao <id> --arquivo <foto.json>            (ensaio)
 *   npx tsx src/scripts/_foto-manual-post.ts --aprovacao <id> --arquivo <foto.json> --aplicar
 *
 * Usa os MESMOS ganchos de imagem e arte da fila (`criarGanchosDeProducao`),
 * trocando só o resolvedor pela foto do arquivo. A peça volta a "aguardando"
 * com o hash novo.
 */
import { readFileSync } from "node:fs";
import { carregarEnv, clienteDoBanco } from "./artigos-comum";

type Foto = {
  imageUrl: string;
  sourcePageUrl: string;
  sourceAssetId: string;
  author: string;
  license: string;
  licenseUrl: string;
  width: number;
  height: number;
  entidade: string;
  tipo: "Person" | "Organization" | "Place";
  motivo: string;
};

async function main() {
  const args = process.argv.slice(2);
  const apId = args[args.indexOf("--aprovacao") + 1];
  const arquivo = args[args.indexOf("--arquivo") + 1];
  const aplicar = args.includes("--aplicar");
  if (!apId || !arquivo) throw new Error("--aprovacao <id> --arquivo <foto.json>");
  carregarEnv();
  const f = JSON.parse(readFileSync(arquivo, "utf8")) as Foto;

  const db = clienteDoBanco();
  const { requireActiveProject } = await import("../lib/server/projects");
  const { depsDaFila, projetoDaFila } = await import("../lib/server/aprovacao/integracao");
  const { criarGanchosDeProducao, mundoDeProducao } = await import("../lib/server/aprovacao/ganchos-de-producao");
  const { enfileirar } = await import("../lib/server/aprovacao/fila");

  const projeto = await requireActiveProject("00000000-0000-4000-8000-000000000001");
  const p = projetoDaFila(projeto as never, projeto.id)!;
  const deps = depsDaFila(db, p);
  const ap = await deps.store.porId(apId);
  if (!ap || ap.ramo !== "post") throw new Error("aprovação de post não encontrada");
  if (ap.liberadoEm) throw new Error("o post já foi liberado para o ar");
  console.log(`post ${ap.pecaId}, ${ap.estado}, sai ${ap.publicarEm}: ${ap.resumo?.titulo ?? ""}`);

  const agora = new Date().toISOString();
  const asset = {
    entityName: f.entidade,
    entityNormalized: f.entidade.toLowerCase(),
    entityType: f.tipo,
    source: "wikimedia_commons",
    sourceAssetId: f.sourceAssetId,
    imageUrl: f.imageUrl,
    sourcePageUrl: f.sourcePageUrl,
    author: f.author,
    license: f.license,
    licenseUrl: f.licenseUrl,
    attribution: `${f.author} (${f.license})`,
    rightsStatement: f.license,
    rightsStatus: "allowed",
    rightsCheckedAt: agora,
    sourceLastCheckedAt: agora,
    width: f.width,
    height: f.height,
    mimeType: "image/jpeg",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 100,
    imageContextType: "entity",
    metadata: { escolhida_a_mao: true, motivo: f.motivo },
  };
  const resultado = {
    storyId: "",
    entidade: null,
    asset,
    assetSecundario: null,
    status: "SELECTED" as const,
    motivo: null,
    fontesConsultadas: [],
    recusados: [],
    legenda: "",
    caminho: "entidade",
  };
  if (!aplicar) {
    console.log("ensaio: trocaria a foto por", f.imageUrl);
    return;
  }

  const ganchos = criarGanchosDeProducao({ ...mundoDeProducao(), imagem: async () => resultado as never });
  const motivo = `foto escolhida à mão: ${f.motivo}`;
  const ctx = { aprovacao: ap, etapa: "imagem", naoRepetir: "", motivo } as never;
  const r1 = await ganchos.post!.imagem!(ctx);
  console.log("imagem:", JSON.stringify(r1).slice(0, 300));
  if (!(r1 as { ok: boolean }).ok) process.exit(1);
  const r2 = await ganchos.post!.arte!({ ...(ctx as object), etapa: "arte" } as never);
  console.log("arte:", JSON.stringify(r2).slice(0, 300));
  if (!(r2 as { ok: boolean }).ok) process.exit(1);

  const lida = await deps.pecas.ler("post", ap.pecaId);
  const imagens = (r2 as { resumo?: { imagens?: string[] } }).resumo?.imagens ?? ap.resumo.imagens;
  const linha = await enfileirar(
    p,
    { ramo: "post", pecaId: ap.pecaId, hash: lida!.hashAtual, publicarEm: ap.publicarEm, avisos: ap.avisos, resumo: { ...ap.resumo, imagens } },
    deps,
  );
  console.log("fila:", linha?.estado, linha?.hashArtefato?.slice(0, 12));
}

main().catch((e) => { console.error(e); process.exit(1); });
