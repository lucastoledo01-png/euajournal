import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { modoDaFila } from "@/lib/server/aprovacao/modo";
import { opcoesDaFilaParaOStore, projetoDaFila } from "@/lib/server/aprovacao/integracao";
import { montarContexto, pautaAvaliadaDoContexto } from "@/lib/server/aprovacao/contexto-de-producao";
import { cadenciaDoProjeto } from "@/lib/server/cadencia";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import { entidadesDaClassificacao } from "@/lib/server/editorial/classificador";
import { impressaoDoAcontecimento } from "@/lib/server/editorial/fingerprint";
import { chapeuDaPeca, gramaticaEfetiva, renderizarCapas, type EntradaDaCapa } from "@/lib/server/social/arte";
import { congelarArtefato } from "@/lib/server/social/artefato";
import { legendaDoInstagram, linhaDeCredito } from "@/lib/server/social/legenda-final";
import { modoDoPipelineSocial, permiteEnforce } from "@/lib/server/social/modo";
import { vagasDaTarde, type PostDoDia } from "@/lib/server/social/quente-da-tarde";
import { topicoDaPauta } from "@/lib/server/social/selecao";
import { avaliarPostSocial } from "@/lib/server/social/social-guard";
import { chaveDeIdempotencia, criarSocialPostsStore, resolverOrigem } from "@/lib/server/social/social-posts-store";
import { zonedTimeToUtc } from "@/lib/server/time";
import type { TarefasStore } from "../tarefas-store";
import type { MaterialDaEscrita, ResultadoDaEscrita } from "./fluxo";
import { visualDoMaterial } from "./material";

/**
 * Montar e agendar o post do Claude (27/10/2026).
 *
 * A mesma sequência que `rodarCicloSocial` faz depois da redação
 * (`social/pipeline-v2.ts`), sem modelo nenhum: os portões, a vaga, o chapéu,
 * a arte congelada, o crédito da legenda e a gravação pelo store, que grava o
 * histórico editorial e põe o post na fila de aprovação.
 *
 * Os portões que o store pula são repetidos aqui, porque quem chama o store
 * direto passa por fora do ciclo:
 *
 * - a fila de aprovação em `enforce`, sem exceção: no motor Claude nada vai ao
 *   ar sem alguém aprovar no painel (decisão do dono);
 * - o Social V2 em `enforce` no projeto, e a liberação do ambiente
 *   (`permiteEnforce`), as mesmas do ciclo.
 *
 * Na v1 a peça é única, no molde jornal, sem bolha: a bolha pede detecção de
 * rosto, que é chamada de modelo, e ainda não virou tarefa do Claude.
 */

export type DepsDoAgendamento = {
  client: SupabaseClient;
  tarefas: TarefasStore;
  candidata: (projectIdDaFonte: string, storyId: string) => Promise<CandidataPersistida | null>;
  env?: Record<string, string | undefined>;
  agora?: () => Date;
  /** Só para teste: o render e o congelamento de verdade abrem o Chromium. */
  renderizar?: typeof renderizarCapas;
  congelar?: typeof congelarArtefato;
};

type Falha = { ok: false; error: string };

function falha(error: string): Falha {
  return { ok: false, error };
}

/** O post pronto: a escrita que passou na auditoria e na guarda, com o material dela. */
async function postPronto(projeto: Project, storyId: string, data: string, deps: DepsDoAgendamento) {
  const tarefas = await deps.tarefas.doDia(projeto.id, data);
  const escrita = tarefas.find((t) => t.tipo === "escrever_post" && t.chave === storyId);
  if (!escrita) return falha(`não há escrita da pauta ${storyId} em ${data}`);
  const resultado = escrita.resultado as ResultadoDaEscrita | null;
  if (escrita.estado !== "entregue" || !resultado?.pronto) {
    return falha("o post ainda não passou pela auditoria e pela guarda: peça a próxima tarefa e entregue");
  }
  const material = escrita.material as MaterialDaEscrita;
  const candidata = await deps.candidata(material.origem.projectId, storyId);
  const pauta = pautaAvaliadaDoContexto(material.pauta, candidata);
  const veredicto = avaliarPostSocial(
    resultado.copy,
    {
      pauta,
      pacote: material.pacote,
      candidata,
      keyword: material.keyword,
      fechamentoDaNewsletter: (deps.env ?? process.env).NEWSLETTER_FINAL_LINE,
      hashtags: material.hashtags,
    },
    resultado.reparos,
  );
  // A guarda é determinística: o que passou na entrega passa aqui. Se não passar, algo mudou no meio.
  if (!veredicto.passed) {
    return falha(`a guarda não confirma mais o post: ${veredicto.issues.map((i) => i.detalhe).join("; ")}`);
  }
  return { ok: true as const, escrita, material, pauta, candidata, veredicto, copy: resultado.copy };
}

function capaDo(pronto: Exclude<Awaited<ReturnType<typeof postPronto>>, Falha>): EntradaDaCapa {
  const visual = visualDoMaterial(pronto.material);
  const eixo = pronto.pauta.classificacao.eixo ?? "";
  const chapeu = chapeuDaPeca({ eixo, textos: [pronto.copy.headline, pronto.material.pauta.titulo, pronto.material.pauta.resumo] });
  const gramatica = gramaticaEfetiva({ pedida: "jornal", eixo, chapeu, headline: pronto.copy.headline, comFoto: true });
  return {
    headline: pronto.copy.headline,
    eixo,
    chapeu,
    asset: visual.asset,
    assetSecundario: null,
    motivoSemFoto: "",
    gramatica,
  };
}

/** A prévia da peça, para o Claude olhar antes de agendar. Não grava nada. */
export async function montarPost(
  projeto: Project,
  pedido: { storyId: string; data: string },
  deps: DepsDoAgendamento,
): Promise<{ ok: true; png: Buffer; manchete: string; legenda: string } | Falha> {
  const pronto = await postPronto(projeto, pedido.storyId, pedido.data, deps);
  if (!pronto.ok) return pronto;
  const [arte] = await (deps.renderizar ?? renderizarCapas)([capaDo(pronto)]);
  if (!arte) return falha("o render não devolveu a peça");
  const credito = linhaDeCredito([visualDoMaterial(pronto.material).asset]);
  return {
    ok: true,
    // A prévia vai em JPEG: o PNG em 2x passa de 4 MB, e a peça congelada para a Meta é feita no agendamento.
    png: arte.jpeg,
    manchete: pronto.copy.headline,
    legenda: legendaDoInstagram(pronto.veredicto.legendaFinal, { hashtags: "manter", credito }),
  };
}

export async function agendarPost(
  projeto: Project,
  pedido: { storyId: string; data: string },
  deps: DepsDoAgendamento,
): Promise<{ ok: true; postId: string | null; quando: string; legenda: string } | Falha> {
  const env = deps.env ?? process.env;
  if (modoDaFila(projeto) !== "enforce") {
    return falha("a fila de aprovação do projeto não está em enforce: nada do Claude é agendado sem aprovação no painel");
  }
  if (modoDoPipelineSocial(env, projeto) !== "enforce") {
    return falha("o Social V2 do projeto não está em enforce (settings.capacidades.social)");
  }
  const liberacao = permiteEnforce(env);
  if (!liberacao.permitido) return falha(`o ambiente não libera gravar posts: ${liberacao.motivo}`);

  const pronto = await postPronto(projeto, pedido.storyId, pedido.data, deps);
  if (!pronto.ok) return pronto;

  const { data: linhas, error } = await deps.client
    .from("social_posts")
    .select("status, scheduled_at, error_message, dry_run")
    .eq("project_id", projeto.id)
    .eq("edition_date", pedido.data)
    .eq("platform", "instagram");
  if (error) return falha(`os posts do dia não puderam ser lidos: ${error.message}`);
  const cadencia = cadenciaDoProjeto(projeto);
  const agora = deps.agora ? deps.agora() : new Date();
  const vagas = vagasDaTarde({
    horarios: cadencia.instagram.horarios,
    dataIso: pedido.data,
    timezone: projeto.timezone,
    agoraMs: agora.getTime(),
    postsDoDia: (linhas ?? []) as PostDoDia[],
    maximoDoDia: cadencia.instagram.volume.maximo,
    maximoDoCiclo: 1,
  });
  const horaLocal = vagas.teto > 0 ? vagas.horarios[0] : null;
  if (!horaLocal) return falha(`sem vaga no Instagram em ${pedido.data}: ${vagas.motivo}`);
  const quando = zonedTimeToUtc(pedido.data, horaLocal, projeto.timezone).toISOString();

  const capa = capaDo(pronto);
  const chave = chaveDeIdempotencia(pedido.data, pedido.storyId);
  const congelado = await (deps.congelar ?? congelarArtefato)({ capa, path: `${projeto.slug}/${pedido.data}/${chave}` });
  if (!congelado.ok) return falha(`a arte não fechou: ${congelado.motivo}`);

  const visual = visualDoMaterial(pronto.material);
  const credito = linhaDeCredito([visual.asset]);
  const legendaFinal = legendaDoInstagram(pronto.veredicto.legendaFinal, { hashtags: "manter", credito });
  const p = projetoDaFila(projeto, projeto.id);
  const store = criarSocialPostsStore(deps.client, opcoesDaFilaParaOStore(p ? { ...p, slug: projeto.slug } : null, deps.client));

  const r = await store.gravar([
    {
      projectId: projeto.id,
      editionDate: pedido.data,
      post: {
        pauta: pronto.pauta,
        copy: pronto.copy,
        veredicto: pronto.veredicto,
        tentativas: pronto.veredicto.attempts,
        tokens: 0,
        custoUsd: 0,
        reparosAplicados: [],
      },
      chapeu: capa.chapeu,
      vaga: { posicao: pronto.material.posicao, slot: `${pedido.data}-mcp-${horaLocal}`, quandoIso: quando, horaLocal },
      visual,
      candidateId: pronto.candidata?.id ?? pronto.material.candidateId,
      topicId: topicoDaPauta(pronto.pauta),
      eventFingerprint:
        impressaoDoAcontecimento(entidadesDaClassificacao(pronto.pauta.classificacao)) || pedido.storyId,
      origem: resolverOrigem(pedido.storyId, []),
      formato: "static",
      artefatos: [{ ...congelado.artefato, index: 1 }],
      bolha: false,
      gramatica: capa.gramatica ?? "jornal",
      creditoDaLegenda: credito,
      creditosDasFotos: visual.asset?.attribution ? [visual.asset.attribution] : [],
      legendaFinal,
      contexto: montarContexto({
        data: pedido.data,
        pautas: [pronto.pauta],
        pacotes: new Map([[pedido.storyId, pronto.material.pacote]]),
      }),
      posicao: pronto.material.posicao,
    },
  ]);
  if (r.erros.length > 0) return falha(`o post não foi gravado: ${r.erros.join("; ")}`);
  if (r.gravados === 0) {
    return falha(`o post não foi gravado: ${r.bloqueadosPorIdempotencia.map((b) => b.motivo).join("; ") || "bloqueado"}`);
  }

  const { data: gravado } = await deps.client
    .from("social_posts")
    .select("id")
    .eq("project_id", projeto.id)
    .eq("idempotency_key", chave)
    .maybeSingle();
  return { ok: true, postId: (gravado as { id?: string } | null)?.id ?? null, quando, legenda: legendaFinal };
}
