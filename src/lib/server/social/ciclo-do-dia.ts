import { modoDoTermometro, pautasAtrasadas, termometroDoDia } from "../editorial/termometro-do-dia";
import type { EstadoAtual } from "../editorial/termometro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PautaAvaliada } from "../editorial/guarda";
import type { RegistroHistorico } from "../editorial/history";
import type { ConfigEditorial } from "../editorial/config";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { montarPacotesDasPautas } from "../editorial/pacote-factual";
import { conferirFinalistas } from "../editorial/finalistas";
import type { ResultadoDosFinalistas } from "../editorial/finalistas";
import { criarCandidatosStore } from "../editorial/candidatos-store";
import { imagemDaPauta } from "../visual/acervo/imagem-da-pauta";
import { acervoDoProjeto } from "../visual/acervo/acervo";
import { buscarSegundaFoto } from "../visual/resolver";
import { detectarRostos } from "../visual/rostos-na-foto";
import { carregarConfigSocial, SOCIAL_PERSISTENCE_UNAVAILABLE } from "./selecao";
import { limitarTetoDoDia, poolDoInstagram } from "../ramos/selecao";
import { criarSocialPostsStore } from "./social-posts-store";
import { opcoesDaFilaParaOStore, projetoDaFila } from "../aprovacao/integracao";
import { modoDoPipelineSocial } from "./modo";
import type { ModoSocial, ResumoVisualDoDia } from "./modo";
import type { ProjetoComCapacidades } from "../capacidades";
import { rodarCicloSocial } from "./pipeline-v2";
import { ehCitacaoDeFamoso } from "../editorial/classificador";
import { calorNoPoolDoInstagram } from "./calor-no-feed";
import { fontesPadraoDoCalor, modoDoCalor, type FontesDoCalor } from "../editorial/calor-do-dia";
import { comHistoricoDoFeed, foraDoFeed, lerHistoricoDoFeed } from "./historico-do-feed";
import { moldesLigados } from "./moldes-do-feed";
import { modoDaFila } from "../aprovacao/modo";
import { criarFilaStore } from "../aprovacao/fila-store";
import { aprendizadoDoCanal, aprendizadoVazio, type AprendizadoDoCanal } from "../aprendizado/do-canal";
import { comFotoDoCanal } from "../aprendizado/imagem";
import { aprenderNaSelecao } from "../aprendizado/selecao";
import { moldesComAprendizado } from "../aprendizado/arte";
import {
  decisorDeFormato,
  historicoDoEvergreen,
  pacotesDoEvergreen,
  prepararEvergreen,
  verificadorDeClaims,
} from "./evergreen/ciclo";
import { modoDoEvergreen } from "./evergreen/modo";
import { decisorDoDia, modoDoCarrosselDaNoticia } from "./carrossel/modo";
import { fotosDoCarrossel } from "./carrossel/fotos";
import { textoDoSlide } from "./carrossel/guarda";
import { papeisDoModelo } from "./carrossel/estrutura";
import { resolveVisualAsset } from "../visual/resolver";
import { fotosUsadasRecentemente } from "../visual/memoria-de-fotos";
import type { UsoAnterior } from "./evergreen/tipos";
import type { DiagnosticoDoEvergreen, OpcoesDoEvergreen, ResultadoDoEvergreen } from "./evergreen/ciclo";
import type { MarcaSocial } from "./copy";
import type { OpcoesDoCiclo, ResultadoDoCicloSocial } from "./pipeline-v2";
import { bancosOficiaisLigados } from "../visual/bancos-oficiais/modo";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import type { CandidatasNaoGravadas, LeituraDeCandidatasFalhou } from "../avisos/avisos";
import { avisarCandidatasNaoGravadasNoBanco, avisarLeituraDeCandidatasFalhouNoBanco } from "../avisos/candidatas";

/**
 * O dia do Instagram, a partir do trabalho editorial que a newsletter também usa.
 *
 * Este módulo existe por causa de uma regra de produto: o Instagram NÃO depende
 * de a newsletter fechar edição. São dois consumidores do mesmo upstream, e não
 * um dentro do outro.
 *
 * A consequência prática está no ponto onde ele é chamado: logo depois da
 * guarda editorial, com o `approvedEditorialPool` na mão, e ANTES da composição
 * da newsletter e do mínimo de duas pautas. Um dia com três pautas aprovadas em
 * que a newsletter leva só uma e cancela por mínimo é um dia normal para o
 * feed — e era justamente o dia que o Instagram perdia se dependesse da edição.
 *
 * O que ele NÃO faz, e é deliberado: não fala com a Meta, não chama o worker,
 * não mexe em `news_editions`, e não decide nada sobre a newsletter. Em
 * `enforce` ele grava linhas `scheduled` em `social_posts`, e quem publica é o
 * worker, no horário da vaga.
 */

/** O que o newsroom devolve sobre o social, para amanhã se saber se rodou. */
export type DiagnosticoSocialDoDia = {
  mode: ModoSocial;
  /** Se o ciclo chegou a rodar. Em `off` é sempre false. */
  executed: boolean;
  /** Pautas aprovadas na linha editorial que foram oferecidas ao social. */
  candidates: number;
  /** Quantas o verificador confirmou. */
  verified: number;
  /** Quantas sobreviveram à composição do feed e viraram post. */
  selected: number;
  /** Linhas gravadas em `social_posts`. Sempre 0 fora de `enforce`. */
  scheduled: number;
  /** Descartadas em qualquer etapa, com o motivo agrupado. */
  skipped: number;
  skippedReasons: Record<string, number>;
  /** Falha técnica. Nunca derruba a newsletter. */
  errors: string[];
  /** O que o conteúdo permanente fez hoje. Ausente quando a flag está off. */
  evergreen?: DiagnosticoDoEvergreen;
  /** O que o resolvedor de imagem fez hoje, com motivo. */
  visual?: ResumoVisualDoDia;
  /**
   * A gravação das candidatas falhou nesta execução, e os posts seguiram
   * (06/10/2026). Os erros com o texto do banco; ausente quando gravou.
   */
  candidatasNaoGravadas?: string[];
  /**
   * A LEITURA das candidatas falhou nesta execução (06/10/2026), com o texto
   * do banco. Com ela a notícia do dia fica fechada (decisão do dono), e o
   * campo diz por quê ao lado do `bloqueio` gravado. Ausente quando leu.
   */
  candidatasNaoLidas?: string[];
};

export function diagnosticoSocialAusente(mode: ModoSocial = "off"): DiagnosticoSocialDoDia {
  return {
    mode,
    executed: false,
    candidates: 0,
    verified: 0,
    selected: 0,
    scheduled: 0,
    skipped: 0,
    skippedReasons: {},
    errors: [],
  };
}

export type OpcoesDoSocialDoDia = {
  projectId: string;
  projectSlug: string;
  editionDate: string;
  marca: MarcaSocial;
  historico: RegistroHistorico[];
  /**
   * O que o feed já levou na janela de repetição, lido de `social_posts`
   * (06/10/2026). Ausente, o ciclo lê do banco; presente, é usado como veio.
   * Injetável para o teste e para quem já leu.
   */
  historicoDoFeed?: RegistroHistorico[];
  config: ConfigEditorial;
  client: SupabaseClient;
  /**
   * Se a LEITURA das candidatas falhou: o social fecha em cima disso.
   *
   * Até 06/10/2026 valia para qualquer erro da camada, gravação inclusive, e
   * foi o que deixou o feed de 06/10 sem post de notícia. A gravação tem campo
   * próprio, abaixo, e não fecha nada.
   */
  persistenciaDegradada?: boolean;
  /**
   * Os erros da GRAVAÇÃO das candidatas nesta execução, com o texto do banco
   * (`reuso.errosDeGravacao` da guarda). Com eles os posts seguem, o
   * diagnóstico os grava e o Telegram recebe um aviso por dia. Ver
   * `candidatasNaoGravadasNoDia`, no fim deste arquivo.
   */
  candidatasNaoGravadas?: string[];
  /**
   * Os erros da LEITURA das candidatas, com o texto do banco. Vão para o
   * diagnóstico, para o bloqueio `SOCIAL_PERSISTENCE_UNAVAILABLE` gravar o
   * porquê junto: em 06/10/2026 ele foi gravado sem erro nenhum.
   *
   * ATUALIZADO no mesmo dia, por decisão do dono: o bloqueio continua, e
   * quando ele de fato segura os posts o Telegram recebe um aviso por dia.
   * Ver `leituraDasCandidatasNoDia`, no fim deste arquivo.
   */
  candidatasNaoLidas?: string[];
  /** Quem manda o aviso. Injetável no teste; ausente, o de verdade (`avisos/candidatas.ts`). */
  avisarCandidatasNaoGravadas?: (falha: CandidatasNaoGravadas) => Promise<unknown>;
  /** Quem manda o aviso da leitura que falhou. Injetável no teste; ausente, o de verdade. */
  avisarLeituraDeCandidatasFalhou?: (falha: LeituraDeCandidatasFalhou) => Promise<unknown>;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /** Relógio, só para simulação de dia passado. Ausente em produção. */
  agoraMs?: number;
  /** Força o modo. Usado pelo dry-run de linha de comando, que nunca publica. */
  modoForcado?: ModoSocial;
  /**
   * O projeto, para as capacidades declaradas nele vencerem o ambiente.
   *
   * Opcional porque a mudança é aditiva: sem projeto, tudo lê o ambiente
   * exatamente como lia antes da plataforma multi-projeto existir.
   */
  projeto?: ProjetoComCapacidades | null;
  /**
   * O que o canal do Instagram aprendeu com a fila (06/10/2026). Ausente, é
   * lido do banco quando a fila do projeto está fora de `off`. Injetável para
   * o teste.
   */
  aprendizado?: AprendizadoDoCanal;
  /**
   * Teto de posts do dia no ramo próprio do Instagram (RF-15, 05/10/2026).
   *
   * Ausente, vale `SOCIAL_POSTS_MAX_PER_DAY` como sempre. Presente, só pode
   * BAIXAR o teto: o ramo pede cinco, e um ambiente que já pede menos continua
   * valendo.
   */
  tetoDoDia?: number;
  /**
   * Candidatas que não vieram da coleta do dia: perfis de referência e fontes
   * do feed, construídos em paralelo. Entram no pool e passam pela mesma
   * verificação e composição. Ausente, o pool é o de sempre.
   */
  candidatasExtras?: PautaAvaliada[];
  /**
   * Sem pacote factual, sem post (RF-05).
   *
   * No fluxo de antes, a pauta cujo pacote falhava ia para a copy com o texto
   * cru da matéria. No ramo próprio o pacote é a única matéria-prima, então a
   * pauta sem ele sai do dia. Ausente, o comportamento é o de antes.
   */
  exigirPacoteFactual?: boolean;
  /**
   * As fontes de sinal do calor (06/10/2026), injetáveis no teste. Ausentes,
   * valem as de verdade, e só são chamadas com a capacidade `calor` fora de
   * `off`.
   */
  fontesDoCalor?: FontesDoCalor;
  /*
   * Injetados só em teste, pelas mesmas razões de sempre: um abre navegador e
   * escreve no Storage, o outro lê `prompt_campaigns` no banco. Em produção os
   * dois ficam ausentes e o ciclo usa os de verdade.
   */
  congelarArte?: OpcoesDoCiclo["congelarArte"];
  /** O congelamento de N slides, injetável nos testes e no preview. */
  congelarCarrossel?: OpcoesDoCiclo["congelarCarrossel"];
  /**
   * A verificação semântica das claims, injetável nos testes.
   *
   * Sem isto, o ciclo monta o verificador de verdade e ele chama o modelo: um
   * teste de integração passaria a depender de rede, e o dublê de modelo
   * responderia copy no lugar de claims, o que derruba o post por auditoria
   * não realizada.
   */
  verificarClaims?: OpcoesDoCiclo["verificarClaims"];
  resolverKeyword?: OpcoesDoCiclo["resolverKeyword"];
  /**
   * Conteúdo permanente para as vagas que a notícia deixou.
   *
   * Estes são SUBSTITUIÇÕES para teste e para o preview, não o interruptor.
   *
   * Elas eram o interruptor, e foi assim que o canal inteiro ficou
   * inalcançável: `prepararEvergreen` só rodava quando alguém se lembrava de
   * passar este campo, e ninguém passava no caminho de produção. Com
   * `SOCIAL_EVERGREEN_V2=enforce` o dia continuaria sem um único post
   * permanente, sem erro nenhum para investigar.
   *
   * Agora quem decide é a flag, dentro de `prepararEvergreen`, e em `off` ela
   * volta antes de qualquer trabalho: nenhuma chamada de rede, nenhum custo.
   * Este campo só existe para o teste injetar lastro falso e para o preview
   * forçar o modo.
   */
  evergreen?: Omit<
    OpcoesDoEvergreen,
    "noticiasNoDia" | "maximoPorDia" | "agoraMs" | "projectId" | "historico"
  > & {
    agoraMs?: number;
    /**
     * O histórico de uso, quando quem chama quiser ditá-lo.
     *
     * Opcional porque o ciclo o lê do banco: era obrigatório e ninguém passava,
     * o que fazia o cooldown operar sobre lista vazia. Passar aqui é para teste
     * e para simulação de sete dias.
     */
    historico?: UsoAnterior[];
  };
};

export type ResultadoDoSocialDoDia = {
  diagnostico: DiagnosticoSocialDoDia;
  ciclo: ResultadoDoCicloSocial | null;
  conferencia: Awaited<ReturnType<typeof conferirFinalistas>> | null;
  evergreen?: ResultadoDoEvergreen | null;
};

/**
 * Roda o ciclo social do dia sobre o pool já aprovado.
 *
 * Em `off` ele sai na primeira linha: nenhuma chamada ao verificador, nenhum
 * token gasto, nenhum navegador aberto. É o que torna a integração inócua
 * enquanto a flag não for ligada.
 */
/**
 * Os atores na ordem em que a foto os procura. Na citação de famoso, quem fala
 * primeiro, uma vez só; nos demais casos, a ordem do classificador.
 */
export function atoresParaAFoto(pauta: Pick<PautaAvaliada, "classificacao">): string[] {
  const atores = pauta.classificacao.atores ?? [];
  const quem = ehCitacaoDeFamoso(pauta.classificacao) ? pauta.classificacao.quem_fala!.trim() : "";
  if (!quem) return atores;
  const chave = quem.toLowerCase();
  return [quem, ...atores.filter((a) => a.toLowerCase() !== chave)];
}

export async function rodarSocialDoDia(
  approvedEditorialPool: PautaAvaliada[],
  opcoes: OpcoesDoSocialDoDia,
): Promise<ResultadoDoSocialDoDia> {
  const resultado = await cicloSocialDoDia(approvedEditorialPool, opcoes);
  await leituraDasCandidatasNoDia(resultado, opcoes);
  await candidatasNaoGravadasNoDia(resultado, opcoes);
  return resultado;
}

/**
 * A gravação das candidatas falhou, e o dia seguiu (06/10/2026).
 *
 * Fica registrado no diagnóstico (que `diagnostico-gravado.ts` leva para
 * `platform_events`) e, quando o ciclo é de verdade, vira UM aviso no Telegram
 * por dia. Em ensaio não se avisa: o aviso diz que os posts seguiram, e em
 * ensaio não há post. O aviso nunca derruba o ciclo.
 */
async function candidatasNaoGravadasNoDia(
  resultado: ResultadoDoSocialDoDia,
  opcoes: OpcoesDoSocialDoDia,
): Promise<void> {
  const d = resultado.diagnostico;
  if (d.mode === "off") return;

  const erros = opcoes.candidatasNaoGravadas ?? [];
  if (erros.length === 0) return;

  d.candidatasNaoGravadas = erros;
  d.errors.push(...erros.map((e) => `candidatas não gravadas, posts seguiram: ${e}`));

  if (d.mode !== "enforce") return;
  const falha: CandidatasNaoGravadas = { dia: opcoes.editionDate, erros, postsGravados: d.scheduled };
  try {
    await (opcoes.avisarCandidatasNaoGravadas ??
      ((f: CandidatasNaoGravadas) => avisarCandidatasNaoGravadasNoBanco(opcoes.client, opcoes.projectId, f)))(falha);
  } catch (erro) {
    console.warn(`[SOCIAL V2] aviso de candidatas não gravadas falhou: ${(erro as Error)?.message ?? erro}`);
  }
}

/**
 * A leitura das candidatas falhou, e a notícia do dia ficou fechada
 * (decisão do dono, 06/10/2026).
 *
 * O bloqueio fica: sem a leitura o pool é reclassificado do zero, e o sorteio
 * do classificador volta a decidir o que vai ao ar. O que não fica é o
 * silêncio. Em 06/10 o mesmo bloqueio custou o dia inteiro, e o motivo só
 * apareceu por eliminação.
 *
 * O erro vai sempre para o diagnóstico (fora de `off`). O aviso só sai quando
 * o bloqueio SEGUROU os posts de verdade, e isso só acontece em `enforce`: a
 * composição só acende `SOCIAL_PERSISTENCE_UNAVAILABLE` quando vai publicar
 * (`paraPublicar`). Em ensaio nada seria publicado de qualquer jeito, então
 * dizer "os posts foram segurados" seria mentir, que é a regra dos avisos; é
 * a mesma escolha do aviso de candidatas não gravadas. Leitura que falhou num
 * dia em que o ciclo nem chegou à composição (pool vazio, feed ilegível)
 * também não avisa: não havia post para segurar, e o diagnóstico guarda o erro.
 *
 * Vale para a manhã e para a tarde (`quente-da-tarde-ciclo.ts`), que passam
 * pelo mesmo `rodarSocialDoDia`; a chave `tipo:dia` faz as duas falhas do
 * mesmo dia virarem uma mensagem. O aviso nunca derruba o ciclo.
 */
async function leituraDasCandidatasNoDia(
  resultado: ResultadoDoSocialDoDia,
  opcoes: OpcoesDoSocialDoDia,
): Promise<void> {
  const d = resultado.diagnostico;
  if (d.mode === "off") return;

  const erros = opcoes.candidatasNaoLidas ?? [];
  if (erros.length === 0) return;

  d.candidatasNaoLidas = erros;
  for (const e of erros) d.errors.push(`candidatas não lidas: ${e}`);

  const composicao = resultado.ciclo?.composicao;
  if (d.mode !== "enforce" || composicao?.bloqueio !== SOCIAL_PERSISTENCE_UNAVAILABLE) return;

  const falha: LeituraDeCandidatasFalhou = {
    dia: opcoes.editionDate,
    erros,
    postsSegurados: composicao.escolhidas.length,
  };
  try {
    await (opcoes.avisarLeituraDeCandidatasFalhou ??
      ((f: LeituraDeCandidatasFalhou) => avisarLeituraDeCandidatasFalhouNoBanco(opcoes.client, opcoes.projectId, f)))(falha);
  } catch (erro) {
    console.warn(`[SOCIAL V2] aviso de leitura de candidatas falhou: ${(erro as Error)?.message ?? erro}`);
  }
}

async function cicloSocialDoDia(
  approvedEditorialPool: PautaAvaliada[],
  opcoes: OpcoesDoSocialDoDia,
): Promise<ResultadoDoSocialDoDia> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const modo = opcoes.modoForcado ?? modoDoPipelineSocial(env, opcoes.projeto);
  if (opcoes.candidatasExtras?.length) {
    approvedEditorialPool = poolDoInstagram(approvedEditorialPool, opcoes.candidatasExtras);
  }
  const diagnostico = diagnosticoSocialAusente(modo);
  diagnostico.candidates = approvedEditorialPool.length;

  if (modo === "off") return { diagnostico, ciclo: null, conferencia: null };

  /*
   * O feed não repete o que ele mesmo já levou (06/10/2026).
   *
   * O pool chega filtrado pela guarda com o histórico da NEWSLETTER, que é a
   * pergunta certa para o e-mail e a errada para o feed: 21 dos últimos 60
   * posts contavam 9 pautas em dias seguidos, a mesma candidata voltando ao
   * pool e virando post de novo. A pergunta ao canal é feita aqui, antes do
   * verificador, para ninguém pagar verificação de pauta que não pode sair. Ver
   * `historico-do-feed.ts`, que explica por que a fonte é `social_posts`.
   *
   * Feed ilegível tira a notícia do dia, pela regra da persistência degradada:
   * sem antirrepetição o feed não publica. O evergreen tem histórico próprio e
   * segue a régua dele.
   */
  let historicoDoFeed = opcoes.historicoDoFeed ?? null;
  let feedIlegivel = "";
  if (historicoDoFeed === null) {
    try {
      historicoDoFeed = await lerHistoricoDoFeed(opcoes.client, opcoes.projectId, opcoes.config?.janelaDeDias || 30, {
        excetoData: opcoes.editionDate,
        agoraMs: opcoes.agoraMs,
      });
    } catch (erro) {
      feedIlegivel = `feed do Instagram ilegível: ${(erro as Error).message}`;
      console.warn(`[SOCIAL V2] notícia fora do dia: ${feedIlegivel}`);
    }
  }
  const historicoDoCanal = comHistoricoDoFeed(opcoes.historico, historicoDoFeed ?? []);
  const doFeed = feedIlegivel
    ? {
        pool: [] as PautaAvaliada[],
        repetidas: approvedEditorialPool.map((p) => ({ storyId: p.storyId, titulo: p.grupo.primary.title, motivo: feedIlegivel })),
      }
    : foraDoFeed(approvedEditorialPool, historicoDoCanal, opcoes.config);
  for (const r of doFeed.repetidas) {
    console.log(`[SOCIAL V2] já no feed, fora: ${r.titulo.slice(0, 70)} :: ${r.motivo}`);
  }
  approvedEditorialPool = doFeed.pool;
  const motivoDoFeed = feedIlegivel ? "INSTAGRAM_HISTORY_UNREADABLE" : "ALREADY_ON_INSTAGRAM";
  const cortesDoFeed: Record<string, number> = doFeed.repetidas.length ? { [motivoDoFeed]: doFeed.repetidas.length } : {};
  if (feedIlegivel) diagnostico.errors.push(feedIlegivel);

  const configSocial = limitarTetoDoDia(carregarConfigSocial(env), opcoes.tetoDoDia);

  /*
   * O calor (06/10/2026), antes dos finalistas: é a ordem do pool que decide
   * quem é verificado. Em `off` nada é chamado; em `dry_run` o pool volta o
   * mesmo e o que mudaria vai para `platform_events`; em `enforce` a nota leva
   * o calor somado. Falha aqui nunca derruba o dia: o pool segue como veio.
   */
  const modoCalor = modoDoCalor(opcoes.projeto);
  if (modoCalor !== "off") {
    try {
      const comCalor = await calorNoPoolDoInstagram(approvedEditorialPool, {
        modo: modoCalor,
        fontes:
          opcoes.fontesDoCalor ??
          fontesPadraoDoCalor({ client: opcoes.client, projectId: opcoes.projectId, env, fetcher, agoraMs: opcoes.agoraMs }),
        configSocial,
        client: opcoes.client,
        projectId: opcoes.projectId,
        editionDate: opcoes.editionDate,
        agoraMs: opcoes.agoraMs,
      });
      approvedEditorialPool = comCalor.pool;
      for (const l of comCalor.linhas) console.log(l);
    } catch (erro) {
      console.warn(`[CALOR] não rodou, o pool segue sem calor: ${(erro as Error)?.message ?? erro}`);
    }
  }

  /*
   * O termômetro (28/10/2026): o estado atual da história de cada pauta, para
   * a guarda do post segurar a etapa superada ("viaja" quando já "chegou").
   * Em `dry_run` só diz no log quais pautas a trava seguraria pela manchete de
   * origem; em `enforce` o estado vai para a guarda. Falha nunca derruba o dia.
   */
  let estadosAtuais: Map<string, EstadoAtual> | undefined;
  const modoTermometro = modoDoTermometro(opcoes.projeto);
  if (modoTermometro !== "off") {
    try {
      const t = await termometroDoDia(
        approvedEditorialPool,
        opcoes.fontesDoCalor ??
          fontesPadraoDoCalor({ client: opcoes.client, projectId: opcoes.projectId, env, fetcher, agoraMs: opcoes.agoraMs }),
        opcoes.agoraMs,
      );
      for (const l of t.linhas) console.log(l);
      for (const a of pautasAtrasadas(approvedEditorialPool, t.estados)) {
        console.log(`[TERMOMETRO] ${modoTermometro === "enforce" ? "segura" : "seguraria"} ${a.storyId}: ${a.motivo}`);
      }
      if (modoTermometro === "enforce") estadosAtuais = t.estados;
    } catch (erro) {
      console.warn(`[TERMOMETRO] não rodou, a trava fica de fora hoje: ${(erro as Error)?.message ?? erro}`);
    }
  }

  const candidatosStore = criarCandidatosStore(opcoes.client);

  /*
   * A verificação de finalistas, que é do social e não da newsletter.
   *
   * Ela reaproveita a classificação já persistida: o `store` é o mesmo que a
   * guarda usou, então pauta verificada por um canal não é paga de novo pelo
   * outro. É o que faz "compartilhar upstream" ser literal e não retórico.
   */
  /*
   * Sem pool aprovado não se chama o verificador: não há o que verificar, e a
   * chamada custaria tokens para devolver listas vazias. O dia continua, porque
   * o evergreen pode sustentá-lo sozinho.
   */
  const conferencia: ResultadoDosFinalistas =
    approvedEditorialPool.length > 0
      ? await conferirFinalistas(approvedEditorialPool, {
          canal: "instagram",
          vagas: configSocial.maximoPorDia,
          config: opcoes.config,
          store: candidatosStore,
          projectId: opcoes.projectId,
          env,
          fetcher,
        })
      : {
          confirmadas: [],
          recusadas: [],
          emConflito: [],
          naoConferidas: [],
          diagnostico: {
            finalistas: 0,
            verificadasAgora: 0,
            reaproveitadasDoBanco: 0,
            chamadasAoVerificador: 0,
            tokens: 0,
            custoUsd: 0,
          },
          linhasDeLog: [],
        };

  diagnostico.verified = conferencia.confirmadas.length;
  diagnostico.executed = true;
  diagnostico.skipped = conferencia.recusadas.length + conferencia.emConflito.length + doFeed.repetidas.length;
  diagnostico.skippedReasons = {
    VERIFIED_REJECT: conferencia.recusadas.length,
    EDITORIAL_CLASSIFICATION_CONFLICT: conferencia.emConflito.length,
    ...cortesDoFeed,
  };

  /*
   * O pacote factual é o que ancora a copy. Sem ele o gerador escreve sobre o
   * título, e escrever sobre o título é como se inventa detalhe.
   */
  const pacotes = new Map<string, PacoteFactual>();
  if (conferencia.confirmadas.length > 0) {
    const construcao = await montarPacotesDasPautas(
      conferencia.confirmadas.map((p) => ({
        url: p.grupo.primary.url,
        titulo: p.grupo.primary.title,
        texto: p.enriquecimento?.texto ?? "",
        urls: [p.grupo.primary.url],
      })),
      env,
      fetcher,
    );
    const porUrl = new Map(conferencia.confirmadas.map((p) => [p.grupo.primary.url, p.storyId]));
    for (const [url, pacote] of construcao.pacotes.entries()) {
      const storyId = porUrl.get(url);
      if (storyId) pacotes.set(storyId, pacote);
    }
  }

  if (opcoes.exigirPacoteFactual) {
    const semPacote = conferencia.confirmadas.filter((p) => !pacotes.has(p.storyId));
    if (semPacote.length > 0) {
      conferencia.confirmadas = conferencia.confirmadas.filter((p) => pacotes.has(p.storyId));
      diagnostico.skipped += semPacote.length;
      diagnostico.skippedReasons.NO_FACTUAL_PACKAGE = semPacote.length;
      diagnostico.verified = conferencia.confirmadas.length;
    }
  }

  const candidatas = await candidatosStore.buscarPorStoryIds(
    opcoes.projectId,
    conferencia.confirmadas.map((p) => p.storyId),
  );

  /*
   * A prova de verificação, quando a candidata não foi gravada (06/10/2026).
   *
   * O Social Guard só deixa sair notícia com veredito `confirm` (`podePublicar`),
   * e lê esse veredito da linha de `news_candidates`. Quando a gravação das
   * candidatas falha, a linha não existe, o verificador não tem onde gravar o
   * veredito, e TODO post de notícia cairia como `SOCIAL_REJECT_UNVERIFIED`:
   * tirar o bloqueio da composição sem isto trocaria um dia sem post por outro
   * dia sem post, mais caro, com a copy paga e recusada.
   *
   * A regra da guarda não muda: só sai o que o verificador confirmou. O que
   * muda é de onde vem a prova, e só para as pautas sem linha no banco: o
   * veredito desta mesma execução, que é o que estaria gravado se a gravação
   * tivesse dado certo. Pauta que o verificador recusou ou pôs em conflito não
   * está em `confirmadas` e continua de fora. Sem `id`, o post é gravado com
   * `candidate_id` nulo, como o evergreen.
   */
  if ((opcoes.candidatasNaoGravadas ?? []).length > 0) {
    for (const p of conferencia.confirmadas) {
      if (candidatas.has(p.storyId)) continue;
      candidatas.set(p.storyId, {
        status: "approved",
        verificacao: {
          status: "confirm",
          motivo: "confirmada pelo verificador nesta execução; a candidata não foi gravada no banco",
          divergencias: [],
          verificadoEm: new Date().toISOString(),
          canal: "instagram",
          inputHash: "",
        },
      } as unknown as CandidataPersistida);
    }
  }

  /*
   * O evergreen entra aqui, e a posição não é arbitrária.
   *
   * Só agora se sabe quantas notícias o dia tem de verdade — depois da linha
   * editorial e do verificador —, e é esse número que define as vagas
   * restantes. Calcular antes usaria o pool aprovado, que é maior que o que
   * vira post, e o dia estouraria o teto.
   */
  /*
   * O histórico do evergreen vem do banco, e ninguém o lia.
   *
   * `prepararEvergreen` exige o histórico e o caminho de produção não passava
   * nenhum, o que fazia o cooldown de 30 dias e a janela de 7 dias operarem
   * sobre uma lista vazia: o mesmo par tópico e ângulo poderia voltar todo dia.
   * A leitura é feita aqui porque é aqui que existe o cliente do banco.
   *
   * E é feita SÓ quando o modo não é `off`: em `off` o dia não paga nem esta
   * consulta.
   */
  const modoEvergreen = opcoes.evergreen?.modoForcado ?? modoDoEvergreen(env, opcoes.projeto);
  const desde = new Date(
    (opcoes.evergreen?.agoraMs ?? opcoes.agoraMs ?? Date.now()) - 45 * 24 * 60 * 60 * 1000,
  ).toISOString();

  /*
   * Histórico que não pôde ser lido DESLIGA o evergreen do dia.
   *
   * Rodar a régua de repetição sobre uma lista vazia é pior que não rodar o
   * canal: o cooldown de 30 dias e a janela de 7 dias passariam a permitir
   * exatamente o post de ontem. Um dia sem conteúdo permanente é uma perda
   * pequena; repetir o post de ontem é o defeito que o catálogo inteiro existe
   * para impedir.
   */
  let historicoEvergreen = opcoes.evergreen?.historico ?? null;
  let evergreenBloqueado = "";

  if (historicoEvergreen === null && modoEvergreen !== "off") {
    try {
      historicoEvergreen = await historicoDoEvergreen(opcoes.client, opcoes.projectId, desde);
    } catch (erro) {
      evergreenBloqueado = `histórico do evergreen ilegível: ${(erro as Error).message}`;
      console.warn(`[SOCIAL V2] evergreen desligado hoje: ${evergreenBloqueado}`);
    }
  }

  const evergreen = await prepararEvergreen({
    ...(opcoes.evergreen ?? {}),
    ...(evergreenBloqueado ? { modoForcado: "off" as const } : {}),
    historico: historicoEvergreen ?? [],
    projectId: opcoes.projectId,
    noticiasNoDia: conferencia.confirmadas.length,
    maximoPorDia: configSocial.maximoPorDia,
    programasDaNoticia: conferencia.confirmadas.flatMap((p) => p.classificacao.atores ?? []),
    agoraMs: opcoes.evergreen?.agoraMs ?? opcoes.agoraMs ?? Date.now(),
    env,
    fetcher,
  });

  /*
   * O diagnóstico do evergreen é anexado AQUI, e não no retorno final.
   *
   * No fim, ele não existia nos retornos antecipados: um dia sem notícia e sem
   * evergreen voltava com `diagnostico.evergreen` ausente, e ausente é
   * indistinguível de "o canal não rodou". É exatamente o tipo de silêncio que
   * fez este canal ficar sem chamador sem ninguém notar.
   */
  diagnostico.evergreen = evergreenBloqueado
    ? { ...evergreen.diagnostico, semLastro: [{ item: "-", motivo: evergreenBloqueado }] }
    : evergreen.diagnostico;

  for (const [chave, candidata] of evergreen.candidatas) candidatas.set(chave, candidata);
  for (const [chave, pacote] of pacotesDoEvergreen(evergreen.lastros)) pacotes.set(chave, pacote);

  /*
   * Nada de notícia e nada de permanente: o dia não tem o que publicar.
   *
   * Isto substitui o retorno antecipado que existia quando o verificador não
   * confirmava nada. Ele estava certo enquanto só a notícia alimentava o feed, e
   * passou a estar errado: um dia sem notícia é exatamente o dia em que o
   * evergreen tem mais valor, e o retorno antigo o impedia de rodar.
   */
  if (conferencia.confirmadas.length === 0 && evergreen.extras.length === 0) {
    return { diagnostico, ciclo: null, conferencia, evergreen };
  }

  /*
   * A memória de foto, carregada uma vez por ciclo.
   *
   * São duas janelas. `fotosDaEdicao` é compartilhada por todas as pautas de
   * hoje, e sem ela cada chamada criava o próprio conjunto vazio, o que fazia
   * o dedupe do dia não deduplicar nada: em 14/09/2026 dois posts do mesmo dia
   * saíram com a mesma foto. `fotosAntigas` alcança os dias anteriores, que é
   * o que o banco conceitual não tinha como saber sozinho.
   *
   * Falha de leitura não derruba o ciclo: sem memória o dia sai como saía
   * antes, e o risco é repetir foto, não ficar sem post.
   */
  const fotosDaEdicao = new Set<string>();
  let fotosAntigas: string[] = [];
  try {
    const desdeFoto = new Date(
      (opcoes.agoraMs ?? Date.now()) - 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
    fotosAntigas = await fotosUsadasRecentemente(opcoes.client, opcoes.projectId, desdeFoto);
  } catch (erro) {
    console.warn("[SOCIAL] Não consegui ler a memória de fotos:", erro);
  }

  /*
   * A pauta como o resolvedor de imagem a recebe, e as opções que a foto de
   * fundo e a busca extra da bolha compartilham.
   */
  const paraImagem = (pauta: PautaAvaliada) => ({
    storyId: pauta.storyId,
    titulo: pauta.grupo.primary.title,
    resumo: pauta.enriquecimento?.texto ?? "",
    categoria: pauta.classificacao.eixo,
    classificacao: {
      /*
       * Na citação de famoso, quem fala vai à frente (06/10/2026): o formato
       * pede a foto da PESSOA, e o resolvedor procura a entidade pela ordem
       * dos atores. Sem isto, a fala de Jensen Huang sobre data centers
       * podia sair com a foto da Nvidia ou de um galpão.
       */
      atores: atoresParaAFoto(pauta),
      lugares: pauta.classificacao.lugares,
      acontecimento: pauta.classificacao.acontecimento,
      pais: pauta.classificacao.pais,
    },
  });
  const projetoDaImagem = opcoes.projeto ? { ...opcoes.projeto, id: opcoes.projectId } : null;
  const opcoesDaImagem = {
    env,
    fetcher,
    somenteLeitura: true,
    jaUsadosNestaEdicao: fotosDaEdicao,
    jaUsadasRecentemente: fotosAntigas,
    /*
     * Os bancos oficiais do projeto (06/10/2026). Vai aqui, e não só em
     * `imagemDaPauta`, porque a foto do carrossel e a segunda foto da bolha
     * chamam o resolvedor direto, com estas mesmas opções.
     */
    bancosOficiais: bancosOficiaisLigados(opcoes.projeto),
  };

  /*
   * O que o Instagram aprendeu com as reprovações DELE (06/10/2026): a pauta
   * parecida com a recusada desce, a fonte ou o ator recusado três vezes sai,
   * a foto recusada não volta ao post, e o molde recusado três vezes sai da
   * escolha. Só com a fila fora de `off`; sem ela, nada é lido.
   */
  const aprendizado =
    opcoes.aprendizado ??
    (opcoes.projeto && modoDaFila(opcoes.projeto) !== "off"
      ? await aprendizadoDoCanal(criarFilaStore(opcoes.client), opcoes.projectId, "post", opcoes.agoraMs ?? Date.now())
      : aprendizadoVazio("post"));
  const doPool = aprenderNaSelecao(conferencia.confirmadas, aprendizado.selecao, "post");
  const moldesDoDia = moldesComAprendizado(moldesLigados(opcoes.projeto), aprendizado.arte);
  for (const l of [...doPool.linhas, ...moldesDoDia.linhas]) console.log(l);

  const modoCarrosselDaNoticia = modoDoCarrosselDaNoticia(opcoes.projeto);

  const ciclo = await rodarCicloSocial(doPool.pool, {
    projectId: opcoes.projectId,
    estadosAtuais,
    /*
     * Os moldes saem do projeto, do mesmo `settings` de onde saem as
     * capacidades, e por isso nenhum chamador precisou mudar. Projeto ausente
     * devolve todos ligados, que é como a esteira se comportava antes. Desde
     * 06/10/2026 o molde recusado três vezes pelo editor sai também.
     */
    moldes: moldesDoDia.moldes,
    slugDoProjeto: opcoes.projectSlug,
    editionDate: opcoes.editionDate,
    // A referência ao pool do dia, para a troca de pauta na fila (06/10/2026).
    poolDoDia: approvedEditorialPool.map((p) => p.storyId),
    marca: opcoes.marca,
    historico: opcoes.historico,
    pacotes,
    candidatas,
    persistenciaDegradada: opcoes.persistenciaDegradada,
    /*
     * O store só é passado em `enforce`, e isso é cinto sobre suspensório: o
     * ciclo já se recusa a gravar fora de enforce. Não entregar o store faz a
     * gravação ser impossível, e não apenas proibida.
     */
    store:
      modo === "enforce"
        ? criarSocialPostsStore(
            opcoes.client,
            // A fila de aprovação (05/10/2026): ausente ou `off`, objeto vazio e o store de sempre.
            opcoesDaFilaParaOStore(projetoDaFila(opcoes.projeto, opcoes.projectId), opcoes.client),
          )
        : null,
    config: configSocial,
    env: opcoes.modoForcado ? { ...env, SOCIAL_PIPELINE_V2: opcoes.modoForcado } : env,
    fetcher,
    agoraMs: opcoes.agoraMs,
    ...(evergreen.extras.length ? { extras: evergreen.extras } : {}),
    /*
     * O decisor de formato só existe quando há evergreen no dia.
     *
     * Sem ele, `gerarPostDaPauta` não pergunta nada e todo post é peça única,
     * que é o comportamento da notícia. É por isso que o carrossel não precisa
     * de nenhuma condição do lado do gerador: ele nasce desligado.
     */
    /*
     * A notícia em carrossel (06/10/2026) entra pelo mesmo gancho, atrás da
     * capacidade `carrossel_noticia`. Em `enforce` ela traz junto a verificação
     * semântica, pela mesma razão do conteúdo permanente: slide de prosa sem
     * número nem nome não tem o que a ancoragem determinística conferir.
     */
    ...(modoCarrosselDaNoticia === "enforce"
      ? {
          decidirCarrossel: decisorDoDia(
            evergreen.extras.length ? decisorDeFormato(evergreen.lastros) : null,
            modoCarrosselDaNoticia,
          )!,
          verificarClaims: opcoes.verificarClaims ?? verificadorDeClaims({ env, fetcher }),
          fotosDoCarrossel: async ({ post, visual }) => {
            const carrossel = post.carrossel!;
            const pauta = post.pauta;
            const pacote = pacotes.get(pauta.storyId) ?? null;
            return fotosDoCarrossel({
              pauta: paraImagem(pauta),
              quantas: papeisDoModelo(carrossel.papeis).length,
              fotoDaCapa: visual?.asset ?? null,
              pessoas: pacote?.people ?? [],
              textos: carrossel.slides.map((s) => textoDoSlide(s)),
              /*
               * Direto no resolvedor, e não por `imagemDaPauta`: aquela guarda
               * UMA resposta por pauta, e aqui a pergunta é repetida de
               * propósito para achar a segunda, a terceira e a quarta foto.
               */
              resolver: (alvo, jaUsadas) =>
                resolveVisualAsset(alvo, {
                  client: opcoes.client,
                  env,
                  fetcher,
                  somenteLeitura: true,
                  jaUsadosNestaEdicao: jaUsadas,
                  // Também por identidade, que ignora os parâmetros do endereço.
                  jaUsadasRecentemente: [...fotosAntigas, ...fotosDaEdicao, ...jaUsadas],
                  // O protagonista do carrossel em fotos diferentes: os bancos oficiais têm várias, e recentes.
                  bancosOficiais: opcoesDaImagem.bancosOficiais,
                }),
            });
          },
        }
      : evergreen.extras.length
      ? {
          decidirCarrossel: decisorDoDia(decisorDeFormato(evergreen.lastros), modoCarrosselDaNoticia)!,
          /*
           * A verificação semântica entra junto com o evergreen, e sai junto.
           *
           * É o mesmo princípio do decisor de formato: sem conteúdo permanente
           * no dia, o gerador não pergunta nada e a notícia não paga nem chamada
           * nem mudança de comportamento.
           */
          verificarClaims: opcoes.verificarClaims ?? verificadorDeClaims({ env, fetcher }),
        }
      : modoCarrosselDaNoticia === "dry_run"
      ? {
          // Só anota no log o que viraria carrossel; nenhum post muda.
          decidirCarrossel: decisorDoDia(null, "dry_run")!,
        }
      : {}),
    ...(opcoes.congelarArte ? { congelarArte: opcoes.congelarArte } : {}),
    ...(opcoes.congelarCarrossel ? { congelarCarrossel: opcoes.congelarCarrossel } : {}),
    ...(opcoes.resolverKeyword ? { resolverKeyword: opcoes.resolverKeyword } : {}),
    /*
     * Por `imagemDaPauta` (05/10/2026, integração): com o acervo em `enforce`
     * o post reusa a foto que o portal e a newsletter receberam para a mesma
     * pauta. Fora de `enforce` é repasse direto ao resolvedor, como antes.
     */
    resolverVisual: async (pauta) =>
      comFotoDoCanal(
        await imagemDaPauta(paraImagem(pauta), {
          client: opcoes.client,
          projeto: projetoDaImagem,
          opcoes: opcoesDaImagem,
        }),
        aprendizado.imagem,
        // A compartilhada que o post recusou: só o post resolve outra (06/10/2026).
        () =>
          imagemDaPauta(paraImagem(pauta), {
            client: opcoes.client,
            projeto: projetoDaImagem,
            ignorarReuso: true,
            opcoes: {
              ...opcoesDaImagem,
              jaUsadasRecentemente: [...fotosAntigas, ...aprendizado.imagem.evitar],
              ...(aprendizado.imagem.motivos.length ? { recusasDoEditor: aprendizado.imagem.motivos } : {}),
            },
          }),
      ),
    /*
     * A bolha sem rosto (06/10/2026). Os rostos da foto de fundo são
     * perguntados a um modelo de visão, com memória por URL, e só na vez da
     * bolha. Sem chave, a detecção falha e a capa sai sem bolha.
     */
    detectarRostos: (url) => detectarRostos(url, { env, fetcher }),
    /*
     * A busca extra da segunda foto, também só na vez da bolha e só quando o
     * resolvedor não trouxe vice. Mesmas memórias de foto do ciclo, e o acervo
     * pela mesma capacidade que a foto de fundo usa.
     */
    buscarSegundaFoto: (pauta, visual) =>
      buscarSegundaFoto(paraImagem(pauta), visual.asset ?? { imageUrl: "" }, visual.entidade ?? null, {
        ...opcoesDaImagem,
        client: opcoes.client,
        acervo: acervoDoProjeto(opcoes.client, projetoDaImagem),
      }),
  });

  diagnostico.selected = ciclo.previews.length;
  diagnostico.scheduled = ciclo.gravacao?.gravados ?? 0;
  diagnostico.skipped =
    conferencia.recusadas.length + conferencia.emConflito.length + ciclo.descartados.length + doFeed.repetidas.length;
  diagnostico.skippedReasons = {
    VERIFIED_REJECT: conferencia.recusadas.length,
    EDITORIAL_CLASSIFICATION_CONFLICT: conferencia.emConflito.length,
    ...cortesDoFeed,
  };
  for (const d of ciclo.descartados) {
    const chave = d.motivo.split(":")[0].trim();
    diagnostico.skippedReasons[chave] = (diagnostico.skippedReasons[chave] ?? 0) + 1;
  }
  diagnostico.errors = ciclo.gravacao?.erros ?? [];
  // O desfecho do resolvedor de imagem viaja junto: é o diagnóstico que
  // sobrevive ao bloqueio da newsletter, e é nele que a causa fica legível.
  if (ciclo.diagnostico.visual) diagnostico.visual = ciclo.diagnostico.visual;

  return { diagnostico, ciclo, conferencia, evergreen };
}
