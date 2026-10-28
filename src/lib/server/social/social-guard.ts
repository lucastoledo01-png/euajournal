import { contradizEstadoAtual, type EstadoAtual } from "../editorial/termometro";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { citacoesSemAtribuicao, validarAncoragem } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import type { CopyDoPost } from "./copy";
import { montarLegenda } from "./copy";
import { garantirLegendaSocial, validarLegendaSocial } from "./legenda";
import type { ContextoDaLegenda } from "./legenda";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import { podePublicar } from "../editorial/candidatos-store";
import { escolherUrlPublicavel } from "../editorial/regras-duras";
import { FORMA_DA_MANCHETE } from "./manchete";
import { atribuicoesDaLegendaSemLastro, conferirDiasDaSemana, conferirFormaDaLegenda } from "./forma-da-legenda";
import { conferirContextoDaManchete } from "./manchete-com-contexto";

/**
 * A última pergunta antes de um post existir.
 *
 * A guarda editorial decide se a PAUTA pode virar conteúdo. Esta decide se o
 * TEXTO que foi escrito sobre ela pode ir ao ar, e são coisas diferentes: uma
 * pauta impecável rende uma manchete que inverte a decisão judicial, e nenhum
 * filtro anterior olha para a manchete.
 *
 * O que ela confere está na ordem do dano. Manchete que afirma o que a fonte
 * não diz é o pior, porque é o que o leitor lê primeiro e o que ele
 * compartilha. Depois vem a legenda. Depois a forma.
 */

export const MOTIVOS_DO_SOCIAL_GUARD = {
  /** O post conta uma etapa que a história já passou (termômetro, 28/10/2026). */
  ETAPA_SUPERADA: "SOCIAL_REJECT_STALE_STAGE",
  HEADLINE_SEM_ANCORAGEM: "SOCIAL_REJECT_HEADLINE",
  CAPTION_SEM_ANCORAGEM: "SOCIAL_REJECT_GROUNDING",
  EUA_NEGATIVO: "SOCIAL_REJECT_US_NEGATIVE",
  FONTE_NAO_RESOLVIDA: "SOCIAL_REJECT_SOURCE_UNRESOLVED",
  CTA_PROIBIDO: "SOCIAL_REJECT_CTA",
  HASHTAGS: "SOCIAL_REJECT_HASHTAGS",
  ASSINATURA_DE_NEWSLETTER: "REJECT_SOCIAL_CAPTION",
  NAO_VERIFICADA: "SOCIAL_REJECT_UNVERIFIED",
  HEADLINE_FORA_DA_FORMA: "SOCIAL_REJECT_HEADLINE_SHAPE",
  /** Fala conferida entre aspas sem o nome de quem falou no post (06/10/2026). */
  CITACAO_SEM_ATRIBUICAO: "SOCIAL_REJECT_QUOTE_ATTRIBUTION",
  /*
   * Os motivos do carrossel moram aqui, e não num objeto próprio.
   *
   * O tipo `ProblemaDoPost` deriva deste objeto, e um segundo conjunto de
   * motivos obrigaria todo problema de slide a entrar com cast. Cast num campo
   * de motivo é como um motivo passa a não aparecer no relatório e a não ser
   * contado pelo funil: o valor chega, e nada que agrupa por motivo o conhece.
   *
   * Os três últimos usam os nomes que a newsletter já usa, com a mesma
   * implementação por trás, porque são a mesma régua.
   */
  SLIDE_SEM_ANCORAGEM: "SOCIAL_REJECT_SLIDE_GROUNDING",
  SLIDE_FORA_DA_FORMA: "SOCIAL_REJECT_SLIDE_SHAPE",
  SLIDE_DENSO: "SOCIAL_REJECT_SLIDE_DENSITY",
  JARGAO_JURIDICO: "LEGAL_JARGON_OVERLOAD",
  RELEVANCIA_BAIXA: "LOW_READER_RELEVANCE",
  MANCHETE_LONGA: "HEADLINE_TOO_LONG",
  /*
   * O protagonista de terceiro país, e ele vale nos dois canais.
   *
   * A manchete que motivou a regra era de um POST: "O-1B para designer de
   * cenários do México". Como a régua do slide é a mesma do e-mail, o motivo
   * precisa existir aqui também, senão o `next build` recusa o mapeamento e,
   * pior, o carrossel deixaria passar o que a newsletter aponta.
   */
  PROTAGONISTA_ESTRANGEIRO: "FOREIGN_SUBJECT",
  /*
   * De que país é esta notícia, e ele vale nos dois canais pelo mesmo motivo.
   *
   * A manchete que motivou a regra também era de um POST: "Quem ganha menos
   * quase não participou do recorde de renda familiar em 2025". O dono leu na
   * capa do Instagram e perguntou se era sobre o Brasil ou sobre os EUA.
   */
  PAIS_AMBIGUO: "COUNTRY_UNCLEAR",
  /*
   * Claim qualitativa: a afirmação que não tem número, data nem nome próprio.
   *
   * A conferência determinística não tem o que conferir nela, e ela pode ser
   * enorme: "essa categoria permite trabalhar para qualquer empresa nos EUA"
   * passava com zero claims conferidas. Quem confere é o auditor semântico que
   * a newsletter já usa.
   *
   * `CLAIM_NAO_AUDITADA` é a falha da auditoria, e é FATAL, não reparável:
   * reparar não resolve rede fora do ar, e tratar auditoria ausente como
   * aprovação publicaria um post cuja verificação nunca aconteceu.
   */
  CLAIM_SEM_LASTRO: "SOCIAL_REJECT_CLAIM_UNSUPPORTED",
  CLAIM_NAO_AUDITADA: "SOCIAL_REJECT_CLAIM_NOT_AUDITED",
  /*
   * A legenda no método do Not Journal (06/10/2026): lide de uma ou duas
   * frases, parágrafos curtos, teto de palavras, sem repetir a manchete
   * (`conferirFormaDaLegenda`). E a atribuição na frase ("segundo X") tem de
   * ser a quem deu a informação (`atribuicoesDaLegendaSemLastro`). As duas
   * são reparáveis: é texto, e a reescrita com o problema nomeado resolve.
   */
  CAPTION_FORA_DA_FORMA: "SOCIAL_REJECT_CAPTION_SHAPE",
  CAPTION_ATRIBUICAO_SEM_LASTRO: "SOCIAL_REJECT_CAPTION_ATTRIBUTION",
  /*
   * As regras do dono depois da fila de 07/10/2026 (`manchete-com-contexto.ts`):
   * a manchete se explica sozinha (fala sem dêitico solto, pessoa apresentada,
   * sujeito nomeado) e toda variação diz O QUE variou. Reparáveis: é texto, e
   * a reescrita com o problema nomeado resolve. Motivos separados porque o
   * aprendizado conta reprovação por motivo, e "sem contexto" e "sem métrica"
   * pedem consertos diferentes.
   */
  MANCHETE_SEM_CONTEXTO: "SOCIAL_REJECT_HEADLINE_CONTEXT",
  VARIACAO_SEM_METRICA: "SOCIAL_REJECT_VARIATION_METRIC",
} as const;

export type MotivoDoSocialGuard =
  (typeof MOTIVOS_DO_SOCIAL_GUARD)[keyof typeof MOTIVOS_DO_SOCIAL_GUARD];

export type ProblemaDoPost = {
  motivo: MotivoDoSocialGuard;
  detalhe: string;
  /** Dá para consertar reescrevendo, ou a pauta está perdida? */
  reparavel: boolean;
};

/**
 * Promessas que um post não faz.
 *
 * Nenhuma delas é sobre tom. Todas são sobre responsabilidade: prometer
 * aprovação, elegibilidade, prazo ou custo num post é o tipo de coisa que
 * gera reclamação e, pior, faz alguém tomar decisão de vida com base numa
 * frase de marketing.
 *
 * ## O critério, que faltava escrito
 *
 * Promessa é AFIRMAÇÃO DE RESULTADO sobre o caso de quem lê: dizer que a
 * pessoa se qualifica, que a aprovação está garantida, que sai em tal prazo ou
 * que não precisa de advogado.
 *
 * Pergunta e convite NÃO são promessa. "Você pode morar nos Estados Unidos
 * legalmente?" abre uma dúvida e manda a pessoa responder um questionário;
 * "você pode morar nos Estados Unidos legalmente" afirma que ela pode, sem
 * saber nada do caso dela. A primeira é chamada, a segunda é o que esta lista
 * existe para barrar.
 *
 * A entrada "descubra se voce pode morar legalmente" saiu em 16/09/2026 por
 * isso: ela barrava um convite, e não uma promessa. Pior, era incoerente com o
 * produto, porque o e-mail já imprime a mesma pergunta no bloco de análise de
 * perfil, e nunca houve decisão de proibi-la.
 *
 * Cuidado ao acrescentar: `normalizar` apaga a pontuação, então nenhuma
 * entrada aqui consegue distinguir pergunta de afirmação. Uma frase que só
 * vira promessa por causa do ponto de interrogação ausente NÃO pode entrar na
 * lista, porque ela barraria as duas.
 */
const PROMESSAS_PROIBIDAS = [
  "voce se qualifica",
  "voce e elegivel",
  "aprovacao garantida",
  "green card garantido",
  "visto garantido",
  "garantimos",
  "100% de aprovacao",
  "aprovado em ate",
  "sem burocracia",
  "sem advogado",
  "moradia legal garantida",
];

/** Urgência inventada é a outra família. */
const URGENCIA_FALSA = ["ultimas vagas", "ultima chance", "so ate hoje", "corra antes", "vagas limitadas"];

function normalizar(texto: string): string {
  return ` ${(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/**
 * A manchete cabe na arte e diz um fato?
 *
 * Os números são de `FORMA_DA_MANCHETE`, e não estão escritos aqui de
 * propósito: o prompt que pede a manchete e a conferência que a recusa
 * precisam falar da mesma faixa. Quando eles divergiram, o prompt pedia até 10
 * palavras, a guarda recusava acima de 12, e a referência que o produto
 * persegue tem 15. O resultado era a manchete curta e vaga, todo dia, sem
 * ninguém ter decidido isso.
 *
 * O piso é editorial: manchete curta demais quase nunca é fato, é rótulo. O
 * teto é da arte, medido na faixa da gramática de jornal.
 */
export function conferirFormaDaHeadline(headline: string): ProblemaDoPost | null {
  const limpa = headline.trim();
  const palavras = limpa.split(/\s+/).filter(Boolean);

  if (palavras.length < FORMA_DA_MANCHETE.minimoDePalavras) {
    return {
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_FORA_DA_FORMA,
      detalhe:
        `${palavras.length} palavra(s); abaixo de ${FORMA_DA_MANCHETE.minimoDePalavras} a manchete vira rótulo ` +
        `e não diz o que muda, para quem, nem a partir de quando`,
      reparavel: true,
    };
  }

  if (palavras.length > FORMA_DA_MANCHETE.maximoDePalavras) {
    return {
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_FORA_DA_FORMA,
      detalhe:
        `${palavras.length} palavras; acima de ${FORMA_DA_MANCHETE.maximoDePalavras} ` +
        `o texto encolhe até ficar ilegível na arte`,
      reparavel: true,
    };
  }

  // O caractere é o que a arte mede de verdade: seis palavras longas ocupam
  // mais faixa do que doze curtas, e a faixa tem topo e base fixos.
  if (limpa.length > FORMA_DA_MANCHETE.maximoDeCaracteres) {
    return {
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_FORA_DA_FORMA,
      detalhe:
        `${limpa.length} caracteres; acima de ${FORMA_DA_MANCHETE.maximoDeCaracteres} ` +
        `a manchete não cabe na faixa da capa em corpo legível`,
      reparavel: true,
    };
  }

  if (/\?$/.test(headline.trim())) {
    return {
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_FORA_DA_FORMA,
      detalhe: "manchete em pergunta é teaser, e o post dá o fato",
      reparavel: true,
    };
  }

  return null;
}

export type ContextoDoPost = {
  pauta: PautaAvaliada;
  pacote: PacoteFactual | null;
  candidata?: Pick<CandidataPersistida, "status" | "verificacao"> | null;
  keyword: string;
  fechamentoDaNewsletter?: string;
  /** A candidata já passou pelo estágio de verificação nesta rodada? */
  verificacaoExigida?: boolean;
  /**
   * Problemas que só o FORMATO do post produz, conferidos por quem o conhece.
   *
   * Um carrossel tem slides, e slide sem lastro é problema de post. A guarda
   * não conhece slides, e ensiná-la a conhecer significaria trazer estrutura,
   * papéis e variantes para dentro dela. Então quem sabe confere e entrega os
   * problemas prontos, e a DECISÃO continua acontecendo num lugar só: é ela
   * que ordena fatal antes de reparável, e duplicá-la é como um post reprovado
   * passaria por um caminho e não pelo outro.
   */
  problemasDoFormato?: ProblemaDoPost[];
  /**
   * `settings.instagram.hashtags` do projeto (06/10/2026). Desligado, que é o
   * padrão, a legenda sai sem hashtag e ter poucas deixa de ser problema.
   */
  hashtags?: boolean;
  /**
   * O que a matéria MAIS NOVA da história diz agora (termômetro, 28/10/2026).
   * Presente só com a capacidade `termometro` em `enforce`; ausente, nada muda.
   */
  estadoAtual?: EstadoAtual | null;
};

export type VeredictoDoPost = {
  passed: boolean;
  /** Todos os problemas, na ordem em que foram encontrados. */
  issues: ProblemaDoPost[];
  /** O que uma reescrita resolve. */
  repairableIssues: ProblemaDoPost[];
  /** O que nenhuma reescrita resolve: o problema é a pauta, não o texto. */
  fatalIssues: ProblemaDoPost[];
  /** Quantas reescritas já foram gastas nesta candidata. */
  attempts: number;
  finalDecision: "publicar" | "reparar" | "descartar";
  legendaFinal: string;
  hashtagsFinais: string[];
};

export function avaliarPostSocial(
  copy: CopyDoPost,
  contexto: ContextoDoPost,
  tentativas = 0,
): VeredictoDoPost {
  const problemas: ProblemaDoPost[] = [];
  const { pauta, pacote } = contexto;

  /*
   * A verificação vem primeiro porque ela não é sobre o texto.
   *
   * Se a candidata não foi confirmada, nenhuma reescrita resolve: o problema
   * é a pauta, não a copy. Reparar aqui seria polir um post que não deveria
   * existir.
   */
  if (contexto.verificacaoExigida !== false) {
    const autorizacao = podePublicar(
      contexto.candidata ?? { status: "approved", verificacao: null },
    );
    if (!autorizacao.pode) {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.NAO_VERIFICADA,
        detalhe: autorizacao.motivo,
        reparavel: false,
      });
    }
  }

  /*
   * A trava do termômetro: o post não pode contar uma etapa que a história já
   * passou. Não é reparável, porque o pacote factual é o do capítulo velho:
   * reescrever com "chegou" seria afirmar o que a fonte dele não diz. O certo é
   * a pauta do capítulo novo, que o termômetro já pôs no topo.
   */
  const contradicao = contradizEstadoAtual(`${copy.headline} ${copy.gancho ?? ""}`, contexto.estadoAtual);
  if (contradicao) {
    problemas.push({ motivo: MOTIVOS_DO_SOCIAL_GUARD.ETAPA_SUPERADA, detalhe: contradicao, reparavel: false });
  }

  // Negatividade sobre os EUA: regra da casa, e não do texto.
  if (pauta.classificacao.pais === "EUA" && pauta.classificacao.leitura === "desfavoravel") {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.EUA_NEGATIVO,
      detalhe: "o fato foi lido como desfavorável aos EUA, e a linha editorial não publica isso",
      reparavel: false,
    });
  }

  // Fonte: o leitor precisa poder clicar em algo que não seja agregador.
  const url = escolherUrlPublicavel(pauta.grupo, pauta.enriquecimento);
  if (!url.ok) {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.FONTE_NAO_RESOLVIDA,
      detalhe: url.motivo,
      reparavel: false,
    });
  }

  const forma = conferirFormaDaHeadline(copy.headline);
  if (forma) problemas.push(forma);

  /*
   * A manchete se explica sozinha? (regras do dono, 06/10/2026). Vem antes da
   * ancoragem porque é o defeito que o leitor vê primeiro: "Bret Taylor: “É
   * uma espécie de caos até que tal padrão exista”" estava ancorada, literal e
   * atribuída, e não dizia nada a quem não tinha lido a matéria. O lide entra
   * junto na conferência da variação: "subiram 8%" sem dizer o quê é o mesmo
   * defeito na primeira linha da legenda.
   */
  for (const p of conferirContextoDaManchete(copy.headline, {
    pacote,
    quemFala: pauta.classificacao.citacao_de_famoso ? pauta.classificacao.quem_fala ?? null : null,
    lide: copy.gancho,
  })) {
    problemas.push({
      motivo:
        p.regra === "variacao_sem_metrica"
          ? MOTIVOS_DO_SOCIAL_GUARD.VARIACAO_SEM_METRICA
          : MOTIVOS_DO_SOCIAL_GUARD.MANCHETE_SEM_CONTEXTO,
      detalhe: p.detalhe,
      reparavel: true,
    });
  }

  /*
   * Ancoragem, e a manchete é conferida separada da legenda de propósito.
   *
   * Um post pode ter legenda impecável e manchete que inverte a decisão, e é a
   * manchete que vai no print que alguém compartilha.
   */
  if (pacote) {
    const naHeadline = validarAncoragem(copy.headline, pacote);
    const bloqueiosHeadline = naHeadline.naoSustentadas.filter((c) => c.severidade === "bloqueio");
    if (bloqueiosHeadline.length > 0) {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_SEM_ANCORAGEM,
        detalhe: `a manchete afirma o que a fonte não diz: ${bloqueiosHeadline.map((c) => `${c.tipo} "${c.valor}"`).join(", ")}`,
        reparavel: true,
      });
    }

    // O "(5)" de "na segunda-feira (5)" é do calendário, não do pacote (06/10/2026).
    const corpo = conferirDiasDaSemana(montarLegenda(copy), new Date(), {
      pacote,
      publicadaEm: pauta.grupo.primary.published_at,
    }).paraAncorar;
    const naLegenda = validarAncoragem(corpo, pacote);
    const bloqueiosLegenda = naLegenda.naoSustentadas.filter((c) => c.severidade === "bloqueio");
    if (bloqueiosLegenda.length > 0) {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.CAPTION_SEM_ANCORAGEM,
        detalhe: `a legenda afirma o que a fonte não diz: ${bloqueiosLegenda.map((c) => `${c.tipo} "${c.valor}"`).join(", ")}`,
        reparavel: true,
      });
    }

    /*
     * A citação de famoso é literal E atribuída (06/10/2026). A literalidade a
     * ancoragem acima já confere; aqui, que o post inteiro nomeie quem falou.
     * Fala sem dono é a manchete que circula como se fosse da marca.
     */
    const semDono = citacoesSemAtribuicao(`${copy.headline}\n${corpo}`, pacote);
    if (semDono.length > 0) {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.CITACAO_SEM_ATRIBUICAO,
        detalhe: `fala entre aspas sem o nome de quem falou: ${semDono.map((c) => `"${c.fala.slice(0, 60)}" (${c.autor})`).join(", ")}`,
        reparavel: true,
      });
    }
  }

  /*
   * A forma da legenda e a atribuição dentro dela (06/10/2026).
   *
   * A ancoragem acima confere número e nome contra o pacote inteiro; ela não
   * sabe se "segundo a Axios" é de quem deu o número. Isso, e a forma do
   * método (lide, parágrafos, teto de palavras, manchete repetida), é
   * conferido aqui, sobre o MESMO corpo que vai ao ar.
   */
  {
    const corpo = montarLegenda(copy);
    for (const p of [...conferirFormaDaLegenda(corpo, copy.headline), ...conferirDiasDaSemana(corpo, new Date(), { pacote, publicadaEm: pauta.grupo.primary.published_at }).problemas]) {
      problemas.push({ motivo: MOTIVOS_DO_SOCIAL_GUARD.CAPTION_FORA_DA_FORMA, detalhe: p.detalhe, reparavel: true });
    }
    for (const p of atribuicoesDaLegendaSemLastro(corpo, pacote, pauta.grupo.primary.source_name ?? "")) {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.CAPTION_ATRIBUICAO_SEM_LASTRO,
        detalhe: p.detalhe,
        reparavel: true,
      });
    }
  }

  /*
   * Os problemas do formato entram aqui, depois da ancoragem do texto comum.
   *
   * A posição na lista é a ordem do relatório, não a ordem da decisão: quem
   * decide é a separação entre fatal e reparável, mais abaixo.
   */
  for (const p of contexto.problemasDoFormato ?? []) problemas.push(p);

  // CTA: a ação é livre, a promessa não.
  const textoTodo = normalizar(`${copy.headline} ${montarLegenda(copy)} ${copy.cta}`);
  const promessa = PROMESSAS_PROIBIDAS.find((p) => textoTodo.includes(p));
  const urgencia = URGENCIA_FALSA.find((u) => textoTodo.includes(u));

  if (promessa) {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.CTA_PROIBIDO,
      detalhe: `promete o que só um advogado diz depois de ver o caso: "${promessa}"`,
      reparavel: true,
    });
  }
  if (urgencia) {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.CTA_PROIBIDO,
      detalhe: `urgência inventada: "${urgencia}"`,
      reparavel: true,
    });
  }

  /*
   * A legenda passa pelo guardião determinístico, que é a última camada.
   *
   * Ele remove despedida de e-mail, desduplica o CTA e monta as hashtags a
   * partir da pauta. O que ele encontrou vira problema aqui, para o relatório
   * dizer o que precisou ser consertado em vez de esconder.
   */
  const contextoDaLegenda: ContextoDaLegenda = {
    titulo: pauta.grupo.primary.title,
    resumo: pauta.enriquecimento?.assuntoParaHashtags?.trim() || pauta.enriquecimento?.texto || "",
    categoria: pauta.classificacao.eixo,
    pais: pauta.classificacao.pais === "Brasil" ? "BR" : "US",
    entidades: [...pauta.classificacao.atores, ...pauta.classificacao.lugares],
    keyword: contexto.keyword,
    fechamentoDaNewsletter: contexto.fechamentoDaNewsletter,
    hashtags: contexto.hashtags === true,
  };

  /*
   * O `copy.cta` ("Comente NEWS...") não entra mais na legenda (06/10/2026): o
   * fecho dela é "Siga @eua.journal", posto por `fecharLegenda`. O campo
   * continua existindo porque é ele que desenha o convite no último slide do
   * carrossel, onde o funil de comentário vive.
   */
  const bruta = [montarLegenda(copy), (copy.hashtags ?? []).join(" ")]
    .filter(Boolean)
    .join("\n\n");

  const daLegenda = validarLegendaSocial({ full_caption: bruta, cta_call: copy.cta }, contextoDaLegenda);
  for (const p of daLegenda) {
    if (p.motivo === "REJECT_SOCIAL_CAPTION") {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.ASSINATURA_DE_NEWSLETTER,
        detalhe: p.detalhe,
        reparavel: true,
      });
    }
  }

  const auditada = garantirLegendaSocial(
    {
      title: pauta.grupo.primary.title,
      edition_date: new Date().toISOString().slice(0, 10),
      primary_topic: pauta.classificacao.eixo,
      target_audience_focus: "",
      format: "noticia",
      slides: [],
      caption: {
        headline: copy.gancho.slice(0, 100),
        intro_summary: copy.fato_principal.slice(0, 300),
        key_takeaways: [copy.fato_principal.slice(0, 60), (copy.contexto || copy.gancho).slice(0, 60)],
        /*
         * CTA vazio é decisão, não esquecimento.
         *
         * Um em cada quatro posts sai sem chamada, de propósito, e o valor de
         * reserva que estava aqui desfazia isso: o post nascia SEM_CTA e a
         * legenda final saía com "Comente VISA" no fim. Apareceu no primeiro
         * preview de ponta a ponta.
         */
        cta_call: copy.cta,
        hashtags: copy.hashtags ?? [],
        full_caption: bruta,
      },
    } as never,
    contextoDaLegenda,
  );

  /*
   * Hashtag só conta com o projeto pedindo (06/10/2026). Desligada, a lista
   * final é vazia: o conjunto calculado fica no caption do caminho legado,
   * mas o post não tem hashtag nenhuma, nem na legenda nem no registro.
   */
  const ligadas = contexto.hashtags === true;
  const hashtagsFinais = ligadas ? auditada.carousel.caption.hashtags : [];
  if (ligadas && hashtagsFinais.length < 3) {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HASHTAGS,
      detalhe: `só ${hashtagsFinais.length} hashtag(s) com base na pauta`,
      reparavel: true,
    });
  }

  const fatalIssues = problemas.filter((p) => !p.reparavel);
  const repairableIssues = problemas.filter((p) => p.reparavel);

  /*
   * A decisão é uma só, e a ordem dela importa.
   *
   * Qualquer problema fatal descarta, mesmo que existam dez reparáveis junto:
   * reescrever um post cuja pauta não pode sair é trabalho para jogar fora.
   * Só depois disso a contagem de tentativas entra, porque insistir na
   * terceira reescrita da mesma candidata custa mais que pegar a próxima.
   */
  let finalDecision: VeredictoDoPost["finalDecision"];
  if (fatalIssues.length > 0) finalDecision = "descartar";
  else if (problemas.length === 0) finalDecision = "publicar";
  else finalDecision = "reparar";

  return {
    passed: problemas.length === 0,
    issues: problemas,
    repairableIssues,
    fatalIssues,
    attempts: tentativas,
    finalDecision,
    legendaFinal: auditada.carousel.caption.full_caption,
    hashtagsFinais,
  };
}
