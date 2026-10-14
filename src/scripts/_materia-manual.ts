/**
 * Piloto da produção à mão (14/10/2026): grava UMA matéria escrita fora da
 * esteira, pelo mesmo caminho do ramo do portal, e a leva à fila.
 *
 *   npx tsx src/scripts/_materia-manual.ts --arquivo <materia.json>            (ensaio)
 *   npx tsx src/scripts/_materia-manual.ts --arquivo <materia.json> --aplicar  (grava e enfileira)
 *
 * Nenhuma chamada de modelo. O texto, a capa, o crédito e a legenda vêm do
 * arquivo; o HTML sai de `renderizarArtigoHtml`, o mesmo da página.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { carregarEnv, clienteDoBanco } from "./artigos-comum";

type Entrada = {
  artigo: Record<string, unknown>;
  fonte: { nome: string; url: string };
  fontes?: Array<{ nome: string; url: string }>;
  capa: string;
  credito: { autor: string; licenca: string; origem: string; href: string };
  legenda: string;
  categoria: string;
  publicarEm: string;
  data: string;
  entidades?: Array<{ papel: "sobre" | "menciona"; tipo: string; nome: string; sameAs?: string }>;
};

async function main() {
  const args = process.argv.slice(2);
  const arquivo = args[args.indexOf("--arquivo") + 1];
  const aplicar = args.includes("--aplicar");
  if (!arquivo) throw new Error("--arquivo <materia.json>");
  carregarEnv();

  const e = JSON.parse(readFileSync(arquivo, "utf8")) as Entrada;
  const { ArtigoSchema, renderizarArtigoHtml } = await import("../lib/server/ramos/artigo");
  const { slugDoArtigo, gravarArtigosAgendados } = await import("../lib/server/ramos/portal");
  const { montarPeca } = await import("../lib/server/ramos/peca");
  const { editoriaPeloNome, hrefDaEditoria } = await import("@/lib/editorias");
  const { tagsDeIndexacao } = await import("@/lib/indexacao-do-artigo");
  const { htmlDoCredito } = await import("@/lib/credito-da-capa");
  const { htmlDaLegenda } = await import("../lib/server/legenda-da-capa");

  const artigo = ArtigoSchema.parse(e.artigo);
  const editoria = editoriaPeloNome(e.categoria);
  const html =
    htmlDaLegenda(e.legenda) +
    htmlDoCredito(e.credito) +
    renderizarArtigoHtml(artigo, e.fonte, {
      fontes: e.fontes?.length ? e.fontes : [e.fonte],
      ...(editoria ? { editoria: { nome: editoria.nome, href: hrefDaEditoria(editoria.id) } } : {}),
    });
  if (/—/.test(html)) throw new Error("travessão no texto");
  const slug = slugDoArtigo(artigo.titulo, e.data);
  const corpo = [artigo.titulo, ...(artigo.abertura ?? []), ...artigo.secoes.flatMap((s) => s.paragrafos)].join(" ");
  void corpo;
  const tags = tagsDeIndexacao({ assuntos: artigo.assuntos ?? [], entidades: (e.entidades ?? []) as never });
  const palavras = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  writeFileSync(`/tmp/${slug}.html`, html);
  console.log(`slug ${slug}\npalavras ${palavras}\ntags ${JSON.stringify(tags)}\nprévia /tmp/${slug}.html`);
  if (!aplicar) return;

  const db = clienteDoBanco();
  const peca = montarPeca({
    ramo: "artigo" as const,
    referenciaId: slug,
    storyIds: [],
    titulo: artigo.titulo,
    conteudo: {
      artigo,
      html,
      categoria: e.categoria,
      fonte: e.fonte,
      sourceUrls: (e.fontes?.length ? e.fontes : [e.fonte]).map((f) => f.url),
      capa: e.capa,
      publicarEm: e.publicarEm,
      slug,
      tags,
    },
    avisos: [],
    aprovadaPeloAuditor: true,
    bloqueios: [],
  });
  const g = await gravarArtigosAgendados(db, "00000000-0000-4000-8000-000000000001", [peca as never]);
  console.log("gravação:", JSON.stringify(g));
  if (g.erros.length) process.exit(1);

  const { requireActiveProject } = await import("../lib/server/projects");
  const { levarPecaDoRamoAFila, localizadorSupabase, resumoDoArtigo } = await import("../lib/server/aprovacao/ramos-na-fila");
  const { depsDaFila, projetoDaFila } = await import("../lib/server/aprovacao/integracao");
  const projeto = await requireActiveProject("00000000-0000-4000-8000-000000000001");
  const p = projetoDaFila(projeto as never, projeto.id)!;
  const deps = depsDaFila(db, p);
  const d = await levarPecaDoRamoAFila(p, peca as never, { ...deps, localizar: localizadorSupabase(db, projeto.id) });
  console.log("fila:", JSON.stringify(d));
  if (d.acao === "ja_na_fila") {
    // Versão nova de peça já na fila: o hash muda, e a peça volta a "aguardando".
    const { enfileirar } = await import("../lib/server/aprovacao/fila");
    const lida = await deps.pecas.ler("artigo", d.pecaId);
    const { resumo, publicarEm } = resumoDoArtigo(peca as never);
    const linha = await enfileirar(p, { ramo: "artigo", pecaId: d.pecaId, hash: lida!.hashAtual, publicarEm, avisos: [], resumo }, deps);
    console.log("fila atualizada:", linha?.estado, linha?.hashArtefato?.slice(0, 12));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
