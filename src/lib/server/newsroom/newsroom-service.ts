import { buscaDeEntidadePadrao } from "../editorial/alcance";
import { escapeHtml, safeHttpUrl } from "../html";
import { createListmonkClient } from "../listmonk";
import {
  scheduleEditionPosts,
  type ScheduledPostSlot,
} from "../social/instagram/scheduler";
import {
  DEFAULT_PROJECT_ID,
  getProjectNewsSources,
  projectToday,
  requireActiveProject,
} from "../projects";
import { getSupabaseAdminClient } from "../supabase-admin";
import { formasDasEdicoes, type EdicaoParaORodizio, type FormaDoAssunto } from "./assunto";
import { buscarRelacionadas } from "../materias-relacionadas";
import { collectAllNews } from "./collector";
import { coletarTendencias, limparTendencias, triarTendencias } from "../editorial/tendencias";
import { buscasDoDia } from "../editorial/busca-dinamica";
import { agendaEmTexto, somarDias } from "../editorial/calendario";
import { deduplicateCandidates } from "./deduplicator";
import { runNewsroomPipeline } from "./pipeline";
import { TENTATIVAS_EXTRAS_DA_EDICAO, redigirComNovasTentativas } from "./nova-redacao";
import { rankAndFilterCandidates } from "./ranker";
import { EditionContent } from "./schemas";
import { sendAlert } from "../alerts";
import { modoDaFila } from "../aprovacao/modo";
import { criarFilaStore } from "../aprovacao/fila-store";
import { aprendizadoDoCanal, aprendizadoVazio } from "../aprendizado/do-canal";
import { comFotoDoCanal, fotosDoCanal, type AprendizadoDaImagem } from "../aprendizado/imagem";
import { aprenderNaSelecao } from "../aprendizado/selecao";
import { redacaoDisparaNewsletter, statusDeEntradaDoArtigo } from "../aprovacao/portao";
import { avisosDaEdicao, enfileirarDaRedacao } from "../aprovacao/integracao";
import { horariosDaRedacaoNaFila } from "../aprovacao/fila";
import { cadenciaDoProjeto } from "../cadencia";
import { hashDaNewsletter, hashDoArtigo } from "../aprovacao/hash";
import { MARCA } from "@/lib/marca";
import { recorteDaFoto } from "@/lib/imagem-da-capa";
import { blocoDoVisaMatch, configDoVisaMatch } from "./visamatch-na-edicao";
import type { ConfigDoVisaMatch } from "./visamatch-na-edicao";
import {
  bancoConfigurado,
  buscarFotoDeBanco,
  consultaDaNoticia,
} from "../prompt-system/stock";
import { carregarConfigEditorial } from "../editorial/config";
import { criarProvedorOpenAI } from "../editorial/embeddings";
import { criarHistoricoStore, gerarStoryId } from "../editorial/history";
import type { RegistroHistorico } from "../editorial/history";
import { avaliarPautas, persistenciaParaOSocial, registroDaPauta } from "../editorial/guarda";
import { formatarNumerosDaEdicao } from "./numeros-editoriais";
import type { ContextoDeProducao, PautaDoContexto } from "../aprovacao/contrato";
import { pautaDoContexto } from "../aprovacao/contexto-de-producao";
import { rodarSocialDoDia, diagnosticoSocialAusente } from "../social/ciclo-do-dia";
import { calorNaAberturaDaNewsletter } from "../social/calor-no-feed";
import { fontesPadraoDoCalor, modoDoCalor } from "../editorial/calor-do-dia";
import { limiarDeVeiculosDoCalor } from "../editorial/calor";
import type { DiagnosticoSocialDoDia } from "../social/ciclo-do-dia";
import { gravarDiagnosticoDoSocial, montarRegistroDoSocial } from "../social/diagnostico-gravado";
import { descreverModo, modoDaGuarda } from "../editorial/modo";
import { paraRenderizacao, resolverImagens } from "../editorial/imagens";
import { descreverModoVisual, diagnosticoVazio, modoDoResolvedorVisual } from "../visual/modo";
import type { DiagnosticoVisual } from "../visual/modo";
import { confirmarImagemPublicada, imagemDaPauta } from "../visual/acervo/imagem-da-pauta";
import { ehUltimoRecurso } from "../visual/bandeira";
import { criarBiblioteca } from "../visual/biblioteca";
import type { ResultadoVisual } from "../visual/tipos";
import { extrairEntidades } from "../editorial/classificador";
import { montarPacotesDasPautas } from "../editorial/pacote-factual";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import type { RankedCandidate } from "./ranker";
import { modoDoPipelineSocial, type ModoSocial } from "../social/modo";
import { entrarNasInstrucoes, prepararInstrucoesDoProjeto } from "../instrucoes";
import type { ProjetoComCapacidades } from "../capacidades";
import { envDoListmonk } from "../credenciais-do-projeto";
import { modoDosRamos } from "../ramos/modo";
import type { ModoDosRamos } from "../ramos/modo";
import { criarLivroDeCustos } from "../ramos/custos";
import { montarPeca } from "../ramos/peca";
import type { PecaPronta } from "../ramos/peca";
import { vozesDosRamosComMemoria } from "../ramos/vozes";
import type { VozesDosRamos } from "../ramos/vozes";
import {
  TETO_DO_INSTAGRAM,
  preSelecaoParaPacote,
  recomporNewsletterDaGuarda,
  selecionarParaNewsletter,
} from "../ramos/selecao";
import {
  MOTIVO_SEM_FOTO,
  criarFotosDoDia,
  gravarQuedasSemFoto,
  linhasDasQuedas,
  selecionarComFoto,
  separarPautasSemFoto,
  temFotoDaPauta,
} from "../ramos/sem-foto";
import type { QuedaSemFoto } from "../ramos/sem-foto";
import { garantirPacotes, rodarRamoDoPortal } from "../ramos/ramo-do-portal";
import { criarAmpliadorDePacote, descreverCapaSemManchete } from "../ramos/materia-profunda";
import type { ResultadoDoRamoDoPortal } from "../ramos/ramo-do-portal";
import { gravarArtigosAgendados, horariosDoPortal } from "../ramos/portal";
import { gravarCustos, gravarVeredito, vereditoDaPeca } from "../ramos/registro";
import { lancarCustosDoInstagram, pecasDoInstagram } from "../ramos/instagram";
import { hashtagsLigadasNoProjeto } from "../social/legenda-final";
import { urlDaFotoInteira } from "../visual/foto-inteira";

export type RunNewsroomOptions = {
  /** Projeto para o qual a edição é produzida. Sem valor, usa o projeto semente. */
  projectId?: string;
  dryRun?: boolean;
  timeWindowHours?: number;
  idempotencyKey?: string;
  publishToPortal?: boolean;
  createNewsletterCampaign?: boolean;
  autoSend?: boolean;
  /**
   * Candidatas do Instagram que não vieram da coleta: perfis de referência e
   * fontes do feed, construídos em paralelo (05/10/2026). Só são lidas com os
   * ramos em `enforce`.
   */
  candidatasExtrasDoInstagram?: PautaAvaliada[];
  /**
   * Recebe cada peça pronta dos três ramos, para a fila de aprovação.
   *
   * A fila é construída em paralelo; este é o ponto de encaixe. Só é chamado
   * com os ramos em `enforce` e fora de ensaio. Falha aqui vira log, nunca
   * derruba o ciclo.
   */
  aoProduzirPeca?: (peca: PecaPronta) => Promise<void> | void;
  /**
   * A data da edição, AAAA-MM-DD no fuso do projeto. Ausente, é hoje.
   *
   * Entrou em 05/10/2026 com a produção na véspera (`producao-vespera.ts`): às
   * 17:00 de segunda a redação escreve a edição de terça. O ciclo das 06:03
   * não passa este campo, e continua escrevendo a edição de hoje.
   */
  editionDate?: string;
  /**
   * Publicação com hora marcada, em vez de publicar agora.
   *
   * Com este campo a edição é gravada como `approved` (fora do portal até a
   * hora), o artigo como `scheduled` com `published_at` no horário do portal,
   * e a campanha do Listmonk AGENDADA para o horário da newsletter. Quem vira
   * `approved` em `published` na hora certa é `publicacao-agendada.ts`.
   * Ausente, que é o ciclo das 06:03, tudo sai na hora, como sempre.
   */
  agendamento?: {
    /** Instante ISO do disparo da newsletter. */
    newsletterEm: string;
    /** Instante ISO em que o artigo do portal vai ao ar. */
    portalEm: string;
  };
  /**
   * Só a newsletter, sem tocar no Instagram nem no portal (06/10/2026).
   *
   * Existe para refazer a edição de um dia cujos posts e matérias já foram
   * produzidos e estão na fila, como em 06/10/2026, quando a produção da
   * véspera escreveu e enfileirou tudo e só a edição de 07/10 foi barrada pelo
   * QA. Rodar a redação inteira de novo criaria posts e matérias em dobro.
   *
   * Com este campo: o ciclo social não roda (nem o diagnóstico dele é
   * gravado), o ramo do portal não roda, a edição não vira artigo, o agendador
   * legado do Instagram não roda, e só a peça da newsletter chega a
   * `aoProduzirPeca`. Coleta, classificação, seleção, pacote factual, redação,
   * QA e imagem são os mesmos do ciclo de sempre. Quem chama é
   * `produzirSoANewsletter`, em `producao-vespera.ts`.
   */
  somenteNewsletter?: boolean;
};

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A data da edição: a pedida, ou hoje no fuso do projeto.
 *
 * Data pedida em formato errado é ERRO, e não fallback para hoje: produzir a
 * edição de hoje às 17:00 publicaria o dia errado com a chave de outro.
 */
export function dataDaEdicao(options: Pick<RunNewsroomOptions, "editionDate">, project: { timezone: string }): string {
  if (options.editionDate === undefined) return projectToday(project);
  if (!DATA_ISO.test(options.editionDate)) {
    throw new Error(`editionDate inválida: "${options.editionDate}". Esperado AAAA-MM-DD.`);
  }
  return options.editionDate;
}

/*
 * Aqui havia cinco fotos fixas do Unsplash, todas de tecnologia, usadas como
 * capa quando a edição não tinha imagem. Era o mesmo mecanismo das seis do
 * coletor, com outro nome: foto sem relação com a pauta, escolhida por
 * posição. A capa da edição agora é a foto da primeira pauta, e quando não
 * existe foto a coluna fica nula.
 */

/**
 * HTML da edição.
 *
 * `paraWeb` decide o que fica de fora, e a distinção não é cosmética: a mesma
 * string ia para a caixa de entrada **e** para o corpo do artigo no portal.
 * Na página, o resultado era a edição duplicada, porque a página desenha o próprio
 * cabeçalho (título, data, resumo) e logo abaixo aparecia o cabeçalho do
 * e-mail com os mesmos dados, mais o índice repetindo todos os títulos, mais
 * o rodapé com "powered by" e o link de descadastro. Foi o que apareceu como
 * "repetindo um monte de parte".
 *
 * O que sai no modo web é só o que a página já provê ou o que só faz sentido
 * numa caixa de entrada. As pautas em si são idênticas nos dois.
 */
/**
 * Foto de cada pauta, endereçada pela identidade da pauta.
 *
 * Era um array posicional, e a posição mentia. Um `.filter(Boolean)` no meio
 * do caminho deslocava os índices e cada pauta saía ilustrada com a foto da
 * seguinte. Chave é a identidade da pauta, e identidade não desliza.
 */
export type ImagensDaEdicao = Map<string, string>;

/**
 * Crédito por pauta, quando a licença exige.
 *
 * Mapa separado e opcional: sem ele o template desenha exatamente o que
 * desenhava antes. Licença que pede atribuição pede embaixo da foto, e isso
 * não é negociável por estética.
 */
export type LegendasDaEdicao = Map<string, string>;

/**
 * O contexto da edição para a refação na fila de aprovação (06/10/2026).
 *
 * Uma pauta por história, na ordem da edição, com o `storyId` da identidade da
 * história (a mesma chave das fotos), o pacote factual de cada uma, as fotos e
 * os créditos que o e-mail desenhou, e a referência ao pool do dia. É o que a
 * reescrita da edição, a troca de uma foto e a troca de uma pauta precisam
 * sem a pauta avaliada, que não sobrevive ao ciclo.
 */
export function contextoDaNewsletterNaFila(e: {
  data: string;
  historias: Array<{ title: string; source_url: string; source_name: string; category: string; summary: string; context: string }>;
  pautas: PautaAvaliada[];
  pacotesPorUrl: Map<string, PacoteFactual>;
  pool: string[];
  imagens: Map<string, string>;
  legendas: Map<string, string>;
}): ContextoDeProducao {
  const porUrl = new Map(e.pautas.map((p) => [p.grupo.primary.url, p]));
  const pacotes: Record<string, PacoteFactual> = {};
  const pautas: PautaDoContexto[] = e.historias.map((st) => {
    const id = identidadeDaPauta(st);
    const pacote = e.pacotesPorUrl.get(st.source_url);
    if (pacote) pacotes[id] = pacote;
    const p = porUrl.get(st.source_url);
    if (p) return { ...pautaDoContexto(p), storyId: id };
    return {
      storyId: id,
      titulo: st.title,
      url: st.source_url,
      fonteNome: st.source_name,
      publicadoEm: "",
      resumo: [st.summary, st.context].filter(Boolean).join("\n\n"),
      categoria: st.category,
      eixo: "",
      pais: "",
      atores: [],
      lugares: [],
      acontecimento: [],
    };
  });
  return {
    versao: 1,
    data: e.data,
    pautas,
    ...(Object.keys(pacotes).length ? { pacotes } : {}),
    ...(e.pool.length ? { pool: e.pool } : {}),
    imagens: Object.fromEntries(e.imagens),
    legendas: Object.fromEntries(e.legendas),
  };
}

/** A mesma identidade usada no histórico editorial, para as duas pontas casarem. */
export function identidadeDaPauta(story: { source_url?: string; title: string }): string {
  return gerarStoryId({ url: story.source_url || undefined, titulo: story.title });
}

/** Proporção fixa da foto no e-mail. 600 por 360, cinco por três. */
const FOTO_LARGURA = 600;
const FOTO_ALTURA = 360;

/**
 * A foto da pauta sempre na mesma proporção.
 *
 * A altura era `auto`. Foto deitada ficava boa e foto em pé ocupava a tela
 * inteira do celular: a mesma edição tinha uma pauta de 400px e outra de 1200,
 * e no telefone isso vira rolagem sem fim entre um título e o próximo.
 *
 * Três camadas, porque cliente de e-mail não é navegador:
 *
 * 1. Corte na origem, quando o provedor aceita. Pexels e Unsplash recortam por
 *    parâmetro de URL, e é o único jeito de o Outlook receber a imagem já certa,
 *    já que ele ignora CSS de layout.
 * 2. `width` e `height` no atributo, que é o que o Outlook respeita.
 * 3. `object-fit: cover` para os clientes modernos, que assim recortam em vez
 *    de espremer.
 *
 * O Wikimedia não recorta por URL, só redimensiona por largura. Nesse caso a
 * terceira camada é quem resolve, e o Outlook recebe a foto deitada.
 */
function fotoNaProporcao(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    if (host.endsWith("images.pexels.com")) {
      u.searchParams.set("w", String(FOTO_LARGURA));
      u.searchParams.set("h", String(FOTO_ALTURA));
      u.searchParams.set("fit", "crop");
      return u.toString();
    }

    if (host.endsWith("images.unsplash.com")) {
      u.searchParams.set("w", String(FOTO_LARGURA));
      u.searchParams.set("h", String(FOTO_ALTURA));
      u.searchParams.set("fit", "crop");
      u.searchParams.set("crop", "entropy");
      return u.toString();
    }

    return url;
  } catch {
    return url;
  }
}

/**
 * A foto do e-mail, inteira (14/10/2026). Origem conhecida passa pela rota que
 * compõe a foto inteira sobre ela mesma desfocada em 5:3, então nada é cortado
 * (ver `visual/foto-inteira.ts`). Origem desconhecida segue o caminho antigo.
 */
function fotoDoEmail(url: string): string {
  const limpa = (url || "").replace(/&amp;/g, "&");
  const inteira = urlDaFotoInteira(limpa);
  return inteira !== limpa ? inteira : fotoNaProporcao(url);
}

/** A regra de 05/10/2026, desligada em 14/10/2026: a newsletter mantém a pauta sem foto. */
const PAUTA_SEM_FOTO_CAI_DA_NEWSLETTER = false;

const ESTILO_DA_FOTO =
  `width:100%;max-width:${FOTO_LARGURA}px;height:${FOTO_ALTURA}px;` +
  `object-fit:cover;display:block;border-radius:10px;`;

export function renderEditionToHtml(
  edition: EditionContent,
  imagens: ImagensDaEdicao = new Map(),
  paraWeb = false,
  legendas: LegendasDaEdicao = new Map(),
  /**
   * A data que a edição LEVA, AAAA-MM-DD. Ausente, é o relógio, como sempre
   * foi. Na produção da véspera (05/10/2026) a edição de terça é montada na
   * segunda, e sem isto o cabeçalho diria segunda e o link apontaria para o
   * artigo de segunda.
   */
  dataDaEdicaoIso?: string,
  /**
   * Qual variante do bloco do VisaMatch (05/10/2026): os dias de publicação da
   * newsletter e o que o projeto declarou em `settings.visamatch`. Ausente,
   * rotação padrão sobre terça a sexta. Ver `visamatch-na-edicao.ts`.
   */
  visamatch: ConfigDoVisaMatch = {},
): string {
  const todayStr = dataDaEdicaoIso ?? new Date().toISOString().split("T")[0];

  const dataLonga = (dataDaEdicaoIso ? new Date(`${dataDaEdicaoIso}T12:00:00Z`) : new Date())
    .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    .toUpperCase();

  // --- paleta e medidas -----------------------------------------------------
  //
  // Tudo o que é texto fica em #1A1A1A ou #4A4A4A sobre branco. A auditoria do
  // template anterior achou o oposto disso: rótulo vermelho sobre cinza claro,
  // caixa amarela com texto âmbar, cinza médio sobre cinza claro. Cor de marca
  // aqui é acento (fio, número, rótulo curto), nunca corpo de texto.
  const TINTA = "#1A1A1A";
  const TINTA_SUAVE = "#4A4A4A";
  const LINHA = "#E4E4E7";

  const fonte =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  /*
   * Anula a borda que o template padrao do Listmonk aplica em TODA tabela
   * (`table { border: 1px solid #ddd }` no CSS dele). Como este layout usa
   * tabela para diagramar, cada bloco saiu com uma caixa cinza em volta, e o
   * indice "Nesta edicao" ficou dentro de um retangulo.
   *
   * Estilo inline vence a folha de estilo, entao a correcao vale mesmo se o
   * template mudar.
   */
  const SEM_BORDA = "border:0;border-collapse:collapse";

  const blocoDoParceiro = blocoDoVisaMatch(
    todayStr,
    { fonte, tinta: TINTA, tintaSuave: TINTA_SUAVE, linha: LINHA, cor: MARCA.cor, tintaEscura: MARCA.tintaEscura, semBorda: SEM_BORDA },
    visamatch,
  );

  /*
   * O corpo da pauta, com negrito e com parágrafos.
   *
   * Duas coisas que a referência faz e que o texto corrido não fazia. O leitor
   * passa o olho antes de ler, e o que segura o olho é o número em negrito; e
   * um bloco único de oito linhas é o que faz uma notícia curta parecer longa.
   *
   * A ordem aqui importa e é a única coisa delicada: escapa PRIMEIRO, converte
   * depois. Invertido, um `<b>` escrito pelo modelo viraria marcação de
   * verdade no e-mail de todo mundo. Depois do escape, só os asteriscos que o
   * próprio modelo escreveu podem virar tag, e nada mais.
   */
  const corpoDoTexto = (texto: string, estilo: string): string => {
    const paragrafos = escapeHtml(texto ?? "")
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (paragrafos.length === 0) return "";

    return paragrafos
      .map((t) => {
        const comNegrito = t.replace(/\*\*([^*]+)\*\*/g, "<strong style=\"color:#1A1A1A;\">$1</strong>");
        return `<p style="${estilo}">${comNegrito.replace(/\n/g, "<br />")}</p>`;
      })
      .join("");
  };

  const rotulo = (texto: string, cor: string) =>
    `<div style="font-family:${fonte};font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${cor};margin:0 0 10px 0;">${escapeHtml(texto)}</div>`;

  // --- índice ---------------------------------------------------------------
  //
  // Numerado, sem emoji e sem caixa cinza. O emoji por categoria vinha de um
  // mapa da vertical antiga ("Redes Sociais", "Vendas") e caía num raio ⚡ para
  // toda pauta de imigração, decoração que não informa nada.
  const tocHtml = edition.stories
    .map(
      (s, i) => `
      <tr>
        <td style="padding:0 0 12px 0;vertical-align:top;width:28px;">
          <span style="font-family:${fonte};font-size:15px;font-weight:800;color:${MARCA.cor};">${i + 1}</span>
        </td>
        <td style="padding:0 0 12px 0;font-family:${fonte};font-size:16px;line-height:1.5;color:${TINTA};">
          ${escapeHtml(s.title)}
        </td>
      </tr>`,
    )
    .join("");

  // --- pautas ---------------------------------------------------------------
  //
  // A primeira pauta tem tratamento de capa. As demais são mais curtas.
  //
  // Antes, toda pauta trazia os mesmos dois blocos rotulados ("O que muda na
  // prática" e "Por que olhar de perto"), na mesma ordem, com o mesmo tamanho.
  // Cinco vezes seguidas isso deixa de ser estrutura e vira cadência de robô:
  // o leitor aprende o formato na segunda pauta e passa a rolar as outras.
  //
  // Só a pauta principal ganha o box destacado. Nas demais o impacto prático
  // entra como uma frase no fim do parágrafo, sem rótulo. Um texto com ritmo
  // variado se lê; um formulário repetido não.
  const storiesHtml = edition.stories
    .map((s, index) => {
      const principal = index === 0;
      const whatsappText = encodeURIComponent(
        `${s.title}\n\n${MARCA.site}/artigos/edicao-${todayStr}`,
      );
      const imagem = safeHttpUrl(imagens.get(identidadeDaPauta(s)) || "", "");
      const credito = legendas.get(identidadeDaPauta(s)) || "";
      const creditoHtml =
        imagem && credito
          ? `<p style="font-family:${fonte};font-size:12px;line-height:1.4;color:#8A8A8F;margin:-8px 0 14px 0;">${escapeHtml(credito)}</p>`
          : "";
      const fonteUrl = safeHttpUrl(s.source_url);

      const linhaDaFonte = `
        <p style="font-family:${fonte};font-size:13px;line-height:1.5;color:#71717A;margin:0;">
          Fonte:
          <a href="${escapeHtml(fonteUrl)}" target="_blank" rel="noopener noreferrer" style="color:#71717A;text-decoration:underline;">${escapeHtml(s.source_name)}</a>
          &nbsp;·&nbsp;
          <a href="https://wa.me/?text=${whatsappText}" target="_blank" style="color:${MARCA.cor};text-decoration:none;font-weight:700;white-space:nowrap;"><img src="${MARCA.site}/marca/whatsapp.png" alt="" width="14" height="14" style="width:14px;height:14px;vertical-align:-2px;border:0;margin-right:5px;" />Compartilhar</a>
        </p>`;

      if (!principal) {
        return `
      <tr><td style="padding:0 0 34px 0;border:0;">
        ${rotulo(s.category, MARCA.cor)}
        <h2 class="titulo-n" style="font-family:${fonte};font-size:22px;line-height:1.32;font-weight:800;letter-spacing:-0.015em;color:${TINTA};margin:0 0 12px 0;">
          ${escapeHtml(s.title)}
        </h2>
        ${
          imagem
            ? `<img src="${escapeHtml(fotoDoEmail(imagem))}" alt="" width="${FOTO_LARGURA}" height="${FOTO_ALTURA}" style="${ESTILO_DA_FOTO}${recorteDaFoto(imagem).css}margin:0 0 14px 0;" />${creditoHtml}`
            : ""
        }
        ${corpoDoTexto(s.summary, `font-family:${fonte};font-size:16px;line-height:1.62;color:${TINTA_SUAVE};margin:0 0 12px 0;`)}
        ${linhaDaFonte}
      </td></tr>`;
      }

      return `
      <tr><td style="padding:0 0 40px 0;border:0;">
        ${rotulo(s.category, MARCA.cor)}

        <h2 class="titulo-1" style="font-family:${fonte};font-size:25px;line-height:1.26;font-weight:800;letter-spacing:-0.02em;color:${TINTA};margin:0 0 16px 0;">
          ${escapeHtml(s.title)}
        </h2>

        ${
          imagem
            ? `<img src="${escapeHtml(fotoDoEmail(imagem))}" alt="" width="${FOTO_LARGURA}" height="${FOTO_ALTURA}" style="${ESTILO_DA_FOTO}${recorteDaFoto(imagem).css}margin:0 0 18px 0;" />${creditoHtml}`
            : ""
        }

        ${corpoDoTexto(s.summary, `font-family:${fonte};font-size:17px;line-height:1.6;color:${TINTA_SUAVE};margin:0 0 14px 0;`)}

        ${/*
          Contexto e relevância no mesmo parágrafo, sem rótulo. O conteúdo do
          "Por que olhar de perto" continua na edição; o que sai é o rótulo
          repetido em toda pauta, que era o que dava cara de formulário.
        */ ""}
        ${/*
          "Por que isso importa?" volta como rótulo, e a diferença com o que
          saiu está no desenho.

          O que tinha sido removido era um QUADRO com rótulo fixo em toda
          pauta, que pedia conteúdo mesmo quando não havia. Este rótulo é
          inline, em negrito, no começo do próprio parágrafo, que é a forma da
          referência: ele não cria caixa, não ocupa linha sozinho e some junto
          com o texto quando o campo está vazio.

          E o campo vazio é resultado válido desde 15/09: quando o pacote não
          sustenta relevância, a pauta sai sem esta linha, e não com uma frase
          de enchimento.
        */ ""}
        ${
          s.context
            ? corpoDoTexto(s.context, `font-family:${fonte};font-size:17px;line-height:1.6;color:${TINTA_SUAVE};margin:0 0 14px 0;`)
            : ""
        }
        ${
          s.why_it_matters
            ? `<p style="font-family:${fonte};font-size:17px;line-height:1.6;color:${TINTA_SUAVE};margin:0 0 18px 0;"><strong style="color:${TINTA};">Por que isso importa:</strong> ${escapeHtml(
                s.why_it_matters,
              ).replace(/\*\*([^*]+)\*\*/g, "<strong style=\"color:#1A1A1A;\">$1</strong>")}</p>`
            : ""
        }

        ${/*
          O quadro "O que muda na prática" saiu.
          Ele aparecia em TODA pauta, e nem toda pauta tem uma consequência
          prática para declarar. Quando não tinha, o texto preenchia o quadro
          assim mesmo, e o que saía era hedge: "quem atua na área deve observar
          se reúne reconhecimento contínuo; a fonte não informa critérios".
          Um rótulo fixo pede conteúdo fixo, e conteúdo que não existe vira
          enchimento com cara de formulário.

          O campo continua sendo gerado: o carrossel usa `practical_impact` na
          estrutura dos slides. O que saiu foi a renderização no e-mail e no
          portal, não o dado.
        */ ""}
        ${linhaDaFonte}
      </td></tr>`;
    })
    .join("");

  /*
   * O "Giro rápido" saiu do e-mail.
   *
   * Ele repetia, em três linhas soltas, fatos que as pautas logo acima já
   * tinham dado. Num dia em que as quatro pautas cobrem o mesmo
   * acontecimento, ele vira a quinta e a sexta vez que o leitor lê a mesma
   * coisa, agora sem contexto nenhum.
   *
   * O campo continua sendo gerado e gravado em `news_editions.quick_bits`:
   * o que saiu foi a RENDERIZAÇÃO, não o dado. É a mesma decisão que tirou o
   * quadro "O que muda na prática" logo acima, e pelo mesmo motivo: rótulo
   * fixo pede conteúdo fixo, e conteúdo que não existe vira enchimento.
   */

  /*
   * Mobile-first, e aqui isso é literal: os valores inline são os do celular.
   *
   * O que existia era um desktop estreitado. A soma horizontal era 12px do
   * container externo mais 32px do quadro, dos dois lados: 88px de padding num
   * aparelho de 390px, sobrando 302px para o texto. Quem lê no ônibus recebia
   * três quartos da tela.
   *
   * Agora o padrão é 20px de cada lado, sem padding externo lateral: 350px de
   * texto no mesmo aparelho. O `@media (min-width:600px)` devolve o respiro do
   * desktop, e é acréscimo, não requisito — cliente de e-mail que ignora o
   * bloco de estilo continua exibindo a versão do celular, que é a que quase
   * toda a audiência vê.
   *
   * `!important` porque estilo inline vence folha de estilo em CSS, e sem ele a
   * media query não teria efeito nenhum sobre os atributos `style`.
   */
  const estiloResponsivo = `
  <style>
    @media (min-width: 600px) {
      .quadro { padding: 36px 32px 40px 32px !important; }
      .hero { font-size: 34px !important; }
      .titulo-1 { font-size: 28px !important; }
      .titulo-n { font-size: 23px !important; }
    }
    @media (max-width: 359px) {
      .quadro { padding: 22px 16px 26px 16px !important; }
      .hero { font-size: 27px !important; }
      .titulo-1 { font-size: 23px !important; }
    }
  </style>`;

  // --- montagem -------------------------------------------------------------
  return `${paraWeb ? "" : estiloResponsivo}
  <div style="background:#F4F4F5;padding:0;margin:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};background:#F4F4F5;">
      <tr><td align="center" style="padding:16px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;">
          <tr><td class="quadro" style="padding:26px 20px 30px 20px;">

            ${/* No portal a página já mostra título, data e resumo. */ ""}
            ${
              paraWeb
                ? ""
                : `<div style="text-align:center;padding:0 0 26px 0;">
              <div style="font-family:${fonte};font-size:12px;font-weight:700;letter-spacing:0.1em;color:#A1A1AA;margin:0 0 14px 0;">
                ${escapeHtml(dataLonga)}
              </div>
              ${/*
                O logo com o `alt` da marca. Cliente de e-mail que bloqueia
                imagem por padrão mostra o texto alternativo, então o
                cabeçalho continua legível mesmo sem carregar nada.
              */ ""}
              <img src="${MARCA.logoClaro}" alt="${MARCA.nome}" width="200" height="${Math.round(200 / MARCA.logoProporcao)}"
                style="width:200px;max-width:60%;height:auto;display:block;margin:0 auto 20px auto;border:0;" />
              <h1 class="hero" style="font-family:${fonte};font-size:30px;line-height:1.22;font-weight:800;letter-spacing:-0.03em;color:${TINTA};margin:0 0 12px 0;">
                ${escapeHtml(edition.headline)}
              </h1>
              <p style="font-family:${fonte};font-size:16px;line-height:1.6;color:${TINTA_SUAVE};margin:0;">
                ${escapeHtml(edition.preheader)}
              </p>
            </div>`
            }

            ${
              paraWeb
                ? ""
                : `<p style="font-family:${fonte};font-size:17px;line-height:1.6;color:${TINTA_SUAVE};border-left:3px solid ${MARCA.cor};padding:0 0 0 16px;margin:0 0 34px 0;">
              ${escapeHtml(edition.intro)}
            </p>`
            }

            ${/*
              Índice. Fora do portal: numa página de rolagem contínua ele só
              repete os títulos que vêm logo abaixo, e foi metade da duplicação
              relatada pelo leitor.
            */ ""}
            ${
              paraWeb
                ? ""
                : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};margin:0 0 40px 0;">
              <tr><td style="border-top:1px solid ${LINHA};border-bottom:1px solid ${LINHA};padding:22px 0;">
                ${rotulo("Nesta edição", TINTA_SUAVE)}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA}">${tocHtml}</table>
              </td></tr>
            </table>`
            }

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA}">
              ${storiesHtml}
            </table>

            ${/*
              O único convite do fim do e-mail, e por que é este.

              Aqui havia dois blocos, um embaixo do outro: a análise de perfil
              e um convite para seguir o Instagram. O segundo disputava com a
              própria newsletter a atenção de quem tinha acabado de ler a
              edição, e oferecia o MESMO conteúdo em outro formato. Pedir que
              o leitor troque o e-mail pelo feed é pedir que ele saia de onde
              ele já está.

              Fica a análise de perfil, que é a única coisa aqui que responde à
              pergunta que levou a pessoa a assinar: eu consigo? Ela herda o
              desenho escuro que era do bloco do Instagram, porque aquele
              desenho é o mais forte da peça. O Instagram desce para o rodapé,
              num ícone.

              O link carrega a edição no utm_content, então dá para saber qual
              edição converte.
            */ ""}
            ${/*
              Atualização de 05/10/2026, decisão do dono: o convite continua
              sendo um só, mas deixou de ser o MESMO todo dia. O bloco do
              VisaMatch alterna de formato a cada edição (menção de uma linha,
              "Você sabia?", pergunta rápida, checklist, dúvida comum, cartão
              discreto, P.S. e o cartão escuro que morava aqui), sempre
              rotulado como de parceiro, com a variante no utm_content. Ver
              `visamatch-na-edicao.ts`. O texto acima fica como registro de
              por que o fim do e-mail tem um convite só.
            */ ""}
            ${blocoDoParceiro.antesDoFechamento}

            ${
              paraWeb
                ? ""
                : `<p style="font-family:${fonte};font-size:16px;line-height:1.7;color:${TINTA};font-weight:700;margin:0 0 32px 0;">
              ${escapeHtml(edition.final_line)}
            </p>`
            }

            ${blocoDoParceiro.depoisDoFechamento}

            ${/*
              Rodapé de caixa de entrada: quem somos, redes e descadastro. No
              portal é ruído, e o link de descadastro chega a ser errado, porque a
              página é pública e o visitante não assina lista nenhuma.
            */ ""}
            ${
              paraWeb
                ? ""
                : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA}">
              <tr><td style="border-top:1px solid ${LINHA};padding:28px 0 0 0;">
                ${rotulo("Quem somos", "#A1A1AA")}
                <p style="font-family:${fonte};font-size:14px;line-height:1.65;color:${TINTA_SUAVE};margin:0 0 14px 0;">
                  A <strong style="color:${TINTA};">${MARCA.nome}</strong> é uma newsletter diária e gratuita
                  sobre os Estados Unidos, escrita em português: economia, trabalho, custo de vida,
                  política, tecnologia e cultura, sempre com a fonte ao lado.
                </p>
                <p style="font-family:${fonte};font-size:12px;line-height:1.6;color:#8A8A8F;margin:0 0 20px 0;">
                  Conteúdo informativo, não orientação financeira nem jurídica. Confirme
                  na fonte citada antes de tomar qualquer decisão.
                </p>
                ${/*
                  O Instagram, agora, é isto: um ícone e o nome do perfil.

                  Ele tinha um bloco inteiro no fim do e-mail, competindo com a
                  edição que o leitor acabou de ler. Aqui ele cumpre a função
                  que lhe cabe, que é existir para quem foi procurar, do mesmo
                  jeito que a referência faz: uma fileira discreta de ícones no
                  rodapé.

                  PNG, e não SVG, porque cliente de e-mail não renderiza SVG. É
                  o mesmo caminho do ícone do WhatsApp que já está na peça.
                */ ""}
                <p style="font-family:${fonte};font-size:13px;margin:0 0 16px 0;">
                  <a href="${MARCA.instagram}" target="_blank" style="color:#8A8A8F;font-weight:600;text-decoration:none;">
                    <img src="${MARCA.site}/marca/instagram.png" alt="" width="15" height="15" style="width:15px;height:15px;vertical-align:-3px;border:0;margin-right:6px;" />${MARCA.instagramNome}</a>
                </p>
                <p style="font-family:${fonte};font-size:12px;line-height:1.6;color:#A1A1AA;margin:0;">
                  Atualize suas <a href="{{ UnsubscribeURL }}" style="color:#71717A;">preferências</a>
                  ou <a href="{{ UnsubscribeURL }}" style="color:#71717A;">cancele a assinatura</a>.<br />
                  © 2026 ${MARCA.nome}
                </p>
              </td></tr>
            </table>`
            }

          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

/**
 * Grava o dia em que a redação rodou e decidiu não publicar.
 *
 * Existe porque a ausência de linha é ambígua: em agosto, `newsroom_runs`
 * vazio significou cron morto, e em setembro significou linha editorial
 * fazendo o trabalho dela. Os dois casos exigem reações opostas, e nenhum dos
 * dois deixava rastro.
 *
 * `cancelled` já está no CHECK da tabela desde a migration original, então
 * isto não pede alteração de schema. O erro da própria gravação é engolido, no
 * mesmo padrão do registro de sucesso: não conseguir anotar o dia não pode
 * virar uma segunda falha em cima da primeira.
 *
 * A chave leva o sufixo `#sem-edicao` porque `idempotency_key` é UNIQUE global.
 * Gravando com a chave canônica, o dia sem edição ocuparia o lugar do dia: uma
 * recuperação bem-sucedida mais tarde perderia o próprio registro de sucesso, e
 * o dia ficaria arquivado como cancelado tendo publicado. Registro que mente é
 * pior que registro ausente, que é o problema que este código veio resolver.
 *
 * Como efeito, a guarda de idempotência não vê este registro, e está certo:
 * dia cancelado por falta de pauta DEVE poder ser tentado de novo.
 */
/**
 * Anexa o desfecho do alerta ao run já gravado.
 *
 * Existe por causa de um beco sem saída da investigação de 06, 07 e 08 de
 * setembro de 2026: os alertas críticos não chegaram, e a única evidência do
 * motivo era um `console.error` dentro do contêiner, que o usuário `deploy` não
 * consegue ler (sem docker, sem sudo). Cinco hipóteses foram eliminadas por
 * medição e a sexta ficou sem prova, porque a prova estava num log inalcançável.
 *
 * Log serve para quem tem acesso ao log. O que sobrevive é o que está no banco.
 * A próxima vez que um alerta falhar, o motivo estará na linha do run.
 */
export async function anexarDesfechoDoAlerta(
  idempotencyKey: string,
  desfecho: { enviado: boolean; motivo: string; status: number | null; descricao: string | null },
  cliente?: ReturnType<typeof getSupabaseAdminClient>,
): Promise<void> {
  try {
    const supabase = cliente ?? getSupabaseAdminClient();
    const chave = `${idempotencyKey}#sem-edicao`;

    const { data } = await supabase
      .from("newsroom_runs")
      .select("error_message")
      .eq("idempotency_key", chave)
      .maybeSingle();

    const anterior = (data?.error_message as string | undefined) ?? "";
    const nota =
      `alerta=${desfecho.enviado ? "entregue" : "FALHOU"} motivo=${desfecho.motivo}` +
      (desfecho.status !== null ? ` status=${desfecho.status}` : "") +
      (desfecho.descricao ? ` descricao=${desfecho.descricao.slice(0, 200)}` : "");

    await supabase
      .from("newsroom_runs")
      .update({ error_message: anterior ? `${anterior} | ${nota}` : nota })
      .eq("idempotency_key", chave);
  } catch (err) {
    console.error("[NEWSROOM DB] Não consegui anexar o desfecho do alerta:", err);
  }
}

export async function registrarDiaSemEdicao(dados: {
  projectId: string;
  startTime: number;
  idempotencyKey: string;
  motivo: string;
  sourcesCount: number;
  candidatesFound: number;
  uniqueCount: number;
  duplicatesCount: number;
  storiesSelected: number;
  dryRun: boolean;
}, cliente?: ReturnType<typeof getSupabaseAdminClient>): Promise<void> {
  if (dados.dryRun) return;

  try {
    const supabase = cliente ?? getSupabaseAdminClient();
    await supabase.from("newsroom_runs").insert({
      project_id: dados.projectId,
      started_at: new Date(dados.startTime).toISOString(),
      finished_at: new Date().toISOString(),
      status: "cancelled",
      sources_count: dados.sourcesCount,
      candidates_found: dados.candidatesFound,
      candidates_filtered: dados.candidatesFound - dados.uniqueCount,
      duplicates_count: dados.duplicatesCount,
      stories_selected: dados.storiesSelected,
      dry_run: false,
      edition_id: null,
      error_message: dados.motivo,
      idempotency_key: `${dados.idempotencyKey}#sem-edicao`,
    });
  } catch (err) {
    console.error("[NEWSROOM DB] Não consegui registrar o dia sem edição:", err);
  }
}

/**
 * Falha técnica da redação também vira linha no banco.
 *
 * Em 10/09/2026 o cron disparou às 09:03:01 UTC, o endpoint respondeu 202, a
 * redação classificou 109 candidatas e aprovou 5, e depois disso não sobrou
 * nada: nem `news_editions`, nem `newsroom_runs`, nem artigo, nem post. A linha
 * do run é gravada UMA vez, no fim do caminho de sucesso, então qualquer
 * exceção entre a aprovação editorial e a edição apaga a própria evidência, e
 * o dia fica indistinguível de cron morto.
 *
 * É a lição de 06, 07 e 08 de setembro com outro rosto. Naquela vez o portão
 * que decidia não publicar sinalizava por `throw`, e a correção foi gravar
 * antes de sinalizar. A correção alcançou o mínimo de pautas e parou ali: o
 * bloqueio do QA em `enforce` continua saindo por exceção, e qualquer erro
 * técnico no mesmo trecho some do mesmo jeito.
 *
 * Esta função não muda decisão nenhuma e não engole erro nenhum: grava e
 * repassa. Ela só garante que, quando o dia quebrar, o motivo esteja onde dá
 * para ler sem docker e sem sudo.
 *
 * A chave leva a hora da falha porque `idempotency_key` é UNIQUE global. Sem
 * isso, a segunda falha do dia não gravaria, e a recuperação bem-sucedida mais
 * tarde disputaria a chave canônica do dia com o registro do erro.
 */
export async function registrarFalhaDaRedacao(
  erro: unknown,
  contexto: {
    startTime: number;
    options: RunNewsroomOptions;
    env: Record<string, string | undefined>;
    /** Onde o funil parou. Sem isto a linha de falha grava zeros. */
    funil?: ContadoresDoFunil;
  },
  cliente?: ReturnType<typeof getSupabaseAdminClient>,
): Promise<void> {
  try {
    const { options, env } = contexto;
    const dryRun =
      options.dryRun ?? (env.DRY_RUN === "true" || env.DRY_RUN === undefined ? true : false);
    if (dryRun) return;

    const project = await requireActiveProject(options.projectId ?? DEFAULT_PROJECT_ID);
    const todayStr = dataDaEdicao(options, project);
    const chaveDoDia = options.idempotencyKey || `daily-edition-${todayStr}`;
    const quando = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    const cabeca =
      erro instanceof Error ? `RUN_FAILED: ${erro.message}` : `RUN_FAILED: ${String(erro)}`;
    const linhaDoStack =
      erro instanceof Error && erro.stack ? ` | ${erro.stack.split("\n")[1]?.trim() ?? ""}` : "";

    /*
     * O detalhe entra antes da linha do stack de propósito.
     *
     * A coluna é cortada, e o que o corte pode comer tem que ser a parte que
     * menos responde. Para bloqueio editorial o stack aponta para o `throw` do
     * portão, que já se sabe qual é; o trecho reprovado é o que não está em
     * lugar nenhum além do log do contêiner, que ninguém alcança.
     */
    const detalhe = detalheDoBloqueioDoErro(erro);
    const motivo = detalhe
      ? `${cabeca}\n${resumoDoBloqueio(detalhe)}${linhaDoStack}`
      : `${cabeca}${linhaDoStack}`;

    const supabase = cliente ?? getSupabaseAdminClient();
    const funil = contexto.funil ?? funilVazio();

    await supabase.from("newsroom_runs").insert({
      project_id: project.id,
      started_at: new Date(contexto.startTime).toISOString(),
      finished_at: new Date().toISOString(),
      status: "failed",
      sources_count: funil.sourcesCount,
      candidates_found: funil.candidatesFound,
      candidates_filtered: Math.max(0, funil.candidatesFound - funil.uniqueCount),
      duplicates_count: funil.duplicatesCount,
      stories_selected: funil.approvedCount,
      dry_run: false,
      edition_id: null,
      error_message: motivo.slice(0, 2000),
      idempotency_key: `${chaveDoDia}#falha-${quando}`,
    });

    console.error(`[NEWSROOM DB] Falha da redação registrada em newsroom_runs: ${motivo.slice(0, 300)}`);
  } catch (dbErr) {
    // Best effort de verdade: não registrar a falha não pode virar uma segunda
    // falha que esconda a primeira.
    console.error("[NEWSROOM DB] Não consegui registrar a falha da redação:", dbErr);
  }
}

/**
 * Redação em ensaio não grava post.
 *
 * `dryRun` sempre governou a newsletter, o portal e o Listmonk, e nunca chegou
 * ao social: quem decidia lá era só `SOCIAL_PIPELINE_V2`. Com a flag em
 * `enforce`, um dry-run da rota admin gerava arte, congelava artefato e gravava
 * linha `scheduled` em `social_posts`, que o worker publicaria depois. Uma rota
 * chamada dry-run criando publicação de verdade é a pior forma de surpresa.
 *
 * O rebaixamento só desce. Com o canal em `off`, ensaiar não pode LIGAR o
 * pipeline e gastar tokens que o operador desligou de propósito.
 *
 * Fora do ensaio devolve `undefined`, e não um modo: o caminho do cron precisa
 * continuar lendo a flag, e não receber um valor calculado aqui.
 */
export function modoSocialParaOEnsaio(
  dryRun: boolean,
  env: Record<string, string | undefined>,
  projeto?: ProjetoComCapacidades | null,
): ModoSocial | undefined {
  if (!dryRun) return undefined;
  return modoDoPipelineSocial(env, projeto) === "off" ? "off" : "dry_run";
}

/**
 * O que a execução já produziu quando ela falha depois.
 *
 * O diagnóstico do Instagram vivia num `let` local, e só aparecia nos dois
 * `return` do caminho feliz. O portão do QA sai por `throw`, então ele pulava
 * os dois: numa edição bloqueada, o canal social rodava inteiro, gravava post e
 * o resultado dizia apenas `{ok:false, error}`. Quem operava não tinha como
 * saber se o Instagram do dia tinha acontecido.
 *
 * O rastro é criado FORA da execução e preenchido por dentro, então ele
 * sobrevive à exceção. Não há cópia paralela: o diagnóstico mora aqui e só
 * aqui, porque duas variáveis que podem discordar é o defeito seguinte.
 */
/**
 * O que sobrevive ao `throw` e chega em quem grava a falha.
 *
 * O diagnóstico social já viajava aqui. Os números do funil passaram a viajar
 * junto porque a linha de falha os gravava zerados: eles só eram escritos no
 * caminho de sucesso, então um dia bloqueado perdia exatamente os números que
 * explicam por que foi bloqueado.
 *
 * Em 16/09/2026 isso apareceu na prática: três execuções falhadas, todas com
 * `candidates_found: 0`, e nenhuma forma de saber se o pool estava cheio ou
 * vazio sem reler o banco de candidatas na mão.
 */
export type RastroDaExecucao = {
  social: DiagnosticoSocialDoDia;
  funil: ContadoresDoFunil;
};

export type ContadoresDoFunil = {
  sourcesCount: number;
  candidatesFound: number;
  uniqueCount: number;
  duplicatesCount: number;
  /** Quantas a linha editorial aprovou, antes da composição da edição. */
  approvedCount: number;
};

export function funilVazio(): ContadoresDoFunil {
  return {
    sourcesCount: 0,
    candidatesFound: 0,
    uniqueCount: 0,
    duplicatesCount: 0,
    approvedCount: 0,
  };
}

/** Motivo estruturado da falha, para quem lê a resposta decidir o que fazer. */
export const MOTIVO_QA_BLOQUEOU = "EDITORIAL_QA";
export const MOTIVO_FALHA_GENERICA = "RUN_FAILED";

/*
 * O anexo é uma propriedade não enumerável no próprio erro, e não um erro novo
 * que embrulha o antigo. A mensagem, a `stack` e a identidade continuam sendo
 * as mesmas: o alerta do Telegram e a linha `failed` de `newsroom_runs` leem
 * exatamente o que liam antes desta mudança.
 */
/**
 * Por que a edição foi barrada, com nome e sobrenome.
 *
 * O motivo resumido já vinha na mensagem do erro: "UNGROUNDED_EDITORIAL_CLAIM
 * em 3 conclusão(ões)". Ele diz QUANTAS e não diz QUAIS, e o detalhe ia para
 * `console.error`, dentro de um contêiner que ninguém alcança sem docker.
 *
 * Em três dias seguidos a edição foi barrada por motivos diferentes, e sem o
 * trecho apontado não dá para distinguir as duas hipóteses que exigem ações
 * opostas: o pipeline está inventando, ou a guarda está apertada demais.
 * Afrouxar a régua sem saber qual das duas é o caso publicaria alucinação.
 */
export type DetalheDoBloqueio = {
  score: number;
  riscoDeAlucinacao: boolean;
  tentativasDeReparo: number;
  /** O que o auditor genérico apontou. */
  issues: string[];
  /** Número, data ou nome que não aparece no pacote factual. */
  semLastro: Array<{ materia: string; itens: Array<{ tipo: string; valor: string; onde: string }> }>;
  /** Conclusão que o auditor semântico não sustentou, com o trecho exato. */
  conclusoes: Array<{ tipo: string; trecho: string; motivo: string }>;
  /** Imprecisão que sobrou depois do reparo. Não bloqueia. */
  apontamentos: string[];
  /** Quantas redações inteiras a edição teve (06/10/2026, `nova-redacao.ts`). Ausente é uma. */
  redacoes?: number;
};

const LIMITE_DO_TRECHO = 240;

function recortar(texto: string, limite = LIMITE_DO_TRECHO): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite - 1)}…`;
}

/**
 * O bloqueio em texto, curto o bastante para caber junto da falha gravada.
 *
 * A ordem não é estética. Primeiro o trecho reprovado, depois a contagem e o
 * resto: quem lê isso está tentando decidir se o pipeline inventou ou se a
 * guarda apertou demais, e essas duas hipóteses pedem ações opostas. Sem a
 * frase, a linha gravada repete o que a mensagem já dizia.
 */
export function resumoDoBloqueio(detalhe: DetalheDoBloqueio): string {
  const linhas: string[] = [
    `QA ${detalhe.score} | alucinação: ${detalhe.riscoDeAlucinacao ? "sim" : "não"} | reparos: ${detalhe.tentativasDeReparo}` +
      ((detalhe.redacoes ?? 1) > 1 ? ` | redações: ${detalhe.redacoes}` : ""),
  ];

  for (const conclusao of detalhe.conclusoes) {
    linhas.push(
      `[conclusão ${conclusao.tipo}] "${recortar(conclusao.trecho)}" -> ${recortar(conclusao.motivo, 160)}`,
    );
  }

  for (const materia of detalhe.semLastro) {
    for (const item of materia.itens) {
      linhas.push(
        `[sem lastro ${item.tipo}] "${recortar(item.valor, 80)}" em ${recortar(materia.materia, 90)} (${item.onde})`,
      );
    }
  }

  for (const issue of detalhe.issues) linhas.push(`[auditor] ${recortar(issue, 160)}`);
  for (const apontamento of detalhe.apontamentos) {
    linhas.push(`[apontamento] ${recortar(apontamento, 160)}`);
  }

  return linhas.join("\n");
}

const CHAVE_DETALHE = "__detalheDoBloqueio";

/** Marca um erro com o detalhe do bloqueio, sem mudar a mensagem dele. */
export function comDetalheDoBloqueio<T>(erro: T, detalhe: DetalheDoBloqueio): T {
  return anexar(erro, CHAVE_DETALHE, detalhe) as T;
}

export function detalheDoBloqueioDoErro(erro: unknown): DetalheDoBloqueio | null {
  const d = (erro as Record<string, unknown> | null)?.[CHAVE_DETALHE];
  return d && typeof d === "object" ? (d as DetalheDoBloqueio) : null;
}

const CHAVE_DIAGNOSTICO = "__diagnosticoSocial";
const CHAVE_MOTIVO = "__motivoDaRedacao";

function anexar(erro: unknown, chave: string, valor: unknown): unknown {
  if (typeof erro !== "object" || erro === null) return erro;
  try {
    Object.defineProperty(erro, chave, { value: valor, enumerable: false, configurable: true });
  } catch {
    // Erro congelado. Repassa sem o anexo: perder o diagnóstico é melhor que
    // perder o erro.
  }
  return erro;
}

/** Marca um erro com o motivo estruturado, sem mudar a mensagem dele. */
export function comMotivo<T>(erro: T, motivo: string): T {
  return anexar(erro, CHAVE_MOTIVO, motivo) as T;
}

export function motivoDoErro(erro: unknown): string {
  const m = (erro as Record<string, unknown> | null)?.[CHAVE_MOTIVO];
  return typeof m === "string" ? m : MOTIVO_FALHA_GENERICA;
}

export function diagnosticoSocialDoErro(erro: unknown): DiagnosticoSocialDoDia | null {
  const d = (erro as Record<string, unknown> | null)?.[CHAVE_DIAGNOSTICO];
  return d && typeof d === "object" ? (d as DiagnosticoSocialDoDia) : null;
}

export async function runNewsroom(
  options: RunNewsroomOptions = {},
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  const startTime = Date.now();
  const rastro: RastroDaExecucao = {
    social: diagnosticoSocialAusente(modoDoPipelineSocial(env)),
    funil: funilVazio(),
  };

  try {
    return await executarRedacaoDoDia(options, env, fetcher, rastro);
  } catch (erro) {
    await registrarFalhaDaRedacao(erro, { startTime, options, env, funil: rastro.funil });
    // O erro segue sendo erro. Ele só passa a carregar o que já tinha sido
    // produzido antes dele.
    throw anexar(erro, CHAVE_DIAGNOSTICO, rastro.social);
  }
}

/**
 * A agenda escrita para o redator, ou vazio.
 *
 * O horizonte é curto de propósito. Trinta dias é o que cabe numa edição
 * diária: o que está a noventa dias não muda uma linha do texto de hoje, e
 * encheria o briefing de ruído que o modelo tentaria usar.
 */
export function agendaDoBriefing(hoje: string): string {
  const texto = agendaEmTexto(hoje, 30);
  if (!texto) return "";

  return [
    "O QUE VEM POR AÍ (use só se a pauta do dia encostar no assunto, e nunca force):",
    texto,
    "Não escreva sobre uma data futura como se fosse notícia do dia. Ela serve para dar contexto a uma pauta que já existe.",
  ].join("\n");
}

async function executarRedacaoDoDia(
  options: RunNewsroomOptions = {},
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  rastro: RastroDaExecucao = {
    social: diagnosticoSocialAusente(modoDoPipelineSocial(env)),
    funil: funilVazio(),
  },
) {
  const dryRun = options.dryRun ?? (env.DRY_RUN === "true" || env.DRY_RUN === undefined ? true : false);
  const somenteNewsletter = options.somenteNewsletter === true;
  // Só a newsletter nunca regrava a edição como artigo: o portal do dia já foi produzido.
  const publishToPortal = somenteNewsletter ? false : (options.publishToPortal ?? !dryRun);
  const createNewsletterCampaign = options.createNewsletterCampaign ?? !dryRun;
  const autoSend = options.autoSend ?? (env.NEWSLETTER_AUTO_SEND === "true" || (!dryRun && env.NEWSLETTER_AUTO_SEND !== "false"));

  const project = await requireActiveProject(options.projectId ?? DEFAULT_PROJECT_ID);

  /*
   * As instruções editoriais do projeto valem daqui até o fim do ciclo
   * (RF-26). Com a capacidade `instrucoes` desligada, que é o padrão, isto não
   * lê nada e os prompts saem byte a byte como antes. Ver `instrucoes.ts`.
   */
  entrarNasInstrucoes(await prepararInstrucoesDoProjeto(project, { cliente: getSupabaseAdminClient }));

  // A data vem do fuso do projeto. Com UTC, toda execução depois das 21h no
  // Brasil era gravada com a data do dia seguinte. Na produção da véspera, a
  // data é a de amanhã, pedida por quem chamou.
  const todayStr = dataDaEdicao(options, project);
  const agendamento = options.agendamento;
  const idempotencyKey = options.idempotencyKey || `daily-edition-${todayStr}`;

  console.log(`[NEWSROOM] Iniciando run da redação de ${project.slug} (dry_run: ${dryRun}, auto_send: ${autoSend}, key: ${idempotencyKey})...`);

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: existingRun } = await supabase
        .from("newsroom_runs")
        .select("id, status, edition_id")
        .eq("project_id", project.id)
        .eq("idempotency_key", idempotencyKey)
        .single();

      if (existingRun && existingRun.status === "success") {
        console.log(`[NEWSROOM] Run já executado com sucesso hoje (${idempotencyKey}). Cancelando duplicação.`);
        return { ok: false, reason: "already_executed_today", idempotencyKey };
      }
    } catch {
      // continua em caso de primeiro registro
    }
  }

  const startTime = Date.now();

  // As fontes vêm do banco, por projeto. Antes eram um array fixo no código,
  // então um projeto de outro segmento exigiria editar o fonte e fazer deploy.
  const sources = await getProjectNewsSources(project.id);

  /*
   * As buscas que o DIA cria, somadas às fontes cadastradas.
   *
   * As fontes do banco respondem "o que estas publicações publicaram?". Isso
   * deixa de fora o que ainda não foi publicado mas tem data marcada, e o que
   * o país inteiro está procurando agora. O calendário resolve o primeiro, a
   * tendência resolve o segundo, e as duas viram fonte de busca para
   * atravessarem a MESMA coleta, deduplicação, classificação e guarda.
   *
   * O bloco inteiro é opcional por construção. Ele está dentro de um try, a
   * triagem já devolve vazio quando falha, e a chave desliga tudo: nenhuma
   * dessas três coisas pode custar a edição do dia, porque a edição não
   * depende delas para existir.
   */
  const fontesDoDia = [...sources];
  if (env.EDITORIAL_BUSCA_DINAMICA !== "off") {
    try {
      const { tendencias, avisos } = await coletarTendencias({
        fetcher,
        ontem: somarDias(todayStr, -1),
      });
      if (avisos.length > 0) console.warn(`[NEWSROOM] tendências, fontes que falharam: ${avisos.join(" | ")}`);

      const triagem = await triarTendencias(limparTendencias(tendencias), env, fetcher);
      if (triagem.erro) console.warn(`[NEWSROOM] triagem de tendências não rodou: ${triagem.erro}`);

      const buscas = buscasDoDia({ hoje: todayStr, tendencias: triagem.aprovadas });
      fontesDoDia.push(...buscas.fontes);

      console.log(
        `[NEWSROOM] ${buscas.fontes.length} busca(s) do dia: ` +
          [
            ...buscas.doCalendario.map((d) => `calendário "${d.nome}" em ${d.faltam}d`),
            ...buscas.deTendencia.map((t) => `tendência "${t.termo}" (${t.eixo})`),
          ].join(" | "),
      );
    } catch (erro) {
      console.warn(`[NEWSROOM] busca dinâmica não rodou, seguindo só com as fontes do banco: ${(erro as Error).message}`);
    }
  }

  console.log(`[NEWSROOM] Coletando notícias de ${fontesDoDia.length} fontes (${sources.length} do banco) para ${project.slug}...`);
  const collectionResult = await collectAllNews(fontesDoDia, fetcher);
  console.log(`[NEWSROOM] ${collectionResult.candidates.length} candidatas encontradas na janela de ${collectionResult.windowHours}h em ${collectionResult.sourcesAttempted} fontes.`);

  const { uniqueGroups, duplicatesCount } = deduplicateCandidates(collectionResult.candidates);
  console.log(`[NEWSROOM] ${uniqueGroups.length} grupos únicos após deduplicação (${duplicatesCount} duplicatas removidas).`);

  /*
   * Os números do funil entram no rastro assim que existem, e não no fim.
   *
   * O rastro é o que sobrevive ao `throw`. Preenchê-lo aqui é o que faz a linha
   * de falha dizer quantas fontes responderam e quantas candidatas chegaram,
   * em vez de zeros que não distinguem "coleta vazia" de "bloqueado com o pool
   * cheio".
   */
  rastro.funil = {
    ...rastro.funil,
    sourcesCount: collectionResult.sourcesAttempted,
    candidatesFound: collectionResult.candidates.length,
    uniqueCount: uniqueGroups.length,
    duplicatesCount,
  };

  /*
   * A seleção do dia.
   *
   * Com a guarda ligada, quem escolhe é a camada editorial: classificação de
   * país e leitura, filtro da linha editorial, verificação de repetição contra
   * os últimos 30 dias e nota que não depende de vocabulário de vertical.
   *
   * Sem ela, segue o ranker antigo, que soma ocorrência de "model", "gpt" e
   * "benchmark". Numa publicação de imigração isso empata todas as pautas no
   * piso e a seleção vira a ordem do feed. A chave existe para o período de
   * validação, não para ser um modo de operação permanente.
   */
  // A linha do projeto entra aqui (06/10/2026): é a mesma config que a
  // guarda, o verificador e o social recebem.
  const configEditorial = carregarConfigEditorial(env, project);
  const modo = modoDaGuarda(env, project);
  console.log(`[NEWSROOM] Guarda editorial ${descreverModo(modo)} (EDITORIAL_GUARD=${modo}).`);

  /*
   * Os três ramos (05/10/2026). Ver `ramos/modo.ts`.
   *
   * Eles dependem do pool da guarda, então sem guarda não há ramo. E só
   * mandam quando a guarda também manda: com a guarda em observação quem
   * escolhe a edição é o ranker antigo, e um ramo em `enforce` em cima dele
   * decidiria sobre uma seleção que não é a publicada. Nesse caso o ramo
   * desce para `dry_run` e o log diz por quê.
   */
  const modoRamosDeclarado = modoDosRamos(env, project);
  const modoRamos: ModoDosRamos =
    modo === "off" ? "off" : modo === "dry_run" && modoRamosDeclarado === "enforce" ? "dry_run" : modoRamosDeclarado;
  const ramosNoComando = modoRamos === "enforce";
  if (modoRamosDeclarado !== "off") {
    console.log(
      `[NEWSROOM] Ramos ${modoRamos}` +
        (modoRamos !== modoRamosDeclarado ? ` (declarado ${modoRamosDeclarado}, guarda em ${modo})` : "") +
        ".",
    );
  }
  const livro = criarLivroDeCustos();
  const pecasDoDia: PecaPronta[] = [];
  /*
   * Quem decide a imagem da newsletter. Lido aqui, e não só na hora da foto,
   * porque a regra "pauta sem foto não vira conteúdo" (05/10/2026) precisa
   * saber ANTES da redação se a foto que a seleção confere é a mesma que a
   * edição vai usar. Só com o V2 em `enforce` ela é.
   */
  const modoVisual = modoDoResolvedorVisual(env, project);
  /*
   * A foto de cada pauta, com memória do dia (`ramos/sem-foto.ts`).
   *
   * Resolvida em LEITURA: nesta hora ninguém sabe qual pauta vai sair, e
   * gravar marcaria como usada a foto de pauta que não saiu. Quem publica
   * confirma depois o que foi ao ar (`confirmarImagemPublicada`). A seleção
   * do portal, a da newsletter e a foto da edição leem a MESMA resposta, e a
   * pauta ganha a mesma foto nos dois canais.
   */
  const usadosNoDia = new Set<string>();
  let bibliotecaDoDia: ReturnType<typeof criarBiblioteca> | null = null;
  /*
   * `doCanal` existe desde 06/10/2026 (aprendizado da fila): quando a foto
   * compartilhada da pauta é uma que ESTE canal recusou, só ele resolve
   * outra, sem reuso, com as recusadas fora e o motivo do editor na cena.
   */
  const resolverFotoDaPauta = (p: PautaAvaliada, doCanal?: AprendizadoDaImagem) => {
    bibliotecaDoDia ??= criarBiblioteca(getSupabaseAdminClient());
    return imagemDaPauta(
      {
        storyId: p.storyId,
        titulo: p.grupo.primary.title,
        resumo: p.enriquecimento?.texto ?? "",
        categoria: p.classificacao.eixo,
        classificacao: {
          atores: p.classificacao.atores,
          lugares: p.classificacao.lugares,
          acontecimento: p.classificacao.acontecimento,
          pais: p.classificacao.pais,
        },
      },
      {
        client: getSupabaseAdminClient(),
        projeto: project,
        ...(doCanal ? { ignorarReuso: true } : {}),
        opcoes: {
          client: getSupabaseAdminClient(),
          biblioteca: bibliotecaDoDia,
          env,
          fetcher,
          jaUsadosNestaEdicao: usadosNoDia,
          somenteLeitura: true,
          ...(doCanal
            ? { jaUsadasRecentemente: doCanal.evitar, ...(doCanal.motivos.length ? { recusasDoEditor: doCanal.motivos } : {}) }
            : {}),
        },
      },
    );
  };
  const fotosDoDia = criarFotosDoDia<PautaAvaliada>(
    (p) => p.storyId,
    (p) => resolverFotoDaPauta(p),
  );
  /** As pautas que caíram por falta de foto, por canal, para o painel. */
  const quedasSemFoto: Array<{ canal: string; quedas: QuedaSemFoto[] }> = [];
  const registrarQuedasSemFoto = async () => {
    for (const { canal, quedas } of quedasSemFoto) {
      for (const l of linhasDasQuedas(canal, quedas)) console.log(l);
      if (dryRun || quedas.length === 0) continue;
      const erro = await gravarQuedasSemFoto(getSupabaseAdminClient(), project.id, canal, quedas, {
        data: todayStr,
        dryRun,
      });
      if (erro) console.warn(`[NEWSROOM] quedas sem foto (${canal}) não gravadas: ${erro}`);
    }
    quedasSemFoto.length = 0;
  };
  /** O pacote factual é camada comum: um por pauta, para todos os ramos. */
  const pacotesDoDia = new Map<string, PacoteFactual>();
  /*
   * A memória de reprovação nos redatores dos ramos (RF-29, integração de
   * 05/10/2026): os erros recentes que o editor apontou na etapa "texto", e as
   * regras fixas que o dono aprovou, entram depois da voz de cada ramo. Só com
   * a fila fora de `off`; desligada, as vozes saem byte a byte como antes.
   */
  const vozes: VozesDosRamos | null = modoRamos !== "off" ? await vozesDosRamosComMemoria(project) : null;
  /*
   * O aprendizado de cada canal (06/10/2026): a seleção da newsletter e a do
   * portal penalizam o que o editor recusou NAQUELE canal, e cada um vê a
   * foto compartilhada pelo próprio filtro. Só com a fila fora de `off` e os
   * ramos ligados; sem isso o aprendizado é vazio e nada muda.
   */
  const comAprendizado = modoRamos !== "off" && modoDaFila(project) !== "off";
  const lojaDaFila = comAprendizado ? criarFilaStore(getSupabaseAdminClient()) : null;
  const [aprendizadoDaNewsletter, aprendizadoDoPortal] = lojaDaFila
    ? await Promise.all([
        aprendizadoDoCanal(lojaDaFila, project.id, "newsletter"),
        aprendizadoDoCanal(lojaDaFila, project.id, "artigo"),
      ])
    : [aprendizadoVazio("newsletter"), aprendizadoVazio("artigo")];
  const fotosDaNewsletter = fotosDoCanal(fotosDoDia, (p) => p.storyId, aprendizadoDaNewsletter.imagem, (p) =>
    resolverFotoDaPauta(p, aprendizadoDaNewsletter.imagem),
  );
  const fotosDoPortal = fotosDoCanal(fotosDoDia, (p) => p.storyId, aprendizadoDoPortal.imagem, (p) =>
    resolverFotoDaPauta(p, aprendizadoDoPortal.imagem),
  );
  let resultadoDoPortal: ResultadoDoRamoDoPortal | null = null;
  // O registro dos ramos vai para o banco só fora de ensaio, como o resto.
  const registrarRamos = modoRamos !== "off" && !dryRun;
  const contextoDoRegistro = { data: todayStr, dryRun, modo: modoRamos };
  const fecharCustosDosRamos = async () => {
    if (!registrarRamos) return;
    const erro = await gravarCustos(getSupabaseAdminClient(), project.id, livro, contextoDoRegistro);
    if (erro) console.warn(`[NEWSROOM] custos dos ramos não gravados: ${erro}`);
  };
  const entregarPeca = async (peca: PecaPronta) => {
    pecasDoDia.push(peca);
    if (registrarRamos) {
      const erro = await gravarVeredito(getSupabaseAdminClient(), project.id, vereditoDaPeca(peca), contextoDoRegistro);
      if (erro) console.warn(`[NEWSROOM] veredito do ramo ${peca.ramo} não gravado: ${erro}`);
    }
    // Cinto do modo só newsletter: post e matéria não chegam à fila nem por engano.
    if (somenteNewsletter && peca.ramo !== "newsletter") return;
    if (ramosNoComando && !dryRun && options.aoProduzirPeca) {
      try {
        await options.aoProduzirPeca(peca);
      } catch (erro) {
        console.warn(`[NEWSROOM] fila não recebeu a peça ${peca.ramo} ${peca.referenciaId}: ${(erro as Error).message}`);
      }
    }
  };

  let ranked: RankedCandidate[];
  let pautasDaGuarda: PautaAvaliada[] = [];
  /** O pool aprovado do dia, por storyId, só como referência da fila de aprovação (06/10/2026). */
  let poolAprovadoDoDia: string[] = [];
  let diagnosticoDeCandidatas: {
    degraded: boolean;
    lidas: number;
    reaproveitadas: number;
    classificadasAgora: number;
    gravadas: number;
    erros: string[];
  } = { degraded: false, lidas: 0, reaproveitadas: 0, classificadasAgora: 0, gravadas: 0, erros: [] };
  // Guardado para a escolha de imagem, que precisa saber o que já foi usado.
  let historicoDaGuarda: RegistroHistorico[] = [];
  /*
   * O que o Instagram fez hoje, no resultado do newsroom.
   *
   * Ele começa como "não rodou" e só muda se rodar. Ficar ausente do resultado
   * seria indistinguível de ter rodado e não produzido nada, que é a diferença
   * que este campo existe para dizer.
   */
  // O diagnóstico mora no rastro, que sobrevive à exceção do portão do QA.
  rastro.social = diagnosticoSocialAusente(modoDoPipelineSocial(env, project));

  if (modo !== "off") {
    const store = criarHistoricoStore(getSupabaseAdminClient());
    const historico = await store.janela(project.id, configEditorial.janelaDeDias);
    historicoDaGuarda = historico;
    console.log(
      `[NEWSROOM] ${historico.length} registros no histórico de ${configEditorial.janelaDeDias} dias.`,
    );

    /*
     * A classificação do dia é gravada aqui, e é uma vez só.
     *
     * Sem isto, a newsletter classificava as candidatas, jogava fora, e o
     * canal social classificava as MESMAS candidatas de novo mais tarde. Duas
     * leituras do mesmo fato, com o custo dobrado e, pior, com respostas
     * diferentes: medido, a mesma candidata muda de decisão em 24% das vezes.
     *
     * O que muda para a newsletter: nada de composição. Ela continua com os
     * mesmos tetos, as mesmas 2 a 4 pautas e a mesma guarda. A única coisa
     * diferente é de onde vem a classificação, e o teste de antes e depois
     * prova que a escolha final é a mesma.
     *
     * O verificador de finalistas NÃO entra aqui. Ele é da fase 3 e ainda não
     * foi validado contra o comportamento da newsletter; ligar os dois de uma
     * vez misturaria "compartilhar classificação" com "mudar quem publica".
     */
    const resultado = await avaliarPautas(uniqueGroups, {
      canal: "newsletter",
      historico,
      config: configEditorial,
      provedorDeVetor: criarProvedorOpenAI(env, fetcher),
      env,
      fetcher,
      candidatos: { client: getSupabaseAdminClient(), projectId: project.id },
      // Só a newsletter usa o material que a véspera classificou. Ver `soReaproveitadas`.
      ...(somenteNewsletter ? { soReaproveitadas: true } : {}),
      // O piso de alcance nacional da pauta centrada em gente (06/10/2026, `alcance.ts`).
      alcance: buscaDeEntidadePadrao(env, fetcher),
    });

    if (resultado.reuso.erros.length > 0) {
      console.warn(
        `[NEWSROOM] candidatePersistenceDegraded=true :: ${resultado.reuso.erros.join(" | ")}`,
      );
    }
    diagnosticoDeCandidatas = {
      degraded: resultado.reuso.erros.length > 0,
      lidas: resultado.reuso.candidatasLidas,
      reaproveitadas: resultado.reuso.classificacoesReaproveitadas,
      classificadasAgora: resultado.reuso.classificadasAgora,
      gravadas: resultado.reuso.persistidas,
      erros: resultado.reuso.erros,
    };

    console.log(
      `[NEWSROOM] candidatas: ${resultado.reuso.candidatasLidas} lidas, ` +
        `${resultado.reuso.classificacoesReaproveitadas} reaproveitadas, ` +
        `${resultado.reuso.classificadasAgora} classificadas agora, ` +
        `${resultado.reuso.persistidas} gravadas.`,
    );

    for (const linha of resultado.linhasDeLog) console.log(linha);
    livro.lancar("classificacao", "comum", resultado.custoUsd, resultado.tokens.total);

    /*
     * O Instagram entra AQUI, e o lugar é a regra de produto.
     *
     * Logo abaixo vem a composição da newsletter e o mínimo de duas pautas, e
     * um dia que não fecha edição sai por um `return` que não executa mais
     * nada. Se o social morasse depois disso, um dia com três pautas aprovadas
     * em que a newsletter leva uma e cancela levaria o feed junto — e esse é
     * exatamente o dia mais comum na capacidade medida.
     *
     * São dois consumidores do mesmo trabalho editorial, não um dentro do
     * outro. O social recebe o `approvedEditorialPool`, que é a camada
     * compartilhada, e daqui para baixo não toca em nada da newsletter.
     *
     * O `try` não é decoração: falha técnica do social não pode derrubar a
     * edição. O motivo vira diagnóstico e alerta, e o e-mail segue.
     */
    /* Quantas a linha editorial aprovou, antes de a composição escolher. */
    rastro.funil = { ...rastro.funil, approvedCount: resultado.approvedEditorialPool.length };
    poolAprovadoDoDia = resultado.approvedEditorialPool.map((p) => p.storyId);

    const modoSocialDoEnsaio = modoSocialParaOEnsaio(dryRun, env, project);
    /*
     * O ramo próprio do Instagram (RF-15): a voz do post depois do briefing,
     * até cinco posts, pool mais as candidatas extras, pacote factual
     * obrigatório e evergreen desligado. Fora do comando dos ramos nada disto
     * é passado, e o ciclo é o de antes.
     */
    const extraDoSocial =
      ramosNoComando && vozes
        ? [project.editorialPromptExtra ?? "", vozes.post].filter(Boolean).join("\n\n")
        : (project.editorialPromptExtra ?? "");
    const opcoesDoRamoNoSocial = ramosNoComando
      ? {
          tetoDoDia: TETO_DO_INSTAGRAM,
          candidatasExtras: options.candidatasExtrasDoInstagram ?? [],
          exigirPacoteFactual: true,
          evergreen: { modoForcado: "off" as const },
        }
      : {};
    let resultadoSocial: Awaited<ReturnType<typeof rodarSocialDoDia>> | null = null;

    if (somenteNewsletter) {
      console.log("[NEWSROOM] só a newsletter: o ciclo do Instagram NÃO roda, e nenhum post é criado.");
    } else try {
      // Só a LEITURA das candidatas fecha o feed; a gravação que falha avisa e segue (06/10/2026, `guarda.ts`).
      const social = await rodarSocialDoDia(resultado.approvedEditorialPool, {
        ...(modoSocialDoEnsaio ? { modoForcado: modoSocialDoEnsaio } : {}),
        // As capacidades declaradas no projeto vencem o ambiente, daqui para baixo.
        projeto: project,
        projectId: project.id,
        projectSlug: project.slug,
        editionDate: todayStr,
        marca: {
          nome: project.brand.displayName || project.name,
          nicho: project.niche,
          extra: extraDoSocial,
          keyword: String(project.settings?.instagram_keyword ?? "").trim(),
          hashtags: hashtagsLigadasNoProjeto(project.settings),
        },
        historico,
        config: configEditorial,
        client: getSupabaseAdminClient(),
        ...persistenciaParaOSocial(resultado.reuso),
        env,
        fetcher,
        ...opcoesDoRamoNoSocial,
      });

      if (modoRamos !== "off") {
        lancarCustosDoInstagram(livro, social);
        for (const peca of pecasDoInstagram(social)) await entregarPeca(peca);
      }

      rastro.social = social.diagnostico;
      for (const l of social.ciclo?.linhasDeLog ?? []) console.log(l);
      resultadoSocial = social;

      if (social.diagnostico.mode !== "off") {
        console.log(
          `[NEWSROOM] socialV2 ${social.diagnostico.mode}: ` +
            `${social.diagnostico.candidates} candidatas, ${social.diagnostico.verified} verificadas, ` +
            `${social.diagnostico.selected} post(s), ${social.diagnostico.scheduled} agendado(s), ` +
            `${social.diagnostico.skipped} descartada(s).`,
        );
      }
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      rastro.social = { ...diagnosticoSocialAusente(modoDoPipelineSocial(env, project)), errors: [motivo] };
      console.error(`[NEWSROOM] socialV2 falhou, e a newsletter segue: ${motivo}`);
      await sendAlert(
        "warning",
        "Social V2 falhou no ciclo do newsroom",
        `A edição de ${todayStr} segue pelo caminho normal.\n${motivo}`,
      );
    }

    /*
     * O porquê do feed do dia vai para o banco. Ver `diagnostico-gravado.ts`.
     * Só a newsletter não grava: o diagnóstico do dia é o da produção que fez
     * os posts, e um "não rodou" por cima dele apagaria o porquê verdadeiro.
     */
    if (!somenteNewsletter) {
      const naoGravado = await gravarDiagnosticoDoSocial(
        getSupabaseAdminClient(),
        project.id,
        montarRegistroDoSocial(
          resultadoSocial ?? { diagnostico: rastro.social, ciclo: null, conferencia: null },
          { editionDate: todayStr, dryRun },
        ),
      );
      if (naoGravado) console.warn(`[NEWSROOM] diagnóstico do social não gravado: ${naoGravado}`);
    }

    /*
     * A camada comum dos ramos: o pacote factual, uma vez por pauta.
     *
     * A pré-seleção decide quais pautas qualquer ramo PODE levar, e só elas
     * pagam extração. Depois disso cada ramo escolhe a sua, já exigindo o
     * pacote (RF-05).
     */
    let selecionadasDaNewsletter = resultado.selecionadas;
    let viavelDaNewsletter = resultado.viavel;
    let motivoDaInviabilidade = resultado.motivoDaInviabilidade;

    /*
     * O pool de cada canal, com o que o editor recusou na seleção DAQUELE
     * canal (06/10/2026): a pauta parecida desce, a fonte ou o ator recusado
     * três vezes sai. Sem reprovação de seleção, é o mesmo pool.
     */
    const doPoolDaNewsletter = aprenderNaSelecao(
      resultado.approvedEditorialPool,
      aprendizadoDaNewsletter.selecao,
      "newsletter",
    );
    const doPoolDoPortal = aprenderNaSelecao(resultado.approvedEditorialPool, aprendizadoDoPortal.selecao, "artigo");
    for (const l of [...doPoolDaNewsletter.linhas, ...doPoolDoPortal.linhas]) console.log(l);

    if (modoRamos !== "off") {
      /*
       * A pré-seleção já sem as pautas sem foto (05/10/2026): o pacote factual
       * custa uma chamada por pauta, e pauta sem foto não vira conteúdo em canal
       * nenhum. Tirá-las aqui faz o pacote ir para a próxima elegível, que é a
       * que vai ocupar a vaga.
       */
      const preComFoto = await selecionarComFoto({
        selecionar: (excluir) =>
          preSelecaoParaPacote(resultado.approvedEditorialPool, configEditorial, historico, 2, excluir),
        escolhidas: (lista) => lista,
        chave: (p) => p.storyId,
        titulo: (p) => p.grupo.primary.title,
        fotos: fotosDoDia,
        // O pacote serve à newsletter e ao portal, que aceitam pauta sem foto desde 14/10/2026.
        exigirFoto: false,
      });
      const pre = preComFoto.selecao;
      if (preComFoto.semFoto.length > 0) {
        console.log(
          `[NEWSROOM] Ramos: ${preComFoto.semFoto.length} pauta(s) sem foto fora da pré-seleção (${MOTIVO_SEM_FOTO}).`,
        );
      }
      const g = await garantirPacotes(pre, pacotesDoDia, { env, fetcher, livro });
      console.log(`[NEWSROOM] Ramos: pacote factual para ${pacotesDoDia.size} de ${pre.length} pauta(s) pré-selecionada(s).`);
      for (const falha of g.falhas) console.warn(`[NEWSROOM] Pacote factual falhou: ${falha}`);

      /*
       * O portal (RF-12 a RF-14) roda AQUI, antes da decisão da newsletter, pelo
       * mesmo motivo do Instagram: dia sem edição não pode ser dia sem matéria.
       */
      if (somenteNewsletter) {
        console.log("[NEWSROOM PORTAL] só a newsletter: o ramo do portal NÃO roda, e nenhuma matéria é criada.");
      } else try {
        resultadoDoPortal = await rodarRamoDoPortal({
          pool: doPoolDoPortal.pool,
          pacotes: pacotesDoDia,
          historico,
          config: configEditorial,
          marca: {
            nome: project.brand.displayName || project.name,
            nicho: project.niche,
            briefing: project.editorialPromptExtra ?? "",
            voz: vozes?.artigo ?? "",
          },
          data: todayStr,
          timezone: project.timezone,
          horarios: horariosDoPortal(project),
          livro,
          env,
          fetcher,
          buscarRelacionadas: (alvo) => buscarRelacionadas(getSupabaseAdminClient(), project.id, alvo),
          /*
           * A matéria profunda (06/10/2026): o pacote de cada matéria junta as
           * outras fontes do mesmo fato (grupo da deduplicação, candidatas com
           * cosseno de 0.70 ou mais nos últimos dias e a fonte primária citada),
           * e a capa ganha a descrição da conferência visual sem a manchete.
           */
          ampliarPacote: criarAmpliadorDePacote({
            client: getSupabaseAdminClient(),
            projectId: project.id,
            env,
            fetcher,
            livro,
            limiar: configEditorial.limiarDeAgrupamento,
          }),
          descreverCapa: (url) => descreverCapaSemManchete(url, env),
          /*
           * A capa da matéria sai de `imagemDaPauta` (05/10/2026, integração):
           * com o acervo em `enforce`, a mesma pauta ganha a MESMA foto no
           * portal, no post e na newsletter. Fora de `enforce` é repasse direto
           * ao resolvedor, como antes.
           *
           * Desde a regra "pauta sem foto não vira conteúdo" (05/10/2026), a
           * mesma memória decide também quais pautas o portal pode escrever: a
           * sem foto cai antes da redação e a vaga vai para a próxima.
           *
           * Pelo filtro do portal (06/10/2026): a foto que o portal recusou não
           * volta a ser capa dele, e só ele resolve outra.
           */
          fotos: fotosDoPortal,
        });
        if (resultadoDoPortal.semFoto.length > 0) quedasSemFoto.push({ canal: "artigo", quedas: resultadoDoPortal.semFoto });
        for (const l of resultadoDoPortal.linhasDeLog) console.log(l);

        if (ramosNoComando && !dryRun) {
          const supabase = getSupabaseAdminClient();
          const gravacao = await gravarArtigosAgendados(supabase, project.id, resultadoDoPortal.pecas);
          for (const e of gravacao.erros) console.warn(`[NEWSROOM PORTAL] artigo não gravado: ${e}`);
          console.log(
            `[NEWSROOM PORTAL] ${gravacao.gravados.length} matéria(s) agendada(s), à espera de aprovação: ${gravacao.gravados.join(", ")}`,
          );

          /*
           * O histórico do canal `article` nasce no agendamento, e não na
           * publicação. É conservador de propósito: a matéria agendada e
           * reprovada também impede a pauta de voltar ao portal por trinta
           * dias, e o preço disso é uma pauta a menos. O contrário seria a
           * mesma matéria agendada duas vezes em dois dias seguidos.
           */
          const porStory = new Map(resultadoDoPortal.selecao.escolhidas.map((p) => [p.storyId, p]));
          const registros = resultadoDoPortal.pecas
            .filter((pc) => gravacao.gravados.includes(pc.referenciaId))
            .map((pc) => {
              const pauta = porStory.get(pc.storyIds[0]);
              return pauta
                ? registroDaPauta(pauta, {
                    projectId: project.id,
                    canal: "article",
                    imagemUrl: pc.conteudo.capa,
                    publicadoEm: pc.conteudo.publicarEm,
                  })
                : null;
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);
          if (registros.length > 0) {
            try {
              await criarHistoricoStore(supabase).registrar(registros);
            } catch (erro) {
              console.warn(`[NEWSROOM PORTAL] histórico do portal não gravado: ${(erro as Error).message}`);
            }
          }
        }

        /*
         * A entrega das peças vem DEPOIS da gravação (integração de 05/10/2026):
         * a fila identifica o artigo por `articles.id`, e antes do upsert a
         * linha não existe. Entregue antes, toda matéria do dia ficaria fora da
         * fila, e com ela em `enforce` nenhuma sairia.
         */
        for (const peca of resultadoDoPortal.pecas) await entregarPeca(peca);
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : String(erro);
        console.error(`[NEWSROOM PORTAL] ramo do portal falhou, e a newsletter segue: ${motivo}`);
        await sendAlert("warning", "Ramo do portal falhou", `Dia ${todayStr}. A newsletter segue.\n${motivo}`);
      }

      /*
       * A seleção própria da newsletter (RF-07), só quando os ramos mandam.
       * Em `dry_run` ela é calculada e registrada no log, e a edição sai pela
       * seleção de antes.
       */
      /*
       * Com os ramos no comando e o V2 decidindo a foto da edição, a pauta sem
       * foto cai AQUI, antes da redação, e a vaga vai para a próxima
       * (05/10/2026). Fora disso a foto da edição vem de outro caminho, e a
       * régua fica para depois da resolução (`pautasSemFotoNaEdicao`).
       */
      let daNewsletter: ReturnType<typeof selecionarParaNewsletter>;
      if (ramosNoComando && modoVisual === "enforce") {
        const r = await selecionarComFoto({
          selecionar: (excluir) =>
            selecionarParaNewsletter(doPoolDaNewsletter.pool, pacotesDoDia, configEditorial, excluir),
          escolhidas: (sel) => sel.escolhidas,
          chave: (p) => p.storyId,
          titulo: (p) => p.grupo.primary.title,
          fotos: fotosDaNewsletter,
          // Newsletter: pauta sem foto sai só com texto (14/10/2026).
          exigirFoto: false,
        });
        daNewsletter = r.selecao;
        if (r.semFoto.length > 0) {
          quedasSemFoto.push({ canal: "newsletter", quedas: r.semFoto });
          if (!daNewsletter.viavel) {
            daNewsletter = {
              ...daNewsletter,
              motivo: `${daNewsletter.motivo} (${r.semFoto.length} sem foto, ${MOTIVO_SEM_FOTO})`,
            };
          }
        }
      } else {
        daNewsletter = selecionarParaNewsletter(doPoolDaNewsletter.pool, pacotesDoDia, configEditorial);
      }
      for (const l of daNewsletter.linhasDeLog) console.log(l);
      if (ramosNoComando) {
        selecionadasDaNewsletter = daNewsletter.escolhidas;
        viavelDaNewsletter = daNewsletter.viavel;
        motivoDaInviabilidade = daNewsletter.viavel ? "" : daNewsletter.motivo;
      }
    }

    /*
     * A mesma régua quando quem compõe a edição é a guarda, e não o ramo: a
     * composição é refeita sem as pautas sem foto, e a próxima entra no lugar.
     * Só com a guarda e o V2 no comando, pelos mesmos motivos de cima.
     */
    if (!ramosNoComando && modo === "enforce" && modoVisual === "enforce") {
      const r = await selecionarComFoto({
        selecionar: (excluir) =>
          recomporNewsletterDaGuarda(resultado.approvedEditorialPool, resultado.selecionadas, configEditorial, excluir),
        escolhidas: (sel) => sel.escolhidas,
        chave: (p) => p.storyId,
        titulo: (p) => p.grupo.primary.title,
        fotos: fotosDoDia,
      });
      if (r.semFoto.length > 0) {
        quedasSemFoto.push({ canal: "newsletter", quedas: r.semFoto });
        selecionadasDaNewsletter = r.selecao.escolhidas;
        viavelDaNewsletter = r.selecao.viavel;
        motivoDaInviabilidade = r.selecao.viavel
          ? ""
          : `${r.selecao.motivo} (${r.semFoto.length} sem foto, ${MOTIVO_SEM_FOTO})`;
      }
    }
    await registrarQuedasSemFoto();

    /*
     * O calor na abertura da newsletter (06/10/2026). As pautas são as mesmas
     * que a seleção escolheu; em `enforce` a mais quente passa a abrir o
     * e-mail, em `dry_run` só se grava qual abriria. Falha aqui não toca a
     * edição.
     */
    const modoCalorDaNewsletter = modoDoCalor(project);
    if (modoCalorDaNewsletter !== "off" && selecionadasDaNewsletter.length > 1) {
      try {
        const abertura = await calorNaAberturaDaNewsletter(selecionadasDaNewsletter, {
          modo: modoCalorDaNewsletter,
          fontes: fontesPadraoDoCalor({ client: getSupabaseAdminClient(), projectId: project.id, env, fetcher }),
          client: dryRun ? null : getSupabaseAdminClient(),
          projectId: project.id,
          editionDate: todayStr,
          // Contar veículos usa 0.65 desde 06/10/2026, e não o 0.70 da composição.
          limiar: limiarDeVeiculosDoCalor(env),
        });
        selecionadasDaNewsletter = abertura.escolhidas;
        for (const l of abertura.linhas) console.log(l);
      } catch (erro) {
        console.warn(`[CALOR] abertura da newsletter sem calor: ${(erro as Error)?.message ?? erro}`);
      }
    }

    const daGuarda: RankedCandidate[] = selecionadasDaNewsletter.map((p) => ({
      group: p.grupo,
      score: p.pontuacao.total,
      breakdown: {
        impact: p.pontuacao.partes.relevancia,
        novelty: p.pontuacao.partes.ineditismo,
        utility: 0,
        credibility: p.pontuacao.partes.credibilidade,
      },
      reasoning: `${p.pontuacao.explicacao} | ${p.classificacao.pais} | ${p.classificacao.eixo}`,
    }));

    if (modo === "dry_run") {
      // Observação: a guarda rodou inteira e o log acima diz o que ela faria.
      // A edição continua saindo pelo caminho antigo, então nada do que ela
      // decidiu chega ao leitor. O histórico também não é gravado aqui: quem
      // publicou foi o fluxo antigo, e o backfill recupera essas edições
      // quando a guarda assumir.
      console.log(
        `[NEWSROOM] Em observação, a guarda escolheria ${resultado.selecionadas.length} pauta(s) ` +
          `e recusaria ${resultado.recusadas.length}. A edição de hoje segue pelo fluxo antigo.`,
      );
      if (!resultado.viavel) {
        console.log(`[NEWSROOM] Em enforce, a edição de hoje não sairia: ${resultado.motivoDaInviabilidade}.`);
      }

      ranked = rankAndFilterCandidates(uniqueGroups);
      if (ranked.length < 4) {
        throw new Error(`Número insuficiente de notícias qualificadas coletadas (${ranked.length}, mínimo 4).`);
      }
    } else {
      if (!viavelDaNewsletter) {
        /*
         * Sem pauta suficiente, a edição não sai. A alternativa seria completar
         * com o que o filtro recusou, e completar com o que o filtro recusou é
         * não ter filtro. Isso não muda.
         *
         * O que muda é COMO isso é dito. Antes era `throw`, e um throw aqui
         * acontece antes de qualquer escrita: `news_editions` na linha 916 e
         * `newsroom_runs` na 1158 nunca eram alcançados. O resultado é que três
         * dias de decisão editorial CORRETA (06, 07 e 08 de setembro de 2026)
         * não deixaram uma linha em lugar nenhum, e ficaram indistinguíveis de
         * um cron morto, que é exatamente o incidente de agosto. Ainda por
         * cima, o `.catch` da rota classificava a decisão como
         * "Redação falhou", em nível crítico.
         *
         * Dia sem pauta é resultado, não exceção. Ele é gravado com status
         * `cancelled`, que já existe no CHECK da tabela, e devolvido como
         * `ok: false` com motivo próprio, para o alerta sair como aviso e o
         * watchdog continuar sabendo que a chamada chegou à aplicação.
         */
        const detalhe =
          `${motivoDaInviabilidade}. ` +
          `${resultado.recusadas.length} pautas recusadas pela linha editorial.`;

        console.log(`[NEWSROOM] Edição não fecha hoje: ${detalhe}`);

        await registrarDiaSemEdicao({
          projectId: project.id,
          startTime,
          idempotencyKey,
          motivo: `EDITORIAL_MINIMUM_NOT_MET: ${detalhe}`,
          sourcesCount: collectionResult.sourcesAttempted,
          candidatesFound: collectionResult.candidates.length,
          uniqueCount: uniqueGroups.length,
          duplicatesCount,
          storiesSelected: selecionadasDaNewsletter.length,
          dryRun,
        });
        await fecharCustosDosRamos();

        return {
          ok: false as const,
          reason: "editorial_minimum_not_met" as const,
          detail: detalhe,
          approvedCount: selecionadasDaNewsletter.length,
          rejectedCount: resultado.recusadas.length,
          minimumRequired: configEditorial.minimoDePautas,
          /*
           * O social sai NESTE retorno também, e é o caso que mais importa.
           *
           * Este é o dia em que a newsletter não fecha. Se o diagnóstico do
           * Instagram só aparecesse no caminho de sucesso, o dia em que ele
           * mais tem valor seria o dia em que ninguém saberia se ele rodou.
           */
          socialV2: rastro.social,
          /* O portal também sai neste retorno: dia sem edição não é dia sem matéria. */
          ramos: modoRamos !== "off" ? { modo: modoRamos, pecas: pecasDoDia, custos: livro.porRamo() } : undefined,
          idempotencyKey,
        };
      }

      pautasDaGuarda = selecionadasDaNewsletter;
      ranked = daGuarda;
    }
  } else {
    ranked = rankAndFilterCandidates(uniqueGroups);
    console.log(`[NEWSROOM] ${ranked.length} pautas classificadas pelo ranker antigo.`);

    if (ranked.length < 4) {
      throw new Error(`Número insuficiente de notícias qualificadas coletadas (${ranked.length}, mínimo 4).`);
    }
  }

  /*
   * Pacote factual das pautas escolhidas.
   *
   * Só existe quando a guarda selecionou: é ela que traz o texto da matéria
   * enriquecido, e sem esse texto o extrator leria a manchete de novo.
   */
  const pacotes = new Map<string, PacoteFactual>();
  // Com os ramos, parte (ou tudo) já foi montado na camada comum, e não se paga
  // de novo. Sem os ramos o cache está vazio e o bloco é o de antes.
  for (const p of pautasDaGuarda) {
    const pronto = pacotesDoDia.get(p.grupo.primary.url);
    if (pronto) pacotes.set(p.grupo.primary.url, pronto);
  }
  const pacotesQueFaltam = pautasDaGuarda.filter((p) => !pacotes.has(p.grupo.primary.url));
  if (pacotesQueFaltam.length > 0) {
    const r = await montarPacotesDasPautas(
      pacotesQueFaltam.map((p) => ({
        url: p.grupo.primary.url,
        titulo: p.grupo.primary.title,
        texto: p.enriquecimento.texto,
        urls: [p.grupo.primary.url, ...p.grupo.secondary_urls],
      })),
      env,
      fetcher,
    );

    for (const [url, pacote] of r.pacotes) pacotes.set(url, pacote);
    livro.lancar("pacote_factual", "comum", r.custoUsd, r.tokens);
    console.log(`[NEWSROOM] Pacote factual montado para ${r.pacotes.size} de ${pacotesQueFaltam.length} pautas.`);
    for (const falha of r.falhas) console.warn(`[NEWSROOM] Pacote factual falhou: ${falha}`);
  }

  console.log("[NEWSROOM] Executando pipeline editorial da OpenAI...");

  /*
   * O rodízio das formas do assunto lê as edições gravadas (06/10/2026).
   * Leitura pura, também no ensaio; falha de leitura não derruba o dia, só
   * deixa o rodízio começar do começo.
   */
  const formasRecentesDoAssunto = await formasRecentesDoAssuntoDoProjeto(project.id, todayStr);

  // A voz da edição vem do projeto, não de uma constante no código. Sem isto,
  // trocar a vertical no banco mudava as fontes e não mudava o texto: o
  // sistema coletava imigração e escrevia como se fosse notícia de IA.
  // Quando quem selecionou foi o fluxo antigo, os limites antigos valem:
  // ele não passou por filtro editorial e continua entregando de 4 a 6.
  const limitesDaEdicao =
    pautasDaGuarda.length > 0
      ? { minimo: configEditorial.minimoDePautas, maximo: configEditorial.maximoDePautas }
      : { minimo: 4, maximo: 6 };
  const redigirEdicao = (lista: RankedCandidate[]) =>
    runNewsroomPipeline(
      lista,
      env,
      fetcher,
      {
        nome: project.brand.displayName || project.name,
        nicho: project.niche,
        /*
         * A voz do projeto, mais o que vem por aí.
         *
         * O redator escrevia sem saber a data. Com a agenda no briefing, uma
         * pauta de varejo escrita em 6 de novembro pode dizer que a Black Friday
         * é dali a três semanas, porque a informação está na mão dele. Sem ela,
         * o texto trata toda semana como se fosse uma semana qualquer.
         *
         * Vazio na maior parte dos dias, e isso está certo: em 5 de janeiro não
         * existe gancho, e inventar um seria pior do que não ter.
         */
        extra: [
          project.editorialPromptExtra,
          // A voz própria do ramo da newsletter, só quando os ramos mandam.
          ramosNoComando ? vozes?.newsletter : "",
          agendaDoBriefing(todayStr),
        ]
          .filter(Boolean)
          .join("\n\n"),
        assinatura:
          String(project.settings?.final_line ?? "").trim() ||
          `Até amanhã. Equipe ${project.brand.displayName || project.name}.`,
      },
      limitesDaEdicao,
      pacotes,
      configEditorial.maximoDeReparos,
      /*
       * Com os ramos no comando, a nota do auditor deixa de bloquear e vira aviso
       * na peça (decisão do dono, 05/10/2026). O risco de alucinação e as duas
       * ancoragens continuam bloqueando, exatamente como antes.
       */
      ramosNoComando ? 0 : configEditorial.notaMinimaDeQA,
      {
        ...(ramosNoComando ? { notaDeAviso: configEditorial.notaMinimaDeQA } : {}),
        formasRecentesDoAssunto,
      },
    );

  /*
   * Barrada, a edição é escrita de novo antes de o dia ficar sem newsletter
   * (06/10/2026, ver `nova-redacao.ts`). Só com a guarda no comando, que é
   * quando o bloqueio derruba a edição; em observação ela sai de qualquer
   * jeito pelo caminho antigo, e uma segunda redação seria custo sem efeito.
   * O portão é o mesmo em toda tentativa: nada aqui afrouxa a conferência.
   */
  const novasRedacoes = await redigirComNovasTentativas(ranked, redigirEdicao, {
    minimo: limitesDaEdicao.minimo,
    tentativasExtras: modo === "enforce" ? TENTATIVAS_EXTRAS_DA_EDICAO : 0,
  });
  const pipelineResult = novasRedacoes.resultado;
  if (novasRedacoes.tentativas.length > 1) {
    console.log(
      `[NEWSROOM] ${novasRedacoes.tentativas.length} redação(ões) da edição: ` +
        novasRedacoes.tentativas
          .map((t) => `${t.tentativa}: ${t.aprovado ? "passou" : t.bloqueios.join(" + ")} (QA ${t.score})`)
          .join(" | "),
    );
  }
  livro.lancar("redacao", "newsletter", pipelineResult.custosPorEtapa.redacao);
  livro.lancar("auditoria_qa", "newsletter", pipelineResult.custosPorEtapa.auditoria_qa);
  livro.lancar("auditoria_claims", "newsletter", pipelineResult.custosPorEtapa.auditoria_claims);

  /*
   * Números viram apresentação humana AQUI, e não antes.
   *
   * Depois da geração e de todo o reparo: a conferência de ancoragem compara o
   * texto contra o pacote factual, e ela precisa ver o número como a fonte o
   * escreveu. Arredondar antes faria "R$ 5,0857" virar "R$ 5,09" e a
   * conferência acusar um valor que não está no pacote — a correção derrubaria
   * a edição.
   *
   * Depois daqui o número é só apresentação. O pacote factual e o que fica
   * gravado em `news_editions` continuam com o valor da fonte: se alguém
   * contestar amanhã, o que se confere é o dado, não o texto do e-mail.
   */
  pipelineResult.edition = formatarNumerosDaEdicao(pipelineResult.edition);

  /*
   * Afirmação sem sustentação é bloqueio, não apontamento.
   *
   * A conferência é determinística e roda depois do auditor: ela compara nome
   * próprio, número e data do texto contra o pacote. Em enforce, uma única
   * afirmação sem lastro impede a edição de sair, mesmo com nota alta. Errar
   * um requisito de imigração custa o status migratório de alguém, e nota 90
   * não conserta um número inventado.
   */
  if (pipelineResult.tentativasDeReparo > 0) {
    console.log(
      `[NEWSROOM] Ciclo de correção: ${pipelineResult.tentativasDeReparo} tentativa(s).`,
    );
    for (const r of pipelineResult.rodadasDeReparo) {
      console.log(
        `[NEWSROOM] tentativa ${r.tentativa}: recebeu ${r.problemasRecebidos.length}, ` +
          `restaram ${r.problemasRestantes.length}`,
      );
    }
  }

  /*
   * O veredito final da guarda.
   *
   * Três conferências, e as três precisam passar: ancoragem dura (nome, número
   * e data), claims semânticas (consequência, impacto, causa, comparação,
   * tendência, previsão) e o auditor. Uma edição pode ter nota alta e ainda
   * afirmar que uma medida encarece compras quando o material não diz o que a
   * medida faz. Nota não conserta isso.
   */
  const semLastro = pipelineResult.ancoragem.filter((a) => !a.ancorado);
  const claimsSoltas = pipelineResult.claimsSemanticas.naoSustentadas;

  if (semLastro.length > 0) {
    const detalhe = semLastro
      .map((a) => `"${a.titulo}": ${a.naoSustentadas.map((c) => `${c.tipo} ${c.valor}`).join(", ")}`)
      .join(" | ");
    console.error(`[NEWSROOM] Afirmações sem lastro no pacote factual: ${detalhe}`);
  }

  if (claimsSoltas.length > 0) {
    console.error(
      `[NEWSROOM] Conclusões sem sustentação: ` +
        claimsSoltas.map((c) => `${c.tipo}: "${c.trecho}"`).join(" | "),
    );
  }

  if (pipelineResult.claimsSemanticas.erro) {
    console.error(
      `[NEWSROOM] Auditoria de conclusões não rodou: ${pipelineResult.claimsSemanticas.erro}. ` +
        "Isso NÃO é aprovação.",
    );
  }

  /*
   * A matéria que saiu para a edição poder sair.
   *
   * Isto precisa ser barulhento. Uma edição de duas pautas quando o dia tinha
   * quatro é uma edição menor de propósito, e quem lê o log amanhã tem que
   * saber que a decisão foi tomada aqui e por qual motivo, não descobrir pela
   * contagem.
   */
  if (pipelineResult.pautasRemovidas.length > 0) {
    console.warn(
      `[NEWSROOM] ${pipelineResult.pautasRemovidas.length} pauta(s) retirada(s) para a edição sair: ` +
        pipelineResult.pautasRemovidas.map((p) => `"${p.titulo}" (${p.motivo})`).join(" | "),
    );
    await sendAlert(
      "warning",
      `Edição saiu sem ${pipelineResult.pautasRemovidas.length} pauta(s)`,
      pipelineResult.pautasRemovidas.map((p) => `${p.titulo}: ${p.motivo}`).join("\n") +
        `\n\nA edição foi publicada com as ${pipelineResult.edition.stories.length} pautas que sobraram. ` +
        "Antes de 16/09/2026 este caso derrubava a edição inteira.",
    );
  }

  if (pipelineResult.problemasRestantes.length > 0) {
    // Imprecisão que sobrou depois do reparo. Não bloqueia, mas fica no log:
    // é o que aparece na errata de amanhã se ninguém olhar.
    for (const p of pipelineResult.problemasRestantes) {
      console.warn(`[NEWSROOM] apontamento não resolvido: ${p.descricao}`);
    }
  }

  /*
   * A peça da newsletter, para a fila e para o registro do veredito (RF-10).
   *
   * O veredito é gravado nos dois desfechos. Até aqui só o bloqueio deixava
   * rastro, e só na linha `failed` do run.
   */
  const storyIdPorUrl = new Map(pautasDaGuarda.map((p) => [p.grupo.primary.url, p.storyId]));
  const pecaDaNewsletter = (referenciaId: string, html: string | null) =>
    montarPeca({
      ramo: "newsletter",
      referenciaId,
      storyIds: pipelineResult.edition.stories
        .map((st) => storyIdPorUrl.get(st.source_url) ?? "")
        .filter(Boolean),
      titulo: pipelineResult.edition.subject,
      conteudo: {
        subject: pipelineResult.edition.subject,
        preheader: pipelineResult.edition.preheader,
        headline: pipelineResult.edition.headline,
        edition: pipelineResult.edition,
        html,
      },
      avisos: [
        ...pipelineResult.avisos,
        ...pipelineResult.pautasRemovidas.map((p) => `pauta retirada: "${p.titulo}" (${p.motivo})`),
        // A nova redação também fica visível para quem aprova (06/10/2026).
        ...novasRedacoes.retiradas.map(
          (t) => `pauta retirada: "${t}" (apontada pelo auditor numa redação barrada por risco de alucinação)`,
        ),
        ...pipelineResult.problemasRestantes.map((p) => `apontamento não resolvido: ${p.descricao}`),
      ],
      aprovadaPeloAuditor: pipelineResult.aprovado,
      bloqueios: pipelineResult.bloqueios,
    });
  const registrarVereditoDaNewsletter = async (peca: PecaPronta) => {
    if (!registrarRamos) return;
    const erro = await gravarVeredito(
      getSupabaseAdminClient(),
      project.id,
      vereditoDaPeca(peca, {
        nota: pipelineResult.qaResult.score,
        riscoDeAlucinacao: Boolean(pipelineResult.qaResult.hallucination_risk),
      }),
      contextoDoRegistro,
    );
    if (erro) console.warn(`[NEWSROOM] veredito da newsletter não gravado: ${erro}`);
  };

  if (!pipelineResult.aprovado && modo === "enforce") {
    if (modoRamos !== "off") {
      const peca = pecaDaNewsletter(`edicao-${todayStr}`, null);
      pecasDoDia.push(peca);
      await registrarVereditoDaNewsletter(peca);
      await fecharCustosDosRamos();
    }
    /*
     * A decisão é a mesma, e a mensagem é byte a byte a de antes: o alerta e a
     * linha `failed` de `newsroom_runs` continuam lendo o que liam. O que muda
     * é que o erro passa a dizer POR QUE ele é, para quem lê a resposta não
     * precisar interpretar texto livre.
     */
    const detalhe: DetalheDoBloqueio = {
      score: pipelineResult.qaResult.score,
      riscoDeAlucinacao: Boolean(pipelineResult.qaResult.hallucination_risk),
      tentativasDeReparo: pipelineResult.tentativasDeReparo,
      issues: (pipelineResult.qaResult.issues ?? []).map((i) => String(i)).slice(0, 20),
      semLastro: pipelineResult.ancoragem
        .filter((a) => !a.ancorado)
        .map((a) => ({
          materia: a.titulo,
          itens: a.naoSustentadas.map((c) => ({ tipo: c.tipo, valor: c.valor, onde: c.onde })).slice(0, 10),
        })),
      conclusoes: pipelineResult.claimsSemanticas.naoSustentadas
        .map((c) => ({ tipo: c.tipo, trecho: c.trecho, motivo: c.motivo }))
        .slice(0, 20),
      apontamentos: pipelineResult.problemasRestantes.map((p) => p.descricao).slice(0, 20),
      redacoes: novasRedacoes.tentativas.length,
    };

    throw comDetalheDoBloqueio(
      comMotivo(
        new Error(
          `Edição bloqueada depois de ${pipelineResult.tentativasDeReparo} tentativa(s) de correção ` +
            `(QA ${pipelineResult.qaResult.score}): ${pipelineResult.bloqueios.join(" | ")}`,
        ),
        MOTIVO_QA_BLOQUEOU,
      ),
      detalhe,
    );
  }

  /*
   * Uma foto por pauta, endereçada pela identidade da pauta.
   *
   * Dois caminhos, e nunca os dois decidindo ao mesmo tempo. O da fase 1
   * escolhe por assunto no banco de imagem. O V2 escolhe pela entidade da
   * pauta, com licença verificada. Quem manda é `VISUAL_RESOLVER_V2`, e em
   * `enforce` a decisão final vem só de `resolveVisualAsset`.
   */
  console.log(`[NEWSROOM] Resolvedor de imagem ${descreverModoVisual(modoVisual)} (VISUAL_RESOLVER_V2=${modoVisual}).`);

  const diagnosticoVisual: DiagnosticoVisual = diagnosticoVazio();
  const resultadosVisuais: ResultadoVisual[] = [];
  /** Fotos resolvidas em leitura na seleção, a confirmar se forem ao ar. */
  const paraConfirmar = new Map<string, ResultadoVisual>();
  const imagensV2: ImagensDaEdicao = new Map();
  const legendasV2: LegendasDaEdicao = new Map();

  if (modoVisual !== "off") {
    /*
     * A entidade vem da classificação que a guarda já fez.
     *
     * Quando a guarda não rodou (ela pode estar em dry_run ou off), a
     * classificação não existe, e aí as entidades são extraídas das próprias
     * matérias, numa chamada só. É o mesmo extrator da fase 1.
     */
    const classificacaoPorUrl = new Map(
      pautasDaGuarda.map((p) => [p.grupo.primary.url, p.classificacao]),
    );

    const semClassificacao = pipelineResult.edition.stories
      .map((story, i) => ({ story, i }))
      .filter(({ story }) => !classificacaoPorUrl.has(story.source_url));

    let extraidas = new Map<string, { atores: string[]; lugares: string[]; acontecimento: string[] }>();
    if (semClassificacao.length > 0) {
      const r = await extrairEntidades(
        semClassificacao.map(({ story, i }) => ({
          id: String(i),
          titulo: story.title,
          resumo: `${story.summary} ${story.context ?? ""}`.slice(0, 800),
          fonte: story.source_name,
        })),
        env,
        fetcher,
      );
      extraidas = r.entidades;
      if (r.falhas.length > 0) {
        console.warn(`[NEWSROOM] Entidades não extraídas: ${r.falhas.join(" | ")}`);
      }
    }

    const biblioteca = bibliotecaDoDia ?? criarBiblioteca(getSupabaseAdminClient());
    /*
     * O conjunto do dia, o mesmo da seleção com foto: uma pauta da edição não
     * pega a foto que outra pauta do dia já levou, nem a do portal.
     */
    const usadosNestaEdicao = usadosNoDia;
    const pautaPorUrl = new Map(pautasDaGuarda.map((p) => [p.grupo.primary.url, p]));

    for (const [i, story] of pipelineResult.edition.stories.entries()) {
      const daGuarda = classificacaoPorUrl.get(story.source_url);
      const classificacao = daGuarda
        ? {
            atores: daGuarda.atores,
            lugares: daGuarda.lugares,
            acontecimento: daGuarda.acontecimento,
            pais: daGuarda.pais,
          }
        : (extraidas.get(String(i)) ?? { atores: [], lugares: [], acontecimento: [] });

      /*
       * A foto que a seleção já conferiu, quando conferiu (05/10/2026): a
       * mesma resposta, sem resolver de novo e sem a chance de a segunda
       * resolução discordar da primeira. Ela foi resolvida em leitura, então
       * o uso é confirmado depois, só para o que de fato for ao ar.
       */
      const daSelecao = pautaPorUrl.get(story.source_url);
      /*
       * Pelo filtro da newsletter (06/10/2026): a compartilhada que a
       * newsletter recusou não conta como conferida, e a da própria newsletter
       * é resolvida aqui, só para ela.
       */
      let jaConferida = daSelecao ? fotosDaNewsletter.jaResolvido(daSelecao.storyId) : undefined;
      if (daSelecao && jaConferida === undefined && fotosDoDia.jaResolvido(daSelecao.storyId)) {
        jaConferida = (await fotosDaNewsletter.resultado(daSelecao)).visual ?? undefined;
      }
      if (jaConferida) {
        const resultado = { ...jaConferida, storyId: identidadeDaPauta(story) };
        resultadosVisuais.push(resultado);
        diagnosticoVisual.storiesProcessed += 1;
        if (temFotoDaPauta(resultado) && resultado.asset) {
          diagnosticoVisual.assetsSelected += 1;
          const fonte = resultado.asset.source;
          diagnosticoVisual.sourcesUsed[fonte] = (diagnosticoVisual.sourcesUsed[fonte] ?? 0) + 1;
          imagensV2.set(identidadeDaPauta(story), resultado.asset.imageUrl);
          if (resultado.asset.attribution) legendasV2.set(identidadeDaPauta(story), resultado.asset.attribution);
          if (modoVisual === "enforce" && !dryRun) paraConfirmar.set(identidadeDaPauta(story), resultado);
        } else {
          diagnosticoVisual.noValidImage += 1;
          if (resultado.asset && ehUltimoRecurso(resultado.asset)) {
            diagnosticoVisual.ultimoRecurso = (diagnosticoVisual.ultimoRecurso ?? 0) + 1;
          }
        }
        console.log(
          `[NEWSROOM] imagem V2 ${resultado.status} (da seleção) :: ${story.title.slice(0, 55)} :: ` +
            (resultado.asset ? `${resultado.asset.source}, ${resultado.asset.license}` : `${resultado.motivo}`),
        );
        continue;
      }

      // Por `imagemDaPauta` (05/10/2026): ver a capa do portal, acima.
      const pautaDaFoto = {
        storyId: identidadeDaPauta(story),
        titulo: story.title,
        resumo: story.summary,
        categoria: story.category,
        classificacao,
      };
      const opcoesDaFoto = {
        client: getSupabaseAdminClient(),
        biblioteca,
        env,
        fetcher,
        jaUsadosNestaEdicao: usadosNestaEdicao,
        // Grava só quando o V2 manda de verdade e a execução publica.
        somenteLeitura: modoVisual !== "enforce" || dryRun,
      };
      // A foto que a newsletter recusou não volta a ela (06/10/2026); os outros canais não sentem.
      const resultado = await comFotoDoCanal(
        await imagemDaPauta(pautaDaFoto, { client: getSupabaseAdminClient(), projeto: project, opcoes: opcoesDaFoto }),
        aprendizadoDaNewsletter.imagem,
        () =>
          imagemDaPauta(pautaDaFoto, {
            client: getSupabaseAdminClient(),
            projeto: project,
            ignorarReuso: true,
            opcoes: {
              ...opcoesDaFoto,
              jaUsadasRecentemente: aprendizadoDaNewsletter.imagem.evitar,
              ...(aprendizadoDaNewsletter.imagem.motivos.length
                ? { recusasDoEditor: aprendizadoDaNewsletter.imagem.motivos }
                : {}),
            },
          }),
      );

      resultadosVisuais.push(resultado);
      diagnosticoVisual.storiesProcessed += 1;

      if (resultado.status === "SELECTED" && resultado.asset) {
        diagnosticoVisual.assetsSelected += 1;
        const fonte = resultado.asset.source;
        diagnosticoVisual.sourcesUsed[fonte] = (diagnosticoVisual.sourcesUsed[fonte] ?? 0) + 1;
        imagensV2.set(identidadeDaPauta(story), resultado.asset.imageUrl);
        if (resultado.asset.attribution) legendasV2.set(identidadeDaPauta(story), resultado.asset.attribution);
      } else {
        diagnosticoVisual.noValidImage += 1;
        if (resultado.motivo === "AMBIGUOUS_ENTITY") diagnosticoVisual.ambiguousEntity += 1;

        /*
         * Sem foto da pauta, a bandeira. O número continua contando a verdade.
         *
         * O resolvedor devolve uma bandeira americana do Commons, com licença e
         * crédito, quando não acha foto da pauta, e mantém `status` em
         * NO_VALID_IMAGE de propósito, para o relatório não chamar de sucesso o
         * dia em que a busca falhou. A newsletter perguntava pelo status e por
         * isso saía com o bloco vazio.
         *
         * Em 18/09/2026 a edição inteira saiu sem uma foto sequer. Duas coisas
         * minhas se encontraram: a bandeira, que nasceu com status recusado, e a
         * conferência visual, que passou a derrubar a foto genérica de banco. O
         * caso raro virou o caso comum.
         *
         * A separação é esta: `noValidImage` continua subindo, então o relatório
         * segue dizendo quantos dias a busca de foto da pauta falhou; e a peça
         * recebe uma imagem real, licenciada, que diz Estados Unidos, que é o
         * assunto de toda edição. Contar como sucesso seria perder o número que
         * mostra quando a busca precisa melhorar; deixar o bloco vazio é entregar
         * menos do que existe na mão.
         */
        /*
         * SUPERADO em 05/10/2026, pela decisão "pauta sem foto não vira
         * conteúdo": a bandeira continua sendo contada, e não vai mais para a
         * edição. A pauta sem foto sai logo abaixo (`pautasSemFotoNaEdicao`).
         * O texto acima fica como registro de por que ela entrou em 18/09.
         */
        if (resultado.asset && ehUltimoRecurso(resultado.asset)) {
          diagnosticoVisual.ultimoRecurso = (diagnosticoVisual.ultimoRecurso ?? 0) + 1;
        }
      }

      console.log(
        `[NEWSROOM] imagem V2 ${resultado.status} :: ${story.title.slice(0, 55)} :: ` +
          `entidade ${resultado.entidade?.nome ?? "nenhuma"} (${resultado.entidade?.tipo ?? "n/d"})` +
          (resultado.asset
            ? ` :: ${resultado.asset.source}, ${resultado.asset.license}, contexto ${resultado.asset.imageContextType}`
            : ` :: ${resultado.motivo}`),
      );
    }
  }

  /*
   * O caminho da fase 1 só roda quando o V2 não está no comando.
   *
   * Em `enforce`, a decisão final vem de uma interface só. Encadear os dois
   * resolvedores mais um fallback é como a foto errada aparecia antes: cada
   * camada tapando o buraco da anterior com o que tivesse à mão.
   */
  let imagensDaEdicao: ImagensDaEdicao;
  let legendasDaEdicao: LegendasDaEdicao = new Map();

  if (modoVisual === "enforce") {
    imagensDaEdicao = imagensV2;
    legendasDaEdicao = legendasV2;
  } else {
    const escolhasDeImagem = await resolverImagens(
      pipelineResult.edition.stories.map((story, i) => ({
        titulo: story.title,
        categoria: story.category,
        sourceUrl: story.source_url,
        imagemDoFeed: pipelineResult.selectedCandidates[i]?.image_url ?? "",
      })),
      { historico: historicoDaGuarda, janelaEmDias: configEditorial.janelaDeImagemEmDias, env },
    );

    for (const escolha of escolhasDeImagem.values()) {
      console.log(
        `[NEWSROOM] imagem ${escolha.imageSource} :: ${escolha.titulo.slice(0, 60)} :: ${escolha.motivo}` +
          (escolha.descartadaPorRepeticao ? ` :: descartada: ${escolha.descartadaPorRepeticao}` : ""),
      );
    }

    imagensDaEdicao = paraRenderizacao(escolhasDeImagem);
  }

  /*
   * Pauta sem foto não vira conteúdo (decisão do dono, 05/10/2026).
   *
   * Com a seleção conferida antes da redação, isto não acha nada: a foto da
   * edição é a mesma que a seleção viu. É a rede para os caminhos em que a
   * foto sai de outro lugar (o resolvedor da fase 1, o ranker antigo, a pauta
   * que a guarda não classificou). A pauta sem foto sai da edição, como a
   * pauta sem lastro sai em `runNewsroomPipeline`, e com menos que o mínimo a
   * edição não sai: vale o caminho do dia sem edição, registrado, sem inventar.
   */
  /*
   * ATUALIZADO em 14/10/2026, por decisão do dono: na newsletter a pauta sem
   * foto FICA, só com texto, e o que sai é a imagem (a bandeira de último
   * recurso, ou o endereço vazio). Tirar a pauta depois de escrita era o que
   * deixava o assunto prometendo uma notícia que não estava na edição (14/10).
   */
  {
    const historias = pipelineResult.edition.stories;
    const { saem: semFotoNaEdicao } = separarPautasSemFoto(historias, (st) => imagensDaEdicao.get(identidadeDaPauta(st)));
    for (const i of semFotoNaEdicao) imagensDaEdicao.delete(identidadeDaPauta(historias[i]));
    if (semFotoNaEdicao.length > 0) {
      console.log(`[NEWSROOM] ${semFotoNaEdicao.length} pauta(s) sem foto ficam na edição, só com texto.`);
    }
  }
  if (PAUTA_SEM_FOTO_CAI_DA_NEWSLETTER) {
    const historias = pipelineResult.edition.stories;
    const { ficam, saem } = separarPautasSemFoto(historias, (st) => imagensDaEdicao.get(identidadeDaPauta(st)));
    if (saem.length > 0) {
      const visualPorStory = new Map(resultadosVisuais.map((r) => [r.storyId, r]));
      const quedas: QuedaSemFoto[] = saem.map((i) => {
        const st = historias[i];
        const v = visualPorStory.get(identidadeDaPauta(st));
        return {
          storyId: identidadeDaPauta(st),
          titulo: st.title,
          motivo: `${MOTIVO_SEM_FOTO}: sem foto da pauta depois da resolução (${v?.motivo ?? (modoVisual === "enforce" ? "sem resultado" : "fase 1 sem foto")})`,
        };
      });
      quedasSemFoto.push({ canal: "newsletter", quedas });
      await registrarQuedasSemFoto();

      const piso = Math.max(configEditorial.minimoDePautas, 2);
      if (ficam.length < piso) {
        const detalhe =
          `${MOTIVO_SEM_FOTO}: ${ficam.length} pauta(s) com foto depois da resolução, mínimo ${piso}. ` +
          `Sem foto: ${quedas.map((q) => `"${q.titulo.slice(0, 60)}"`).join(", ")}.`;
        console.log(`[NEWSROOM] Edição não fecha hoje: ${detalhe}`);
        await registrarDiaSemEdicao({
          projectId: project.id,
          startTime,
          idempotencyKey,
          motivo: `EDITORIAL_MINIMUM_NOT_MET: ${detalhe}`,
          sourcesCount: collectionResult.sourcesAttempted,
          candidatesFound: collectionResult.candidates.length,
          uniqueCount: uniqueGroups.length,
          duplicatesCount,
          storiesSelected: ficam.length,
          dryRun,
        });
        await fecharCustosDosRamos();
        return {
          ok: false as const,
          reason: "editorial_minimum_not_met" as const,
          detail: detalhe,
          approvedCount: ficam.length,
          rejectedCount: saem.length,
          minimumRequired: piso,
          socialV2: rastro.social,
          ramos: modoRamos !== "off" ? { modo: modoRamos, pecas: pecasDoDia, custos: livro.porRamo() } : undefined,
          idempotencyKey,
        };
      }

      const saiu = new Set(saem);
      for (const q of quedas) {
        pipelineResult.pautasRemovidas.push({ indice: -1, titulo: q.titulo, motivo: q.motivo });
      }
      pipelineResult.edition = { ...pipelineResult.edition, stories: historias.filter((_, i) => !saiu.has(i)) };
      // As duas listas são cortadas juntas, pelo motivo de `runNewsroomPipeline`.
      pipelineResult.selectedCandidates = pipelineResult.selectedCandidates.filter((_, i) => !saiu.has(i));
      console.warn(`[NEWSROOM] ${saem.length} pauta(s) sem foto retirada(s) da edição; ${ficam.length} seguem.`);
    }
  }

  /*
   * O que foi resolvido em leitura na seleção e vai ao ar tem o uso
   * confirmado agora (`confirmarImagemPublicada`), só para as pautas que
   * ficaram na edição.
   */
  for (const st of pipelineResult.edition.stories) {
    const r = paraConfirmar.get(identidadeDaPauta(st));
    if (!r) continue;
    const notas = await confirmarImagemPublicada(r, {
      biblioteca: bibliotecaDoDia,
      client: getSupabaseAdminClient(),
      projeto: project,
    });
    for (const n of notas) console.warn(`[NEWSROOM] ${n}`);
  }

  // O bloco do VisaMatch da edição: a rotação pelos dias da newsletter do projeto.
  const configDoParceiro: ConfigDoVisaMatch = {
    ...configDoVisaMatch(project.settings),
    dias: cadenciaDoProjeto(project).newsletter.dias,
  };
  const htmlContent = renderEditionToHtml(
    pipelineResult.edition,
    imagensDaEdicao,
    false,
    legendasDaEdicao,
    todayStr,
    configDoParceiro,
  );
  // Versão sem o cromo de e-mail, para o corpo do artigo no portal.
  const htmlParaPortal = renderEditionToHtml(
    pipelineResult.edition,
    imagensDaEdicao,
    true,
    legendasDaEdicao,
    todayStr,
    configDoParceiro,
  );
  const wordCount = htmlContent.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const executionTimeMs = Date.now() - startTime;

  console.log(`[NEWSROOM] Pipeline concluído com sucesso em ${executionTimeMs}ms! (QA score: ${pipelineResult.qaResult.score}/100, Palavras: ${wordCount})`);

  let createdArticleSlug: string | undefined;
  let createdCampaignId: number | undefined;
  let campaignStatus: string = "draft";
  let editionId: string | undefined;

  // A edição precisa ficar gravada antes de qualquer publicação: é dela que o
  // pipeline do Instagram tira as pautas dos posts do dia. A tabela
  // news_editions existia com 18 colunas e nenhum insert em todo o código, e o
  // serviço do Instagram, ao não encontrar a edição, caía num conteúdo de
  // demonstração escrito no próprio arquivo.
  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();

      const { count } = await supabase
        .from("news_editions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id);

      const linhaDaEdicao = {
        project_id: project.id,
        edition_date: todayStr,
        edition_number: (count ?? 0) + 1,
        slug: `edicao-${todayStr}`,
        subject: pipelineResult.edition.subject,
        subject_options: pipelineResult.edition.subject_options,
        preheader: pipelineResult.edition.preheader,
        headline: pipelineResult.edition.headline,
        intro: pipelineResult.edition.intro,
        stories: pipelineResult.edition.stories,
        quick_bits: pipelineResult.edition.quick_bits ?? [],
        closing: pipelineResult.edition.closing,
        final_line: pipelineResult.edition.final_line,
        content_html: htmlContent,
        word_count: wordCount,
        qa_passed: pipelineResult.qaResult.passed,
        qa_score: pipelineResult.qaResult.score,
        qa_hallucination_risk: pipelineResult.qaResult.hallucination_risk,
        qa_issues: pipelineResult.qaResult.issues,
        // Agendada, a edição espera a hora fora do portal: o portal lista
        // só `published`. Ver `publicacao-agendada.ts`.
        status: agendamento ? "approved" : "published",
        updated_at: new Date().toISOString(),
      };
      const gravarEdicao = (linha: Record<string, unknown>) =>
        supabase.from("news_editions").upsert(linha, { onConflict: "project_id,edition_date" }).select("id").single();

      /*
       * A forma do assunto vai junto (06/10/2026), na coluna `subject_form`.
       * Antes da migration a coluna não existe e o PostgREST recusa o upsert
       * inteiro: aí a edição é gravada sem ela, e o rodízio lê a forma pelo
       * texto do assunto (`inferirFormaDoAssunto`).
       */
      const formaDoAssunto = pipelineResult.edition.subject_form ?? null;
      let { data: editionRow, error: editionErr } = await gravarEdicao(
        formaDoAssunto ? { ...linhaDaEdicao, subject_form: formaDoAssunto } : linhaDaEdicao,
      );
      if (editionErr && formaDoAssunto && /subject_form/.test(editionErr.message)) {
        console.warn("[NEWSROOM] news_editions ainda sem a coluna subject_form: gravando a edição sem a forma do assunto.");
        ({ data: editionRow, error: editionErr } = await gravarEdicao(linhaDaEdicao));
      }

      if (editionErr) throw new Error(editionErr.message);
      editionId = editionRow?.id;
      console.log(`[NEWSROOM] Edição ${todayStr} gravada em news_editions (${editionId}).`);

      /*
       * Histórico editorial da edição.
       *
       * Sem esta gravação a verificação de repetição nunca aprende: ela
       * consulta uma tabela que ninguém alimenta, que foi exatamente o que
       * aconteceu com `news_candidates.dedupe_key`, coluna existente e vazia
       * desde sempre.
       *
       * Escreve depois da edição gravada, e só o que de fato entrou nela. E
       * não derruba o dia se falhar: a edição já está publicada, e o preço de
       * um registro perdido é uma pauta que pode se repetir, não uma edição
       * que não sai.
       */
      if (pautasDaGuarda.length > 0) {
        try {
          const store = criarHistoricoStore(supabase);
          const porUrl = new Map(pautasDaGuarda.map((p) => [p.grupo.primary.url, p]));

          // Percorre as pautas da edição, não as da guarda: a foto é indexada
          // pela ordem das pautas publicadas, e casar por posição em outra
          // lista foi o que já ilustrou uma pauta com a foto de outra.
          const visualPorStory = new Map(resultadosVisuais.map((r) => [r.storyId, r]));

          const registros = pipelineResult.edition.stories
            .map((story) => {
              const pauta = porUrl.get(story.source_url);
              if (!pauta) return null;

              const identidade = identidadeDaPauta(story);
              const visual = visualPorStory.get(identidade);
              const asset = modoVisual === "enforce" ? (visual?.asset ?? null) : null;

              const registro = registroDaPauta(pauta, {
                projectId: project.id,
                canal: "newsletter",
                newsletterId: editionId,
                imagemUrl: imagensDaEdicao.get(identidade) || null,
                publicadoEm: new Date().toISOString(),
              });

              /*
               * Com o V2 no comando, a publicação guarda de onde a foto veio e
               * sob que licença. Antes só a URL era gravada, e uma URL sozinha
               * não responde se a imagem podia ser publicada.
               */
              if (asset) {
                registro.visualAssetId = asset.id ?? null;
                registro.imagemFonte = asset.source;
                registro.imagemLicenca = asset.license;
                registro.imagemAutor = asset.author;
                registro.imagemCredito = asset.attribution;
                registro.imagemAssetId = asset.sourceAssetId;
                registro.imagemUrlCanonica = asset.imageUrl;
              }

              return registro;
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          const gravados = await store.registrar(registros);
          console.log(
            `[NEWSROOM] Histórico editorial: ${gravados} de ${registros.length} pautas registradas.`,
          );
        } catch (histErr) {
          console.error(
            `[NEWSROOM] Histórico editorial não gravado: ${histErr instanceof Error ? histErr.message : String(histErr)}`,
          );
        }
      }
    } catch (edErr) {
      // Sem a edição gravada os posts do dia não têm de onde sair, então a
      // falha interrompe em vez de seguir para a publicação.
      throw new Error(
        `Falha ao gravar a edição do dia: ${edErr instanceof Error ? edErr.message : String(edErr)}`,
      );
    }
  }

  if (modoRamos !== "off") {
    const peca = pecaDaNewsletter(editionId ?? `edicao-${todayStr}`, htmlContent);
    pecasDoDia.push(peca);
    await registrarVereditoDaNewsletter(peca);
    if (ramosNoComando && !dryRun && options.aoProduzirPeca) {
      try {
        await options.aoProduzirPeca(peca);
      } catch (erro) {
        console.warn(`[NEWSROOM] fila não recebeu a peça da newsletter: ${(erro as Error).message}`);
      }
    }
  }

  /*
   * Com os ramos no comando, o portal NÃO regrava o e-mail (RF-13).
   *
   * O artigo da edição era o HTML da newsletter sob o slug da data. O portal
   * passou a ter matéria própria por pauta, escrita para a busca, e publicar
   * as duas coisas faria cada pauta aparecer duas vezes no site, uma delas
   * com o texto do e-mail.
   */
  if (publishToPortal && ramosNoComando) {
    console.log(
      `[NEWSROOM PORTAL] edição NÃO regravada como artigo: o portal é ramo próprio ` +
        `(${resultadoDoPortal?.pecas.length ?? 0} matéria(s) do dia).`,
    );
  }


  /*
   * A fila de aprovação do projeto (05/10/2026). Em `off`, que é o padrão,
   * nada abaixo muda: o artigo nasce publicado e a newsletter dispara aqui.
   * Em `enforce`, as duas peças entram na fila e só saem quando aprovadas.
   */
  const modoDaFilaDoDia = modoDaFila(project);
  const projetoDaFilaDoDia = { id: project.id, timezone: project.timezone, settings: project.settings };
  // A data é a da EDIÇÃO (o alvo da véspera), e o horário é o da cadência quando há agendamento.
  const horariosNaFila = horariosDaRedacaoNaFila(projetoDaFilaDoDia, todayStr, agendamento);
  const envioDaNewsletter = horariosNaFila.newsletter;

  if (publishToPortal && !ramosNoComando) {
    try {
      const supabase = getSupabaseAdminClient();
      const articleSlug = `edicao-${todayStr}`;
      /*
       * Capa do artigo: a foto da primeira pauta desta edição, ou nada.
       *
       * O upsert casa por (project_id, slug), e o slug é a data. Quando a
       * coluna não recebia valor confiável, a linha existente ficava com a
       * capa da execução anterior, e a edição de hoje aparecia no portal com
       * a foto de ontem. Escrever `null` explicitamente é o que impede essa
       * herança: ausência de foto passa a ser um valor, não a omissão que
       * deixa o valor velho no lugar.
       */
      const primaryCoverImage =
        imagensDaEdicao.get(identidadeDaPauta(pipelineResult.edition.stories[0])) || null;

      const { data: articleData, error: articleErr } = await supabase
        .from("articles")
        .upsert(
          {
            project_id: project.id,
            slug: articleSlug,
            title: pipelineResult.edition.headline,
            excerpt: pipelineResult.edition.preheader,
            description: pipelineResult.edition.intro,
            cover_image: primaryCoverImage,
            content_html: htmlParaPortal,
            content: pipelineResult.edition.stories,
            // A fila manda sobre o agendamento (integração de 05/10/2026): com
            // ela em `enforce` o artigo espera a aprovação, mesmo agendado.
            status:
              modoDaFilaDoDia === "enforce"
                ? statusDeEntradaDoArtigo(modoDaFilaDoDia)
                : agendamento
                  ? "scheduled"
                  : "published",
            category: "Edição Diária",
            author: MARCA.nome,
            reading_minutes: Math.ceil(wordCount / 200),
            /*
             * Título e descrição de busca, das colunas que existiam e ninguém
             * preenchia: em 16/09/2026, zero dos quatro artigos publicados
             * tinha `seo_title`, `seo_description`, `aeo_questions` ou
             * `canonical_url`.
             *
             * Não há chamada nova de LLM aqui, e isso é deliberado. O assunto
             * do e-mail e o preheader já foram escritos e já passaram pela
             * auditoria de lastro: eles são, por construção, a versão curta e
             * conferida da edição. Gerar um segundo par só para a busca
             * acrescentaria custo, latência e uma superfície nova para
             * alucinar.
             *
             * O limite de 160 é o que o Google costuma mostrar; o que passa
             * disso não é penalizado, é cortado no meio da frase.
             *
             * O TÍTULO DE BUSCA É O `headline`, e não o `subject`. O assunto do
             * e-mail é escrito para dar vontade de abrir na caixa de entrada,
             * com curiosidade incompleta e caixa baixa ("o prazo fixo ficou
             * para depois"). Isso é ótimo no Gmail e péssimo num resultado de
             * busca, onde quem lê está procurando um assunto e não recebendo
             * uma carta. O `headline` é a frase afirmativa que diz o que
             * mudou, que é exatamente o que a busca precisa.
             */
            seo_title: pipelineResult.edition.headline || pipelineResult.edition.subject,
            seo_description: (pipelineResult.edition.preheader || pipelineResult.edition.intro || "").slice(0, 160),
            canonical_url: `${MARCA.site}/artigos/${articleSlug}`,
            // Na fila, a data de publicação é a da liberação, e não a da redação.
            published_at:
              modoDaFilaDoDia === "enforce" ? null : (agendamento?.portalEm ?? new Date().toISOString()),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,slug" }
        )
        .select("id, slug")
        .single();

      if (!articleErr && articleData) {
        createdArticleSlug = articleData.slug;
        console.log(`[NEWSROOM PORTAL] Edição publicada no portal com sucesso em /artigos/${createdArticleSlug}`);

        await supabase.from("article_revisions").insert({
          project_id: project.id,
          article_id: articleData.id,
          title: pipelineResult.edition.headline,
          body: pipelineResult.edition as any,
          created_by: "newsroom_bot",
        });

        await enfileirarDaRedacao(projetoDaFilaDoDia, {
          ramo: "artigo",
          pecaId: articleData.id as string,
          hash: hashDoArtigo(pipelineResult.edition.headline, htmlParaPortal, primaryCoverImage),
          publicarEm: horariosNaFila.artigoDaEdicao,
          avisos: avisosDaEdicao(pipelineResult.qaResult),
          resumo: {
            titulo: pipelineResult.edition.headline,
            texto: pipelineResult.edition.headline,
            slug: articleData.slug as string,
            imagens: primaryCoverImage ? [primaryCoverImage] : [],
            pacoteFactual: pipelineResult.edition.stories.map((st) => st.title).filter(Boolean),
          },
        });
      }
    } catch (pubErr) {
      console.error("[NEWSROOM PORTAL ERROR] Falha ao publicar edição no portal:", pubErr);
    }
  }

  /*
   * A newsletter entra na fila ANTES do disparo, e em `enforce` no lugar dele.
   *
   * O horário planejado é o de envio do projeto (06:07 por padrão): aprovada
   * antes, ela espera; aprovada depois, sai na hora da aprovação, e às 06:00 o
   * Telegram avisa se ainda não houver decisão. Quem faz isso é `cicloDaFila`.
   */
  if (createNewsletterCampaign && editionId) {
    await enfileirarDaRedacao(projetoDaFilaDoDia, {
      ramo: "newsletter",
      pecaId: editionId,
      hash: hashDaNewsletter(pipelineResult.edition.subject, htmlContent),
      publicarEm: envioDaNewsletter,
      avisos: avisosDaEdicao(pipelineResult.qaResult),
      resumo: {
        titulo: pipelineResult.edition.subject,
        texto: pipelineResult.edition.subject,
        pacoteFactual: pipelineResult.edition.stories.map((st) => st.title).filter(Boolean),
        contexto: contextoDaNewsletterNaFila({
          data: todayStr,
          historias: pipelineResult.edition.stories,
          pautas: pautasDaGuarda,
          pacotesPorUrl: pacotes,
          pool: poolAprovadoDoDia,
          imagens: imagensDaEdicao,
          legendas: legendasDaEdicao,
        }),
      },
    });
  }

  if (createNewsletterCampaign && !redacaoDisparaNewsletter(modoDaFilaDoDia)) {
    console.log(
      `[NEWSROOM LISTMONK] fila de aprovação em enforce: a campanha de ${todayStr} só é criada quando a edição for aprovada.`,
    );
  }

  /*
   * Só a newsletter nunca fala com o Listmonk (06/10/2026): ela existe para pôr
   * a edição na fila, e a campanha nasce na liberação. `produzirSoANewsletter`
   * já recusa rodar com a fila fora de `enforce`; isto é o cinto.
   */
  if (createNewsletterCampaign && !somenteNewsletter && redacaoDisparaNewsletter(modoDaFilaDoDia)) {
    try {
      /*
       * A configuração do Listmonk vem do projeto quando ele tem uma.
       *
       * Sem isto, dois projetos disparariam na mesma lista: `LISTMONK_URL`,
       * token e lista são variáveis de ambiente, globais ao deploy.
       */
      const listmonk = createListmonkClient(await envDoListmonk(project.id, env), fetcher);
      const campaignName = `${MARCA.nome}, edição ${todayStr}`;
      // O portão olha `hallucination_risk`, não `passed`.
      //
      // `passed` é o veredito genérico que o checador autodeclara, e ele
      // reprova por tom, gramática ou qualquer implicância, custando a
      // newsletter inteira do dia. O dano que justifica não enviar é um só:
      // fato inventado chegando à lista. Isso não se desfaz com errata.
      //
      // Vírgula errada é recuperável e não vale um dia sem edição. Número de
      // benchmark que não estava na fonte, não.
      const retidoPorAlucinacao = pipelineResult.qaResult.hallucination_risk;
      const campaignResult = await listmonk.createCampaign({
        name: campaignName,
        subject: pipelineResult.edition.subject,
        body: htmlContent,
        autoSend: autoSend && !retidoPorAlucinacao,
        // Com agendamento, `autoSend` AGENDA para a hora da newsletter em vez
        // de disparar. Ver `listmonk.ts`.
        ...(agendamento ? { sendAt: agendamento.newsletterEm } : {}),
      });

      if (campaignResult.ok && campaignResult.id) {
        createdCampaignId = campaignResult.id;
        campaignStatus = campaignResult.status || (autoSend && !retidoPorAlucinacao ? "running" : "draft");
        console.log(`[NEWSROOM LISTMONK] Campanha criada no Listmonk ID #${createdCampaignId} (status: ${campaignStatus})`);
      }

      if (retidoPorAlucinacao) {
        // Campanha retida sem aviso é indistinguível de campanha que não foi
        // criada. Quem precisa revisar tem que saber no mesmo minuto.
        await sendAlert(
          "warning",
          "Newsletter retida: risco de alucinação",
          `Edição ${todayStr} ficou em rascunho no Listmonk (campanha #${createdCampaignId ?? "?"}). ` +
            `QA ${pipelineResult.qaResult.score}/100. Apontamentos: ` +
            (pipelineResult.qaResult.issues.join(" · ") || "nenhum detalhado"),
        );
      }
    } catch (lmErr) {
      console.error("[NEWSROOM LISTMONK ERROR] Falha ao criar campanha no Listmonk:", lmErr);
    }
  }

  /*
   * O agendador LEGADO, e por que ele agora tem um portão.
   *
   * Ele agenda uma vaga por pauta da NEWSLETTER e o worker gera o roteiro na
   * hora de publicar. Isso funcionava quando era o único caminho. Com o Social
   * V2 em `enforce`, os dois passam a criar linhas `scheduled` para o MESMO dia
   * a partir do MESMO trabalho editorial, e o mesmo worker publica as duas.
   *
   * Foi o que aconteceu em 09/09: o V2 publicou "Regra permite residência para
   * crianças nascidas nos EUA" às 11:00 e o legado publicou "Registro de
   * residência para crianças nascidas nos EUA" às 12:30. Mesmo assunto, duas
   * vezes, no mesmo perfil, no mesmo dia.
   *
   * O portão é a flag que JÁ existe, e é de propósito: `INSTAGRAM_AUTO_POST`
   * governa a PUBLICAÇÃO dos dois ramos, lá no serviço que publica, então
   * desligá-la mataria o V2 junto. `SOCIAL_PIPELINE_V2` governa a GERAÇÃO do
   * V2, e é exatamente a pergunta certa: se o V2 está publicando o dia, o
   * legado não tem o que agendar.
   *
   * Nada do legado é apagado: o código fica, o ramo do worker fica, e as linhas
   * históricas ficam. O que para é a criação automática de vaga nova.
   */
  const modoSocialV2 = modoDoPipelineSocial(env, project);
  // Com os ramos no comando, o Instagram é ramo próprio e nunca nasce da edição.
  const legadoCede = modoSocialV2 === "enforce" || ramosNoComando;

  let scheduledPosts: ScheduledPostSlot[] = [];

  if (legadoCede) {
    console.log(
      "[NEWSROOM INSTAGRAM] agendador legado NÃO rodou: SOCIAL_PIPELINE_V2=enforce, " +
        "e o feed do dia é do Social V2. Nenhuma vaga legada foi criada.",
    );
  }

  if (!dryRun && !legadoCede) {
    // Só a newsletter nunca agenda post: o feed do dia já foi produzido.
    if (somenteNewsletter) {
      console.log("[NEWSROOM INSTAGRAM] só a newsletter: o agendador legado NÃO rodou.");
    } else try {
      /*
       * O legado também não repete o feed (06/10/2026). As pautas da edição
       * passaram pela régua da NEWSLETTER, e a pauta que o feed levou ontem
       * pelo Social V2 pode estar nelas. Feed ilegível derruba o agendamento
       * do dia pelo `catch` abaixo: sem antirrepetição, o feed não publica.
       */
      const { foraDoFeedDaEdicao, lerHistoricoDoFeed } = await import("../social/historico-do-feed");
      const doFeed = await lerHistoricoDoFeed(getSupabaseAdminClient(), project.id, configEditorial.janelaDeDias, {
        excetoData: todayStr,
      });
      const daEdicao = foraDoFeedDaEdicao(pipelineResult.edition.stories, doFeed, configEditorial);
      for (const r of daEdicao.repetidas) {
        console.log(`[NEWSROOM INSTAGRAM] já no feed, o legado não agenda: ${r.titulo.slice(0, 70)} :: ${r.motivo}`);
      }
      scheduledPosts = await scheduleEditionPosts({
        project,
        editionId,
        editionDate: todayStr,
        articleSlug: createdArticleSlug || `edicao-${todayStr}`,
        stories: daEdicao.historias,
      });
    } catch (agErr) {
      // Falhar no agendamento não pode desfazer a newsletter que já saiu.
      console.error("[NEWSROOM INSTAGRAM] Falha ao agendar os posts do dia:", agErr);
    }
  }

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.from("newsroom_runs")
        .insert({
          project_id: project.id,
          started_at: new Date(startTime).toISOString(),
          finished_at: new Date().toISOString(),
          status: "success",
          sources_count: collectionResult.sourcesAttempted,
          candidates_found: collectionResult.candidates.length,
          candidates_filtered: collectionResult.candidates.length - uniqueGroups.length,
          duplicates_count: duplicatesCount,
          stories_selected: pipelineResult.selectedCandidates.length,
          tokens_input: pipelineResult.totalUsage.promptTokens,
          tokens_output: pipelineResult.totalUsage.completionTokens,
          // Com os ramos, o custo do dia é o do livro inteiro, e não só o da
          // redação da newsletter (RNF-14).
          cost_estimate_usd: modoRamos !== "off" ? livro.total() : pipelineResult.totalUsage.estimatedCostUsd,
          dry_run: false,
          edition_id: editionId,
          idempotency_key: idempotencyKey,
        });
    } catch (dbErr) {
      console.error("[NEWSROOM DB] Erro ao gravar histórico no Supabase:", dbErr);
    }
  }

  await fecharCustosDosRamos();

  return {
    ok: true,
    projectId: project.id,
    projectSlug: project.slug,
    dryRun,
    /*
     * O modo que o processo REALMENTE leu, normalizado.
     *
     * Sem isto, distinguir "variável não configurada" de "escrita errada" de
     * "contêiner subiu com o ambiente antigo" exigia inferir pelo formato da
     * edição, e a inferência falha justamente quando mais importa. Vai o modo
     * normalizado, nunca o valor bruto da variável.
     */
    editorialGuardMode: modo,
    /**
     * A camada de candidatas funcionou nesta execução?
     *
     * Falha aqui não derruba a edição, e por isso ela precisa aparecer: uma
     * degradação silenciosa faria o canal social reclassificar tudo amanhã
     * sem ninguém perceber que o cache parou de existir.
     */
    candidatePersistence: diagnosticoDeCandidatas,
    /** Modo efetivo do resolvedor de imagem, normalizado, lido pelo processo. */
    visualResolverMode: modoVisual,
    visualResolution: diagnosticoVisual,
    /**
     * O que o Instagram fez hoje.
     *
     * `executed: false` com `mode: "off"` é o estado normal enquanto a flag
     * não for ligada. `executed: false` com `mode: "dry_run"` significa que a
     * flag está ligada e o ciclo NÃO foi alcançado — que é a diferença que este
     * campo existe para tornar visível.
     */
    socialV2: rastro.social,
    minEditorialQaScore: configEditorial.notaMinimaDeQA,
    maxEditorialRepairAttempts: configEditorial.maximoDeReparos,
    publishedToPortal: Boolean(createdArticleSlug),
    articleSlug: createdArticleSlug,
    listmonkCampaignId: createdCampaignId,
    campaignStatus,
    idempotencyKey,
    editionId,
    scheduledPosts,
    executionTimeMs,
    sourcesAttempted: collectionResult.sourcesAttempted,
    candidatesFound: collectionResult.candidates.length,
    duplicatesCount,
    windowHours: collectionResult.windowHours,
    rankedCandidatesCount: ranked.length,
    selectedStoriesCount: pipelineResult.selectedCandidates.length,
    edition: pipelineResult.edition,
    qaResult: pipelineResult.qaResult,
    htmlContent,
    wordCount,
    tokens: pipelineResult.totalUsage,
    /**
     * Os três ramos, quando ligados: as peças prontas para a fila, e o custo
     * do dia por ramo. Ausente com os ramos em `off`.
     */
    ramos: modoRamos !== "off" ? { modo: modoRamos, pecas: pecasDoDia, custos: livro.porRamo() } : undefined,
  };
}


/**
 * As formas do assunto das últimas edições do projeto, ANTES do dia da edição
 * (06/10/2026). A edição do próprio dia fica de fora: rodar de novo no mesmo
 * dia não pode empurrar o rodízio para a frente.
 *
 * Lê `subject_form` quando a coluna existe; sem ela (antes da migration), lê
 * só o assunto e a forma sai da inferência pelo texto. Qualquer outra falha
 * devolve lista vazia, e o rodízio começa por "pergunta".
 */
export async function formasRecentesDoAssuntoDoProjeto(
  projectId: string,
  antesDe: string,
  cliente?: ReturnType<typeof getSupabaseAdminClient>,
): Promise<Array<FormaDoAssunto | null>> {
  try {
    const supabase = cliente ?? getSupabaseAdminClient();
    const ler = (colunas: string) =>
      supabase
        .from("news_editions")
        .select(colunas)
        .eq("project_id", projectId)
        .lt("edition_date", antesDe)
        .order("edition_date", { ascending: false })
        .limit(5);
    let { data, error } = await ler("subject, subject_form");
    if (error && /subject_form/.test(error.message)) ({ data, error } = await ler("subject"));
    if (error) throw new Error(error.message);
    return formasDasEdicoes((data ?? []) as unknown as EdicaoParaORodizio[]);
  } catch (erro) {
    console.warn(`[NEWSROOM] não consegui ler as formas do assunto das edições anteriores: ${(erro as Error).message}`);
    return [];
  }
}
