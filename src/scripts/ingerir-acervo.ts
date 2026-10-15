import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID } from "../lib/server/projects";
import {
  aplicarPlano,
  linhaDoAcervo,
  listarPasta,
  planejarArquivo,
  recusarDuplicatas,
  type ArquivoPlanejado,
} from "../lib/server/visual/acervo/ingestao";
import { BUCKET_DO_ACERVO, TABELA_DO_ACERVO } from "../lib/server/visual/acervo/acervo";

/**
 * Ingestão do acervo próprio, a partir de uma pasta local.
 *
 * Por padrão é ENSAIO: lê cada arquivo, valida o nome, mede tom e orientação,
 * produz o derivado de 2160x2880 em memória e imprime a linha que seria
 * gravada. Nada sai da máquina. O envio real exige `--aplicar`, e quem roda é o
 * dono (regra de 05/10/2026: nenhuma frente escreve em produção).
 *
 *   npx tsx src/scripts/ingerir-acervo.ts ~/Drive/acervo
 *   npx tsx src/scripts/ingerir-acervo.ts ~/Drive/acervo --salvar-derivados=/tmp/derivados
 *   npx tsx src/scripts/ingerir-acervo.ts ~/Drive/acervo --aplicar --autor="Estúdio X" \
 *       --original="https://drive.google.com/drive/folders/..."
 *
 * Foto de terceiro (Commons, banco oficial) leva o crédito dela num
 * `creditos.json` na pasta (14/10/2026), por nome final do arquivo:
 *   { "pessoas-eua-donald_trump-retrato-01.jpg":
 *       { "autor": "Daniel Torok", "licenca": "domínio público",
 *         "original": "https://commons.wikimedia.org/wiki/File:..." } }
 * O que o arquivo declara vence `--autor` e `--original`.
 *
 * O formato do nome é `grupo-pais-assunto-detalhe-numero.jpg`, e o catálogo
 * de grupos e cenas está em `src/lib/server/visual/acervo/catalogo-de-cenas.ts`.
 */

function carregarEnv(): void {
  for (const arquivo of [".env.local", ".env"]) {
    const caminho = path.resolve(process.cwd(), arquivo);
    if (!fs.existsSync(caminho)) continue;
    for (const linha of fs.readFileSync(caminho, "utf-8").split("\n")) {
      const t = linha.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [chave, ...resto] = t.split("=");
      const valor = resto.join("=").trim().replace(/^["']|["']$/g, "");
      if (chave && !process.env[chave.trim()]) process.env[chave.trim()] = valor;
    }
  }
}

function argumento(nome: string): string | undefined {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : undefined;
}

async function main(): Promise<void> {
  carregarEnv();
  const pasta = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!pasta) {
    console.error("uso: npx tsx src/scripts/ingerir-acervo.ts <pasta> [--aplicar] [--autor=] [--original=]");
    process.exit(2);
  }

  const aplicar = process.argv.includes("--aplicar");
  const projectId = argumento("projeto") ?? DEFAULT_PROJECT_ID;
  const salvarEm = argumento("salvar-derivados");
  const opcoesDoLote = { autor: argumento("autor"), originalRef: argumento("original") ?? null };
  const arquivoDeCreditos = path.join(path.resolve(pasta), "creditos.json");
  const creditos: Record<string, { autor?: string; licenca?: string; original?: string }> = fs.existsSync(arquivoDeCreditos)
    ? JSON.parse(fs.readFileSync(arquivoDeCreditos, "utf-8"))
    : {};
  const opcoesDaLinha = (plano: ArquivoPlanejado) => {
    const c = creditos[plano.nome.arquivo];
    if (!c) return opcoesDoLote;
    return {
      autor: c.autor ?? opcoesDoLote.autor,
      licenca: c.licenca,
      originalRef: c.original ?? opcoesDoLote.originalRef,
    };
  };

  const arquivos = await listarPasta(path.resolve(pasta));
  console.log(`${arquivos.length} arquivo(s) de imagem em ${pasta}`);
  console.log(aplicar ? "MODO: APLICAR (envia ao Storage e grava no banco)" : "MODO: ensaio, nada sai da máquina");
  console.log("");

  const planos = recusarDuplicatas(
    await Promise.all(arquivos.map((a) => planejarArquivo(projectId, a))),
  );
  const prontos = planos.filter((p): p is ArquivoPlanejado => p.ok);
  const recusados = planos.filter((p) => !p.ok);

  for (const p of prontos) {
    const m = p.medida;
    console.log(
      `OK    ${p.nome.arquivo}  tag=${p.nome.tag} pais=${p.nome.pais} ` +
        `tom=${m.tom} (${m.luminancia}) topo=${m.luminanciaDoTopo} orientacao=${m.orientacao} ` +
        `original=${m.larguraOriginal}x${m.alturaOriginal}`,
    );
    for (const aviso of p.avisos) console.log(`      aviso: ${aviso}`);
    const credito = opcoesDaLinha(p);
    console.log(`      crédito: ${credito.autor || "(sem autor)"} | ${("licenca" in credito && credito.licenca) || "acervo próprio"}`);
    if (salvarEm) {
      fs.mkdirSync(salvarEm, { recursive: true });
      fs.writeFileSync(path.join(salvarEm, path.basename(p.caminho)), p.derivado);
    }
  }
  for (const r of recusados) {
    if (!r.ok) console.log(`RECUSA ${path.basename(r.origem)}: ${r.motivo}`);
  }

  console.log("");
  console.log(`${prontos.length} pronto(s), ${recusados.length} recusado(s)`);

  if (!aplicar) {
    const exemplo = prontos[0];
    if (exemplo) {
      console.log("");
      console.log(`Exemplo da linha que seria gravada em ${TABELA_DO_ACERVO}:`);
      console.log(
        JSON.stringify(
          linhaDoAcervo(projectId, exemplo, `<url pública do bucket ${BUCKET_DO_ACERVO}>/${exemplo.caminho}`, opcoesDaLinha(exemplo)),
          null,
          2,
        ),
      );
      console.log("");
      console.log(`Upload que seria feito: bucket "${BUCKET_DO_ACERVO}", ${prontos.length} objeto(s), ex.: ${exemplo.caminho}`);
    }
    console.log("");
    console.log("Para enviar de verdade, rode de novo com --aplicar.");
    return;
  }

  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const resultado = await aplicarPlano(getSupabaseAdminClient(), projectId, prontos, opcoesDaLinha);
  console.log(`enviados: ${resultado.enviados}; já existiam: ${resultado.pulados.length}; erros: ${resultado.erros.length}`);
  for (const e of resultado.erros) console.log(`ERRO ${e}`);
  if (resultado.erros.length > 0) process.exit(1);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
