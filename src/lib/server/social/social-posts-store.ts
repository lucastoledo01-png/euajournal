import type { ContextoDeProducao } from "../aprovacao/contrato";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistroHistorico } from "../editorial/history";
import { criarHistoricoStore } from "../editorial/history";
import { registroDoPost } from "./historico-do-feed";
import type { PostGerado } from "./gerador";
import type { Vaga } from "./agenda";
import { idNaBiblioteca } from "../visual/biblioteca";
import type { ResultadoVisual } from "../visual/tipos";
import type { ArtefatoDeSlide } from "./artefato";
import type { FormatoDoPost } from "./carrossel/formato";
import { varianteDaCapa } from "./arte";
import type { GramaticaDaCapa } from "./arte";
import type { DecisaoDaBolha } from "./bolha-sem-rosto";
import { statusDeEntradaDoPost } from "../aprovacao/portao";
import type { OpcoesDaFilaNoStore } from "../aprovacao/integracao";
import { legendaDoInstagram } from "./legenda-final";

/**
 * Onde um post do social V2 vira linha.
 *
 * Três coisas que a tabela já resolve e não precisam de coluna nova: a
 * manchete da arte mora em `title`, a legenda em `caption`, e o resultado da
 * guarda em `social_guard_reasons`, que é jsonb e cabe o objeto inteiro.
 * Inventar `headline`, `full_caption` e `social_guard_result` ao lado delas
 * criaria três pares de colunas dizendo a mesma coisa.
 */

export type OrigemDoPost = {
  /**
   * De onde o post veio.
   *
   * `evergreen` é o terceiro valor, e a coluna é `text` sem CHECK: conferido no
   * banco de produção antes de escolher isto, justamente para não exigir
   * migration. O worker não lê este campo — para ele os três são a mesma linha
   * com o mesmo `generation_version`.
   */
  originChannel: "newsletter" | "social" | "evergreen";
  originStoryId: string | null;
  motivo: string;
};

/**
 * De onde este post veio, e a distinção que importa.
 *
 * Classificação compartilhada NÃO é publicação na newsletter. Desde que o
 * newsroom passou a gravar em `news_candidates`, toda pauta do dia foi
 * classificada pelo mesmo processo que serve o e-mail, e marcar todas como
 * `origin_channel=newsletter` por causa disso apagaria justamente o que o
 * campo existe para dizer: se o leitor já viu aquilo no e-mail de manhã.
 *
 * A prova de publicação é o `editorial_history` com canal newsletter. Sem
 * linha lá, o post é social-only, por mais que a classificação tenha vindo do
 * mesmo lugar.
 */
export function resolverOrigem(storyId: string, historico: RegistroHistorico[]): OrigemDoPost {
  /*
   * Conteúdo permanente se declara pela própria identidade.
   *
   * `evg:{topico}:{angulo}` é a chave que o catálogo evergreen gera, e ela não
   * existe no noticiário. Perguntar ao `editorial_history` se um explicador de
   * EB-2 "saiu na newsletter" não faz sentido: ele nunca esteve numa edição, e
   * a resposta seria "social-only" por ausência, não por decisão.
   *
   * A alternativa seria um parâmetro a mais em toda a cadeia. O prefixo diz a
   * mesma coisa sem que ninguém precise carregá-lo.
   */
  if (storyId.startsWith("evg:")) {
    return {
      originChannel: "evergreen",
      originStoryId: null,
      motivo: "conteúdo permanente do catálogo, ancorado em fonte oficial",
    };
  }

  const naNewsletter = historico.find((h) => h.storyId === storyId && h.canal === "newsletter");

  if (naNewsletter) {
    return {
      originChannel: "newsletter",
      originStoryId: naNewsletter.storyId,
      motivo: "a pauta saiu na newsletter e está sendo reaproveitada, que é o fluxo desejado",
    };
  }

  return {
    originChannel: "social",
    originStoryId: null,
    motivo: "aprovada e verificada, e não entrou na composição do e-mail",
  };
}

/** A chave que impede a mesma pauta virar duas linhas no mesmo dia. */
export function chaveDeIdempotencia(editionDate: string, storyId: string): string {
  return `social-v2-${editionDate}-${storyId}`;
}

export type PostParaGravar = {
  projectId: string;
  editionDate: string;
  post: PostGerado;
  vaga: Vaga;
  visual: ResultadoVisual | null;
  candidateId: string | null;
  topicId: string | null;
  eventFingerprint: string | null;
  origem: OrigemDoPost;
  /**
   * Os arquivos aprovados, já no Storage, com o hash dos bytes e na ordem.
   *
   * São obrigatórios para gravar: uma linha `scheduled` sem artefato é um
   * compromisso de publicar algo que ainda não existe, e obrigaria o worker a
   * produzir a peça, que é exatamente o que o V2 existe para não fazer.
   *
   * A lista tem um item na peça única e um por slide no carrossel. Um só
   * caminho para os dois casos, porque dois caminhos é como a proteção de um
   * deles envelhece sem ninguém notar.
   */
  artefatos: ArtefatoDeSlide[];
  /** Imagem única ou carrossel. Gravado, nunca deduzido da contagem. */
  formato: FormatoDoPost;
  /**
   * Esta capa saiu com o círculo da segunda foto?
   *
   * Gravado, e não deduzido de `visual.assetSecundario`, porque as duas coisas
   * são diferentes: o visual diz que EXISTIA uma segunda foto aprovada, e este
   * campo diz que ela FOI ao ar. Quem alterna o ritmo lê este campo, e ler o
   * outro faria a alternância enxergar bolha onde a peça não tem nenhuma.
   */
  bolha: boolean;
  /**
   * Por que a capa tem ou não tem bolha, e onde ela ficou (06/10/2026).
   *
   * Os rostos achados na foto de fundo, a posição escolhida ou o motivo de não
   * haver nenhuma, a origem da segunda foto e o custo. Opcional para quem
   * grava sem passar pela decisão (scripts antigos, testes).
   */
  decisaoDaBolha?: DecisaoDaBolha | null;
  /**
   * Qual gramática esta capa usou, jornal ou recorte.
   *
   * Gravado, e não deduzido, pela mesma razão do campo acima: a gramática
   * PEDIDA pode não ser a usada, porque o recorte tem orçamento de caracteres
   * e cai para jornal quando o texto estoura. Quem alterna o ritmo lê este
   * campo, e a conferência da publicação compara `arte.variante` com ele.
   *
   * Deduzir do eixo faria a conferência recusar toda peça que caiu para
   * jornal, que é justamente a peça que funcionou.
   */
  gramatica: GramaticaDaCapa;
  /**
   * A legenda como ela vai ao ar, já com o crédito da foto no fim.
   *
   * Vem pronta de quem monta o post, e não é recalculada aqui: o crédito
   * depende do asset escolhido, e o store não é o lugar de repetir essa
   * decisão. Ausente, vale a legenda do veredicto, que é o comportamento de
   * antes de 18/09/2026.
   */
  legendaFinal?: string;
  /**
   * A linha curta do crédito ("Foto: X", "Fotos: A, B e C"), montada por
   * `linhaDeCredito` com as fotos que foram ao ar (06/10/2026). O store passa
   * a legenda de novo por `fecharLegenda` antes de gravar, e é esta linha que
   * fica como a última: qualquer outro crédito que tenha vazado sai ali.
   * Ausente, preserva a linha curta que já estiver logo abaixo do fecho.
   */
  creditoDaLegenda?: string;
  /** As atribuições completas de todas as fotos do post, para o registro. */
  creditosDasFotos?: string[];
  /**
   * O contexto da refação na fila de aprovação (06/10/2026): pauta, pacote,
   * pool do dia. Vai para `content_json.contexto_da_refacao` e de lá para a
   * linha da fila. Ausente nos chamadores antigos.
   */
  contexto?: ContextoDeProducao;
  /** A posição na leva do dia, que decide o CTA. Gravada junto do contexto. */
  posicao?: number;
  /**
   * O chapéu impresso na peça, tema ou editoria (06/10/2026). Gravado para a
   * refação da arte desenhar o MESMO chapéu sem recalcular sobre outro texto.
   */
  chapeu?: string;
  /**
   * A foto de cada slide de conteúdo do carrossel de notícia, na ordem dos
   * slides que foram ao ar (06/10/2026). A refação recongela as telas com
   * elas: sem isto, o miolo sairia sem foto, que é o slide que não existe.
   */
  fotosDoCarrossel?: Array<{ imageUrl: string; attribution?: string | null } | null>;
};

/** O artefato como a linha o registra. Um formato, usado pela capa e por slide. */
function comoRegistro(a: ArtefatoDeSlide) {
  return {
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
  };
}

export type ResultadoDaGravacaoSocial = {
  gravados: number;
  bloqueadosPorIdempotencia: Array<{ storyId: string; motivo: string }>;
  erros: string[];
  ids: string[];
};

type LinhaExistente = {
  id: string;
  story_id: string | null;
  event_fingerprint: string | null;
  idempotency_key: string | null;
};

export type SocialPostsStore = {
  /** O que já existe para este projeto nesta data. Base da idempotência. */
  doDia(projectId: string, editionDate: string): Promise<LinhaExistente[]>;
  /**
   * As capas mais recentes, da mais nova para a mais antiga, só com o que o
   * ritmo precisa saber. Atravessa dias de propósito: o feed não zera à
   * meia-noite.
   */
  ultimasCapas(
    projectId: string,
    limite: number,
  ): Promise<Array<{ bolha: boolean; gramatica: string }>>;
  gravar(posts: PostParaGravar[]): Promise<ResultadoDaGravacaoSocial>;
};

/**
 * O store, opcionalmente amarrado à fila de aprovação (05/10/2026).
 *
 * Sem `fila`, grava `scheduled` exatamente como antes. Com a fila em
 * `enforce`, o status de entrada vem do portão (`draft`) e cada post gravado é
 * enfileirado com o hash dos arquivos congelados. Quem decide o status é
 * `statusDeEntradaDoPost`, e não este arquivo: é a regra com dono único.
 */
export function criarSocialPostsStore(client: SupabaseClient, fila: OpcoesDaFilaNoStore = {}): SocialPostsStore {
  const statusDeEntrada = fila.statusDeEntrada ?? statusDeEntradaDoPost("off");
  return {
    async doDia(projectId, editionDate) {
      const { data, error } = await client
        .from("social_posts")
        .select("id, story_id, event_fingerprint, idempotency_key")
        .eq("project_id", projectId)
        .eq("edition_date", editionDate)
        .eq("platform", "instagram");

      if (error) throw new Error(`social_posts, leitura do dia falhou: ${error.message}`);
      return (data ?? []) as unknown as LinhaExistente[];
    },

    async ultimasCapas(projectId, limite) {
      const { data, error } = await client
        .from("social_posts")
        .select("content_json")
        .eq("project_id", projectId)
        .eq("platform", "instagram")
        .order("scheduled_at", { ascending: false })
        .limit(limite);

      if (error) throw new Error(`social_posts, leitura do ritmo falhou: ${error.message}`);

      /*
       * Linha antiga não tem o campo, e a resposta certa para ela é `false`.
       *
       * Toda peça gravada antes de 16/09/2026 saiu sem o registro do ritmo.
       * Tratar ausência como "teve bolha" faria a primeira peça depois do
       * deploy sair sem círculo por engano; tratar como "não teve" apenas
       * permite que a próxima leve, que é o comportamento neutro.
       */
      return (data ?? []).map((linha) => {
        const conteudo = (linha as {
          content_json?: { arte?: { bolha?: boolean; gramatica?: string } };
        }).content_json;
        return {
          bolha: conteudo?.arte?.bolha === true,
          /*
           * Peça anterior a 18/09/2026 não tem o campo, e a resposta certa para
           * ela é "jornal": era a única gramática que existia na prática.
           */
          gramatica: conteudo?.arte?.gramatica ?? "jornal",
        };
      });
    },

    async gravar(posts) {
      const resultado: ResultadoDaGravacaoSocial = {
        gravados: 0,
        bloqueadosPorIdempotencia: [],
        erros: [],
        ids: [],
      };
      if (posts.length === 0) return resultado;

      const projectId = posts[0].projectId;
      const editionDate = posts[0].editionDate;
      const existentes = await this.doDia(projectId, editionDate);

      const chavesUsadas = new Set(existentes.map((l) => l.idempotency_key).filter(Boolean) as string[]);
      const storiesUsados = new Set(existentes.map((l) => l.story_id).filter(Boolean) as string[]);
      const eventosUsados = new Set(existentes.map((l) => l.event_fingerprint).filter(Boolean) as string[]);

      const linhas: Record<string, unknown>[] = [];

      for (const p of posts) {
        const storyId = p.post.pauta.storyId;
        const chave = chaveDeIdempotencia(p.editionDate, storyId);

        /*
         * Duas barreiras diferentes, e a segunda é a que importa.
         *
         * A chave impede a mesma pauta duas vezes, que é reexecução do ciclo.
         * O fingerprint impede o mesmo ACONTECIMENTO chegando por outro
         * artigo, que é o caso real: duas fontes cobrem a mesma decisão
         * judicial, os story_id são diferentes, e para quem rola o feed é o
         * mesmo post duas vezes.
         */
        if (chavesUsadas.has(chave) || storiesUsados.has(storyId)) {
          resultado.bloqueadosPorIdempotencia.push({
            storyId,
            motivo: "esta pauta já tem post neste dia",
          });
          continue;
        }

        if (p.eventFingerprint && eventosUsados.has(p.eventFingerprint)) {
          resultado.bloqueadosPorIdempotencia.push({
            storyId,
            motivo: `DUPLICATE_EVENT: o mesmo acontecimento já tem post neste dia`,
          });
          continue;
        }

        chavesUsadas.add(chave);
        storiesUsados.add(storyId);
        if (p.eventFingerprint) eventosUsados.add(p.eventFingerprint);

        const asset = p.visual?.asset ?? null;

        linhas.push({
          project_id: p.projectId,
          edition_date: p.editionDate,
          platform: "instagram",
          post_type: "carousel",
          status: statusDeEntrada,
          dry_run: false,
          idempotency_key: chave,

          // A manchete da arte e a legenda usam as colunas que já existem.
          title: p.post.copy.headline.slice(0, 300),
          /*
           * O último passo antes do banco (06/10/2026): `fecharLegenda` é
           * idempotente, e passar aqui garante as duas regras do dono em
           * qualquer caminho que chegue ao store, inclusive um que monte a
           * legenda de outro jeito no futuro. Hashtag fica como veio: ela só
           * está no texto quando o projeto a ligou.
           */
          caption: legendaDoInstagram(p.legendaFinal ?? p.post.veredicto.legendaFinal, {
            hashtags: "manter",
            credito: p.creditoDaLegenda ?? "manter",
          }),

          /*
           * As mesmas colunas que o caminho legado usa para o manifesto.
           *
           * O painel de logs e qualquer inspeção manual já olham para elas.
           * Gravar o artefato só dentro de `content_json` esconderia o arquivo
           * de quem procura no lugar de sempre.
           */
          slides_manifest: p.artefatos.map((a) => ({
            /*
             * O índice começa em 1, como no caminho legado.
             *
             * A peça única gravava 0 e o legado grava 1, e a divergência não
             * incomodava ninguém enquanto houvesse um slide só. Com carrossel,
             * o índice é a ORDEM de publicação e aparece no nome do arquivo
             * (`social-v2-01.png`) e no container filho: duas convenções seria
             * um jeito de publicar o slide 3 no lugar do 2.
             */
            index: a.index,
            url: a.url,
            filename: a.filename,
            sha256: a.sha256,
            bytes: a.bytes,
            /** Preenchido pelo worker, quando o container filho é criado. */
            provider_child_id: null,
          })),
          asset_paths: p.artefatos.map((a) => a.url),

          scheduled_at: p.vaga.quandoIso,
          scheduled_slot: p.vaga.slot,
          generation_version: "social-v2",

          story_id: storyId,
          candidate_id: p.candidateId,
          topic_id: p.topicId,
          event_fingerprint: p.eventFingerprint,
          origin_channel: p.origem.originChannel,
          origin_story_id: p.origem.originStoryId,
          editorial_score: p.post.pauta.pontuacao.total,
          visual_asset_id: idNaBiblioteca(asset),

          social_guard_status: p.post.veredicto.passed ? "passed" : "failed",
          social_guard_reasons: {
            finalDecision: p.post.veredicto.finalDecision,
            attempts: p.post.veredicto.attempts,
            issues: p.post.veredicto.issues,
            reparosAplicados: p.post.reparosAplicados,
          },

          content_json: {
            format: "noticia",
            /*
             * O formato da PEÇA, que é outra pergunta que `format`.
             *
             * `format: "noticia"` é o formato de DESENHO: quais tokens, qual
             * chrome, quais variantes. `formato` é quantas imagens o post tem.
             * Um carrossel evergreen é desenhado com os tokens de `noticia` e
             * publicado como carrossel, e juntar as duas coisas num campo só
             * obrigaria a inventar um formato de desenho para cada formato de
             * publicação.
             */
            formato: p.formato,
            copy: p.post.copy,
            /*
             * A forma do carrossel, para a fila de aprovação refazer o texto
             * slide a slide e recongelar as telas (06/10/2026). Sem a
             * estrutura e os papéis, um carrossel não se redesenha igual.
             */
            ...(p.post.carrossel
              ? {
                  carrossel: {
                    estrutura: p.post.carrossel.estrutura,
                    slides: p.post.carrossel.slides.length,
                    papeis: p.post.carrossel.papeis,
                    ...(p.fotosDoCarrossel ? { fotos: p.fotosDoCarrossel } : {}),
                  },
                }
              : {}),
            ...(p.contexto ? { contexto_da_refacao: { ...p.contexto, ...(p.posicao ? { posicao: p.posicao } : {}) } } : {}),
            hashtags: p.post.veredicto.hashtagsFinais,
            origem: p.origem.motivo,
            /*
             * O contrato de render, para a arte ser reproduzível fora daqui.
             *
             * A arte do V2 não é gravada como arquivo: quem publica é o
             * worker, e ele renderiza de novo. Isso só é seguro se o render
             * for determinístico E se todo insumo dele estiver na linha —
             * senão o worker desenha uma peça parecida, não a peça aprovada.
             *
             * `title` já carrega a manchete e `visual` já carrega a foto e o
             * crédito. Faltava o eixo, que é a sobrancelha da capa de texto:
             * sem ele a peça sairia sem "PROCESSO" em cima do título, e
             * ninguém notaria comparando o banco.
             *
             * String vazia é um valor, não uma ausência: quer dizer que a
             * classificação não nomeou editoria, e a peça imprime sem
             * sobrancelha de propósito.
             */
            arte: {
              versao: "v2",
              variante: varianteDaCapa(Boolean(asset), p.gramatica),
              /*
               * A gramática ao lado da variante, e não no lugar dela.
               *
               * A variante é o nome do desenho e é o que a conferência compara;
               * a gramática é a decisão que o produziu, e é o que o ritmo lê no
               * feed. Guardar só a variante obrigaria o ritmo a traduzir nome de
               * template de volta para decisão, que é a mesma regra em dois
               * lugares outra vez.
               */
              gramatica: p.gramatica,
              eixo: p.post.pauta.classificacao.eixo ?? "",
              // O chapéu impresso, com o tema quando houve (06/10/2026).
              ...(p.chapeu ? { chapeu: p.chapeu } : {}),
              /*
               * O artefato congelado, que é o que vai ao ar.
               *
               * Isto muda a natureza do que está gravado: antes a linha
               * descrevia como a peça DEVERIA ser desenhada, e o worker a
               * desenhava de novo na hora de publicar. Agora ela aponta para o
               * arquivo que já existe, e o `sha256` é o que prova que o arquivo
               * baixado é o arquivo aprovado.
               *
               * O eixo e a variante continuam aqui, e não como redundância: eles
               * dizem COMO a peça foi desenhada, que é registro de auditoria, e
               * a variante ainda serve para pegar linha contraditória.
               */
              artefato: comoRegistro(p.artefatos[0]),
              /*
               * A lista inteira, e a capa repetida nela.
               *
               * `artefato` continua sendo a capa porque é o que o worker lê
               * para a peça única e é o que o painel mostra como thumbnail.
               * `artefatos` é a fonte da publicação nos dois casos, e a carga
               * confere que o primeiro item é o mesmo arquivo da capa: sem essa
               * conferência, uma linha poderia ter capa de um post e slides de
               * outro.
               */
              artefatos: p.artefatos.map(comoRegistro),
              /*
               * O ritmo do feed, gravado peça a peça.
               *
               * É a única memória de que a capa anterior levou o círculo. Sem
               * ela, a próxima execução não teria como alternar e a bolha
               * voltaria a sair em todo post, que é o defeito apontado em
               * 16/09/2026.
               */
              bolha: p.bolha,
              /*
               * A decisão que produziu o campo acima, para auditoria: quem
               * pergunta "a bolha deste post cobria alguém?" encontra aqui os
               * rostos e a posição, sem renderizar de novo.
               */
              ...(p.decisaoDaBolha ? { bolha_decisao: p.decisaoDaBolha } : {}),
            },
            /*
             * O registro do direito é completo mesmo quando a arte não imprime
             * nada.
             *
             * Public domain e CC0 dispensam crédito na peça, e por isso
             * `attribution` vem vazia e a tira não é desenhada. Isso não
             * dispensa saber, depois, de onde a foto veio: quem responde a uma
             * contestação de direito autoral seis meses depois olha esta linha,
             * não a imagem. Por isso autor, licença, URL da licença e o estado
             * da verificação ficam gravados nos dois casos, e `atribuicaoImpressa`
             * registra o que efetivamente foi para a arte.
             */
            visual: asset
              ? {
                  source: asset.source,
                  sourceAssetId: asset.sourceAssetId,
                  sourcePageUrl: asset.sourcePageUrl,
                  author: asset.author,
                  license: asset.license,
                  licenseUrl: asset.licenseUrl,
                  attribution: asset.attribution,
                  /*
                   * Falso sempre desde 06/10/2026: a arte do Instagram não
                   * imprime crédito para licença nenhuma, por decisão do dono.
                   * O crédito vai na última linha da legenda, curto, e fica
                   * registrado em `creditoNaLegenda`.
                   */
                  atribuicaoImpressa: false,
                  creditoNaLegenda: p.creditoDaLegenda ?? null,
                  creditosDasFotos: p.creditosDasFotos ?? [],
                  rightsStatement: asset.rightsStatement,
                  rightsStatus: asset.rightsStatus,
                  rightsCheckedAt: asset.rightsCheckedAt,
                  imageUrl: asset.imageUrl,
                  imageContextType: asset.imageContextType,
                  assetDate: asset.assetDate ?? null,
                  temporalRelevanceScore: asset.temporalRelevanceScore ?? null,
                  semanticContextFit: asset.semanticContextFit ?? null,
                  /*
                   * O que a conferência visual VIU, e não só uma nota.
                   *
                   * `semanticContextFit` vale 100 quando o detector de
                   * polaridade fica calado, e foi assim que um prédio russo
                   * saiu com nota máxima numa pauta americana. Este campo só
                   * existe quando alguém abriu a imagem, e guarda a descrição
                   * para o relatório poder ser conferido sem abrir a foto de
                   * novo.
                   */
                  conferenciaVisual: asset.conferenciaVisual ?? null,
                  /*
                   * Por qual etapa a foto veio: a da entidade, a da cena, ou a
                   * da cena depois de a entidade falhar (06/10/2026). É o
                   * número que diz quanto a etapa da cena está salvando.
                   */
                  caminho: p.visual?.caminho ?? null,
                  // E em qual degrau da escada da cena ela foi achada.
                  degrau: p.visual?.degrau ?? null,
                  /*
                   * O protagonista da manchete e a PROVA de que a foto é dele
                   * (06/10/2026, "imagem certeira"): retrato P18, comparação
                   * de rosto com o retrato de referência, nome da marca lido
                   * na foto, logotipo oficial ou representante conferido.
                   */
                  protagonista: p.visual?.protagonista ?? null,
                  verificacao: (asset.metadata?.verificacao as Record<string, unknown> | undefined) ?? null,
                }
              : {
                  // Sem foto não é falha registrada como falha: é a decisão de
                  // publicar com capa de texto, e o motivo de ter sido tomada.
                  motivo: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
                  capa: "texto",
                  entidadeVisual: p.visual?.entidade?.nome ?? null,
                  fontesConsultadas: (p.visual?.fontesConsultadas ?? []).map((f) => ({
                    fonte: f.fonte,
                    encontrados: f.encontrados,
                    nota: f.nota,
                  })),
                },
          },
          updated_at: new Date().toISOString(),
        });
      }

      if (linhas.length === 0) return resultado;

      const { data, error } = await client
        .from("social_posts")
        .upsert(linhas, { onConflict: "project_id,idempotency_key", ignoreDuplicates: true })
        .select("id, idempotency_key");

      if (error) {
        resultado.erros.push(error.message);
        return resultado;
      }

      const devolvidas = (data ?? []) as Array<{ id: string; idempotency_key?: string }>;
      const ids = devolvidas.map((r) => r.id);
      resultado.gravados = ids.length;
      resultado.ids = ids;

      /*
       * O canal `instagram` do histórico editorial nasce aqui, no agendamento
       * (06/10/2026), como o do portal nasce no agendamento da matéria.
       *
       * Até esta data nenhum caminho de produção gravava esta linha: as oito
       * que existiam eram do backfill de 05/09, e `used_social` (ver
       * `candidatos-store.ts`) apontava para um canal vazio. A régua do feed
       * não depende desta escrita, ela lê `social_posts` (ver
       * `historico-do-feed.ts`); a linha é o registro para relatório e
       * auditoria. Por isso a falha não derruba a gravação do post.
       */
      if (devolvidas.length > 0) {
        try {
          const porChave = new Map(posts.map((p) => [chaveDeIdempotencia(p.editionDate, p.post.pauta.storyId), p]));
          const registros = devolvidas
            .map((r) => {
              const p = r.idempotency_key ? porChave.get(r.idempotency_key) : undefined;
              return p ? registroDoPost(p.post.pauta, { projectId: p.projectId, socialPostId: r.id, publicadoEm: p.vaga.quandoIso }) : null;
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);
          if (registros.length > 0) await criarHistoricoStore(client).registrar(registros);
        } catch (erro) {
          console.warn(`[SOCIAL V2] histórico editorial do Instagram não gravado: ${(erro as Error).message}`);
        }
      }

      if (fila.aoGravar && devolvidas.length > 0) {
        const porChave = new Map(linhas.map((l) => [String(l.idempotency_key), l]));
        await fila.aoGravar(
          devolvidas
            .map((r, i) => ({ id: r.id, linha: (r.idempotency_key ? porChave.get(r.idempotency_key) : linhas[i]) ?? linhas[i] }))
            .filter((g): g is { id: string; linha: Record<string, unknown> } => Boolean(g.linha)),
        );
      }

      return resultado;
    },
  };
}
