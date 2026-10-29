import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { disfarcarPalavrasPesadas } from "@/lib/server/social/palavras-pesadas";
import os from "node:os";
import path from "node:path";
import type { Project } from "@/lib/server/projects";
import { projectToday } from "@/lib/server/projects";
import { sha256De, type ArtefatoCongelado } from "@/lib/server/social/artefato";
import { abrirEscritaDoReel, materialDoCandidato } from "@/lib/server/mcp/reels/tarefa";
import type { TarefasStore } from "@/lib/server/mcp/tarefas-store";
import { baixarVideo } from "./baixar";
import type { CandidatoDeReel, CandidatosDeReel } from "./candidatos";
import { ASPECTO_DO_MOLDE, folhaDeQuadros, medidasDoVideo, medirCorte } from "./corte";
import type { ReelParaGravar } from "./gravar";

/**
 * O trabalho do worker nos Reels (28/10/2026), em dois passos, cada um pego
 * por reivindicação condicional:
 *
 *   preparar   o Claude escolheu o vídeo: baixa, corta no tempo, mede o corte
 *              dos dois moldes, desenha a folha de quadros, sobe tudo no bucket
 *              `reels` e abre a tarefa `escrever_reel`;
 *   renderizar o Claude entregou o texto: monta o Reel no molde, sobe o MP4 e
 *              grava a linha na fila de aprovação, em `aguardando`.
 *
 * Roda no worker porque precisa de ffmpeg, yt-dlp e Chromium. Falha vira
 * `falhou` com o motivo no candidato; nada aqui publica.
 */

export const BUCKET_DOS_REELS = "reels";

export type DepsDoTrabalho = {
  candidatos: CandidatosDeReel;
  tarefas: TarefasStore;
  projeto: (projectId: string) => Promise<Project | null>;
  subir: (buffer: Buffer, caminho: string, mime: string) => Promise<string | null>;
  gravar: (projeto: Project, reel: ReelParaGravar) => Promise<{ ok: true; postId: string } | { ok: false; error: string }>;
  montar: (pedido: {
    video: string;
    formato: "a" | "b";
    linhas: string[];
    rotulo: string;
    categoria: string;
    corte: { x: number; y: number; largura: number; altura: number } | null;
    saida: string;
  }) => Promise<string>;
  baixar?: typeof baixarVideo;
  fetcher?: typeof fetch;
};

function pasta(): string {
  return mkdtempSync(path.join(os.tmpdir(), "reel-trabalho-"));
}

async function subirArquivo(deps: DepsDoTrabalho, arquivo: string, caminho: string, mime: string): Promise<string> {
  const url = await deps.subir(readFileSync(arquivo), caminho, mime);
  if (!url) throw new Error(`o Storage recusou ${caminho}`);
  return url;
}

export async function prepararCandidato(c: CandidatoDeReel, deps: DepsDoTrabalho): Promise<void> {
  const projeto = await deps.projeto(c.projectId);
  if (!projeto) throw new Error(`o projeto ${c.projectId} não existe`);
  const dir = pasta();
  try {
    const video = await (deps.baixar ?? baixarVideo)(c, dir, { fetcher: deps.fetcher });
    const corte = { a: medirCorte(video.arquivo, ASPECTO_DO_MOLDE.a).corte, b: medirCorte(video.arquivo, ASPECTO_DO_MOLDE.b).corte };
    const molde = video.largura >= video.altura ? "a" : "b";
    const folha = folhaDeQuadros(video.arquivo, path.join(dir, "folha.jpg"), corte[molde]);
    const base = `${projeto.slug}/${c.id}`;
    const videoUrl = await subirArquivo(deps, video.arquivo, `${base}/origem.mp4`, "video/mp4");
    const folhaUrl = await subirArquivo(deps, folha, `${base}/folha-origem.jpg`, "image/jpeg");
    const preparo = {
      videoUrl,
      videoPath: `${base}/origem.mp4`,
      folhaUrl,
      original: { largura: video.largura, altura: video.altura, segundos: video.segundos },
      corte,
      tarefaId: null as string | null,
    };
    const tarefa = await abrirEscritaDoReel(c.projectId, projectToday(projeto), materialDoCandidato(c, preparo), deps.tarefas);
    await deps.candidatos.preparado(c.id, { ...preparo, tarefaId: tarefa.id });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function renderizarCandidato(c: CandidatoDeReel, deps: DepsDoTrabalho): Promise<{ postId: string; folhaUrl: string }> {
  const projeto = await deps.projeto(c.projectId);
  if (!projeto) throw new Error(`o projeto ${c.projectId} não existe`);
  if (!c.preparo || !c.texto) throw new Error("candidato sem preparo ou sem texto");
  const t = c.texto;
  const dir = pasta();
  try {
    const origem = path.join(dir, "origem.mp4");
    const resposta = await (deps.fetcher ?? fetch)(c.preparo.videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!resposta.ok) throw new Error(`o vídeo preparado não baixou (${resposta.status})`);
    writeFileSync(origem, Buffer.from(await resposta.arrayBuffer()));

    const saida = path.join(dir, "reel.mp4");
    // As palavras pesadas saem disfarçadas no vídeo, como na legenda (29/10/2026).
    const linhas = t.linhas.map((l, i) => (i === t.destaque ? `*${disfarcarPalavrasPesadas(l)}*` : disfarcarPalavrasPesadas(l))).join("|");
    await deps.montar({
      video: origem,
      formato: t.molde,
      linhas: [linhas],
      rotulo: disfarcarPalavrasPesadas(t.rotulo),
      categoria: t.categoria,
      corte: t.corte,
      saida,
    });

    const bytes = readFileSync(saida);
    const sha256 = sha256De(bytes);
    const medidas = medidasDoVideo(saida);
    // O hash no nome: a versão refeita depois de uma reprovação é outro arquivo, nunca o mesmo sobrescrito.
    const caminho = `${projeto.slug}/${c.id}/reel-${sha256.slice(0, 12)}.mp4`;
    const url = await subirArquivo(deps, saida, caminho, "video/mp4");
    const folha = folhaDeQuadros(saida, path.join(dir, "folha.jpg"), null);
    const folhaUrl = await subirArquivo(deps, folha, `${projeto.slug}/${c.id}/folha-${sha256.slice(0, 12)}.jpg`, "image/jpeg");

    const video: ArtefatoCongelado = {
      url,
      path: caminho,
      filename: path.basename(caminho),
      mime: "video/mp4",
      sha256,
      bytes: statSync(saida).size,
      largura: medidas.largura,
      altura: medidas.altura,
      otimizado: false,
    };
    const r = await deps.gravar(projeto, {
      data: projectToday(projeto),
      candidato: { id: c.id, fonte: c.fonte, origemId: c.origemId, autor: c.autor, permalink: c.permalink },
      manchete: t.manchete,
      legenda: t.legenda,
      molde: t.molde,
      desenho: { rotulo: t.rotulo, categoria: t.categoria, linhas: t.linhas, destaque: t.destaque, corte: t.corte, tarefa_id: t.tarefaId },
      video,
      folhaUrl,
      postExistente: c.socialPostId,
    });
    if (!r.ok) throw new Error(r.error);
    return { postId: r.postId, folhaUrl };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Um giro: devolve o que ficou preso, prepara um e renderiza um. */
export async function giroDosReels(deps: DepsDoTrabalho): Promise<{ preparados: number; renderizados: number; falhas: string[] }> {
  const saida = { preparados: 0, renderizados: 0, falhas: [] as string[] };
  await deps.candidatos.recuperarPresos(20).catch(() => 0);

  for (const c of await deps.candidatos.filaDePreparo(1)) {
    if (!(await deps.candidatos.reivindicar(c.id))) continue;
    try {
      await prepararCandidato(c, deps);
      saida.preparados += 1;
    } catch (e) {
      const motivo = `preparo: ${e instanceof Error ? e.message : String(e)}`;
      saida.falhas.push(motivo);
      await deps.candidatos.encerrar(c.id, "falhou", motivo);
    }
  }

  for (const c of await deps.candidatos.filaDeRender(1)) {
    if (!(await deps.candidatos.reivindicar(c.id))) continue;
    try {
      const { postId, folhaUrl } = await renderizarCandidato(c, deps);
      await deps.candidatos.pronta(c.id, postId, { ...c.preparo!, folhaFinalUrl: folhaUrl });
      saida.renderizados += 1;
    } catch (e) {
      const motivo = `render: ${e instanceof Error ? e.message : String(e)}`;
      saida.falhas.push(motivo);
      await deps.candidatos.encerrar(c.id, "falhou", motivo);
    }
  }
  return saida;
}
