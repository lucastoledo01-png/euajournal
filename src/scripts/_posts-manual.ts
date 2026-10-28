/**
 * Posts à mão (27/10/2026): carrossel de notícia com fotos escolhidas fora da
 * esteira, renderizado pelo mesmo caminho da arte (`renderizarCapas`).
 *
 *   npx tsx src/scripts/_posts-manual.ts --arquivo producao-manual/2026-10-27/posts.json --fotos <pasta> --saida <pasta>
 *
 * Nada é gravado no banco nem publicado: o script só escreve os PNG e um
 * resumo de cada post (legenda e crédito) na pasta de saída. As fotos vêm de
 * uma pasta local e entram no render por um `fetcher` que atende "local://".
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { carregarEnv } from "./artigos-comum";

type Foto = { arquivo: string; autor: string; licenca: string; pagina: string };
type Bolha = { foto: Foto; posicao?: string };
type Post = {
  id: string;
  eixo: string;
  headline: string;
  destaque: string;
  legenda: string;
  slides: Array<{ blocos: string[]; foto: Foto; bolha?: Bolha }>;
  capa: Foto;
  bolhaDaCapa?: Bolha;
};

async function main() {
  const args = process.argv.slice(2);
  const pega = (nome: string) => args[args.indexOf(nome) + 1];
  const arquivo = pega("--arquivo");
  const fotos = pega("--fotos");
  const saida = pega("--saida");
  if (!arquivo || !fotos || !saida) throw new Error("--arquivo, --fotos e --saida são obrigatórios");
  carregarEnv();

  const posts = JSON.parse(readFileSync(arquivo, "utf8")) as Post[];
  const { renderizarCapas } = await import("../lib/server/social/arte");
  const { entradasDoCarrossel } = await import("../lib/server/social/carrossel/arte");

  const fetcher = (async (url: string) => {
    const u = String(url);
    if (!u.startsWith("local://")) throw new Error(`só fotos locais: ${u}`);
    const buf = readFileSync(path.join(fotos, u.slice("local://".length)));
    return new Response(buf, { status: 200, headers: { "content-type": "image/jpeg" } });
  }) as unknown as typeof fetch;

  const comoAsset = (f: Foto) => ({
    imageUrl: `local://${f.arquivo}`,
    attribution: f.autor,
    author: f.autor,
    license: f.licenca,
  });

  const papeis = [
    { papel: "capa", tipo: "cover", pede: "", obrigatorio: true, escritoEmCodigo: true },
    { papel: "passo 1", tipo: "content", pede: "", obrigatorio: true },
    { papel: "passo 2", tipo: "content", pede: "", obrigatorio: true },
    { papel: "fechamento", tipo: "cta", pede: "", obrigatorio: true, escritoEmCodigo: true },
  ] as never;

  mkdirSync(saida, { recursive: true });

  for (const post of posts) {
    const copy = {
      headline: post.headline,
      destaque: post.destaque,
      gancho: "",
      fato_principal: "",
      contexto: "",
      informacao_util: "",
      ressalva: "",
      cta: "",
      hashtags: [],
      slides: post.slides.map((s, i) => ({
        papel: `passo ${i + 1}`,
        titulo: "",
        corpo: s.blocos.join("\n\n"),
        bullets: [],
        lado_a: "",
        lado_b: "",
      })),
    } as never;

    const montado = entradasDoCarrossel(copy, papeis, {
      eixo: post.eixo,
      asset: comoAsset(post.capa),
      motivoSemFoto: "NO_VALID_IMAGE",
      fotosDoMiolo: post.slides.map((s) => comoAsset(s.foto)),
      ...(post.bolhaDaCapa
        ? {
            assetSecundario: comoAsset(post.bolhaDaCapa.foto),
            ...(post.bolhaDaCapa.posicao ? { posicaoDaBolha: post.bolhaDaCapa.posicao } : {}),
          }
        : {}),
      bolhasDoMiolo: post.slides.map((s) => (s.bolha ? comoAsset(s.bolha.foto) : null)),
      posicoesDasBolhasDoMiolo: post.slides.map((s) => s.bolha?.posicao ?? null),
    });

    // O fechamento é o convite para seguir o perfil, e não o de assinar.
    const ultima = montado.entradas[montado.entradas.length - 1];
    if (!ultima.slidePronto) throw new Error("o fechamento não veio como slide pronto");
    ultima.slidePronto = { ...ultima.slidePronto, variant: "cta_siga", cta_text: "", highlight_text: "", ...(process.env.EUA_TILES ? { tile_urls: process.env.EUA_TILES.split(",") } : {}) } as never;

    const artes = await renderizarCapas(montado.entradas, { fetcher });
    const pasta = path.join(saida, post.id);
    mkdirSync(pasta, { recursive: true });
    artes.forEach((a, i) => {
      writeFileSync(path.join(pasta, `slide-${i + 1}.png`), a.png);
      // Acima do limite interno (6 MB) o PNG não publica: sai também o JPEG do mesmo desenho.
      if (a.png.byteLength > 6 * 1024 * 1024) writeFileSync(path.join(pasta, `slide-${i + 1}.jpg`), a.jpegPublicavel);
    });

    const nomes = [
      post.capa,
      ...(post.bolhaDaCapa ? [post.bolhaDaCapa.foto] : []),
      ...post.slides.flatMap((s) => [s.foto, ...(s.bolha ? [s.bolha.foto] : [])]),
    ].map((f) => f.autor);
    const unicos = [...new Set(nomes)];
    // Até três nomes; depois disso, "e outros" (regra do crédito na legenda).
    const credito =
      unicos.length === 1
        ? `Foto: ${unicos[0]}`
        : unicos.length <= 3
          ? `Fotos: ${unicos.slice(0, -1).join(", ")} e ${unicos[unicos.length - 1]}`
          : `Fotos: ${unicos.slice(0, 3).join(", ")} e outros`;
    writeFileSync(
      path.join(pasta, "legenda.txt"),
      `${post.legenda}\n\nSiga @eua.journal\n${credito}\n`,
    );
    console.log(`${post.id}: ${artes.length} slides em ${pasta}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
