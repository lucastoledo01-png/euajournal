import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetVisual, StatusDeDireitos, TipoDeEntidade } from "./tipos";

/**
 * A biblioteca de assets validados.
 *
 * O ganho não é economizar chamada de API: é que a segunda matéria sobre a
 * mesma pessoa não precisa torcer para a busca devolver algo tão bom quanto na
 * primeira. O que já foi validado fica validado, com a licença junto.
 *
 * Duas regras que a leitura impõe:
 *
 *   asset com direitos `unknown` ou `revoked` não é oferecido para publicação,
 *   nem que seja o único da entidade;
 *
 *   asset usado dentro da janela sai da frente, e outro da mesma entidade
 *   entra no lugar. É por isso que vale a pena guardar oito fotos do Trump e
 *   não uma.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O id que pode ir para `visual_asset_id`, ou nulo.
 *
 * `social_posts.visual_asset_id` e `editorial_history.visual_asset_id` são
 * chave estrangeira para `visual_assets`, e nem todo asset mora lá. A foto do
 * acervo próprio chega com o id da tabela do ACERVO: em 15/10/2026 quatro das
 * cinco fotos do dia eram do acervo, o insert dos posts violou a chave, e o
 * dia saiu sem post nenhum. Asset de fonte externa que não chegou a ser
 * registrado fica com o id da origem, que nem é uuid.
 *
 * Nulo aqui não perde nada: a foto inteira continua gravada no registro da
 * peça (`content_json.visual` no post), que é onde a antirrepetição lê.
 */
export function idNaBiblioteca(asset: Pick<AssetVisual, "id" | "source"> | null | undefined): string | null {
  if (!asset?.id) return null;
  if (asset.source === "acervo_proprio") return null;
  return UUID.test(asset.id) ? asset.id : null;
}

const COLUNAS =
  "id,entity_name,entity_normalized,entity_type,source,source_asset_id,source_page_url,image_url," +
  "author,license,license_url,attribution,rights_statement,rights_status,rights_checked_at," +
  "source_last_checked_at,width,height,mime_type,storage_path,perceptual_hash,image_relevance_score," +
  "status,usage_count,last_used_at,metadata_json,image_context_type";

type Linha = {
  id: string;
  entity_name: string;
  entity_normalized: string;
  entity_type: string;
  source: string;
  source_asset_id: string;
  source_page_url: string;
  image_url: string;
  author: string;
  license: string;
  license_url: string;
  attribution: string;
  rights_statement: string;
  rights_status: StatusDeDireitos;
  rights_checked_at: string | null;
  source_last_checked_at: string | null;
  width: number;
  height: number;
  mime_type: string;
  storage_path: string | null;
  perceptual_hash: string | null;
  image_relevance_score: number;
  status: string;
  usage_count: number;
  last_used_at: string | null;
  metadata_json: Record<string, unknown>;
  image_context_type: string | null;
};

function daLinha(l: Linha): AssetVisual & { id: string; usageCount: number; lastUsedAt: string | null } {
  return {
    id: l.id,
    entityName: l.entity_name,
    entityNormalized: l.entity_normalized,
    entityType: l.entity_type as TipoDeEntidade,
    source: l.source as AssetVisual["source"],
    sourceAssetId: l.source_asset_id,
    imageUrl: l.image_url,
    sourcePageUrl: l.source_page_url,
    author: l.author,
    license: l.license,
    licenseUrl: l.license_url,
    attribution: l.attribution,
    rightsStatement: l.rights_statement,
    rightsStatus: l.rights_status,
    rightsCheckedAt: l.rights_checked_at ?? "",
    sourceLastCheckedAt: l.source_last_checked_at ?? "",
    width: l.width,
    height: l.height,
    mimeType: l.mime_type,
    storagePath: l.storage_path,
    perceptualHash: l.perceptual_hash,
    imageRelevanceScore: Number(l.image_relevance_score ?? 0),
    imageContextType: (l.image_context_type as AssetVisual["imageContextType"]) ?? "conceptual",
    metadata: l.metadata_json ?? {},
    usageCount: l.usage_count,
    lastUsedAt: l.last_used_at,
  };
}

function paraLinha(a: AssetVisual) {
  return {
    entity_name: a.entityName,
    entity_normalized: a.entityNormalized,
    entity_type: a.entityType,
    primary_entity: a.entityName,
    primary_entity_type: a.entityType,
    source: a.source,
    source_asset_id: a.sourceAssetId,
    source_page_url: a.sourcePageUrl,
    image_url: a.imageUrl,
    author: a.author,
    license: a.license,
    license_url: a.licenseUrl,
    attribution: a.attribution,
    rights_statement: a.rightsStatement,
    rights_status: a.rightsStatus,
    rights_checked_at: a.rightsCheckedAt || new Date().toISOString(),
    source_last_checked_at: a.sourceLastCheckedAt || new Date().toISOString(),
    width: a.width,
    height: a.height,
    mime_type: a.mimeType,
    storage_path: a.storagePath,
    perceptual_hash: a.perceptualHash,
    image_relevance_score: a.imageRelevanceScore,
    image_context_type: a.imageContextType,
    primary_entity_confidence: Math.round(a.entityConfidence ?? 0),
    primary_entity_evidence: a.entityEvidence ?? [],
    metadata_json: a.metadata ?? {},
  };
}

export type AssetGuardado = ReturnType<typeof daLinha>;

export type Biblioteca = {
  /** Assets publicáveis desta entidade, do mais antigo em uso para o mais recente. */
  daEntidade(normalizado: string): Promise<AssetGuardado[]>;
  /** Grava ou atualiza pelo par (origem, id na origem). */
  guardar(asset: AssetVisual): Promise<AssetGuardado | null>;
  registrarUso(id: string): Promise<void>;
  /** Já existe este arquivo, de qualquer entidade? */
  porUrl(imageUrl: string): Promise<AssetGuardado | null>;
};

export function criarBiblioteca(client: SupabaseClient): Biblioteca {
  return {
    async daEntidade(normalizado: string): Promise<AssetGuardado[]> {
      const { data, error } = await client
        .from("visual_assets")
        .select(COLUNAS)
        .eq("entity_normalized", normalizado)
        .eq("status", "active")
        .eq("rights_status", "verified")
        .order("last_used_at", { ascending: true, nullsFirst: true });

      if (error) throw new Error(`Biblioteca visual, leitura falhou: ${error.message}`);
      return (data as unknown as Linha[]).map(daLinha);
    },

    async guardar(asset: AssetVisual): Promise<AssetGuardado | null> {
      const { data, error } = await client
        .from("visual_assets")
        .upsert(paraLinha(asset), { onConflict: "source,source_asset_id" })
        .select(COLUNAS)
        .single();

      if (error) throw new Error(`Biblioteca visual, escrita falhou: ${error.message}`);
      return data ? daLinha(data as unknown as Linha) : null;
    },

    async registrarUso(id: string): Promise<void> {
      const { data } = await client.from("visual_assets").select("usage_count").eq("id", id).single();
      const atual = Number((data as { usage_count?: number } | null)?.usage_count ?? 0);

      const { error } = await client
        .from("visual_assets")
        .update({ last_used_at: new Date().toISOString(), usage_count: atual + 1 })
        .eq("id", id);

      if (error) throw new Error(`Biblioteca visual, uso não registrado: ${error.message}`);
    },

    async porUrl(imageUrl: string): Promise<AssetGuardado | null> {
      const { data, error } = await client
        .from("visual_assets")
        .select(COLUNAS)
        .eq("image_url", imageUrl)
        .maybeSingle();

      if (error) throw new Error(`Biblioteca visual, consulta por URL falhou: ${error.message}`);
      return data ? daLinha(data as unknown as Linha) : null;
    },
  };
}

/** Usado dentro da janela? Devolve quando saiu, ou null. */
export function usadoRecentemente(asset: AssetGuardado, janelaEmDias: number): string | null {
  if (!asset.lastUsedAt) return null;
  const quando = new Date(asset.lastUsedAt).getTime();
  const limite = Date.now() - janelaEmDias * 24 * 60 * 60 * 1000;
  return quando >= limite ? asset.lastUsedAt : null;
}
