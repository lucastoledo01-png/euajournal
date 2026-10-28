import type { SupabaseClient } from "@supabase/supabase-js";
import { avisarSemEsperar } from "../indexnow";
import { MARCA } from "@/lib/marca";
import { envDoListmonk } from "../credenciais-do-projeto";
import { createListmonkClient } from "../listmonk";
import type { Ramo } from "./contrato";
import type { AdaptadorDePecas, PecaLida, ProjetoDaFila, ResultadoDoDespacho } from "./fila";
import { hashDaNewsletter, hashDoArtigo, hashDoPlano, hashDoPostDaLinha } from "./hash";
import { itensEditados } from "../mcp/dia/plano-na-fila";
import { arteDaLinhaDoPost } from "../aprendizado/detalhes";
import { legendaDoInstagram } from "../social/legenda-final";

/**
 * As peças de verdade, nas tabelas de verdade.
 *
 * Cada ramo mora numa tabela: o post em `social_posts`, a newsletter em
 * `news_editions` (e no Listmonk, só na hora de sair), o artigo em `articles`.
 * O hash é sempre recalculado do que está na linha AGORA, nunca do que a fila
 * guardou: comparar a fila com ela mesma não confere nada.
 */

type Linha = Record<string, unknown>;

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** As frases da copy que servem de lastro para um número editado à mão. */
function materialDoPost(conteudo: Linha | null): string[] {
  const copy = (conteudo?.copy ?? {}) as Linha;
  // `paragrafos` desde 06/10/2026: é onde mora o corpo da legenda no método do Not Journal.
  const paragrafos = Array.isArray(copy.paragrafos) ? (copy.paragrafos as unknown[]).map(s) : [];
  return [...["headline", "gancho", "fato_principal", "contexto", "informacao_util", "ressalva", "destaque"].map((k) => s(copy[k])), ...paragrafos]
    .filter(Boolean);
}

function materialDaEdicao(stories: unknown): string[] {
  if (!Array.isArray(stories)) return [];
  return (stories as Linha[]).flatMap((st) =>
    ["title", "summary", "why_it_matters", "practical_impact", "body"].map((k) => s(st?.[k])).filter(Boolean),
  );
}

/**
 * Status de post cancelado, com a rede de quando a migration ainda não rodou.
 *
 * `cancelled` entra no CHECK de `social_posts` pela migration de 05/10/2026.
 * Sem ela, o Postgres recusa com 23514, e aí vale o que o incidente de 16/09
 * mandou fazer: `draft` com o motivo em `error_message` começando por
 * CANCELADO, que é o que permite separar depois.
 */
async function retirarPost(client: SupabaseClient, id: string, tipo: "cancelada" | "descartada", motivo: string) {
  const rotulo = tipo === "cancelada" ? "CANCELADO" : "DESCARTADO";
  const mensagem = `${rotulo}: ${motivo}`.slice(0, 1000);
  const base = () =>
    client
      .from("social_posts")
      .update({ status: "cancelled", error_message: mensagem, updated_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "published");
  const { error } = await base();
  if (!error) return;
  if (error.code === "23514" || /social_posts_status_check/.test(error.message)) {
    const { error: e2 } = await client
      .from("social_posts")
      .update({ status: "draft", error_message: mensagem, updated_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "published");
    if (e2) throw new Error(`[FILA] não consegui retirar o post ${id}: ${e2.message}`);
    return;
  }
  throw new Error(`[FILA] não consegui retirar o post ${id}: ${error.message}`);
}

export function criarAdaptadorSupabase(
  client: SupabaseClient,
  projeto: ProjetoDaFila,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): AdaptadorDePecas {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const keyword = s((projeto.settings ?? {}).instagram_keyword);

  async function lerLinha(tabela: string, colunas: string, id: string): Promise<Linha | null> {
    const { data, error } = await client.from(tabela).select(colunas).eq("id", id).eq("project_id", projeto.id).maybeSingle();
    if (error) throw new Error(`[FILA] não consegui ler ${tabela} ${id}: ${error.message}`);
    return (data as Linha | null) ?? null;
  }

  /*
   * O artigo liberado pela fila, com três ajustes da integração de 05/10/2026:
   *
   *   1. Horário futuro na linha FICA agendado. A matéria do ramo nasce com
   *      `published_at` no horário dela; aprovar às 22h a matéria das 12:00 e
   *      publicá-la às 22h atropelaria a cadência. Ela fica `scheduled`, e
   *      quem a publica na hora é o relógio do portal, que pergunta ao portão
   *      de novo e encontra esta aprovação. A liberação da fila já espera o
   *      `publicar_em`, então isto é o cinto para fila e linha discordarem.
   *   2. `manual_review_status` vira `approved`, a coluna que a regra do ramo
   *      lê (`publicarArtigosAprovados`). Sem isto, a aprovação da fila e a do
   *      ramo seriam duas aprovações para a mesma matéria.
   *   3. Já publicado é sucesso. O relógio do portal pode ter publicado no
   *      mesmo minuto, e responder falha aqui soltaria a liberação e mandaria
   *      alerta a cada giro sobre uma matéria que está no ar.
   */
  async function despacharArtigo(pecaId: string, agora: Date): Promise<ResultadoDoDespacho> {
    const l = await lerLinha("articles", "id, slug, status, published_at", pecaId);
    if (!l) return { ok: false, motivo: "o artigo não existe mais" };
    if (l.status === "published") return { ok: true, detalhe: "artigo já estava publicado no portal" };

    const horario = typeof l.published_at === "string" ? Date.parse(l.published_at) : NaN;
    const futuro = Number.isFinite(horario) && horario > agora.getTime();
    const campos = futuro
      ? { status: "scheduled", manual_review_status: "approved", updated_at: agora.toISOString() }
      : {
          status: "published",
          manual_review_status: "approved",
          published_at: agora.toISOString(),
          updated_at: agora.toISOString(),
        };
    const { data, error } = await client
      .from("articles")
      .update(campos)
      .eq("id", pecaId)
      .eq("project_id", projeto.id)
      .in("status", ["draft", "scheduled"])
      .select("id");
    if (error) return { ok: false, motivo: error.message };
    if (!data || data.length === 0) return { ok: false, motivo: "o artigo não estava em rascunho nem agendado" };
    // Publicada agora pela liberação da fila: o IndexNow avisa sem segurar o despacho (06/10/2026).
    if (!futuro && typeof l.slug === "string") avisarSemEsperar(client, projeto.id, [l.slug], "publicada pela liberação da fila");
    return futuro
      ? { ok: true, detalhe: `artigo aprovado e agendado para ${String(l.published_at)}` }
      : { ok: true, detalhe: "artigo publicado no portal" };
  }

  const adaptador: AdaptadorDePecas = {
    async ler(ramo, pecaId): Promise<PecaLida | null> {
      if (ramo === "plano") {
        const l = await lerLinha("planos_do_dia", "id, data, itens", pecaId);
        if (!l) return null;
        const texto = JSON.stringify(l.itens ?? {}, null, 2);
        return { hashAtual: hashDoPlano(l.itens), texto, titulo: `Plano do dia ${s(l.data)}`, material: [texto] };
      }
      if (ramo === "post") {
        const l = await lerLinha("social_posts", "id, title, caption, slides_manifest, content_json", pecaId);
        if (!l) return null;
        const conteudo = ((l.content_json as Linha) ?? {}) as Linha;
        const foto = s(((conteudo.visual ?? {}) as Linha).imageUrl);
        return {
          hashAtual: hashDoPostDaLinha(l),
          texto: s(l.caption),
          titulo: s(l.title),
          material: materialDoPost(conteudo),
          keyword,
          // A foto de FUNDO e a decisão de arte, para a reprovação gravar o que a peça tinha.
          extras: { fotos: foto ? [foto] : [], arte: arteDaLinhaDoPost(conteudo.arte as Linha | undefined) },
        };
      }
      if (ramo === "newsletter") {
        const l = await lerLinha("news_editions", "id, subject, headline, content_html, stories", pecaId);
        if (!l) return null;
        return {
          hashAtual: hashDaNewsletter(s(l.subject), s(l.content_html)),
          texto: s(l.subject),
          titulo: s(l.headline) || s(l.subject),
          material: [s(l.headline), ...materialDaEdicao(l.stories)],
        };
      }
      const l = await lerLinha("articles", "id, title, content_html, excerpt, description, cover_image", pecaId);
      if (!l) return null;
      return {
        hashAtual: hashDoArtigo(s(l.title), s(l.content_html), s(l.cover_image)),
        texto: s(l.title),
        titulo: s(l.title),
        material: [s(l.excerpt), s(l.description), s(l.content_html)],
        extras: { fotos: s(l.cover_image) ? [s(l.cover_image)] : [] },
      };
    },

    async gravarTexto(ramo: Ramo, pecaId, novoTexto) {
      const agora = new Date().toISOString();
      if (ramo === "plano") {
        // O dono só tira item do plano: pauta que o Claude não propôs não entra pela edição.
        const atual = await lerLinha("planos_do_dia", "id, itens", pecaId);
        if (!atual) throw new Error("[FILA] o plano não existe mais");
        const itens = itensEditados(atual.itens, novoTexto);
        const { error } = await client.from("planos_do_dia").update({ itens, atualizado_em: agora }).eq("id", pecaId).eq("project_id", projeto.id);
        if (error) throw new Error(`[FILA] não consegui gravar o plano: ${error.message}`);
      } else if (ramo === "post") {
        const { error } = await client
          .from("social_posts")
          /*
           * A edição à mão passa pelo mesmo fecho da esteira (06/10/2026): o
           * crédito fora do lugar sai, "Siga @eua.journal" fica uma vez, e a
           * linha curta do crédito logo abaixo dele é preservada. As regras do
           * dono valem para quem digita também.
           */
          .update({ caption: legendaDoInstagram(novoTexto, { hashtags: "manter", credito: "manter", keyword }), updated_at: agora })
          .eq("id", pecaId)
          .eq("project_id", projeto.id);
        if (error) throw new Error(`[FILA] não consegui gravar a legenda: ${error.message}`);
      } else if (ramo === "newsletter") {
        const { error } = await client
          .from("news_editions")
          .update({ subject: novoTexto, updated_at: agora })
          .eq("id", pecaId)
          .eq("project_id", projeto.id);
        if (error) throw new Error(`[FILA] não consegui gravar o assunto: ${error.message}`);
      } else {
        const { error } = await client
          .from("articles")
          .update({ title: novoTexto, seo_title: novoTexto, updated_at: agora })
          .eq("id", pecaId)
          .eq("project_id", projeto.id);
        if (error) throw new Error(`[FILA] não consegui gravar o título: ${error.message}`);
      }
      const relida = await adaptador.ler(ramo, pecaId);
      if (!relida) throw new Error("[FILA] a peça sumiu depois da edição");
      return { hashNovo: relida.hashAtual };
    },

    async despachar(ramo, pecaId, aprovacao): Promise<ResultadoDoDespacho> {
      const agora = new Date();

      if (ramo === "plano") {
        // Aprovar o plano não publica nada: libera o Claude para produzir o que ele lista.
        const { data, error } = await client
          .from("planos_do_dia")
          .update({ estado: "aprovado", etapa: "preparo", motivo: null, atualizado_em: agora.toISOString() })
          .eq("id", pecaId)
          .eq("project_id", projeto.id)
          .select("id");
        if (error) return { ok: false, motivo: error.message };
        if (!data || data.length === 0) return { ok: false, motivo: "o plano não existe mais" };
        return { ok: true, detalhe: "plano aprovado: o Claude segue para a produção" };
      }

      if (ramo === "post") {
        /*
         * A promoção para `scheduled` é a ÚNICA escrita desse status quando a
         * fila está em `enforce`. O horário fica o planejado, ou agora se ele
         * já passou: aprovar às 15h um post planejado para as 12h o publica no
         * próximo giro do worker, e não amanhã.
         */
        const planejado = aprovacao.publicarEm ? Date.parse(aprovacao.publicarEm) : NaN;
        const quando = new Date(Number.isFinite(planejado) ? Math.max(planejado, agora.getTime()) : agora.getTime());
        const { data, error } = await client
          .from("social_posts")
          .update({ status: "scheduled", scheduled_at: quando.toISOString(), error_message: null, updated_at: agora.toISOString() })
          .eq("id", pecaId)
          .eq("project_id", projeto.id)
          .in("status", ["draft", "scheduled"])
          .select("id");
        if (error) return { ok: false, motivo: error.message };
        if (!data || data.length === 0) return { ok: false, motivo: "o post não estava em rascunho nem agendado" };
        return { ok: true, detalhe: `post na vaga do worker para ${quando.toISOString()}` };
      }

      if (ramo === "artigo") return despacharArtigo(pecaId, agora);

      /*
       * Newsletter: a campanha nasce AQUI, com o assunto e o HTML que estão na
       * linha agora, e não na hora da redação. Assim o que sai é, por
       * construção, a versão cujo hash foi aprovado, e uma edição de assunto
       * feita na fila não precisa de PUT em campanha já criada.
       */
      const l = await lerLinha("news_editions", "id, subject, content_html, edition_date", pecaId);
      if (!l) return { ok: false, motivo: "a edição não existe mais" };
      const listmonk = createListmonkClient(await envDoListmonk(projeto.id, env), fetcher);
      const r = await listmonk.createCampaign({
        name: `${MARCA.nome}, edição ${s(l.edition_date)}`,
        subject: s(l.subject),
        body: s(l.content_html),
        autoSend: true,
      });
      if (!r.ok || !r.id) return { ok: false, motivo: `Listmonk: ${"reason" in r ? r.reason : "sem id de campanha"}` };
      return { ok: true, detalhe: `campanha #${r.id} disparada no Listmonk` };
    },

    async retirar(ramo, pecaId, tipo, motivo) {
      if (ramo === "post") return retirarPost(client, pecaId, tipo, motivo);
      if (ramo === "plano") {
        const { error } = await client
          .from("planos_do_dia")
          .update({ estado: "reprovado", motivo: `${tipo}: ${motivo}`.slice(0, 2000), atualizado_em: new Date().toISOString() })
          .eq("id", pecaId)
          .eq("project_id", projeto.id);
        if (error) throw new Error(`[FILA] não consegui retirar o plano ${pecaId}: ${error.message}`);
        return;
      }
      /*
       * Newsletter não tem o que retirar: a campanha só nasce no despacho, e a
       * linha de `news_editions` continua sendo o registro da edição, que o
       * Instagram lê. O que impede o envio é o estado da aprovação.
       */
      if (ramo === "newsletter") return;
      const { error } = await client
        .from("articles")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", pecaId)
        .eq("project_id", projeto.id)
        .neq("status", "published");
      if (error) throw new Error(`[FILA] não consegui retirar o artigo ${pecaId}: ${error.message} (${tipo}: ${motivo})`);
    },
  };

  return adaptador;
}
