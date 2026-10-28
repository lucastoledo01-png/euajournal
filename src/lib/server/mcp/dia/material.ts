import { pautaDaCandidata } from "@/lib/server/aprovacao/contexto-de-producao";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import type { ResultadoVisual } from "@/lib/server/visual/tipos";
import type { MaterialDoPost } from "../post/material";

/**
 * O material de uma pauta do plano do dia (29/10/2026): a candidata que a
 * triagem do Claude aprovou, o pacote factual que ele extraiu e a foto que ele
 * escolheu. É o mesmo formato que o post lia dos posts de outro projeto, então
 * a escrita, a auditoria e o agendamento do post não mudam.
 */
export function materialDaPauta(
  candidata: CandidataPersistida,
  foto: ResultadoVisual | null,
  data: string,
  posicao: number,
): { ok: true; material: MaterialDoPost } | { ok: false; motivo: string } {
  if (!candidata.factualPackage) return { ok: false, motivo: `a pauta ${candidata.storyId} ainda não tem pacote factual (extrair_pacote)` };
  const asset = foto?.status === "SELECTED" ? foto.asset : null;
  if (!asset?.imageUrl) return { ok: false, motivo: `a pauta ${candidata.storyId} não tem foto aprovada, e pauta sem foto não vira conteúdo` };
  return {
    ok: true,
    material: {
      versao: 1,
      data,
      origem: { projectId: candidata.projectId, postId: "" },
      pauta: { ...pautaDaCandidata(candidata), publicadoEm: "" },
      pacote: candidata.factualPackage,
      // O mesmo recorte que o store grava em `content_json.visual`.
      visual: {
        imageUrl: asset.imageUrl,
        source: asset.source,
        sourceAssetId: asset.sourceAssetId,
        sourcePageUrl: asset.sourcePageUrl,
        author: asset.author,
        license: asset.license,
        licenseUrl: asset.licenseUrl,
        attribution: asset.attribution,
        rightsStatement: asset.rightsStatement,
        rightsStatus: asset.rightsStatus,
        rightsCheckedAt: asset.rightsCheckedAt,
        imageContextType: asset.imageContextType,
        caminho: foto?.caminho ?? null,
        conferenciaVisual: asset.conferenciaVisual ?? null,
      },
      candidateId: candidata.id,
      posicao,
    },
  };
}
