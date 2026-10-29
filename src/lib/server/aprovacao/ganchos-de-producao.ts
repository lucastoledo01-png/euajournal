import type { SupabaseClient } from "@supabase/supabase-js";
import { creditoDoAsset, htmlDoCredito, legendaNeutra } from "@/lib/credito-da-capa";
import { enderecoLimpoDaImagem } from "@/lib/imagem-da-capa";
import { htmlDaLegenda } from "../legenda-da-capa";
import { temFotoDaPauta } from "../ramos/sem-foto";
import type { Project } from "../projects";
import type { OrigemDoArtigo } from "../ramos/portal";
import type { Artigo, MarcaDoArtigo, ResultadoDoArtigo } from "../ramos/artigo";
import type { ResultadoVisual } from "../visual/tipos";
import type { PautaParaImagem } from "../visual/resolver";
import type {
  ResultadoDoCongelamento,
  EntradaDoCongelamento,
  EntradaDoCarrossel,
  ResultadoDoCarrossel,
} from "../social/artefato";
import { criarGanchosPorEtapa, CARROSSEL_SEM_FORMA, type MundoDaRefacao } from "./ganchos-por-etapa";
import { mundoDaRefacaoDeProducao } from "./mundo-da-refacao";
import type { ContextoDaRefacao, GanchosDeRefazer, ResultadoDaEtapa } from "./refazer";
import { getSupabaseAdminClient } from "../supabase-admin";
import type { PapelDeSlide } from "../social/carrossel/estrutura";
import type { CopyDoCarrossel } from "../social/carrossel/copy";
import { moldesLigados } from "../social/moldes-do-feed";
import { aprendizadoDaArteVazio, arteNaRefacao } from "../aprendizado/arte";
import { arteDaLinhaDoPost } from "../aprendizado/detalhes";
import { fotoNovaServe, imagemNaRefacao } from "../aprendizado/imagem";
import { legendaDoInstagram, linhaDeCredito } from "../social/legenda-final";

/**
 * Os ganchos de refação ligados de verdade (RF-22, integração de 05/10/2026).
 *
 * A fila nasceu com `GANCHOS_DE_PRODUCAO` vazio, e disse por quê: cada etapa
 * pede a pauta avaliada inteira, que não sobrevive ao ciclo. A integração
 * resolveu o caso do ARTIGO gravando na própria linha da fila
 * (`resumo.origemDoArtigo`) o pacote factual e a classificação de onde a
 * matéria saiu, e o caso da IMAGEM e da ARTE do post lendo o que a linha de
 * `social_posts` já guarda (manchete, foto, gramática, story_id).
 *
 * O que está ligado:
 *
 *   artigo.texto   reescreve pelo MESMO redator e MESMO auditor do ramo
 *                  (`escreverArtigoDaPauta`), com a memória de reprovação e o
 *                  motivo do editor no fim da voz. Reprovado no auditor, a
 *                  refação falha e a peça fica em `refazendo`: a fila não é
 *                  lugar de consertar fato inventado.
 *   artigo.imagem  resolve outra foto por `imagemDaPauta`, sem cache, e troca
 *                  só a capa. O título e o HTML não mudam.
 *   post.imagem    idem, gravando a foto nova em `content_json.visual`.
 *   post.arte      recongela a capa com a manchete e a foto da linha, num
 *                  caminho NOVO (nunca sobrescreve: incidente de 16/09).
 *
 * O que continua SEM refação automática, e por quê:
 *
 *   selecao (todos)    refazer a seleção é escolher OUTRA pauta, e isso é o
 *                      ciclo do dia inteiro de novo, não uma etapa.
 *   post.texto         o gerador do post (`gerarPostDaPauta`) pede a pauta
 *                      avaliada inteira e o pacote, que não estão na linha
 *                      do post; reescrever a legenda por fora seria um segundo
 *                      gerador sem a guarda social.
 *   newsletter.*       o texto é a edição inteira (2 a 4 pautas, um laço de
 *                      reparo e o QA); a imagem é uma por pauta dentro do HTML
 *                      já montado. Nenhuma das duas é etapa de uma peça só.
 *   carrossel          refazer imagem ou arte de N telas exige o compositor do
 *                      carrossel; o gancho recusa com o motivo.
 *
 * Nos casos sem gancho a peça fica em `refazendo` com o motivo no painel, que é
 * o comportamento que a fila já tinha.
 *
 * ATUALIZADO em 06/10/2026, véspera de a fila valer: a lista acima de "sem
 * refação" foi toda ligada, em `ganchos-por-etapa.ts` (seleção dos três ramos,
 * texto do post e do carrossel, a newsletter inteira) e aqui mesmo (imagem e
 * arte do carrossel). O que tornou possível foi gravar o contexto de produção
 * na linha da fila (`resumo.contexto`) e remontá-lo das tabelas para as peças
 * antigas. A foto refeita passou a ser só da peça reprovada: `imagemDaPauta`
 * com `ignorarReuso` não regrava mais a foto compartilhada da pauta.
 *
 * Tudo aqui, menos o cliente do banco, é importado na hora (`import()` dentro do gancho): este arquivo é
 * lido por `integracao.ts`, que o worker e o ciclo social também importam, e
 * o renderizador e o redator não têm o que fazer no grafo deles.
 */

type Linha = Record<string, unknown>;

/** O que os ganchos precisam do mundo. Injetável, para o teste produzir o "não" sem rede. */
export type MundoDosGanchos = {
  client: () => SupabaseClient;
  projeto: (id: string) => Promise<Project>;
  vozDoArtigo: (projectId: string) => Promise<string>;
  escrever: (
    pauta: { classificacao: { pais: string; eixo: string }; grupo: { primary: { source_name: string } } },
    pacote: OrigemDoArtigo["pacote"],
    marca: MarcaDoArtigo,
  ) => Promise<ResultadoDoArtigo>;
  renderizarHtml: (
    artigo: Artigo,
    fonte: { nome: string; url: string },
    /** As fontes do pacote, quando a matéria juntou mais de uma (06/10/2026). */
    fontes?: Array<{ id: string; nome: string; url: string }>,
  ) => Promise<string> | string;
  imagem: (
    pauta: PautaParaImagem,
    ctx: {
      client: SupabaseClient;
      projeto: Project;
      evitar: string[];
      /** Por que o editor recusou fotos neste canal (06/10/2026): vai para a pergunta da cena. */
      recusas?: string[];
    },
  ) => Promise<ResultadoVisual>;
  congelar: (entrada: EntradaDoCongelamento) => Promise<ResultadoDoCongelamento>;
  /** O congelamento das N telas do carrossel (06/10/2026). */
  congelarCarrossel?: (entrada: EntradaDoCarrossel) => Promise<ResultadoDoCarrossel>;
  agora?: () => number;
} & Partial<Omit<MundoDaRefacao, "client" | "projeto" | "imagem" | "agora">>;

/** O mundo tem tudo o que os ganchos de 06/10/2026 pedem? Só então eles entram. */
function mundoCompleto(m: MundoDosGanchos): m is MundoDosGanchos & MundoDaRefacao {
  const chaves: Array<keyof MundoDaRefacao> = [
    "candidatasPorStory",
    "candidatasPorUrl",
    "poolDoDia",
    "historico",
    "config",
    "montarPacote",
    "fotoDaPauta",
    "marcaDoPost",
    "gerarPost",
    "produzirPost",
    "produzirArtigo",
    "reescreverNewsletter",
    "renderizarNewsletter",
  ];
  return chaves.every((k) => typeof (m as Record<string, unknown>)[k] === "function");
}

/** A pauta que o post guardou em `content_json.contexto_da_refacao`: a dele (pelo `story_id`) ou a primeira. */
export function pautaGuardadaNoPost(contentJson: Linha, storyId: unknown): Linha | null {
  const cx = (contentJson.contexto_da_refacao ?? null) as Linha | null;
  const pautas = cx && Array.isArray(cx.pautas) ? (cx.pautas as Linha[]) : [];
  return pautas.find((p) => p && p.storyId === storyId) ?? pautas[0] ?? null;
}

/**
 * A pauta que a refação da foto do post entrega ao resolvedor (06/10/2026).
 *
 * O título é o da FONTE e a manchete é a do post, como no ciclo: o
 * protagonista sai das duas. Os atores vêm da pauta guardada no post ou, sem
 * ela, das colunas de `news_candidates` (`actors`, `places`, `event_terms`).
 */
export function pautaDoPostParaImagem(
  post: { storyId: string; manchete: string; eixo: string },
  guardada: Linha | null,
  candidata: Linha | null,
): PautaParaImagem {
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const txt = (v: unknown) => (typeof v === "string" ? v : "");
  const p = guardada ?? {};
  const c = candidata ?? {};
  return {
    storyId: post.storyId,
    titulo: txt(p.titulo) || txt(c.title) || post.manchete,
    manchete: post.manchete,
    resumo: txt(p.resumo) || txt(c.summary),
    categoria: txt(p.eixo) || txt(p.categoria) || txt(c.editorial_axis) || post.eixo,
    classificacao: {
      atores: guardada ? lista(p.atores) : lista(c.actors),
      lugares: guardada ? lista(p.lugares) : lista(c.places),
      acontecimento: guardada ? lista(p.acontecimento) : lista(c.event_terms),
      pais: txt(p.pais) || txt(c.country) || "EUA",
    },
  };
}

function falha(motivo: string): ResultadoDaEtapa {
  return { ok: false, motivo };
}

function origemDe(ctx: ContextoDaRefacao): OrigemDoArtigo | null {
  const o = ctx.aprovacao.resumo?.origemDoArtigo;
  return o && typeof o === "object" && o.pacote ? o : null;
}

const SEM_ORIGEM =
  "a fila não guardou a pauta desta matéria (peça anterior à integração de 05/10/2026 ou artigo da edição): refaça à mão";

/** O bloco que vai no fim da voz do redator, na refação. */
export function instrucaoDaRefacao(ctx: Pick<ContextoDaRefacao, "naoRepetir" | "motivo">): string {
  return [
    ctx.naoRepetir,
    `ESTA MATÉRIA FOI REPROVADA PELO EDITOR, e é isto que precisa mudar: ${ctx.motivo}`,
  ]
    .filter((t) => t && t.trim())
    .join("\n\n");
}

async function lerLinha(client: SupabaseClient, tabela: string, colunas: string, id: string, projectId: string) {
  const { data, error } = await client.from(tabela).select(colunas).eq("id", id).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`não consegui ler ${tabela} ${id}: ${error.message}`);
  return (data as Linha | null) ?? null;
}

export function criarGanchosDeProducao(mundo: MundoDosGanchos): GanchosDeRefazer {
  const textoDoArtigo = async (ctx: ContextoDaRefacao): Promise<ResultadoDaEtapa> => {
    const origem = origemDe(ctx);
    if (!origem) return falha(SEM_ORIGEM);
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const voz = await mundo.vozDoArtigo(projeto.id);
    const marca: MarcaDoArtigo = {
      nome: projeto.brand.displayName || projeto.name,
      nicho: projeto.niche,
      briefing: projeto.editorialPromptExtra ?? "",
      voz: [voz, instrucaoDaRefacao(ctx)].filter(Boolean).join("\n\n"),
    };
    const r = await mundo.escrever(
      { classificacao: { pais: origem.pais, eixo: origem.eixo }, grupo: { primary: { source_name: origem.fonteNome } } },
      origem.pacote,
      marca,
    );
    if (!r.artigo) return falha(`a reescrita não saiu: ${r.erro ?? r.veredicto.bloqueios.join(" | ")}`);
    if (!r.veredicto.aprovado) {
      return falha(`a reescrita não passou no auditor do artigo: ${r.veredicto.bloqueios.join(" | ")}`);
    }

    const a = r.artigo;
    const fontesDoPacote = origem.pacote.fontes?.length ? origem.pacote.fontes.map((f) => ({ id: f.id, nome: f.nome, url: f.url })) : undefined;
    const corpo = await mundo.renderizarHtml(a, { nome: origem.fonteNome, url: origem.fonteUrl }, fontesDoPacote);
    /*
     * A legenda e o crédito da capa moram no corpo (06/10/2026), e a etapa
     * culpada foi o texto: os dois parágrafos da linha atual passam para o
     * corpo novo. Antes daqui a reescrita os apagava junto com o texto velho.
     */
    const atual = await lerLinha(mundo.client(), "articles", "id, content_html", ctx.aprovacao.pecaId, ctx.aprovacao.projectId).catch(() => null);
    const htmlAtual = typeof atual?.content_html === "string" ? atual.content_html : "";
    const cabecaDaCapa = [
      htmlAtual.match(/<p[^>]*class="legenda-da-capa"[^>]*>[\s\S]*?<\/p>/i)?.[0] ?? "",
      htmlAtual.match(/<p[^>]*class="credito-da-foto"[^>]*>[\s\S]*?<\/p>/i)?.[0] ?? "",
    ].join("");
    const html = `${cabecaDaCapa}${corpo}`;
    const palavras = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    const agora = new Date(mundo.agora ? mundo.agora() : Date.now()).toISOString();
    /*
     * O slug e o horário NÃO mudam: o endereço da matéria e a vaga dela na
     * cadência são da peça, não do texto. A capa também fica: a etapa
     * culpada foi o texto.
     */
    const { data, error } = await mundo
      .client()
      .from("articles")
      .update({
        title: a.titulo,
        excerpt: a.subtitulo || a.descricao_seo,
        description: a.descricao_seo,
        content_html: html,
        content: (await import("../ramos/artigo")).secoesParaConteudo(a),
        seo_title: a.titulo_seo,
        seo_description: a.descricao_seo.slice(0, 160),
        aeo_questions: a.perguntas,
        reading_minutes: Math.max(1, Math.ceil(palavras / 200)),
        updated_at: agora,
      })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", ctx.aprovacao.projectId)
      .in("status", ["draft", "scheduled"])
      .select("id");
    if (error) return falha(`a reescrita não foi gravada: ${error.message}`);
    if (!data || data.length === 0) return falha("o artigo não está mais em rascunho nem agendado");
    return { ok: true, resumo: { titulo: a.titulo, texto: a.titulo } };
  };

  const imagemDoArtigo = async (ctx: ContextoDaRefacao): Promise<ResultadoDaEtapa> => {
    const origem = origemDe(ctx);
    if (!origem) return falha(SEM_ORIGEM);
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const linha = await lerLinha(client, "articles", "id, title, cover_image, content_html, tags, category", ctx.aprovacao.pecaId, projeto.id);
    if (!linha) return falha("o artigo não existe mais");
    const atual = typeof linha.cover_image === "string" ? linha.cover_image : "";
    // O canal não volta a uma foto que já recusou, e a cena recebe o porquê (06/10/2026).
    const { evitar, recusas } = imagemNaRefacao([atual], ctx.motivo, ctx.aprendizado?.imagem);

    const r = await mundo.imagem(
      {
        storyId: origem.storyId,
        titulo: origem.titulo,
        // O protagonista sai da manchete que vai ao ar (06/10/2026, "imagem certeira").
        ...(typeof linha.title === "string" && linha.title ? { manchete: linha.title } : {}),
        resumo: origem.resumo,
        categoria: origem.eixo,
        classificacao: {
          atores: origem.atores,
          lugares: origem.lugares,
          acontecimento: origem.acontecimento,
          pais: origem.pais,
        },
      },
      { client, projeto, evitar, recusas },
    );
    // Só foto real da pauta; a bandeira não é publicada desde 05/10/2026 (`sem-foto.ts`).
    const nova = temFotoDaPauta(r) ? enderecoLimpoDaImagem(r.asset?.imageUrl) : "";
    if (!fotoNovaServe(nova, [atual], evitar)) return falha("o resolvedor não achou outra foto para esta pauta");

    /*
     * A legenda e o crédito eram da foto VELHA (06/10/2026): saem do corpo, e
     * entram o crédito da nova (do asset que o resolvedor escolheu) e a
     * legenda neutra, que não afirma nada sobre a foto.
     */
    const htmlAtual = typeof linha.content_html === "string" ? linha.content_html : "";
    const semCabeca = htmlAtual
      .replace(/<p[^>]*class="legenda-da-capa"[^>]*>[\s\S]*?<\/p>/gi, "")
      .replace(/<p[^>]*class="credito-da-foto"[^>]*>[\s\S]*?<\/p>/gi, "");
    const tags = Array.isArray(linha.tags) ? (linha.tags as unknown[]).map(String) : [];
    const assunto = tags.find((t) => t.startsWith("assunto:"))?.slice("assunto:".length) ?? (typeof linha.category === "string" ? linha.category : "");
    const credito = creditoDoAsset(r.asset ?? null);
    const content_html = `${htmlDaLegenda(legendaNeutra(assunto))}${credito ? htmlDoCredito(credito) : ""}${semCabeca}`;

    const { error } = await client
      .from("articles")
      .update({ cover_image: nova, content_html, updated_at: new Date(mundo.agora ? mundo.agora() : Date.now()).toISOString() })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", projeto.id)
      .in("status", ["draft", "scheduled"]);
    if (error) return falha(`a capa nova não foi gravada: ${error.message}`);
    return { ok: true, resumo: { imagens: [nova] } };
  };

  function ehCarrossel(l: Linha): boolean {
    const cj = (l.content_json ?? {}) as Linha;
    return (
      cj.formato === "carousel" ||
      (Array.isArray(((cj.copy ?? {}) as Linha).slides) && (((cj.copy ?? {}) as Linha).slides as unknown[]).length > 0) ||
      (Array.isArray(cj.slides) && cj.slides.length > 0) ||
      (Array.isArray(l.asset_paths) && l.asset_paths.length > 1) ||
      Boolean(cj.carrossel)
    );
  }

  const COLUNAS_DO_POST = "id, story_id, title, caption, edition_date, content_json, asset_paths";

  const imagemDoPost = async (ctx: ContextoDaRefacao): Promise<ResultadoDaEtapa> => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const l = await lerLinha(client, "social_posts", COLUNAS_DO_POST, ctx.aprovacao.pecaId, projeto.id);
    if (!l) return falha("o post não existe mais");
    /*
     * O carrossel tem uma foto só, a da capa; a refação troca a foto e a arte
     * recongela as telas todas (06/10/2026). Antes daqui a peça ficava parada.
     */
    const cj = (l.content_json ?? {}) as Linha;
    if (ehCarrossel(l)) {
      const forma = (cj.carrossel ?? {}) as Linha;
      if (!Array.isArray(forma.papeis) || forma.papeis.length === 0) return falha(CARROSSEL_SEM_FORMA);
    }
    const copy = (cj.copy ?? {}) as Linha;
    const arte = (cj.arte ?? {}) as Linha;
    const visual = (cj.visual ?? {}) as Linha;
    const atual = typeof visual.imageUrl === "string" ? visual.imageUrl : "";
    const storyId = typeof l.story_id === "string" && l.story_id ? l.story_id : String(l.id);

    /*
     * A pauta do post, para o resolvedor (corrigido em 06/10/2026, depois do
     * `--aplicar` da fila de 07/10). Esta leitura pedia a coluna
     * `news_candidates.classificacao`, que NÃO existe no banco: o PostgREST
     * devolvia erro, `data` vinha nulo e o resolvedor recebia `atores: []`.
     * Sem atores, a manchete não tem protagonista que case, e a refação da
     * foto do post descia para a cena: o post da Anthropic ganhou outro
     * escritório do Pexels e o do Caiado, o Capitólio, com
     * `content_json.visual.protagonista: null` gravado como prova. A matéria
     * não sofria porque lê a pauta de `origemDoArtigo`.
     *
     * Agora a fonte é a pauta que o próprio post guarda
     * (`content_json.contexto_da_refacao`), e a candidata, pelas colunas que
     * existem, só quando o post não guarda.
     */
    const guardada = pautaGuardadaNoPost(cj, l.story_id);
    let candidata: Linha | null = null;
    if (!guardada && typeof l.story_id === "string" && l.story_id) {
      const { data } = await client
        .from("news_candidates")
        .select("title, summary, editorial_axis, actors, places, event_terms, country")
        .eq("project_id", projeto.id)
        .eq("story_id", l.story_id)
        .limit(1);
      candidata = ((data ?? []) as Linha[])[0] ?? null;
    }
    const daPauta = pautaDoPostParaImagem(
      { storyId, manchete: String(copy.headline ?? l.title ?? ""), eixo: String(arte.eixo ?? "") },
      guardada,
      candidata,
    );

    // O canal não volta a uma foto que já recusou, e a cena recebe o porquê (06/10/2026).
    const { evitar, recusas } = imagemNaRefacao([atual], ctx.motivo, ctx.aprendizado?.imagem);
    const r = await mundo.imagem(daPauta, { client, projeto, evitar, recusas });
    // Só foto real da pauta; a bandeira não é publicada desde 05/10/2026 (`sem-foto.ts`).
    const nova = temFotoDaPauta(r) ? (r.asset?.imageUrl ?? "") : "";
    if (!fotoNovaServe(nova, [atual], evitar)) return falha("o resolvedor não achou outra foto para esta pauta");

    /*
     * O crédito da legenda acompanha a foto (06/10/2026). A refação trocava a
     * foto e deixava "Foto: Brett Sayles" (o fotógrafo do Pexels da foto
     * velha) embaixo do logotipo da Anthropic. Na peça única a linha é
     * remontada do asset novo; no carrossel as outras telas têm fotos
     * próprias, e a linha fica como estava.
     */
    const creditoNovo = linhaDeCredito([r.asset ?? null]);
    const legendaAtual = typeof l.caption === "string" ? l.caption : "";
    const legendaNova =
      legendaAtual && !ehCarrossel(l) ? legendaDoInstagram(legendaAtual, { hashtags: "manter", credito: creditoNovo }) : null;

    const { error } = await client
      .from("social_posts")
      .update({
        ...(legendaNova !== null ? { caption: legendaNova } : {}),
        content_json: {
          ...cj,
          visual: {
            ...visual,
            capa: "foto",
            imageUrl: nova,
            // As duas chaves: o store grava `attribution`, e a refação antiga gravava `credito`.
            attribution: r.asset?.attribution ?? "",
            credito: r.asset?.attribution ?? "",
            motivo: r.motivo ?? "",
            /*
             * A foto nova leva o próprio registro (06/10/2026): origem, autor,
             * licença, o que a conferência viu e a prova de que é do
             * protagonista. Sem isso a linha ficava com a descrição e a
             * licença da foto VELHA ao lado do endereço da nova.
             */
            ...(r.asset
              ? {
                  source: r.asset.source,
                  sourceAssetId: r.asset.sourceAssetId,
                  sourcePageUrl: r.asset.sourcePageUrl,
                  author: r.asset.author,
                  license: r.asset.license,
                  licenseUrl: r.asset.licenseUrl,
                  imageContextType: r.asset.imageContextType,
                  conferenciaVisual: r.asset.conferenciaVisual ?? null,
                  caminho: r.caminho ?? null,
                  degrau: r.degrau ?? null,
                  protagonista: r.protagonista ?? null,
                  verificacao: (r.asset.metadata?.verificacao as Record<string, unknown> | undefined) ?? null,
                  ...(legendaNova !== null ? { creditoNaLegenda: creditoNovo || null, creditosDasFotos: r.asset.attribution ? [r.asset.attribution] : [] } : {}),
                }
              : {}),
          },
        },
        updated_at: new Date(mundo.agora ? mundo.agora() : Date.now()).toISOString(),
      })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", projeto.id);
    if (error) return falha(`a foto nova não foi gravada: ${error.message}`);
    // A arte vem em seguida (`etapasARefazer`), e é ela que muda o hash do post.
    return { ok: true, resumo: { imagens: [nova] } };
  };

  const arteDoPost = async (ctx: ContextoDaRefacao): Promise<ResultadoDaEtapa> => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const l = await lerLinha(client, "social_posts", COLUNAS_DO_POST, ctx.aprovacao.pecaId, projeto.id);
    if (!l) return falha("o post não existe mais");
    const cj = (l.content_json ?? {}) as Linha;
    const copy = (cj.copy ?? {}) as Linha;
    const arte = (cj.arte ?? {}) as Linha;
    const visual = (cj.visual ?? {}) as Linha;
    const headline = String(copy.headline ?? l.title ?? "").trim();
    if (!headline) return falha("o post não tem manchete gravada");
    const foto = typeof visual.imageUrl === "string" && visual.imageUrl ? visual.imageUrl : "";
    // O store grava `attribution`; `credito` era o nome da refação antiga. Ler só um apagava o crédito.
    const credito =
      typeof visual.attribution === "string" ? visual.attribution : typeof visual.credito === "string" ? visual.credito : "";

    const { gramaticaEfetiva, varianteDaCapa } = await import("../social/arte");
    const corpo = typeof copy.gancho === "string" ? copy.gancho : "";
    const eixo = String(arte.eixo ?? "");
    // O chapéu que foi impresso, tema ou editoria (06/10/2026); ausente, a editoria.
    const chapeu = typeof arte.chapeu === "string" && arte.chapeu.trim() ? arte.chapeu : undefined;
    /*
     * Arte culpada pelo editor (06/10/2026): a refação troca a decisão recusada
     * em vez de recongelar a mesma peça, e grava o porquê. Arte que roda depois
     * do texto ou da imagem mantém a gramática que tinha: ninguém a recusou.
     */
    const gramaticaAtual: "jornal" | "recorte" = arte.gramatica === "recorte" ? "recorte" : "jornal";
    const decisao =
      ctx.culpada === "arte"
        ? arteNaRefacao(
            { gramatica: gramaticaAtual, bolha: arte.bolha === true },
            ctx.aprendizado?.arte ?? aprendizadoDaArteVazio(),
            moldesLigados(projeto),
          )
        : null;
    const gramatica = gramaticaEfetiva({
      pedida: decisao?.gramatica ?? gramaticaAtual,
      eixo,
      chapeu,
      headline,
      corpo,
      comFoto: Boolean(foto),
    });
    const registroDoAprendizado = decisao
      ? {
          aprendizado: {
            motivo: ctx.motivo,
            antes: arteDaLinhaDoPost(arte)?.molde ?? null,
            pedida: decisao.gramatica,
            desenhada: gramatica,
            razao: decisao.razao,
            em: new Date(mundo.agora ? mundo.agora() : Date.now()).toISOString(),
          },
        }
      : {};

    const agora = mundo.agora ? mundo.agora() : Date.now();
    const caminho = `${projeto.slug}/${String(l.edition_date ?? "")}/refeito-${String(l.id).slice(0, 8)}-${agora}`;

    if (ehCarrossel(l)) {
      /*
       * O carrossel recongela TODAS as telas: a capa leva a manchete e a foto,
       * e o miolo leva o texto de cada slide. Tudo ou nada, como no ciclo.
       */
      const forma = (cj.carrossel ?? {}) as Linha;
      const papeis = Array.isArray(forma.papeis) ? (forma.papeis as PapelDeSlide[]) : [];
      if (papeis.length === 0) return falha(CARROSSEL_SEM_FORMA);
      if (!mundo.congelarCarrossel) return falha("o congelamento do carrossel não está ligado neste processo");
      const { entradasDoCarrossel } = await import("../social/carrossel/arte");
      const { ehEstruturaDaNoticia } = await import("../social/carrossel/estrutura");
      /*
       * O miolo da notícia recongela com as MESMAS fotos de slide (06/10/2026):
       * slide de notícia sem foto não existe, e a linha guarda a foto de cada um.
       */
      const fotosGravadas = Array.isArray(forma.fotos)
        ? (forma.fotos as Array<{ imageUrl?: unknown; attribution?: unknown } | null>).map((f) =>
            f && typeof f.imageUrl === "string" && f.imageUrl
              ? { imageUrl: f.imageUrl, attribution: typeof f.attribution === "string" ? f.attribution : "" }
              : null,
          )
        : null;
      if (ehEstruturaDaNoticia(String(forma.estrutura ?? "")) && !fotosGravadas) {
        return falha("o carrossel de notícia não tem as fotos dos slides gravadas, e o slide de notícia não sai sem foto");
      }
      const entradas = entradasDoCarrossel(copy as unknown as CopyDoCarrossel, papeis, {
        eixo,
        ...(chapeu ? { chapeu } : {}),
        ...(fotosGravadas ? { fotosDoMiolo: fotosGravadas } : {}),
        asset: foto ? { imageUrl: foto, attribution: credito } : null,
        assetSecundario: null,
        motivoSemFoto: foto ? "" : String(visual.motivo ?? ""),
        gramatica,
        ...(gramatica === "recorte" ? { corpo } : {}),
      }).entradas;
      const r = await mundo.congelarCarrossel({ slides: entradas, path: caminho });
      if (!r.ok) return falha(`o carrossel não fechou: ${r.motivo}`);
      const registro = (a: (typeof r.artefatos)[number]) => ({
        index: a.index,
        url: a.url,
        path: a.path,
        filename: a.filename,
        mime: a.mime,
        sha256: a.sha256,
        bytes: a.bytes,
        largura: a.largura,
        altura: a.altura,
        otimizado: a.otimizado,
      });
      const { error } = await client
        .from("social_posts")
        .update({
          content_json: {
            ...cj,
            arte: {
              ...arte,
              artefato: registro(r.artefatos[0]),
              artefatos: r.artefatos.map(registro),
              gramatica,
              variante: varianteDaCapa(Boolean(foto), gramatica),
              bolha: false,
              ...registroDoAprendizado,
            },
          },
          asset_paths: r.artefatos.map((a) => a.url),
          slides_manifest: r.artefatos.map((a) => ({
            index: a.index,
            url: a.url,
            filename: a.filename,
            sha256: a.sha256,
            bytes: a.bytes,
            provider_child_id: null,
          })),
          updated_at: new Date(agora).toISOString(),
        })
        .eq("id", ctx.aprovacao.pecaId)
        .eq("project_id", projeto.id)
        .is("provider_creation_id", null)
        .neq("status", "published");
      if (error) return falha(`o carrossel novo não foi gravado: ${error.message}`);
      return { ok: true, resumo: { imagens: r.artefatos.map((a) => a.url) } };
    }

    const congelado = await mundo.congelar({
      capa: {
        headline,
        eixo,
        ...(chapeu ? { chapeu } : {}),
        gramatica,
        ...(gramatica === "recorte" ? { corpo } : {}),
        asset: foto ? { imageUrl: foto, attribution: credito } : null,
        assetSecundario: null,
        motivoSemFoto: foto ? "" : String(visual.motivo ?? ""),
      },
      // Caminho NOVO a cada refação: sobrescrever quebraria o hash de quem aponta para o antigo.
      path: caminho,
    });
    if (!congelado.ok) return falha(`a arte não fechou: ${congelado.motivo}`);

    const artefato = { ...((arte.artefato as Linha) ?? {}), ...congelado.artefato, index: 1 };
    const { error } = await client
      .from("social_posts")
      .update({
        content_json: {
          ...cj,
          arte: {
            ...arte,
            artefato,
            gramatica,
            variante: varianteDaCapa(Boolean(foto), gramatica),
            ...(decisao ? { bolha: false } : {}),
            ...registroDoAprendizado,
          },
        },
        asset_paths: [congelado.artefato.url],
        slides_manifest: [
          {
            index: 1,
            url: congelado.artefato.url,
            filename: congelado.artefato.filename,
            sha256: congelado.artefato.sha256,
            bytes: congelado.artefato.bytes,
            provider_child_id: null,
          },
        ],
        updated_at: new Date(agora).toISOString(),
      })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", projeto.id)
      // Nunca mexe em post que já está no ar ou com container criado.
      .is("provider_creation_id", null)
      .neq("status", "published");
    if (error) return falha(`a arte nova não foi gravada: ${error.message}`);
    return { ok: true, resumo: { imagens: [congelado.artefato.url] } };
  };

  const base: GanchosDeRefazer = {
    artigo: { texto: textoDoArtigo, imagem: imagemDoArtigo },
    post: { imagem: imagemDoPost, arte: arteDoPost },
  };
  if (!mundoCompleto(mundo)) return base;
  const novos = criarGanchosPorEtapa(mundo);
  return {
    artigo: { ...base.artigo, ...novos.artigo },
    post: { ...base.post, ...novos.post },
    newsletter: novos.newsletter,
  };
}

/** O mundo de verdade: banco, redator, resolvedor e renderizador, carregados na hora. */
export function mundoDeProducao(env: Record<string, string | undefined> = process.env): MundoDosGanchos {
  return {
    // O cliente do banco já está no grafo de `integracao.ts`; só ele entra por import estático.
    client: getSupabaseAdminClient,
    /*
     * A refação não publica: só reescreve a peça, que continua presa à fila e
     * ao portão de publicação. Exigir projeto ativo aqui travava a refação no
     * projeto pausado (29/10/2026, "pedi alteração e sumiram" no teste-claude).
     */
    projeto: async (id) => {
      const p = await (await import("../projects")).getProjectById(id);
      if (!p) throw new Error(`Projeto ${id} não encontrado.`);
      return p;
    },
    vozDoArtigo: async (projectId) => (await (await import("../ramos/vozes")).vozesDosRamos(projectId)).artigo,
    escrever: async (pauta, pacote, marca) =>
      (await import("../ramos/artigo")).escreverArtigoDaPauta(pauta, pacote, marca, { env }),
    renderizarHtml: async (artigo, fonte, fontes) =>
      (await import("../ramos/artigo")).renderizarArtigoHtml(artigo, fonte, {
        fontes: fontes?.length ? fontes.map((f) => ({ nome: f.nome, url: f.url })) : [fonte],
        ...(fontes?.length ? { fontesDoTexto: fontes } : {}),
      }),
    imagem: async (pauta, ctx) => {
      const { imagemDaPauta } = await import("../visual/acervo/imagem-da-pauta");
      return imagemDaPauta(pauta, {
        client: ctx.client,
        projeto: ctx.projeto,
        ignorarReuso: true,
        opcoes: {
          client: ctx.client,
          env,
          jaUsadosNestaEdicao: new Set(ctx.evitar),
          jaUsadasRecentemente: ctx.evitar,
          ...(ctx.recusas?.length ? { recusasDoEditor: ctx.recusas } : {}),
        },
      });
    },
    congelar: async (entrada) => (await import("../social/artefato")).congelarArtefato(entrada),
    congelarCarrossel: async (entrada) => (await import("../social/artefato")).congelarCarrossel(entrada),
    // Os ganchos de 06/10/2026: seleção, texto do post, newsletter e carrossel.
    ...mundoDaRefacaoDeProducao(env),
  };
}
