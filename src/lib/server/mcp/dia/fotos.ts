import { z } from "zod";
import type { Project } from "@/lib/server/projects";
import type { CenaDaPauta } from "@/lib/server/visual/cena-da-pauta";
import { SISTEMA_DA_CONFERENCIA, paraConferir } from "@/lib/server/visual/conferencia-visual";
import { resolveVisualAsset, type Conferente, type OpcoesDeResolucao, type PautaParaImagem } from "@/lib/server/visual/resolver";
import type { AssetVisual, ResultadoVisual } from "@/lib/server/visual/tipos";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * A foto da pauta pelo Claude (29/10/2026).
 *
 * O resolvedor da esteira roda inteiro (acervo, bancos oficiais, Commons,
 * Pexels, a escada da cena), mas com um conferente que NÃO chama modelo: ele
 * anota cada foto que a esteira mandaria abrir e responde "ainda não". As
 * anotadas, até seis, viram a tarefa `escolher_foto`, que o Claude vê como
 * imagem, com o critério da conferência visual da esteira
 * (`SISTEMA_DA_CONFERENCIA`). A escolha vira o `ResultadoVisual` da pauta, em
 * `imagem_da_pauta`, de onde todos os canais leem.
 *
 * A cena (o que fotografar quando não há pessoa nem órgão) vem do Claude, no
 * plano do dia: a pergunta ao modelo também não sai.
 */

export const TIPO_DA_FOTO = "escolher_foto" as const;
export const MAXIMO_DE_CANDIDATAS = 6;
const PISO_DE_CONFIANCA = 70;

export type CandidataDeFoto = {
  indice: number;
  papel: string;
  imageUrl: string;
  /** A versão leve, que o MCP baixa para mostrar ao Claude. */
  previa: string;
  fonte: string;
  credito: string;
  asset: AssetVisual;
};

/** O conferente que anota e não decide. */
export function conferenteQueAnota(): { conferente: Conferente; anotadas: Array<{ asset: AssetVisual; papel: string }> } {
  const anotadas: Array<{ asset: AssetVisual; papel: string }> = [];
  const vistas = new Set<string>();
  return {
    anotadas,
    conferente: async (asset, contexto) => {
      if (asset.imageUrl && !vistas.has(asset.imageUrl)) {
        vistas.add(asset.imageUrl);
        anotadas.push({ asset, papel: contexto.papel ?? "assunto" });
      }
      return { aprovada: false, descricao: "", motivo: "aguardando a escolha do Claude", paisAparente: null, confianca: 0, falhou: false };
    },
  };
}

export async function candidatasDaFoto(
  pauta: PautaParaImagem,
  cena: CenaDaPauta,
  opcoes: Omit<OpcoesDeResolucao, "conferenciaVisual" | "cenaPronta" | "somenteLeitura">,
  resolver: typeof resolveVisualAsset = resolveVisualAsset,
): Promise<CandidataDeFoto[]> {
  const { conferente, anotadas } = conferenteQueAnota();
  await resolver(pauta, { ...opcoes, conferenciaVisual: conferente, cenaPronta: cena, somenteLeitura: true });
  return anotadas.slice(0, MAXIMO_DE_CANDIDATAS).map(({ asset, papel }, i) => ({
    indice: i,
    papel,
    imageUrl: asset.imageUrl,
    previa: paraConferir(asset.imageUrl),
    fonte: String(asset.source),
    credito: asset.attribution ?? "",
    asset,
  }));
}

export const EscolhaDaFotoSchema = z.object({
  escolha: z.number().int().min(0).nullable().describe("O índice da foto escolhida, ou null se nenhuma serve."),
  descricao: z.string().describe("O que se vê na foto escolhida (ou por que nenhuma serve)."),
  confianca: z.number().min(0).max(100),
  motivo: z.string().default(""),
});

const ESQUEMA = z.toJSONSchema(EscolhaDaFotoSchema, { io: "input" }) as Record<string, unknown>;

export type MaterialDaFoto = {
  storyId: string;
  titulo: string;
  resumo: string;
  categoria: string;
  candidatas: Array<Omit<CandidataDeFoto, "asset">>;
  /** Os assets inteiros, para a entrega montar o resultado sem resolver de novo. */
  assets: AssetVisual[];
};

export async function abrirFoto(projeto: Project, data: string, material: MaterialDaFoto, tarefas: TarefasStore): Promise<Tarefa> {
  const lista = material.candidatas
    .map((c) => `[${c.indice}] ${c.papel === "cena" ? "CONTEXTO" : "ASSUNTO"} · ${c.fonte} · ${c.credito || "sem crédito"}`)
    .join("\n");
  return tarefas.abrir({
    projectId: projeto.id,
    editionDate: data,
    tipo: TIPO_DA_FOTO,
    chave: material.storyId,
    instrucao: {
      system: SISTEMA_DA_CONFERENCIA,
      user:
        `MANCHETE: ${material.titulo}\nRESUMO: ${material.resumo}\nEDITORIA: ${material.categoria}\n\n` +
        `As fotos candidatas vêm como imagens, na ordem dos índices:\n${lista}\n\n` +
        "Escolha UMA que sustenta a manchete pelo critério acima (foto de CONTEXTO só precisa ambientar o assunto), " +
        `ou null se nenhuma serve. Confiança abaixo de ${PISO_DE_CONFIANCA} é recusa.`,
      orientacao: "Olhe as imagens anexadas e responda SÓ com o JSON do esquema.",
    },
    material: material as unknown as Record<string, unknown>,
    esquema: ESQUEMA,
  });
}

/** Pura: a escolha vira o resultado da pauta, ou a recusa. */
export function resultadoDaEscolha(material: MaterialDaFoto, bruto: unknown): { ok: true; resultado: ResultadoVisual } | { ok: false; motivo: string } {
  const lido = EscolhaDaFotoSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, motivo: `a resposta não cabe no esquema: ${lido.error.issues[0]?.message ?? ""}` };
  const e = lido.data;
  const asset = e.escolha === null ? null : material.assets[e.escolha];
  const papel = e.escolha === null ? null : material.candidatas[e.escolha]?.papel;
  const aprovada = Boolean(asset) && e.confianca >= PISO_DE_CONFIANCA;
  return {
    ok: true,
    resultado: {
      storyId: material.storyId,
      entidade: null,
      asset:
        aprovada && asset
          ? { ...asset, conferenciaVisual: { descricao: e.descricao, motivo: `conferida pelo Claude${e.motivo ? `: ${e.motivo}` : ""}`, paisAparente: null, confianca: e.confianca } }
          : null,
      assetSecundario: null,
      status: aprovada ? "SELECTED" : "NO_VALID_IMAGE",
      motivo: aprovada ? null : "VISUAL_CHECK_FAILED",
      fontesConsultadas: [{ fonte: "biblioteca_interna", encontrados: material.candidatas.length, nota: `conferida pelo Claude: ${e.descricao.slice(0, 200)}` }],
      recusados: [],
      legenda: "",
      caminho: papel === "cena" ? "cena" : "entidade",
    },
  };
}

export type DepsDaFoto = {
  tarefas: TarefasStore;
  gravarFoto: (projectId: string, resultado: ResultadoVisual) => Promise<void>;
};

export async function entregarFoto(
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDaFoto,
): Promise<{ ok: true; desfecho: "foto"; storyId: string; comFoto: boolean } | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }> {
  const material = tarefa.material as unknown as MaterialDaFoto;
  const r = resultadoDaEscolha(material, resultado);
  if (!r.ok) {
    return { ok: true, desfecho: "reparar", motivos: [r.motivo], tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, [r.motivo], quem) };
  }
  await deps.gravarFoto(tarefa.projectId, r.resultado);
  await deps.tarefas.entregar(tarefa.id, resultado, quem);
  return { ok: true, desfecho: "foto", storyId: material.storyId, comFoto: r.resultado.status === "SELECTED" };
}
