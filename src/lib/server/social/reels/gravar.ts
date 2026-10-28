import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { modoDaFila } from "@/lib/server/aprovacao/modo";
import { opcoesDaFilaParaOStore, projetoDaFila } from "@/lib/server/aprovacao/integracao";
import { statusDeEntradaDoPost } from "@/lib/server/aprovacao/portao";
import { cadenciaDoProjeto } from "@/lib/server/cadencia";
import type { ArtefatoCongelado } from "@/lib/server/social/artefato";
import { legendaDoInstagram } from "@/lib/server/social/legenda-final";
import { vagasDaTarde, type PostDoDia } from "@/lib/server/social/quente-da-tarde";
import { chaveDeIdempotencia } from "@/lib/server/social/social-posts-store";
import { zonedTimeToUtc } from "@/lib/server/time";

/**
 * Gravar o Reel pronto como post do Instagram (28/10/2026).
 *
 * O Reel não passa pelo store do social: o store pede a pauta avaliada, a copy
 * e o veredicto da guarda do post, e o Reel nasce de um vídeo, não de uma
 * pauta. O que ele grava é o contrato que o worker lê (`lerCargaV2` com
 * `formato: "reel"`) e o que a fila precisa para o hash, e entra na fila pelo
 * mesmo `aoGravar` do store: um caminho só até a aprovação.
 *
 * Só com a fila em `enforce`: nenhum Reel vai ao ar sem alguém aprovar no
 * painel (decisão do dono). O status de entrada é `draft`, e quem o vira em
 * `scheduled` é a liberação da fila.
 */

export type FonteDoReel = "instagram" | "youtube" | "link";

export type ReelParaGravar = {
  data: string;
  candidato: { id: string; fonte: FonteDoReel; origemId: string; autor: string | null; permalink: string | null };
  /** A manchete do molde, que vira o `title` da linha e o título na fila. */
  manchete: string;
  /** A legenda ainda sem fecho; o fecho e o crédito do vídeo são postos aqui. */
  legenda: string;
  molde: "a" | "b";
  /** O texto desenhado no vídeo e o corte usado, para a refação refazer igual. */
  desenho: Record<string, unknown>;
  video: ArtefatoCongelado;
  folhaUrl: string | null;
  /**
   * O post que este Reel já tem, quando é a versão refeita depois de uma
   * reprovação: a linha é a mesma (mesma vaga), com legenda e vídeo novos, e
   * volta à fila com hash novo.
   */
  postExistente?: string | null;
};

export type DepsDoReel = {
  client: SupabaseClient;
  agora?: () => Date;
};

type Falha = { ok: false; error: string };

/**
 * A linha do crédito do vídeo, a última da legenda. Sem autor conhecido, sem
 * linha, pela mesma regra da foto.
 */
export function creditoDoReel(fonte: FonteDoReel, autor: string | null): string {
  const nome = (autor ?? "").trim();
  if (!nome) return "";
  if (fonte === "instagram") return `Vídeo: @${nome.replace(/^@/, "")} (Instagram)`;
  if (fonte === "youtube") return `Vídeo: ${nome} (YouTube)`;
  return `Vídeo: ${nome}`;
}

/** O `story_id` do Reel: a origem do vídeo, que é o que não pode sair duas vezes. */
export function storyDoReel(fonte: FonteDoReel, origemId: string): string {
  return `reel:${fonte}:${origemId}`;
}

/** A linha de `social_posts` do Reel. Pura, para o teste conferir o contrato com `lerCargaV2`. */
export function linhaDoReel(
  projeto: Pick<Project, "id">,
  reel: ReelParaGravar,
  vaga: { quandoIso: string; slot: string },
  status: "scheduled" | "draft",
): Record<string, unknown> {
  const storyId = storyDoReel(reel.candidato.fonte, reel.candidato.origemId);
  const artefato = {
    index: 1,
    url: reel.video.url,
    path: reel.video.path,
    filename: reel.video.filename,
    mime: reel.video.mime,
    sha256: reel.video.sha256,
    bytes: reel.video.bytes,
    largura: reel.video.largura,
    altura: reel.video.altura,
    otimizado: reel.video.otimizado,
  };
  const credito = creditoDoReel(reel.candidato.fonte, reel.candidato.autor);
  return {
    project_id: projeto.id,
    edition_date: reel.data,
    platform: "instagram",
    // O CHECK da coluna é antigo; o formato que decide a publicação é `content_json.formato`.
    post_type: "carousel",
    status,
    dry_run: false,
    idempotency_key: chaveDeIdempotencia(reel.data, storyId),
    title: reel.manchete.slice(0, 300),
    caption: legendaDoInstagram(reel.legenda, { hashtags: "manter", credito }),
    slides_manifest: [
      { index: 1, url: artefato.url, filename: artefato.filename, sha256: artefato.sha256, bytes: artefato.bytes, provider_child_id: null },
    ],
    asset_paths: [artefato.url],
    scheduled_at: vaga.quandoIso,
    scheduled_slot: vaga.slot,
    generation_version: "social-v2",
    story_id: storyId,
    candidate_id: null,
    topic_id: null,
    event_fingerprint: storyId,
    // O texto do Reel passou pelas guardas da tarefa `escrever_reel` antes de chegar aqui.
    social_guard_status: "passed",
    social_guard_reasons: { finalDecision: "reel", issues: [] },
    content_json: {
      format: "reel",
      formato: "reel",
      hashtags: [],
      arte: { versao: "v2", molde: reel.molde, artefato, artefatos: [artefato] },
      reel: {
        candidato_id: reel.candidato.id,
        fonte: reel.candidato.fonte,
        origem_id: reel.candidato.origemId,
        autor: reel.candidato.autor,
        permalink: reel.candidato.permalink,
        molde: reel.molde,
        folha: reel.folhaUrl,
        credito,
        ...reel.desenho,
      },
    },
    updated_at: new Date().toISOString(),
  };
}

const DIAS_PARA_ACHAR_VAGA = 4;

function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function gravarReel(
  projeto: Project,
  reel: ReelParaGravar,
  deps: DepsDoReel,
): Promise<{ ok: true; postId: string; quando: string; legenda: string } | Falha> {
  if (modoDaFila(projeto) !== "enforce") {
    return { ok: false, error: "a fila de aprovação do projeto não está em enforce: nenhum Reel é gravado sem aprovação no painel" };
  }
  if (reel.video.mime !== "video/mp4") return { ok: false, error: `o Reel publica só video/mp4, veio ${reel.video.mime}` };

  if (reel.postExistente) return regravarReel(projeto, reel, reel.postExistente, deps);

  /*
   * A vaga: hoje, e sem vaga hoje, o próximo dia com horário livre (29/10/2026).
   * Antes o Reel que chegava depois da última vaga do dia falhava, e o texto
   * que o Claude escreveu se perdia.
   */
  const cadencia = cadenciaDoProjeto(projeto);
  const agora = deps.agora ? deps.agora() : new Date();
  let dataDaVaga = reel.data;
  let horaLocal: string | null = null;
  let motivo = "";
  for (let dia = 0; dia < DIAS_PARA_ACHAR_VAGA && !horaLocal; dia++) {
    dataDaVaga = somarDias(reel.data, dia);
    const { data: linhas, error } = await deps.client
      .from("social_posts")
      .select("status, scheduled_at, error_message, dry_run")
      .eq("project_id", projeto.id)
      .eq("edition_date", dataDaVaga)
      .eq("platform", "instagram");
    if (error) return { ok: false, error: `os posts de ${dataDaVaga} não puderam ser lidos: ${error.message}` };
    const vagas = vagasDaTarde({
      horarios: cadencia.instagram.horarios,
      dataIso: dataDaVaga,
      timezone: projeto.timezone,
      agoraMs: agora.getTime(),
      postsDoDia: (linhas ?? []) as PostDoDia[],
      maximoDoDia: cadencia.instagram.volume.maximo,
      maximoDoCiclo: 1,
    });
    horaLocal = vagas.teto > 0 ? vagas.horarios[0] : null;
    motivo = vagas.motivo;
  }
  if (!horaLocal) return { ok: false, error: `sem vaga no Instagram de ${reel.data} a ${dataDaVaga}: ${motivo}` };
  const quando = zonedTimeToUtc(dataDaVaga, horaLocal, projeto.timezone).toISOString();
  reel = { ...reel, data: dataDaVaga };

  const p = projetoDaFila(projeto, projeto.id);
  const fila = opcoesDaFilaParaOStore(p ? { ...p, slug: projeto.slug } : null, deps.client);
  const linha = linhaDoReel(
    projeto,
    reel,
    { quandoIso: quando, slot: `${reel.data}-reel-${horaLocal}` },
    fila.statusDeEntrada ?? statusDeEntradaDoPost("enforce"),
  );

  const { data, error: erroDeGravacao } = await deps.client
    .from("social_posts")
    .upsert([linha], { onConflict: "project_id,idempotency_key", ignoreDuplicates: true })
    .select("id");
  if (erroDeGravacao) return { ok: false, error: `o Reel não foi gravado: ${erroDeGravacao.message}` };
  const id = ((data ?? []) as Array<{ id: string }>)[0]?.id;
  if (!id) return { ok: false, error: "este vídeo já tem Reel gravado neste dia" };

  if (fila.aoGravar) await fila.aoGravar([{ id, linha }]);
  return { ok: true, postId: id, quando, legenda: String(linha.caption) };
}

/** A versão refeita: a mesma linha, a mesma vaga, o vídeo e a legenda novos. */
async function regravarReel(
  projeto: Project,
  reel: ReelParaGravar,
  postId: string,
  deps: DepsDoReel,
): Promise<{ ok: true; postId: string; quando: string; legenda: string } | Falha> {
  const { data: atual, error } = await deps.client
    .from("social_posts")
    .select("scheduled_at, scheduled_slot, status")
    .eq("id", postId)
    .eq("project_id", projeto.id)
    .maybeSingle();
  if (error) return { ok: false, error: `o Reel anterior não pôde ser lido: ${error.message}` };
  const linhaAtual = atual as { scheduled_at?: string; scheduled_slot?: string; status?: string } | null;
  if (!linhaAtual) return { ok: false, error: `o post ${postId} do Reel não existe mais` };

  const p = projetoDaFila(projeto, projeto.id);
  const fila = opcoesDaFilaParaOStore(p ? { ...p, slug: projeto.slug } : null, deps.client);
  const nova = linhaDoReel(
    projeto,
    reel,
    { quandoIso: linhaAtual.scheduled_at ?? "", slot: linhaAtual.scheduled_slot ?? "" },
    (linhaAtual.status as "scheduled" | "draft") ?? "draft",
  );
  const { project_id: _p, edition_date: _d, idempotency_key: _k, status: _s, scheduled_at: _a, scheduled_slot: _l, ...campos } = nova;
  const { data, error: erroDeGravacao } = await deps.client
    .from("social_posts")
    .update(campos)
    .eq("id", postId)
    .eq("project_id", projeto.id)
    // Nunca mexe em post que já está no ar ou com container criado.
    .is("provider_creation_id", null)
    .neq("status", "published")
    .select("id");
  if (erroDeGravacao) return { ok: false, error: `o Reel refeito não foi gravado: ${erroDeGravacao.message}` };
  if (!(data ?? []).length) return { ok: false, error: "o Reel anterior já foi publicado ou tem container na Meta" };

  if (fila.aoGravar) await fila.aoGravar([{ id: postId, linha: { ...nova, id: postId } }]);
  return { ok: true, postId, quando: String(linhaAtual.scheduled_at ?? ""), legenda: String(nova.caption) };
}
