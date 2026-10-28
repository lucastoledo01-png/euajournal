import type { PautaAvaliada } from "../editorial/guarda";
import type { RegistroHistorico } from "../editorial/history";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { EstadoAtual } from "../editorial/termometro";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import type { ResultadoVisual } from "../visual/tipos";
import { comporFeedSocial, carregarConfigSocial, topicoDaPauta } from "./selecao";
import type { ComposicaoSocial, ConfigSocial } from "./selecao";
import { carregarConfigDaAgenda, distribuirVagas } from "./agenda";
import type { Vaga } from "./agenda";
import { gerarPostsDoDia , type OpcoesDoGerador } from "./gerador";
import type { MarcaSocial } from "./copy";
import type { PostGerado } from "./gerador";
import { modoDoPipelineSocial, permiteEnforce, diagnosticoSocialVazio } from "./modo";
import type { ResumoVisualDoDia } from "./modo";
import type { DiagnosticoSocial, ModoSocial } from "./modo";
import { chaveDeIdempotencia, resolverOrigem } from "./social-posts-store";
import { ultimaTeveBolha } from "./ritmo-da-bolha";
import {
  decidirBolha,
  decidirBolhaDoMiolo,
  type BuscaDaSegundaFoto,
  type DecisaoDaBolha,
  type DeteccaoDeRostos,
} from "./bolha-sem-rosto";
import { CANVAS_DO_FEED } from "@/lib/carousel-templates/bolha";
import { TODOS_OS_MOLDES, type MoldesLigados } from "./moldes-do-feed";
import { alternarGramatica, recortesSeguidosNoFim, TETO_DE_RECORTES_SEGUIDOS } from "./ritmo-do-recorte";
import { chapeuDaPeca, gramaticaEfetiva } from "./arte";
import type { GramaticaDaCapa } from "./arte";
import type { PostParaGravar, SocialPostsStore } from "./social-posts-store";
import { mesmaKeyword, resolverKeywordCanonica } from "./keyword-canonica";
import type { ResolucaoDaKeyword } from "./keyword-canonica";
import { congelarArtefato, congelarCarrossel } from "./artefato";
import type { EntradaDoCarrossel, ResultadoDoCarrossel } from "./artefato";
import { entradasDoCarrossel } from "./carrossel/arte";
import { ehEstruturaDaNoticia } from "./carrossel/estrutura";
import { podarMioloSemFoto, type FotosDoCarrossel, type MioloPodado } from "./carrossel/fotos";
import { alternarFormatos } from "./carrossel/formato";
import { legendaDoInstagram, linhaDeCredito } from "./legenda-final";
import { comporFeedDoDia } from "./evergreen/compositor";
import type { DecisaoDeFormato } from "./carrossel/formato";
import type { EntradaDoCongelamento, ResultadoDoCongelamento } from "./artefato";
import { impressaoDoAcontecimento } from "../editorial/fingerprint";
import { entidadesDaClassificacao } from "../editorial/classificador";
import { criarFotosDoDia, selecionarComFoto, temFotoDaPauta } from "../ramos/sem-foto";
import { montarContexto } from "../aprovacao/contexto-de-producao";

/**
 * O ciclo social, do pool verificado ao objeto do post.
 *
 * O modo decide o que acontece com o resultado, e só isso. O cálculo é o mesmo
 * nos três: seleção, copy, guarda, reparo, imagem e agenda rodam igual, porque
 * um dry-run que executa um caminho diferente do de produção não diagnostica o
 * de produção.
 *
 *   off       nem entra. O caminho social atual segue inteiro.
 *   dry_run   calcula tudo e NÃO grava nada.
 *   enforce   grava, e está bloqueado por `permiteEnforce`.
 *
 * A escolha de não gravar em dry-run é deliberada e vale a explicação. A
 * tabela `social_posts` é a fila do worker antigo, e ele seleciona por
 * `platform`, `status` e `scheduled_at`, sem olhar a coluna `dry_run`. Uma
 * linha de diagnóstico com status `scheduled` seria publicada por ele no
 * horário. Ou se acrescenta um filtro no worker, que é mexer em produção, ou
 * o dry-run não escreve. Ele não escreve.
 */

export type PreviewDoPost = {
  posicao: number;
  vaga: Vaga;
  post: PostGerado;
  visual: ResultadoVisual | null;
  origem: ReturnType<typeof resolverOrigem>;
  candidateId: string | null;
  topicId: string;
  eventFingerprint: string;
  /** A chave que a gravação usaria. Exposta para o dry-run ser auditável. */
  chaveDeIdempotencia: string;
};

export type DescartePorEtapa = {
  titulo: string;
  storyId: string;
  etapa: "composicao" | "copy" | "visual" | "artefato";
  motivo: string;
};

export type ResultadoDoCicloSocial = {
  modo: ModoSocial;
  previews: PreviewDoPost[];
  descartados: DescartePorEtapa[];
  composicao: ComposicaoSocial | null;
  diagnostico: DiagnosticoSocial;
  /** Preenchido só em enforce liberado. */
  gravacao: { gravados: number; bloqueados: number; erros: string[] } | null;
  linhasDeLog: string[];
  /**
   * O que a bolha custou no ciclo: localizar rostos e, na vez da bolha, a
   * busca extra da segunda foto. Vai para o livro de custos do dia.
   */
  custoDaBolha?: { usd: number; tokens: number };
};

/**
 * O chapéu da peça (06/10/2026): o tema da lista fechada quando a pauta o
 * trata, senão a editoria. O texto é o que diz DE QUE o post trata: a
 * manchete, o título da fonte e o assunto declarado (no evergreen, o resumo
 * curado do catálogo, e não a página inteira do órgão).
 */
function chapeuDoPost(post: PostGerado): string {
  const enriquecimento = post.pauta.enriquecimento;
  return chapeuDaPeca({
    eixo: post.pauta.classificacao.eixo ?? "",
    textos: [
      post.copy.headline,
      post.pauta.grupo.primary.title,
      enriquecimento?.assuntoParaHashtags ?? enriquecimento?.texto ?? "",
    ],
  });
}

export type OpcoesDoCiclo = {
  projectId: string;
  /** O estado atual da história de cada pauta (termômetro em `enforce`). Ausente, a trava não roda. */
  estadosAtuais?: Map<string, EstadoAtual>;
  /**
   * Quais moldes de arte o feed pode usar.
   *
   * Ausente quer dizer todos, que é o comportamento anterior a esta opção
   * existir. Ver `moldes-do-feed.ts`: molde desligado não vira peça, e a peça
   * que não tem molde ligado não vira post.
   */
  moldes?: MoldesLigados;
  editionDate: string;
  marca: MarcaSocial;
  historico: RegistroHistorico[];
  pacotes?: Map<string, PacoteFactual>;
  candidatas?: Map<string, CandidataPersistida>;
  /** Resolve a imagem de uma pauta. Ausente, o ciclo roda sem imagem. */
  resolverVisual?: (pauta: PautaAvaliada) => Promise<ResultadoVisual | null>;
  /**
   * Onde estão os rostos da foto de fundo, como a peça a mostra (06/10/2026).
   *
   * Ausente, a vez da bolha passa sempre: sem saber onde estão os rostos, a
   * bolha não é desenhada. É a regra "falha de conferência é recusa".
   */
  detectarRostos?: (urlDaFoto: string) => Promise<DeteccaoDeRostos>;
  /**
   * Mais uma busca da foto do círculo, só na vez da bolha e só quando o
   * resolvedor não trouxe vice. Ausente, vale só a vice do resolvedor.
   */
  buscarSegundaFoto?: (pauta: PautaAvaliada, visual: ResultadoVisual) => Promise<BuscaDaSegundaFoto>;
  store?: SocialPostsStore | null;
  persistenciaDegradada?: boolean;
  /*
   * O relógio, para simulação de um dia que já passou.
   *
   * `distribuirVagas` nunca agenda no passado, e com razão. Rodando à noite um
   * dry-run de ontem, esse piso empurra a grade inteira para a madrugada
   * seguinte e esconde justamente o que se quer ver. Em produção fica
   * ausente, e o relógio é o de agora.
   */
  agoraMs?: number;
  config?: ConfigSocial;
  /**
   * Resolve a keyword canônica do CTA. Trocado só em teste.
   *
   * Ela entra aqui, e não em quem chama, porque o ciclo é o gargalo por onde
   * TODA copy do V2 passa. Deixar a decisão em cada chamador é como o valor se
   * espalhou por três lugares na primeira vez.
   */
  resolverKeyword?: (projectId: string) => Promise<ResolucaoDaKeyword>;
  /**
   * Congela a arte aprovada num arquivo, e devolve o hash dele.
   *
   * Só é chamado em `enforce`: em dry-run não existe post para publicar, e
   * subir arquivo para o Storage a cada simulação encheria o bucket de peças
   * que nunca vão ao ar.
   */
  congelarArte?: (entrada: EntradaDoCongelamento) => Promise<ResultadoDoCongelamento>;
  /**
   * O congelamento de N slides, injetável pela mesma razão que o de um.
   *
   * Separado do de peça única de propósito: o nome do arquivo é diferente
   * (`social-v2-01.png` contra `social-v2.png`), e passar o caminho da peça
   * única por uma função que indexa mudaria o nome dos artefatos da notícia sem
   * nenhum ganho.
   */
  congelarCarrossel?: (entrada: EntradaDoCarrossel) => Promise<ResultadoDoCarrossel>;
  /** Verificação semântica das claims. Ausente significa não rodar. */
  verificarClaims?: OpcoesDoGerador["verificarClaims"];
  /**
   * As fotos dos slides de conteúdo do carrossel de NOTÍCIA (06/10/2026).
   *
   * Ausente, o carrossel sai como antes: foto só na capa. Quem liga é a
   * capacidade `carrossel_noticia`, em `ciclo-do-dia.ts`, que monta isto com
   * o resolvedor de sempre (`carrossel/fotos.ts`).
   */
  fotosDoCarrossel?: (entrada: { post: PostGerado; visual: ResultadoVisual | null }) => Promise<FotosDoCarrossel>;
  /** Decide static ou carousel por pauta. Ausente significa tudo static. */
  decidirCarrossel?: (
    pauta: PautaAvaliada,
    pacote: PacoteFactual | null,
    comCta: boolean,
  ) => DecisaoDeFormato | null;
  /** Prefixo do caminho no bucket. Sem ele, o ciclo não congela e não grava. */
  slugDoProjeto?: string;
  /**
   * Pautas que entram DEPOIS da composição da notícia, sem passar por ela.
   *
   * É por aqui que o evergreen entra, e a escolha de não jogá-lo no `pool` tem
   * uma razão só: `comporFeedSocial` aplica as réguas de diversidade do
   * noticiário sobre tudo o que recebe, e um evergreen com nota menor poderia
   * fazer uma notícia válida perder vaga por teto de eixo. Notícia nunca perde
   * vaga para conteúdo permanente.
   *
   * Quem decide quantos cabem é quem chama: o compositor do dia calcula as
   * vagas restantes e só manda o que couber. Ausente, o ciclo é exatamente o
   * que era.
   */
  extras?: PautaAvaliada[];
  /**
   * O pool aprovado do dia, por `storyId` e em ordem, só para referência da
   * fila de aprovação (06/10/2026): a troca de pauta de um post reprovado na
   * seleção relê estas candidatas. Ausente, vale o pool que o ciclo recebeu.
   */
  poolDoDia?: string[];
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

/**
 * O tópico que vai para `topic_id`, na chave que a régua de repetição lê.
 *
 * O evergreen guarda a própria identidade no `storyId`, no formato
 * `evg:<tópico>:<ângulo>`, e a janela de tópico do evergreen procura por
 * `evg:<tópico>`. Quem gravava era `topicoDaPauta`, que é a regra da NOTÍCIA:
 * ela olha o texto e devolve `programa:eb5`, `org:uscis` ou `eixo:...`.
 *
 * As duas chaves nunca se encontravam. O efeito no feed foi exatamente o que a
 * janela existe para impedir: entre 12 e 14/09/2026 saíram nove posts perenes
 * sobre três assuntos, ajuste de status, processo consular e a comparação entre
 * os dois, três dias seguidos, com ângulos diferentes e o mesmo tema. O cooldown
 * do par funcionava, então nenhum ângulo repetiu; a janela do tópico estava
 * morta, então o assunto repetiu todo dia.
 *
 * Gravar a chave que a régua lê é o conserto. Regra que consulta uma chave e
 * grava outra não protege nada, e ainda parece protegida.
 */
function topicoDoPost(pauta: PautaAvaliada): string {
  const partes = pauta.storyId.split(":");
  if (partes[0] === "evg" && partes[1]) return `evg:${partes[1]}`;
  return topicoDaPauta(pauta);
}

export async function rodarCicloSocial(
  poolVerificado: PautaAvaliada[],
  opcoes: OpcoesDoCiclo,
): Promise<ResultadoDoCicloSocial> {
  const env = opcoes.env ?? process.env;
  const modo = modoDoPipelineSocial(env);
  const linhas: string[] = [];
  const diagnostico = diagnosticoSocialVazio(modo);

  if (modo === "off") {
    linhas.push("[SOCIAL V2] desligado, o caminho social atual segue inteiro");
    return { modo, previews: [], descartados: [], composicao: null, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  const liberacao = permiteEnforce(env);
  diagnostico.enforcePermitido = liberacao.permitido;
  diagnostico.motivoDoBloqueio = liberacao.motivo;

  const config = opcoes.config ?? carregarConfigSocial(env);
  const descartados: DescartePorEtapa[] = [];

  /*
   * A foto de cada pauta, com memória do ciclo. Ver o passo 1.5.
   */
  const fotos = opcoes.resolverVisual
    ? criarFotosDoDia<PautaAvaliada>((p) => p.storyId, (p) => opcoes.resolverVisual!(p))
    : null;

  // 1. Composição própria do feed.
  const compor = (excluir: ReadonlySet<string>) =>
    comporFeedSocial(
      excluir.size ? poolVerificado.filter((p) => !excluir.has(p.storyId)) : poolVerificado,
      config,
      {
        persistenciaDegradada: opcoes.persistenciaDegradada,
        paraPublicar: modo === "enforce",
      },
    );
  let composicao = compor(new Set());
  linhas.push(...composicao.linhasDeLog);
  diagnostico.candidatasNaFila = poolVerificado.length;
  diagnostico.bloqueio = composicao.bloqueio;

  for (const c of composicao.cortadas) {
    descartados.push({ titulo: c.titulo, storyId: "", etapa: "composicao", motivo: `${c.motivo}: ${c.detalhe}` });
  }

  if (composicao.bloqueio) {
    linhas.push(`[SOCIAL V2] ciclo bloqueado: ${composicao.bloqueio}`);
    return { modo, previews: [], descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  /*
   * 1.5. Pauta sem foto não vira post (decisão do dono, 05/10/2026).
   *
   * A imagem sai do título da fonte e da classificação, que existem antes da
   * copy. Então a pauta sem foto real cai AQUI, antes de alguém pagar para
   * escrever o post, e a composição é refeita sem ela: a vaga vai para a
   * próxima elegível, e o dia não encolhe. Até 05/10 a pauta sem foto saía
   * com a bandeira (regra de 17/09/2026); a bandeira não é mais publicada.
   * A queda vai para `descartados` com o código `REJECT_NO_PHOTO`, que é o que
   * o diagnóstico do social grava e o painel de logs agrupa.
   */
  let extrasComFoto = opcoes.extras ?? [];
  if (fotos) {
    const r = await selecionarComFoto({
      selecionar: compor,
      escolhidas: (c) => c.escolhidas.map((e) => e.pauta),
      chave: (p) => p.storyId,
      titulo: (p) => p.grupo.primary.title,
      fotos,
    });
    composicao = r.selecao;
    for (const q of r.semFoto) {
      descartados.push({ titulo: q.titulo, storyId: q.storyId, etapa: "visual", motivo: q.motivo });
      linhas.push(`[SOCIAL V2] pauta sem foto não vira post :: ${q.motivo} :: ${q.titulo.slice(0, 60)}`);
    }
    if (extrasComFoto.length > 0) {
      const candidatos = extrasComFoto;
      extrasComFoto = [];
      // Em sequência, pelo mesmo motivo de `selecionarComFoto`.
      for (const p of candidatos) {
        const resp = await fotos.resultado(p);
        if (temFotoDaPauta(resp.visual)) extrasComFoto.push(p);
        else {
          const motivo = `REJECT_NO_PHOTO: ${resp.erro ?? resp.visual?.motivo ?? "sem resultado"}`;
          descartados.push({ titulo: p.grupo.primary.title, storyId: p.storyId, etapa: "visual", motivo });
        }
      }
    }
    if (composicao.bloqueio) {
      linhas.push(`[SOCIAL V2] ciclo bloqueado: ${composicao.bloqueio}`);
      return { modo, previews: [], descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
    }
  }

  /*
   * 2. A keyword do CTA, resolvida de uma fonte só.
   *
   * O que vai impresso no post tem que ser exatamente o que o listener escuta.
   * Quem escuta é a automação do OpenReply, criada com a keyword da campanha
   * evergreen; a `settings.instagram_keyword` do projeto não é consumida por
   * ninguém do lado do listener.
   *
   * Sem palavra escutando, a copy sai sem CTA. É perda pequena perto de
   * publicar "Comente X" e deixar quem comentou sem resposta.
   */
  const resolver = opcoes.resolverKeyword ?? resolverKeywordCanonica;
  const canonica = await resolver(opcoes.projectId);
  const marca: MarcaSocial = {
    ...opcoes.marca,
    keyword: canonica.ok ? canonica.keyword : "",
  };

  if (!canonica.ok) {
    linhas.push(`[SOCIAL V2] sem CTA: ${canonica.motivo}`);
  } else if (!mesmaKeyword(canonica.keyword, opcoes.marca.keyword)) {
    linhas.push(
      `[SOCIAL V2] keyword do CTA vem do funil permanente ("${canonica.keyword}"), ` +
        `e não da configuração do projeto ("${opcoes.marca.keyword}"). Quem escuta é a automação ${canonica.automacao}.`,
    );
  }

  /*
   * A notícia composta, mais o que veio por fora.
   *
   * A ordem importa e é a da prioridade: a notícia primeiro, o extra depois. A
   * agenda distribui os horários do dia numa passada só sobre esta lista, o que
   * é o único jeito de os dois canais não receberem o mesmo horário.
   */
  /*
   * O COMPOSITOR ÚNICO. Aqui, e em nenhum outro lugar, os dois canais se juntam.
   *
   * Isto era uma concatenação solta, e `comporFeedDoDia` existia ao lado com
   * teste próprio e nenhum chamador. Duas implementações da mesma aritmética,
   * uma testada e outra em produção, é exatamente o padrão do incidente do
   * `escolherUrlPublicavel`: os testes provavam uma coisa que não acontecia.
   *
   * O que o compositor garante, e a concatenação não garantia:
   *
   *   - a notícia entra primeiro e nunca perde vaga para conteúdo permanente;
   *   - o evergreen ocupa SÓ o que sobrou do teto global;
   *   - o total nunca passa do teto, mesmo que os dois lados cheguem cheios.
   *
   * O teto do evergreen já foi aplicado antes, em `prepararEvergreen`, e por um
   * motivo diferente: lá ele evita BUSCAR fonte oficial para item que não teria
   * vaga. Aqui ele decide o FEED. Os dois usam `calcularVagas`, então não têm
   * como divergir na conta.
   */
  const feed = comporFeedDoDia(
    composicao.escolhidas.map((e) => e.pauta),
    extrasComFoto,
    config.maximoPorDia,
  );

  const paraGerar = [...feed.noticias, ...feed.evergreen];

  if (extrasComFoto.length) {
    linhas.push(
      `[SOCIAL V2] compositor: ${feed.noticias.length} de notícia + ${feed.evergreen.length} de conteúdo ` +
        `permanente = ${feed.total} de ${feed.vagas.maximo} vaga(s)` +
        (feed.evergreen.length < extrasComFoto.length
          ? `; ${extrasComFoto.length - feed.evergreen.length} permanente(s) cortado(s) pelo teto global`
          : ""),
    );
  }

  // 3. Copy, guarda e reparo.
  const geracao = await gerarPostsDoDia(
    paraGerar,
    config.maximoPorDia,
    {
      marca,
      pacotes: opcoes.pacotes,
      candidatas: opcoes.candidatas,
      env,
      fetcher: opcoes.fetcher,
      decidirCarrossel: opcoes.decidirCarrossel,
      verificarClaims: opcoes.verificarClaims,
      estadosAtuais: opcoes.estadosAtuais,
    },
  );
  linhas.push(...geracao.linhasDeLog);
  diagnostico.reparos = geracao.diagnostico.reparosFeitos;

  for (const d of geracao.descartadas) {
    descartados.push({
      titulo: d.pauta.grupo.primary.title,
      storyId: d.pauta.storyId,
      etapa: "copy",
      motivo: d.motivo,
    });
  }

  // 4. Imagem, e sem imagem válida o post continua existindo.
  const comVisual: Array<{ post: PostGerado; visual: ResultadoVisual | null }> = [];
  /*
   * O desfecho do resolvedor vira diagnóstico, e não só contagem.
   *
   * `semImagem` dizia quantas peças ficaram sem foto e nada mais. Faltar foto
   * porque a fonte não tem imagem da entidade, porque a guarda recusou o que
   * havia, ou porque a chave do banco conceitual não está configurada, são três
   * problemas com três ações diferentes, e a diferença só existia num log de
   * contêiner que ninguém alcança.
   */
  const resumoVisual: ResumoVisualDoDia = {
    comFoto: 0,
    semFoto: 0,
    porMotivo: {},
    porFonte: {},
    notaDaPrimeiraSemFoto: "",
  };

  for (const post of geracao.posts) {
    let visual: ResultadoVisual | null = null;
    if (fotos) {
      // A mesma resposta que o passo 1.5 conferiu, da memória do ciclo.
      const resp = await fotos.resultado(post.pauta);
      visual = resp.visual;
      if (resp.erro) {
        const motivo = resp.erro;
        linhas.push(`[SOCIAL V2] imagem falhou em ${post.pauta.storyId}: ${motivo}`);
        resumoVisual.porMotivo.ERRO_NA_RESOLUCAO = (resumoVisual.porMotivo.ERRO_NA_RESOLUCAO ?? 0) + 1;
        if (!resumoVisual.notaDaPrimeiraSemFoto) resumoVisual.notaDaPrimeiraSemFoto = motivo.slice(0, 400);
      }
    }

    if (visual?.asset && (!fotos || temFotoDaPauta(visual))) {
      resumoVisual.comFoto += 1;
      const fonte = visual.asset.source || "desconhecida";
      resumoVisual.porFonte[fonte] = (resumoVisual.porFonte[fonte] ?? 0) + 1;
    } else {
      diagnostico.semImagem += 1;
      resumoVisual.semFoto += 1;
      const motivo = visual?.motivo ?? (opcoes.resolverVisual ? "SEM_RESULTADO" : "RESOLVEDOR_AUSENTE");
      resumoVisual.porMotivo[motivo] = (resumoVisual.porMotivo[motivo] ?? 0) + 1;

      // A nota das fontes consultadas é a linha que nomeia a causa.
      if (!resumoVisual.notaDaPrimeiraSemFoto && visual?.fontesConsultadas?.length) {
        resumoVisual.notaDaPrimeiraSemFoto = visual.fontesConsultadas
          .map((f) => `${f.fonte}(${f.encontrados}): ${f.nota}`)
          .join(" | ")
          .slice(0, 600);
      }
    }

    /*
     * A rede: com a régua do passo 1.5 ligada, post sem foto real não segue,
     * nem com a bandeira. Não deveria acontecer, porque a composição já tirou
     * a pauta sem foto; existe para o caso de uma porta nova chegar aqui sem
     * ter passado por ela.
     */
    if (fotos && !temFotoDaPauta(visual)) {
      descartados.push({
        titulo: post.pauta.grupo.primary.title,
        storyId: post.pauta.storyId,
        etapa: "visual",
        motivo: `REJECT_NO_PHOTO: ${visual?.motivo ?? "sem resultado"}`,
      });
      continue;
    }

    comVisual.push({ post, visual });
  }

  diagnostico.visual = resumoVisual;
  linhas.push(
    `[SOCIAL V2] imagem: ${resumoVisual.comFoto} com foto, ${resumoVisual.semFoto} sem` +
      (resumoVisual.semFoto > 0 ? ` (${Object.keys(resumoVisual.porMotivo).join(", ")})` : ""),
  );

  /*
   * 5. Diversidade de formato, e só entre o que veio DEPOIS da notícia.
   *
   * A notícia é sempre estática nesta fase e sempre vem primeiro, e é por isso
   * que a intercalação só pode agir na cauda: reordenar a lista inteira daria à
   * cauda a chance de ocupar um horário da notícia, e a prioridade da notícia
   * não é desempate, é regra.
   *
   * Aqui já se sabe o formato de cada post, o que antes da geração era
   * impossível: o formato depende de quantos fatos o pacote sustentou.
   */
  const idsDaCauda = new Set((opcoes.extras ?? []).map((p) => p.storyId));
  const daNoticia = comVisual.filter((c) => !idsDaCauda.has(c.post.pauta.storyId));
  const daCauda = comVisual.filter((c) => idsDaCauda.has(c.post.pauta.storyId));
  const ordenados = [
    ...daNoticia,
    ...alternarFormatos(daCauda, (c) => (c.post.carrossel ? "carousel" : "static")),
  ];

  if (daCauda.length > 1) {
    linhas.push(
      `[SOCIAL V2] formatos na cauda: ${ordenados
        .slice(daNoticia.length)
        .map((c) => (c.post.carrossel ? `C${c.post.carrossel.papeis.length}` : "S"))
        .join(" ")}`,
    );
  }

  // 6. Agenda: recebe a quantidade, não a impõe.
  const vagas = distribuirVagas(ordenados.length, opcoes.editionDate, carregarConfigDaAgenda(env), opcoes.agoraMs);

  const previews: PreviewDoPost[] = ordenados.map(({ post, visual }, i) => {
    const fingerprint =
      impressaoDoAcontecimento(entidadesDaClassificacao(post.pauta.classificacao)) || post.pauta.storyId;

    return {
      posicao: i + 1,
      vaga: vagas[i],
      post,
      visual,
      origem: resolverOrigem(post.pauta.storyId, opcoes.historico),
      candidateId: opcoes.candidatas?.get(post.pauta.storyId)?.id ?? null,
      topicId: topicoDoPost(post.pauta),
      eventFingerprint: fingerprint,
      chaveDeIdempotencia: chaveDeIdempotencia(opcoes.editionDate, post.pauta.storyId),
    };
  });

  diagnostico.postsGerados = previews.length;
  diagnostico.descartados = descartados.length;

  /*
   * A gravação é o ÚNICO ponto em que os modos divergem.
   *
   * Em dry_run não se escreve nada, nem com `dry_run: true`: a fila do worker
   * antigo não olha essa coluna, e uma linha `scheduled` seria publicada no
   * horário. Diagnóstico não pode virar publicação por descuido.
   */
  if (modo !== "enforce") {
    linhas.push(`[SOCIAL V2] dry-run: ${previews.length} preview(s), nada gravado em social_posts`);
    return { modo, previews, descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  if (!liberacao.permitido) {
    linhas.push(`[SOCIAL V2] enforce pedido e recusado: ${liberacao.motivo}`);
    return { modo, previews, descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  if (!opcoes.store) {
    linhas.push("[SOCIAL V2] enforce sem store: nada gravado");
    return { modo, previews, descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  /*
   * 7. Congelar a arte ANTES de gravar, e não gravar o que não congelou.
   *
   * Uma linha `scheduled` é um compromisso: o worker vai publicá-la. Gravar
   * primeiro e descobrir na hora da publicação que a peça não fecha deixaria o
   * post parado num estado que ninguém pediu.
   *
   * Por isso a ordem é esta, e por isso o post que falha aqui é DESCARTADO em
   * vez de gravado com defeito. O motivo entra em `descartados` e aparece no
   * relatório do dia.
   */
  const congelar = opcoes.congelarArte ?? congelarArtefato;
  const congelarSlides = opcoes.congelarCarrossel ?? congelarCarrossel;
  const paraGravar: PostParaGravar[] = [];

  /*
   * O que o store vai bloquear não chega a ser renderizado.
   *
   * A idempotência era conferida só na gravação, no fim. Numa segunda execução
   * do ciclo no mesmo dia, a arte da pauta já publicada era renderizada de
   * novo e subia para o MESMO caminho do Storage, porque o caminho é a chave
   * de idempotência. O arquivo mudava alguns bytes (foto nova, fonte
   * recarregada), a linha antiga continuava com o hash antigo, e o worker
   * recusava publicar com SOCIAL_ARTIFACT_HASH_MISMATCH: o post existente
   * quebrava por causa de uma execução que nem era dele.
   *
   * Aconteceu em 16/09/2026, numa leva extra disparada para validar o desenho
   * novo. O post das 14h32 morreu assim.
   *
   * Conferir antes também economiza o render, que é a etapa mais cara do
   * ciclo: navegador aberto, fontes carregadas, foto baixada.
   */
  const jaTemPostHoje = new Set<string>();
  try {
    for (const linha of await opcoes.store.doDia(opcoes.projectId, opcoes.editionDate)) {
      if (linha.idempotency_key) jaTemPostHoje.add(linha.idempotency_key);
    }
  } catch (erro) {
    linhas.push(`[SOCIAL V2] não consegui ler os posts do dia, seguindo sem o filtro: ${(erro as Error).message}`);
  }

  /*
   * O ritmo da bolha, decidido antes de qualquer render.
   *
   * A bolha é o círculo com a segunda foto na capa. Ela chama atenção porque
   * quebra o padrão, e recurso que quebra padrão só funciona enquanto for
   * exceção: em todo post, ele VIRA o padrão e o feed fica com cara de
   * template. Então ter a segunda foto é condição necessária, não suficiente.
   *
   * O estado vem do feed, e não da leva: sem ler a última peça publicada, cada
   * execução recomeçaria o ritmo do zero e duas capas com bolha se encostariam
   * na virada do dia, que é justamente onde o leitor percebe repetição.
   *
   * Falha de leitura não derruba a leva. Ela só faz a primeira peça sair sem
   * bolha, que é o lado seguro do erro.
   */
  let ultimaComBolha = false;
  let recortesNoFim = TETO_DE_RECORTES_SEGUIDOS;
  try {
    /*
     * Uma leitura só para os dois ritmos.
     *
     * A bolha precisa da última peça; o recorte precisa saber quantas peças
     * seguidas no fim do feed já são recorte, e isso exige o teto mais uma.
     */
    const capas = await opcoes.store.ultimasCapas(opcoes.projectId, TETO_DE_RECORTES_SEGUIDOS + 1);
    ultimaComBolha = ultimaTeveBolha(capas);
    recortesNoFim = recortesSeguidosNoFim(capas);
  } catch (erro) {
    linhas.push(
      `[SOCIAL V2] não consegui ler o ritmo do feed, a leva começa conservadora: ${(erro as Error).message}`,
    );
    ultimaComBolha = true;
    recortesNoFim = TETO_DE_RECORTES_SEGUIDOS;
  }

  const moldes = opcoes.moldes ?? TODOS_OS_MOLDES;
  const desligados = Object.entries(moldes)
    .filter(([, ligado]) => !ligado)
    .map(([nome]) => nome);
  if (desligados.length > 0) {
    linhas.push(`[SOCIAL V2] moldes desligados no painel: ${desligados.join(", ")}`);
  }

  /*
   * A bolha agora é decidida peça a peça, dentro do laço, e não numa passada
   * antes dele (06/10/2026). A vez depende de a peça ANTERIOR ter saído com
   * bolha de verdade, e isso só se sabe depois de conferir os rostos, achar a
   * segunda foto e medir o círculo no render. Quando a vez não se cumpre, ela
   * passa para a peça seguinte.
   */
  let anteriorTeveBolha = ultimaComBolha;
  const custoDaBolha = { usd: 0, tokens: 0 };
  const ritmoDaBolha: string[] = [];

  /*
   * A gramática de cada capa, decidida antes de qualquer render.
   *
   * O eixo decide e a alternância é a rede, conforme a decisão de 17/09/2026.
   * O `cabeNoRecorte` entra aqui dentro de `gramaticaEfetiva`, que é a mesma
   * função que o desenho usa: assim o que este laço promete é exatamente o que
   * a peça vai ser, e o campo gravado não mente.
   *
   * O corpo do recorte é o `gancho` da copy. Medido em 25 peças reais: 24
   * cabem no orçamento com foto e 25 sem, então o recorte de fato acontece em
   * vez de cair sempre para jornal.
   */
  const chapeus = previews.map((p) => chapeuDoPost(p.post));
  const gramaticas = alternarGramatica(
    previews.map((p, i) => ({
      eixo: p.post.pauta.classificacao.eixo,
      temFoto: Boolean(p.visual?.asset),
      cabeNoRecorte:
        gramaticaEfetiva({
          pedida: "recorte",
          eixo: p.post.pauta.classificacao.eixo ?? "",
          chapeu: chapeus[i],
          headline: p.post.copy.headline,
          corpo: p.post.copy.gancho,
          comFoto: Boolean(p.visual?.asset),
        }) === "recorte",
    })),
    recortesNoFim,
    moldes,
  );
  linhas.push(
    `[SOCIAL V2] gramática das capas: ${gramaticas.join(", ")} ` +
      `(o feed terminava com ${recortesNoFim} recorte(s) seguido(s), teto ${TETO_DE_RECORTES_SEGUIDOS})`,
  );

  for (const [indice, p] of previews.entries()) {
    /*
     * A gramática desta peça, já decidida pelo ritmo acima.
     *
     * Ela vai para o desenho E para a gravação. O desenho reconfere com a
     * mesma função e chega ao mesmo lugar; a gravação precisa dela porque a
     * conferência da publicação compara `arte.variante` com ela, e post cuja
     * variante contradiz o registro é recusado.
     */
    /*
     * `null` aqui não é ausência de decisão: é a decisão de não publicar.
     *
     * Ela vem de `alternarGramatica`, quando nenhum molde ligado serve para
     * esta peça. Cair no jornal por segurança publicaria justamente o molde
     * que o painel mandou desligar, então a peça sai da leva e o motivo fica
     * no log da rodada.
     */
    if (gramaticas[indice] === null) {
      linhas.push(
        `[SOCIAL V2] ${p.post.pauta.storyId} sem molde ligado que sirva ` +
          `(${p.visual?.asset ? "com foto" : "sem foto"}): não vira post`,
      );
      continue;
    }

    const gramatica: GramaticaDaCapa = gramaticas[indice] ?? "jornal";
    const corpoDoRecorte = gramatica === "recorte" ? p.post.copy.gancho : undefined;

    if (jaTemPostHoje.has(chaveDeIdempotencia(opcoes.editionDate, p.post.pauta.storyId))) {
      linhas.push(
        `[SOCIAL V2] ${p.post.pauta.storyId} já tem post hoje: não renderiza de novo ` +
          `(renderizar sobrescreveria o artefato aprovado e quebraria o hash do post existente)`,
      );
      continue;
    }

    /*
     * A bolha desta peça: a vez, os rostos, a posição e a segunda foto.
     *
     * Zerar o secundário AQUI, e não lá dentro do desenho, é o que faz o
     * artefato congelado e a linha do banco contarem a mesma história: o que
     * for gravado como `bolha` é o que a peça realmente mostra. E o render
     * ainda confere o círculo medido, ver `bolhaFoi` abaixo.
     */
    const { decisao: decisaoDaBolha, asset: secundarioDaCapa } = await decidirBolha({
      moldeLigado: moldes.jornal_bolha,
      anteriorTeveBolha,
      gramatica,
      fotoDeFundo: p.visual?.asset?.imageUrl ?? null,
      segundaFoto: p.visual?.assetSecundario ?? null,
      canvas: CANVAS_DO_FEED,
      detectar: opcoes.detectarRostos,
      buscarSegunda:
        opcoes.buscarSegundaFoto && p.visual
          ? () => opcoes.buscarSegundaFoto!(p.post.pauta, p.visual!)
          : undefined,
    });
    custoDaBolha.usd += decisaoDaBolha.custoUsd;
    custoDaBolha.tokens += decisaoDaBolha.tokens;

    const path = `${opcoes.slugDoProjeto ?? opcoes.projectId}/${opcoes.editionDate}/${p.chaveDeIdempotencia}`;
    const chapeu = chapeus[indice];
    let carrossel = p.post.carrossel;
    const posicaoDaBolha = secundarioDaCapa ? (decisaoDaBolha.posicao ?? undefined) : undefined;
    const rostosDaBolha = decisaoDaBolha.rostos ?? undefined;

    /*
     * Um caminho por formato, e o mesmo tratamento de falha nos dois.
     *
     * O que muda é quantos arquivos são congelados. O que NÃO muda é a regra:
     * artefato que não fecha vira descarte, não vira linha `scheduled` com
     * defeito, porque linha `scheduled` é compromisso de publicar.
     */
    /*
     * Na notícia, cada slide de conteúdo tem a sua foto (06/10/2026). Falha ao
     * resolver não derruba o post: o slide sai no fundo azul-marinho, que é o
     * mesmo desenho sem a foto, e o motivo vai para o log.
     *
     * ATUALIZADO no mesmo dia, por decisão do dono: o slide sem foto SAI, e o
     * carrossel que fica abaixo do mínimo vira peça única
     * (`podarMioloSemFoto`). Falha ao resolver as fotos é o caso extremo
     * disso: nenhum slide tem foto, e a pauta sai como peça única.
     */
    let fotosDoMiolo: FotosDoCarrossel | null = null;
    let podado: Extract<MioloPodado, { formato: "carousel" }> | null = null;
    const posicoesDasBolhasDoMiolo: Array<string | null> = [];
    const rostosDasBolhasDoMiolo: Array<DecisaoDaBolha["rostos"]> = [];
    const daNoticia = Boolean(carrossel && ehEstruturaDaNoticia(carrossel.estrutura));
    if (carrossel && daNoticia) {
      if (opcoes.fotosDoCarrossel) {
        try {
          fotosDoMiolo = await opcoes.fotosDoCarrossel({ post: p.post, visual: p.visual ?? null });
          linhas.push(
            `[SOCIAL V2] ${p.post.pauta.storyId} fotos do carrossel: ${fotosDoMiolo.origem.join(", ")}` +
              (fotosDoMiolo.segundoPersonagem ? ` | bolha: ${fotosDoMiolo.segundoPersonagem}` : ""),
          );
        } catch (erro) {
          linhas.push(`[SOCIAL V2] ${p.post.pauta.storyId} fotos do carrossel falharam: ${(erro as Error).message}`);
        }
      }

      const poda = podarMioloSemFoto({
        papeis: carrossel.papeis,
        slides: carrossel.slides,
        fotos: fotosDoMiolo?.fotos ?? null,
        bolhas: fotosDoMiolo?.bolhas ?? null,
      });
      if (poda.formato === "static") {
        linhas.push(`[SOCIAL V2] ${p.post.pauta.storyId} ${poda.motivo}`);
        carrossel = undefined;
      } else {
        podado = poda;
        if (poda.tirados.length > 0) {
          linhas.push(
            `[SOCIAL V2] ${p.post.pauta.storyId} slide(s) sem foto fora do carrossel: ${poda.tirados.join(", ")} ` +
              `(${poda.papeis.length} slides)`,
          );
        }
        carrossel = {
          ...carrossel,
          papeis: poda.papeis,
          slides: poda.slides,
          removidos: [...carrossel.removidos, ...poda.tirados.map((t) => `${t} (sem foto)`)],
        };

        /*
         * A bolha do miolo também não cobre rosto (06/10/2026). A foto do slide
         * é perguntada ao mesmo detector da capa; sem posição livre, ou sem
         * conseguir conferir, a bolha sai e o slide fica só com a foto.
         */
        for (const [i, bolha] of poda.bolhas.entries()) {
          posicoesDasBolhasDoMiolo[i] = null;
          rostosDasBolhasDoMiolo[i] = null;
          if (!bolha?.imageUrl) continue;
          const decisao = await decidirBolhaDoMiolo({
            fotoDoSlide: poda.fotos[i]!.imageUrl,
            canvas: CANVAS_DO_FEED,
            detectar: opcoes.detectarRostos,
          });
          custoDaBolha.usd += decisao.custoUsd;
          custoDaBolha.tokens += decisao.tokens;
          linhas.push(`[SOCIAL V2] ${p.post.pauta.storyId} bolha do slide ${i + 2}: ${decisao.motivo}`);
          if (decisao.posicao) {
            posicoesDasBolhasDoMiolo[i] = decisao.posicao;
            rostosDasBolhasDoMiolo[i] = decisao.rostos;
          } else {
            poda.bolhas[i] = null;
          }
        }
        // O crédito da bolha que saiu não vai para a legenda.
        poda.creditos = [
          ...new Set(
            [...poda.fotos, ...poda.bolhas].map((f) => (f?.attribution ?? "").trim()).filter(Boolean),
          ),
        ];
      }
    }

    const congelarPecaUnica = () =>
      congelar({
        capa: {
          headline: p.post.copy.headline,
          eixo: p.post.pauta.classificacao.eixo,
          chapeu,
          asset: p.visual?.asset ?? null,
          assetSecundario: secundarioDaCapa,
          posicaoDaBolha,
          rostosDaBolha,
          motivoSemFoto: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
          gramatica,
          corpo: corpoDoRecorte,
        },
        path,
        fetcher: opcoes.fetcher,
      });

    let resultado = carrossel
      ? await congelarSlides({
          slides: entradasDoCarrossel(
            { ...p.post.copy, slides: carrossel.slides },
            carrossel.papeis,
            {
              eixo: p.post.pauta.classificacao.eixo ?? "",
              chapeu,
              asset: p.visual?.asset ?? null,
              assetSecundario: secundarioDaCapa,
              posicaoDaBolha,
              rostosDaBolha,
              motivoSemFoto: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
              gramatica,
              corpo: corpoDoRecorte,
              fotosDoMiolo: podado?.fotos,
              bolhasDoMiolo: podado?.bolhas,
              posicoesDasBolhasDoMiolo: podado ? posicoesDasBolhasDoMiolo : undefined,
              rostosDasBolhasDoMiolo: podado ? rostosDasBolhasDoMiolo : undefined,
            },
          ).entradas,
          path,
          fetcher: opcoes.fetcher,
        })
      : await congelarPecaUnica();

    /*
     * O carrossel de notícia que não fechou (uma foto de slide que não baixou
     * no render, por exemplo) sai como peça única, em vez de perder a pauta:
     * a capa e a legenda já passaram por tudo (06/10/2026).
     */
    if (!resultado.ok && carrossel && daNoticia) {
      linhas.push(
        `[SOCIAL V2] ${p.post.pauta.storyId} o carrossel não fechou (${resultado.motivo}): sai como peça única`,
      );
      carrossel = undefined;
      podado = null;
      resultado = await congelarPecaUnica();
    }

    if (!resultado.ok) {
      linhas.push(`[SOCIAL V2] ${p.post.pauta.storyId} não vira post: ${resultado.motivo}`);
      descartados.push({
        titulo: p.post.copy.headline,
        storyId: p.post.pauta.storyId,
        etapa: "artefato",
        motivo: resultado.motivo,
      });
      continue;
    }

    const artefatos = "artefatos" in resultado ? resultado.artefatos : [{ ...resultado.artefato, index: 1 }];

    /*
     * A bolha que FOI ao arquivo. O render pode tê-la tirado (a foto do
     * círculo não baixou, ou o círculo medido encostou num rosto), e aí a
     * peça não tem bolha e a vez passa, por mais que a decisão a tenha pedido.
     */
    const bolhaFoi = Boolean(secundarioDaCapa) && resultado.bolhaDesenhada !== false;
    const decisaoGravada: DecisaoDaBolha =
      secundarioDaCapa && !bolhaFoi
        ? {
            ...decisaoDaBolha,
            resultado: "tirada_no_render",
            motivo: `${decisaoDaBolha.motivo}; no render: ${resultado.notaDaBolha || "bolha não desenhada"}`,
          }
        : decisaoDaBolha;
    anteriorTeveBolha = bolhaFoi;
    ritmoDaBolha.push(
      `${p.post.pauta.storyId}: ${bolhaFoi ? `com (${decisaoGravada.posicao})` : "sem"} [${decisaoGravada.resultado}]`,
    );

    linhas.push(
      `[SOCIAL V2] ${carrossel ? `carrossel de ${artefatos.length} slides congelado` : "arte congelada"}: ` +
        artefatos
          .map((a) => `${a.filename} ${(a.bytes / 1024).toFixed(0)}KB sha ${a.sha256.slice(0, 8)}`)
          .join(" | ") +
        (artefatos.some((a) => a.otimizado) ? " (otimizado para caber no limite)" : ""),
    );

    paraGravar.push({
      projectId: opcoes.projectId,
      editionDate: opcoes.editionDate,
      // O post como foi ao ar: sem os slides que saíram por falta de foto, ou sem carrossel.
      post: carrossel === p.post.carrossel ? p.post : { ...p.post, carrossel },
      chapeu,
      ...(podado ? { fotosDoCarrossel: podado.fotos.map((f) => f ?? null) } : {}),
      vaga: p.vaga,
      visual: p.visual,
      candidateId: p.candidateId,
      topicId: p.topicId,
      eventFingerprint: p.eventFingerprint,
      origem: p.origem,
      formato: carrossel ? "carousel" : "static",
      artefatos,
      bolha: bolhaFoi,
      decisaoDaBolha: decisaoGravada,
      gramatica,
      /*
       * O crédito da foto entra na legenda, e não na imagem.
       *
       * A tira sobre a peça saiu em 18/09/2026, a pedido do dono. A obrigação
       * de creditar não saiu junto: CC BY e CC BY-SA continuam exigindo
       * atribuição, e ela passa a viver no fim da legenda, depois das
       * hashtags, que é onde não disputa as primeiras linhas.
       *
       * Quando a licença não exige nada, `attribution` já vem vazio do módulo
       * de licenças e a legenda sai intacta. Foi o caso de 18 das 23 últimas
       * peças: Pexels, Unsplash, domínio público e CC0.
       *
       * ATUALIZADO em 06/10/2026, por regra do dono: o crédito é UMA linha
       * curta, a última, logo abaixo de "Siga @eua.journal", com o nome do
       * autor de TODA foto que foi ao ar (Pexels inclusive, que antes ficava
       * sem nada) e a sigla da licença só onde ela exige ("Foto: Gage Skidmore
       * (CC BY-SA 4.0)"). Entram a capa, a bolha da capa quando ela foi
       * desenhada, e a foto e a bolha de cada slide que ficou. A atribuição
       * completa continua no registro do post.
       */
      ...(() => {
        const fotosQueForam = [
          p.visual?.asset ?? null,
          bolhaFoi ? (secundarioDaCapa ?? null) : null,
          ...(podado?.fotos ?? []),
          ...(podado?.bolhas ?? []),
        ];
        const creditoDaLegenda = linhaDeCredito(fotosQueForam);
        return {
          creditoDaLegenda,
          creditosDasFotos: [
            ...new Set(fotosQueForam.map((f) => (f?.attribution ?? "").trim()).filter(Boolean)),
          ],
          legendaFinal: legendaDoInstagram(p.post.veredicto.legendaFinal, {
            hashtags: "manter",
            credito: creditoDaLegenda,
          }),
        };
      })(),
      /*
       * O que a fila de aprovação precisa para refazer só a etapa culpada
       * (06/10/2026): a pauta, o pacote factual, a posição na leva (que decide
       * o CTA) e a referência ao pool do dia, para a troca de pauta.
       */
      contexto: montarContexto({
        data: opcoes.editionDate,
        pautas: [p.post.pauta],
        pacotes: opcoes.pacotes ?? new Map(),
        pool: opcoes.poolDoDia ?? poolVerificado,
      }),
      posicao: p.posicao,
    });
  }

  diagnostico.descartados = descartados.length;

  linhas.push(
    `[SOCIAL V2] ritmo da bolha (a peça anterior do feed ${ultimaComBolha ? "tinha" : "não tinha"} bolha): ` +
      (ritmoDaBolha.length ? ritmoDaBolha.join(" | ") : "nenhuma peça") +
      ` ; custo ${custoDaBolha.usd.toFixed(4)} USD`,
  );

  if (paraGravar.length === 0) {
    linhas.push("[SOCIAL V2] nenhuma arte congelou: nada gravado");
    return { modo, previews, descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas, custoDaBolha };
  }

  const r = await opcoes.store.gravar(paraGravar);
  linhas.push(`[SOCIAL V2] ${r.gravados} post(s) gravado(s), ${r.bloqueadosPorIdempotencia.length} bloqueado(s)`);

  return {
    modo,
    previews,
    descartados,
    composicao,
    diagnostico,
    gravacao: { gravados: r.gravados, bloqueados: r.bloqueadosPorIdempotencia.length, erros: r.erros },
    linhasDeLog: linhas,
    custoDaBolha,
  };
}
