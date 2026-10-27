import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextoDeProducao, PautaDoContexto } from "@/lib/server/aprovacao/contrato";
import type { PacoteFactual } from "@/lib/server/editorial/pacote-factual";
import type { AssetVisual, ResultadoVisual } from "@/lib/server/visual/tipos";

/**
 * O material de um post do Claude: a pauta, o pacote factual e a foto
 * (27/10/2026).
 *
 * No passo 2 do plano (`docs/decisoes.md`, "O motor Claude via MCP"), o Claude
 * ainda não classifica, não monta o pacote e não escolhe a foto: isso chega
 * nos passos seguintes. Então o material vem de um post que a esteira JÁ
 * produziu, que guarda a pauta e o pacote em `content_json.contexto_da_refacao`
 * e a foto aprovada em `content_json.visual`. O Claude escreve o texto de novo,
 * e a plataforma monta, confere e põe na fila do projeto dele.
 *
 * De qual projeto: o próprio, ou o declarado em `settings.mcp.pautas_de` (um
 * slug). É a ponte do projeto de teste, que não tem esteira própria: ele lê,
 * só lê, os posts do eua.journal. Nada é gravado no projeto emprestado.
 */

export type MaterialDoPost = {
  versao: 1;
  /** A data da edição no projeto do Claude, AAAA-MM-DD. */
  data: string;
  /** De onde veio a pauta: o projeto e o post que já existiam. */
  origem: { projectId: string; postId: string };
  pauta: PautaDoContexto;
  pacote: PacoteFactual;
  /** A foto como o store a gravou (`content_json.visual`), com `imageUrl`. */
  visual: Record<string, unknown>;
  candidateId: string | null;
  /** A posição na leva decide o CTA da copy (`levaCta`). */
  posicao: number;
};

export type PautaParaPost = {
  storyId: string;
  titulo: string;
  fonte: string;
  foto: string;
  /** O post de onde a pauta sai. */
  origemPostId: string;
  dataDeOrigem: string;
};

export type LinhaDePostDaFonte = {
  id: string;
  story_id: string | null;
  candidate_id: string | null;
  edition_date: string;
  content_json: Record<string, unknown> | null;
};

export function slugDaFonteDasPautas(projeto: { slug: string; settings?: Record<string, unknown> | null }): string {
  const mcp = projeto.settings?.mcp;
  const bruto =
    mcp && typeof mcp === "object" && !Array.isArray(mcp) ? (mcp as Record<string, unknown>).pautas_de : undefined;
  return typeof bruto === "string" && bruto.trim() ? bruto.trim() : projeto.slug;
}

/**
 * O material de uma linha de `social_posts`, ou o motivo de não servir.
 *
 * Só serve post com pauta, PACOTE e foto: sem pacote a auditoria não tem
 * contra o que conferir, e sem foto a pauta não vira conteúdo (regra de
 * 05/10/2026).
 */
export function materialDaLinha(
  linha: LinhaDePostDaFonte,
  projectIdDaFonte: string,
  data: string,
): { ok: true; material: MaterialDoPost } | { ok: false; motivo: string } {
  const cj = linha.content_json ?? {};
  const contexto = cj.contexto_da_refacao as ContextoDeProducao | undefined;
  const storyId = linha.story_id ?? "";
  const pauta = contexto?.pautas?.find((p) => p.storyId === storyId) ?? contexto?.pautas?.[0];
  if (!pauta) return { ok: false, motivo: "o post de origem não guarda a pauta" };
  const pacote = contexto?.pacotes?.[pauta.storyId];
  if (!pacote) return { ok: false, motivo: "o post de origem não guarda o pacote factual" };
  const visual = (cj.visual ?? {}) as Record<string, unknown>;
  if (typeof visual.imageUrl !== "string" || !visual.imageUrl) {
    return { ok: false, motivo: "o post de origem não tem foto, e pauta sem foto não vira conteúdo" };
  }
  return {
    ok: true,
    material: {
      versao: 1,
      data,
      origem: { projectId: projectIdDaFonte, postId: linha.id },
      pauta,
      pacote,
      visual,
      candidateId: linha.candidate_id,
      posicao: typeof contexto?.posicao === "number" ? contexto.posicao : 1,
    },
  };
}

export function pautaParaPost(linha: LinhaDePostDaFonte): PautaParaPost | null {
  const cj = linha.content_json ?? {};
  const contexto = cj.contexto_da_refacao as ContextoDeProducao | undefined;
  const pauta = contexto?.pautas?.find((p) => p.storyId === linha.story_id) ?? contexto?.pautas?.[0];
  const visual = (cj.visual ?? {}) as Record<string, unknown>;
  if (!pauta || !contexto?.pacotes?.[pauta.storyId] || typeof visual.imageUrl !== "string" || !visual.imageUrl) {
    return null;
  }
  return {
    storyId: pauta.storyId,
    titulo: pauta.titulo,
    fonte: pauta.fonteNome,
    foto: visual.imageUrl,
    origemPostId: linha.id,
    dataDeOrigem: linha.edition_date,
  };
}

/**
 * A foto gravada de volta no formato do resolvedor.
 *
 * O store achata o asset em `content_json.visual`; o que ele não grava
 * (largura, nome da entidade) volta neutro. Para o render e para a gravação
 * do post novo basta: a arte usa `imageUrl` e o crédito usa `attribution` e
 * `author`. Quando o Claude passar a escolher a foto (passo 3), o
 * `ResultadoVisual` vem inteiro da escolha dele.
 */
export function visualDoMaterial(material: MaterialDoPost): ResultadoVisual {
  const v = material.visual;
  const texto = (chave: string) => (typeof v[chave] === "string" ? (v[chave] as string) : "");
  const asset = {
    entityName: "",
    entityNormalized: "",
    entityType: "conceito",
    source: texto("source") || "commons",
    sourceAssetId: texto("sourceAssetId"),
    imageUrl: texto("imageUrl"),
    sourcePageUrl: texto("sourcePageUrl"),
    author: texto("author"),
    license: texto("license"),
    licenseUrl: texto("licenseUrl"),
    attribution: texto("attribution"),
    rightsStatement: texto("rightsStatement"),
    rightsStatus: (texto("rightsStatus") || "unknown") as AssetVisual["rightsStatus"],
    rightsCheckedAt: texto("rightsCheckedAt"),
    sourceLastCheckedAt: texto("rightsCheckedAt"),
    width: 0,
    height: 0,
    mimeType: "",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 0,
    imageContextType: (texto("imageContextType") || "conceitual") as AssetVisual["imageContextType"],
    metadata: {
      reaproveitada_de: material.origem.postId,
      ...(v.verificacao && typeof v.verificacao === "object" ? { verificacao: v.verificacao } : {}),
    },
  } as unknown as AssetVisual;
  return {
    storyId: material.pauta.storyId,
    entidade: null,
    asset,
    assetSecundario: null,
    status: "SELECTED",
    motivo: null,
    fontesConsultadas: [],
    recusados: [],
    legenda: asset.attribution,
  };
}

/** Os posts recentes da fonte que servem de pauta, sem as que o projeto do Claude já usou. */
export async function pautasDisponiveis(
  client: SupabaseClient,
  entrada: { projectIdDaFonte: string; projectIdDoClaude: string; desdeIso: string },
): Promise<PautaParaPost[]> {
  const [daFonte, jaUsadas] = await Promise.all([
    client
      .from("social_posts")
      .select("id, story_id, candidate_id, edition_date, content_json")
      .eq("project_id", entrada.projectIdDaFonte)
      .gte("created_at", entrada.desdeIso)
      .order("created_at", { ascending: false })
      .limit(60),
    client.from("social_posts").select("story_id").eq("project_id", entrada.projectIdDoClaude).gte("created_at", entrada.desdeIso),
  ]);
  if (daFonte.error) throw new Error(`social_posts da fonte, leitura falhou: ${daFonte.error.message}`);
  if (jaUsadas.error) throw new Error(`social_posts do projeto, leitura falhou: ${jaUsadas.error.message}`);
  const usadas = new Set(((jaUsadas.data ?? []) as Array<{ story_id: string | null }>).map((l) => l.story_id));
  const vistas = new Set<string>();
  const saida: PautaParaPost[] = [];
  for (const linha of (daFonte.data ?? []) as LinhaDePostDaFonte[]) {
    const p = pautaParaPost(linha);
    if (!p || usadas.has(p.storyId) || vistas.has(p.storyId)) continue;
    vistas.add(p.storyId);
    saida.push(p);
  }
  return saida;
}

/** A linha mais recente da fonte para a pauta pedida. */
export async function linhaDaFonte(
  client: SupabaseClient,
  projectIdDaFonte: string,
  storyId: string,
): Promise<LinhaDePostDaFonte | null> {
  const { data, error } = await client
    .from("social_posts")
    .select("id, story_id, candidate_id, edition_date, content_json")
    .eq("project_id", projectIdDaFonte)
    .eq("story_id", storyId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`social_posts da fonte, leitura falhou: ${error.message}`);
  return ((data ?? []) as LinhaDePostDaFonte[])[0] ?? null;
}
