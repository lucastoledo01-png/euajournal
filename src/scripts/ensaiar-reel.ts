/**
 * Ensaio do Reel de ponta a ponta, sem banco e sem publicar (28/10/2026).
 *
 *   npx tsx src/scripts/ensaiar-reel.ts --video <arquivo.mp4> [--saida <pasta>]
 *
 * Percorre o caminho de produção com stores em memória: o candidato (colado
 * como `link`), a escolha, o preparo do worker (baixa, corta no tempo, mede o
 * corte, folha de quadros, abre a tarefa), uma entrega de texto no lugar do
 * Claude, o render no molde e a linha de `social_posts` que seria gravada. No
 * fim, confere a linha com `lerCargaV2`, que é o que o worker lê para publicar.
 * Os arquivos que iriam ao bucket ficam na pasta de saída.
 */

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Project } from "../lib/server/projects";
import { tarefasEmMemoria } from "../lib/server/mcp/tarefas-store";
import { entregarEscritaDoReel, type MaterialDoReel } from "../lib/server/mcp/reels/tarefa";
import { lerCargaV2, type LinhaDePost } from "../lib/server/social/instagram/carga-v2";
import { hashDoPostDaLinha } from "../lib/server/aprovacao/hash";
import { candidatosEmMemoria, type CandidatoDeReel } from "../lib/server/social/reels/candidatos";
import { linhaDoReel } from "../lib/server/social/reels/gravar";
import { giroDosReels } from "../lib/server/social/reels/trabalho";
import { montarReel } from "./montar-reel";

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const video = argumento("--video");
  if (!video) throw new Error("use --video <arquivo.mp4>");
  const saida = argumento("--saida") ?? path.join(path.dirname(video), "ensaio-reel");
  mkdirSync(saida, { recursive: true });

  const projeto = { id: "p-ensaio", slug: "ensaio", timezone: "America/Sao_Paulo", settings: {} } as unknown as Project;
  const candidato: CandidatoDeReel = {
    id: "c-ensaio",
    projectId: projeto.id,
    fonte: "link",
    origemId: path.basename(video),
    permalink: null,
    urlVideo: `file://${path.resolve(video)}`,
    autor: "perfil de origem",
    titulo: "Acidente ferroviário na Espanha está entre os mais graves da história do país",
    legenda: "Um trem de alta velocidade descarrilou na Espanha. O acidente está entre os mais graves da história do país.",
    publicadoEm: new Date().toISOString(),
    metricas: {},
    nota: 50,
    estado: "escolhida",
    motivo: null,
    preparo: null,
    texto: null,
    socialPostId: null,
    criadaEm: new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  };
  const candidatos = candidatosEmMemoria([candidato]);
  const tarefas = tarefasEmMemoria();
  let linhaGravada: Record<string, unknown> | null = null;

  const deps = {
    candidatos,
    tarefas,
    projeto: async () => projeto,
    subir: async (buffer: Buffer, caminho: string) => {
      const destino = path.join(saida, caminho.replace(/\//g, "__"));
      writeFileSync(destino, buffer);
      return `file://${destino}`;
    },
    fetcher: (async (url: string | URL) => {
      const local = String(url).replace(/^file:\/\//, "");
      const { readFileSync } = await import("node:fs");
      return new Response(readFileSync(local));
    }) as unknown as typeof fetch,
    montar: montarReel,
    gravar: async (_p: Project, reel: Parameters<typeof linhaDoReel>[1]) => {
      linhaGravada = linhaDoReel(projeto, reel, { quandoIso: new Date().toISOString(), slot: "ensaio" }, "draft");
      return { ok: true as const, postId: "post-ensaio" };
    },
  };

  console.log("1. preparo (baixa, corta, mede o corte, abre a tarefa)...");
  let giro = await giroDosReels(deps);
  if (giro.falhas.length) throw new Error(giro.falhas.join("; "));
  const c = candidatos.todos[0];
  console.log("   corte proposto:", JSON.stringify(c.preparo?.corte));
  console.log("   folha:", c.preparo?.folhaUrl);

  console.log("2. entrega do texto, no lugar do Claude...");
  const tarefa = (await tarefas.proxima(projeto.id, "escrever_reel"))!;
  const r = await entregarEscritaDoReel(
    tarefa,
    {
      molde: "a",
      rotulo: "Tragédia",
      categoria: "Mundo",
      linhas: ["ACIDENTE NA ESPANHA", "ENTRE OS MAIS GRAVES", "DA HISTÓRIA DO PAÍS"],
      destaque: 1,
      legenda: {
        gancho: "Um trem de alta velocidade descarrilou na Espanha.",
        paragrafos: ["O acidente está entre os mais graves da história do país."],
      },
    },
    "ensaio",
    { tarefas, candidatos },
  );
  console.log("   desfecho:", r.desfecho, "motivos" in r ? r.motivos : "");
  if (r.desfecho !== "pronto") throw new Error((tarefa.material as unknown as MaterialDoReel).candidatoId);

  console.log("3. render no molde e a linha da fila...");
  giro = await giroDosReels(deps);
  if (giro.falhas.length) throw new Error(giro.falhas.join("; "));
  if (!linhaGravada) throw new Error("nada gravado");
  const linha = linhaGravada as Record<string, unknown>;
  const reel = String((linha.content_json as { arte: { artefato: { url: string } } }).arte.artefato.url).replace(/^file:\/\//, "");
  copyFileSync(reel, path.join(saida, "reel-final.mp4"));
  const carga = lerCargaV2({ ...linha, status: "scheduled" } as LinhaDePost);
  console.log("   lerCargaV2:", carga.ok ? `ok, formato ${carga.carga.formato}` : carga.faltando);
  console.log("   hash da aprovação:", hashDoPostDaLinha(linha).slice(0, 16));
  console.log("   legenda:\n" + String(linha.caption));
  console.log(`\nArquivos em ${saida} (reel-final.mp4 é o vídeo que iria para a Meta).`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
