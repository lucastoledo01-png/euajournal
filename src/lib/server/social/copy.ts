import { z } from "zod";
import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import { limparVicios } from "../newsroom/anti-vicios";
import { REGRA_DO_DOLAR } from "../editorial/dolar-em-portugues";
import { FORMA_DA_MANCHETE, regraDaMancheteVigente } from "./manchete";
import { instrucaoVigente } from "../instrucoes";
import { vozSocialVigente } from "./voz";

/**
 * O texto de um post, escrito para o feed e não para o e-mail.
 *
 * A diferença não é de tom, é de forma. A newsletter tem assunto, preheader,
 * intro, pautas e fechamento, e o leitor chegou nela por escolha. O post tem
 * uma manchete que precisa parar o polegar e uma legenda que ninguém abre se
 * a primeira linha não segurar. Reaproveitar a copy do e-mail produz post que
 * parece boletim, e foi assim que "Até amanhã. Equipe imigra.us." apareceu
 * embaixo de um CTA.
 *
 * Tudo aqui é escrito a partir do PACOTE FACTUAL, não da matéria. O pacote é
 * a lista do que está escrito na fonte; o que não está nele não pode aparecer
 * no post, e é isso que a guarda social confere depois.
 */

/**
 * Corta na última palavra inteira que cabe.
 *
 * Mesma razão do aparador da legenda da newsletter: o modelo estoura o teto
 * com frequência, e o custo disso não pode ser o post inteiro. Perder a cauda
 * de um parágrafo é muito melhor que perder a publicação, e foi assim que uma
 * pauta boa do Diversity Visa virou "falha técnica ao gerar" no primeiro
 * dry-run de ponta a ponta.
 *
 * A manchete NÃO é aparada em silêncio: cortar manchete muda o que ela afirma.
 * Ela vai inteira para a guarda, que reprova pela forma e manda reescrever.
 */
function aparar(limite: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string" || v.length <= limite) return v;
    const bruto = v.slice(0, limite);
    const ultimoEspaco = bruto.lastIndexOf(" ");
    return (ultimoEspaco > limite * 0.6 ? bruto.slice(0, ultimoEspaco) : bruto).trimEnd();
  }, z.string());
}

export const CopyDoPostSchema = z.object({
  /**
   * A manchete da arte. Curta porque ela é grande na imagem.
   *
   * O limite de palavras não é estética: a arte tem três linhas e um título
   * longo encolhe até ficar ilegível no celular.
   */
  /*
   * Sem teto aqui de propósito. Manchete longa é problema de forma, e quem
   * decide isso é a guarda, que sabe mandar reescrever. Aparar em silêncio
   * mudaria o que a manchete afirma.
   */
  headline: z.string().min(8),
  /** A expressão do headline que sai em cor. Copiada literalmente dele. */
  destaque: aparar(60).pipe(z.string()).default(""),
  /*
   * 240, e não mais 160 (06/10/2026). O gancho passou a ser o lide inteiro em
   * uma frase, no método do Not Journal, e o lide de 20 a 35 palavras tem de
   * 140 a 230 caracteres: com o teto antigo o aparador cortava a frase no meio
   * em silêncio. Efeito colateral conhecido: o recorte usa o gancho como corpo
   * e tem orçamento de 200 caracteres com foto (`CAPACIDADE_DO_RECORTE`), então
   * o gancho longo cai na gramática de jornal, pela regra que já existe.
   *
   * 420 a partir da legenda do Not Journal (06/10/2026, mais tarde): o lide
   * pode ter DUAS frases ("ator, verbo, fato, quando, com o número exato"), de
   * 25 a 60 palavras. O teto do lide é conferido pela guarda
   * (`conferirFormaDaLegenda`), que manda reescrever; o aparador é só a rede
   * para estouro não custar o post.
   */
  gancho: aparar(420).pipe(z.string().min(10)),
  /*
   * Os parágrafos depois do lide, no método do Not Journal (06/10/2026): de 2
   * a 5, cada um com UMA camada nova (números e detalhe, quem disse o quê,
   * histórico, leitura de especialista, o que segue em aberto).
   *
   * Lista, e não mais quatro campos com nome, porque a legenda de referência
   * tem de dois a cinco parágrafos conforme o pacote rende, e campo com nome
   * empurra o modelo a preencher todos. Os campos antigos continuam no schema,
   * com padrão vazio, para uma instrução antiga ainda ativa no banco (que pede
   * `fato_principal`, `contexto`...) continuar produzindo legenda montável:
   * `montarLegenda` usa os antigos só quando a lista vem vazia.
   *
   * `.optional()`, e não `.default([])`: campo novo com padrão vira
   * obrigatório no tipo de SAÍDA e quebra todo literal de copy que já existe
   * (armadilha registrada em `decisoes.md`).
   */
  paragrafos: z.array(aparar(700).pipe(z.string())).max(6).optional(),
  /*
   * Sem piso desde 06/10/2026: no contrato novo ele vem vazio e o texto vai em
   * `paragrafos`. O piso de 20 reprovaria a resposta certa.
   */
  fato_principal: aparar(400).pipe(z.string()).default(""),
  contexto: aparar(400).pipe(z.string()).default(""),
  informacao_util: aparar(300).pipe(z.string()).default(""),
  /** O que a matéria NÃO diz, quando calar seria enganoso. */
  ressalva: aparar(240).pipe(z.string()).default(""),
  /**
   * Vazio de propósito.
   *
   * O prompt manda o modelo devolver string vazia aqui, porque o CTA é montado
   * em código: é onde mora a promessa, e promessa escrita por modelo vira
   * "descubra se você pode morar legalmente nos EUA". Um piso de tamanho neste
   * campo reprovaria a resposta correta.
   */
  cta: aparar(200).pipe(z.string()).default(""),
  /**
   * Sugestão, não decisão.
   *
   * O conjunto final é montado por `garantirLegendaSocial`, que filtra o que a
   * pauta não sustenta e completa o que falta. Exigir um mínimo aqui faria uma
   * resposta pobre em hashtag derrubar uma copy boa, quando a camada seguinte
   * resolveria sozinha.
   */
  hashtags: z.array(z.string()).max(12).default([]),
});

export type CopyDoPost = z.infer<typeof CopyDoPostSchema>;

export type MarcaSocial = {
  nome: string;
  nicho: string;
  extra: string;
  keyword: string;
  /**
   * `settings.instagram.hashtags` do projeto (06/10/2026). Ausente ou falso, a
   * legenda sai sem hashtag nenhuma, como no Not Journal. Opcional para quem
   * monta a marca sem ler o projeto (scripts de ensaio) cair no padrão.
   */
  hashtags?: boolean;
};

/**
 * O CTA varia, a ação não. E a ação é ASSINAR A NEWSLETTER.
 *
 * Todo post terminando com a mesma frase transforma o perfil em gravação, daí
 * as quatro formas. O que elas pedem é sempre a mesma coisa, e o que prometem
 * é sempre a mesma coisa.
 *
 * Até 17/09/2026 elas prometiam uma avaliação de perfil de imigração. O dono
 * corrigiu o rumo: o produto é a newsletter diária sobre os Estados Unidos, e
 * era isso que o CTA tinha que oferecer. A avaliação de perfil é outro funil,
 * e pendurá-la em todo post transformava um jornal em captação de lead.
 *
 * Nenhuma forma promete aprovação, elegibilidade, prazo ou custo de visto:
 * isso só um advogado diz depois de ver o caso, e não é o que se entrega aqui.
 *
 * ATENÇÃO ao mexer: a frase precisa conter "comente" e a palavra-chave, porque
 * é assim que `frasesDeCta` em `legenda.ts` reconhece e separa o CTA do corpo.
 * E a mensagem que a pessoa recebe DEPOIS de comentar não mora aqui: ela está
 * na automação do OpenReply, criada uma única vez. Mudar só este arquivo faz o
 * post prometer uma coisa e o Direct entregar outra.
 */
export const FORMAS_DE_CTA = [
  'Comente {K} e receba no Direct o link da nossa newsletter: os Estados Unidos todo dia, em português, de graça.',
  'Quer acompanhar o que muda nos Estados Unidos sem depender do feed? Comente {K} e o link da newsletter chega no seu Direct.',
  'Toda manhã a gente conta o que aconteceu nos Estados Unidos, em português. Comente {K} para receber no Direct.',
  'Comente {K} e receba no Direct o link para assinar: economia, trabalho, custo de vida e política dos Estados Unidos, todo dia.',
];

/**
 * Nem todo post vende.
 *
 * Um perfil que pede comentário em dez posts por dia cansa, e o leitor
 * aprende a rolar. A proporção não é sorteada: ela é derivada da posição do
 * post no dia, então é estável, auditável e distribuída. Um em cada quatro
 * sai sem CTA, e são os de conteúdo puro.
 */
export function levaCta(posicao: number, proporcao = 0.75): boolean {
  if (proporcao >= 1) return true;
  if (proporcao <= 0) return false;
  const aCada = Math.round(1 / (1 - proporcao));
  return posicao % aCada !== 0;
}

/**
 * Sem keyword, sem CTA. Nunca uma frase com o buraco no meio.
 *
 * Toda forma de CTA é construída em torno de "comente {K}". Com `keyword`
 * vazia, `replace` devolveria "Comente  para receber..." — uma frase que pede
 * uma ação impossível de executar. E uma palavra qualquer no lugar seria pior:
 * o listener escuta uma só, e "Comente VISA" com o listener em outra palavra
 * ensina o leitor que comentar não adianta.
 *
 * Quem decide qual é a palavra é `resolverKeywordCanonica`, e ela devolve vazio
 * quando não há automação escutando.
 */
export function ctaDaPosicao(posicao: number, keyword: string): string {
  if (!keyword.trim()) return "";
  const forma = FORMAS_DE_CTA[posicao % FORMAS_DE_CTA.length];
  return forma.replace(/\{K\}/g, keyword.trim());
}

/**
 * A legenda no método do Not Journal (06/10/2026), lida em sete legendas reais
 * que o dono mandou (Flávio e o dólar, Moraes e Débora, a frase de Bezos, o
 * apoio de Temer, Sicario 3, Trump e a peste na Rússia, os 670 bancos da
 * China). É texto editorial, e por isso mora no trecho editável; o post único e
 * o carrossel leem o MESMO bloco, para a legenda dos dois formatos ser uma só.
 *
 * O que ela NÃO diz é de propósito: crédito de foto, hashtag e o "Siga
 * @eua.journal" são do código (`legenda-final.ts`), e nenhuma versão do
 * texto, nova ou antiga, consegue mudá-los.
 */
export const LEGENDA_NO_METODO_NOT_JOURNAL = `A LEGENDA, no método do Not Journal. Ela conta MAIS que a capa e os slides, e não repete a manchete palavra por palavra.

gancho: o LIDE inteiro, em uma ou duas frases, e ele abre a legenda direto, sem saudação, sem pergunta de gancho. Ator, verbo, fato e quando, com o número exato, de 25 a 60 palavras. O quando é o dia da semana com o dia do mês entre parênteses, como a imprensa brasileira escreve, tirado do CALENDÁRIO que vem junto da pauta: "na segunda-feira (5)". Nunca "hoje", "ontem" ou "amanhã": o post sai num dia diferente do que foi escrito. Sem a data no pacote, sem o quando.
  Exemplo da forma (construção ilustrativa): "A China fechou mais de 670 bancos em um ano, segundo o regulador bancário do país, numa reestruturação que atinge sobretudo bancos rurais pequenos."

paragrafos: de 2 a 5 parágrafos curtos, de 2 a 4 frases cada, e cada um acrescenta UMA camada nova, nesta ordem quando o pacote tiver material para ela:
1. os números e o detalhe que dão o tamanho do fato;
2. quem disse o quê, com a atribuição DENTRO da frase ("segundo o TSE", "de acordo com a Caixin", "segundo a Moody's"); quem é citado é quem deu a informação, nunca o veículo que a repetiu;
3. o histórico que explica o fato ("Débora ficou conhecida por...");
4. a leitura de especialista ou de mercado, só com dono nomeado no pacote ("Para Jason Bedford, pesquisador...", "Analistas associam...");
5. o que segue em aberto ou o próximo passo ("a disputa segue aberta até 25 de outubro", "não há data de estreia anunciada").
Camada sem lastro no pacote não existe: pacote fino dá menos parágrafos, nunca enchimento. A legenda inteira tem de 120 a 300 palavras quando o pacote rende; menos, quando não rende.

O registro é de jornal: neutro, factual, em terceira pessoa. Sem "você", sem adjetivo de opinião, sem emoji, sem hashtag, sem link, sem "Leia mais", sem convite para comentar ou seguir, sem linha de "Fonte:" e sem crédito de foto. Citação entre aspas só com a fala que está no pacote, fiel a ela; fala em inglês vai traduzida para o português.

O que segue em aberto fala do FATO, nunca da reportagem. Proibido: "a fonte não informa", "a fonte não detalha", "não há detalhes", "o veículo não diz". Quando a falta É a notícia, escreva falando da divulgação: "a nova data ainda não foi divulgada".`;

/**
 * O julgamento editorial do post de imagem única, editável no painel desde
 * 05/10/2026 (etapa `social_copy`). O que fica fora daqui é contrato: o canal,
 * a regra do pacote factual, a ordem da legenda e o JSON de saída.
 */
export const INSTRUCAO_PADRAO_SOCIAL_COPY = `E, na manchete, as quatro que derrubam o post:
- Nada de clickbait, nada de pergunta retórica, nada de "você não vai acreditar".
- Nada de adjetivo de opinião ("histórico", "polêmico", "chocante"): a escala é o número.
- Não transforme possibilidade em certeza: "pode mudar" não vira "muda", "proposta avançou" não vira "aprovado".
- Não inverta a decisão: quem suspendeu não aprovou.
- Não invente consequência: se a matéria não diz o efeito, a manchete não afirma efeito.

destaque: de 1 a 4 palavras copiadas LITERALMENTE de dentro do headline, mesma grafia. É o pedaço que sai em cor. Sem nada óbvio para destacar, devolva vazio.

${LEGENDA_NO_METODO_NOT_JOURNAL}`;

export function montarSystemDaCopy(marca: MarcaSocial): string {
  return `
Você escreve um POST DE IMAGEM ÚNICA para o Instagram da marca "${marca.nome}".

NICHO:
${marca.nicho}

BRIEFING (vale sobre qualquer regra genérica abaixo):
${marca.extra}

REGRA QUE VALE SOBRE TODAS: você só pode afirmar o que está no PACOTE FACTUAL. Ele é a lista do que a matéria diz. Número, prazo, taxa, nome e data que não estiverem lá não existem. Não deduza, não arredonde, não complete, não use o que você sabe do assunto.

${REGRA_DO_DOLAR}

CANAL: isto é Instagram, não newsletter. O perfil publica várias vezes por dia, então NÃO existe despedida. Proibido "Até amanhã", "Nos vemos amanhã", "Equipe ${marca.nome}", "Boa leitura" e qualquer assinatura de e-mail.

${regraDaMancheteVigente()}

${instrucaoVigente("social_copy", INSTRUCAO_PADRAO_SOCIAL_COPY)}

${vozSocialVigente()}

ESTRUTURA DA LEGENDA, nesta ordem: o lide em "gancho" e os parágrafos em "paragrafos", um parágrafo por item, sem linha em branco dentro do item. "fato_principal", "contexto", "informacao_util" e "ressalva" vão VAZIOS: o texto todo está no lide e nos parágrafos. "cta" vai vazio. "hashtags" vai vazio: hashtag e o fecho da legenda são do código.

Devolva JSON:
{"headline":"...","destaque":"...","gancho":"...","paragrafos":["...","..."],"fato_principal":"","contexto":"","informacao_util":"","ressalva":"","cta":"","hashtags":[]}
`;
}

/**
 * As falas conferidas do pacote e, quando a pauta é citação de famoso, o
 * formato (06/10/2026). Usado pela peça única e pelo carrossel.
 *
 * A fala vai com o original E a tradução que o pacote conferiu: a guarda só
 * aceita entre aspas o que está numa das duas (ou no texto de origem), então
 * pedir "traduza a fala" sem dar a tradução seria pedir uma recusa.
 */
export function blocoDaCitacao(pauta: PautaAvaliada, pacote: PacoteFactual | null): string[] {
  const citacoes = pacote?.citacoes ?? [];
  if (citacoes.length === 0) return [];
  const linhas = [
    "",
    "CITAÇÕES CONFERIDAS (só estas falas podem ir entre aspas, com as palavras exatas do campo traducao ou original, e sempre com o nome de quem falou no post):",
    JSON.stringify(citacoes.map((c) => ({ quem: c.autor, traducao: c.traducao, original: c.original })), null, 2),
  ];
  const quem = pauta.classificacao.citacao_de_famoso ? pauta.classificacao.quem_fala?.trim() : "";
  if (quem) {
    linhas.push(
      "",
      `FORMATO: CITAÇÃO DE FAMOSO. A manchete é a fala de ${quem} entre aspas, copiada LETRA POR LETRA de uma citação conferida acima (a tradução, em português), seguida ou precedida do nome de quem falou E, se ${quem} não for conhecido do grande público brasileiro, do cargo ou da empresa famosa que o apresenta ("Bret Taylor, presidente do conselho da OpenAI:"). A fala escolhida carrega o assunto sozinha: se ela tem "tal", "isso", "esse", "eles" apontando para algo de fora, nomeie o assunto na manchete fora das aspas, corte com reticências ou escolha outra fala. Não resuma, não melhore e não junte duas falas dentro das mesmas aspas; para encurtar, corte com reticências. A legenda diz onde e quando a fala aconteceu, se o pacote disser.`,
    );
  }
  return linhas;
}

const DIAS_DA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/**
 * Os últimos oito dias com o dia da semana, no fuso de Brasília.
 *
 * A legenda do método diz "na segunda-feira (5)", e o dia da semana errado é
 * fato errado que nenhuma ancoragem pega: ela confere o 5, não a segunda. O
 * modelo não calcula calendário com segurança, então o código entrega a
 * tabela pronta e o prompt manda usar só ela. O carrossel lê a mesma.
 */
export function calendarioDaSemana(agora: Date = new Date()): string {
  const linhas: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(agora.getTime() - i * 86_400_000);
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const [ano, mes, dia] = iso.split("-").map(Number);
    const semana = DIAS_DA_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
    linhas.push(`${semana} (${dia}) = ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`);
  }
  return linhas.join("; ");
}

/**
 * O pedido da copy, exportado para o motor Claude via MCP (27/10/2026): a
 * tarefa servida ao Claude Desktop leva este texto, byte a byte o que a OpenAI
 * recebe. Ver `mcp/tarefas/escrever-post.ts`.
 */
export function montarUserDaCopy(pauta: PautaAvaliada, pacote: PacoteFactual | null): string {
  const p = pauta.grupo.primary;

  const partes = [
    `TÍTULO DA MATÉRIA: ${p.title}`,
    `FONTE: ${p.source_name}`,
    `PAÍS: ${pauta.classificacao.pais}`,
    `EIXO: ${pauta.classificacao.eixo}`,
    ...(p.published_at ? [`PUBLICADA EM: ${p.published_at}`] : []),
    `CALENDÁRIO (do mais recente para o mais antigo): ${calendarioDaSemana()}`,
  ];

  if (pacote) {
    partes.push(
      "",
      "PACOTE FACTUAL, e nada fora dele pode ser afirmado:",
      JSON.stringify(
        {
          fatos: pacote.verified_facts,
          pessoas: pacote.people,
          organizacoes: pacote.organizations,
          lugares: pacote.places,
          datas: pacote.dates,
          numeros: pacote.numbers,
          lacunas: pacote.gaps,
        },
        null,
        2,
      ),
      ...blocoDaCitacao(pauta, pacote),
    );
  } else {
    partes.push("", "TEXTO DA MATÉRIA:", (pauta.enriquecimento?.texto ?? "").slice(0, 3000));
  }

  return partes.join("\n");
}

export type ResultadoDaCopy = {
  copy: CopyDoPost;
  tokens: number;
  custoUsd: number;
};

/**
 * O feed não tem negrito, então marcação de negrito não entra aqui.
 *
 * A newsletter ganhou a instrução de marcar número e prazo com dois
 * asteriscos, e o template do e-mail converte isso em <strong>. O Instagram
 * não converte nada: o asterisco vai impresso na arte e na legenda, e o post
 * sai com "vale por **540 dias**".
 *
 * A instrução do negrito mora no prompt da redação, e não no briefing do
 * projeto, justamente porque o briefing é compartilhado pelos dois canais.
 * Esta limpeza é a segunda garantia: o briefing é editável pelo dono, e uma
 * linha sobre negrito escrita lá de novo voltaria a vazar para cá.
 */
function semMarcacaoDeNegrito<T>(dado: T): T {
  if (typeof dado === "string") return dado.replace(/\*\*([^*]*)\*\*/g, "$1").replace(/\*/g, "") as T;
  if (Array.isArray(dado)) return dado.map((x) => semMarcacaoDeNegrito(x)) as T;
  if (dado && typeof dado === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dado as Record<string, unknown>)) saida[k] = semMarcacaoDeNegrito(v);
    return saida as T;
  }
  return dado;
}

export async function gerarCopyDoPost(
  pauta: PautaAvaliada,
  pacote: PacoteFactual | null,
  marca: MarcaSocial,
  opcoes: { posicao?: number; env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<ResultadoDaCopy> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const posicao = opcoes.posicao ?? 0;

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDaCopy(marca) },
      { role: "user", content: montarUserDaCopy(pauta, pacote) },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  const copy = aceitarCopy(data, posicao, marca.keyword);
  return { copy, tokens: usage.totalTokens, custoUsd: usage.estimatedCostUsd };
}

/**
 * O que vale para toda copy que chega, do modelo da esteira ou do Claude.
 *
 * Exportado para o motor Claude via MCP (27/10/2026): a entrega do Claude
 * passa pela MESMA limpeza, pelo mesmo esquema e pelo mesmo CTA de código.
 * Lança quando a copy não cabe no esquema, como antes.
 */
export function aceitarCopy(data: unknown, posicao: number, keyword: string): CopyDoPost {
  const copy = CopyDoPostSchema.parse(semMarcacaoDeNegrito(limparVicios(data)));

  /*
   * O CTA é montado aqui, não pedido ao modelo.
   *
   * Deixar o modelo escrever a promessa é onde nasce "descubra se você pode
   * morar legalmente nos EUA", que promete uma resposta que só um advogado dá
   * depois de ver o caso. A ação é sempre a mesma e a forma varia por posição,
   * o que dá variedade sem abrir espaço para promessa nova.
   */
  copy.cta = levaCta(posicao) ? ctaDaPosicao(posicao, keyword) : "";
  return copy;
}

/**
 * Reescreve a copy corrigindo o que a guarda apontou.
 *
 * A reescrita recebe os problemas NOMEADOS, e não um pedido genérico de
 * melhorar. Um "reescreva melhor" produz outro texto com outros defeitos; um
 * "a manchete afirma 720 dias e a fonte diz 540" produz a correção.
 *
 * O pacote factual vai junto de novo, e é o ponto mais importante deste
 * prompt: reparar não pode virar uma segunda chance de inventar. O modelo
 * recebe a mesma restrição da primeira geração, mais a instrução explícita de
 * que remover é preferível a substituir por outra coisa.
 */
export async function repararCopyDoPost(
  copy: CopyDoPost,
  problemas: Array<{ motivo: string; detalhe: string }>,
  pauta: PautaAvaliada,
  pacote: PacoteFactual | null,
  marca: MarcaSocial,
  opcoes: { posicao?: number; env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<ResultadoDaCopy> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const posicao = opcoes.posicao ?? 0;

  const instrucao = instrucaoDeReparoDaCopy(copy, problemas);

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDaCopy(marca) },
      { role: "user", content: `${montarUserDaCopy(pauta, pacote)}

${instrucao}` },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  const corrigida = aceitarCopy(data, posicao, marca.keyword);

  return { copy: corrigida, tokens: usage.totalTokens, custoUsd: usage.estimatedCostUsd };
}

/**
 * O pedido de correção, exportado para o motor Claude via MCP (27/10/2026):
 * a tarefa devolvida para reparo leva este texto, o mesmo do reparo da esteira.
 */
export function instrucaoDeReparoDaCopy(
  copy: CopyDoPost,
  problemas: Array<{ motivo: string; detalhe: string }>,
): string {
  const lista = problemas.map((p, i) => `${i + 1}. [${p.motivo}] ${p.detalhe}`).join("\n");

  return `
O texto abaixo foi recusado. Corrija APENAS os problemas listados e devolva o JSON inteiro.

PROBLEMAS A CORRIGIR:
${lista}

REGRAS DA CORREÇÃO:
- Não invente nada para tapar buraco. Se um número, prazo ou nome não está no pacote factual, REMOVA a frase inteira em vez de trocar por outro valor.
- Não mexa no que não foi apontado. Frase que não tem problema fica como está.
- Manchete: de ${FORMA_DA_MANCHETE.minimoDePalavras} a ${FORMA_DA_MANCHETE.maximoDePalavras} palavras, afirmando o fato, sem pergunta e sem clickbait.
- Não escreva despedida, assinatura nem "Até amanhã".
- Não prometa aprovação, elegibilidade, prazo ou custo.

TEXTO RECUSADO:
${JSON.stringify(copy, null, 2)}
`;
}

/**
 * Monta o corpo da legenda: o lide e os parágrafos, sem fecho e sem hashtag.
 *
 * O fecho ("Siga @eua.journal") e a hashtag, quando o projeto a liga, ficam
 * com `fecharLegenda`, que é a camada que decide posição e conteúdo deles e
 * tira o crédito de foto. Montar aqui e lá produziria fecho duplicado.
 *
 * Desde 06/10/2026 o corpo é o lide mais `paragrafos`. Os campos antigos
 * (`fato_principal`, `contexto`, `informacao_util`, `ressalva`) só entram
 * quando a lista vem vazia, que é o que uma instrução antiga ainda ativa no
 * banco produz: a legenda continua montável enquanto o dono não grava a nova.
 * Item que chega com linha em branco dentro vira parágrafos separados, e
 * linha solta dentro de um parágrafo vira espaço: parágrafo é bloco.
 */
export function montarLegenda(copy: CopyDoPost): string {
  const paragrafos = (copy.paragrafos ?? []).map((p) => (p ?? "").trim()).filter(Boolean);
  const corpo = paragrafos.length
    ? [copy.gancho, ...paragrafos, copy.ressalva]
    : [copy.gancho, copy.fato_principal, copy.contexto, copy.informacao_util, copy.ressalva];
  return corpo
    .flatMap((p) => (p ?? "").split(/\n\s*\n/))
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}
