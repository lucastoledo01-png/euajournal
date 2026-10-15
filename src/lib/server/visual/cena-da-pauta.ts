import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import { cardapioParaOModelo, tagDoCatalogo } from "./acervo/catalogo-de-cenas";

/**
 * O que fotografar quando a pauta não tem entidade nomeada.
 *
 * Havia dois caminhos, e só o primeiro olhava para a matéria. Com entidade
 * nomeada, o sistema resolve Trump, a USCIS ou o Fed no Wikidata e busca a
 * foto daquela coisa. Sem entidade nomeada, ele desistia de olhar o conteúdo e
 * caía numa lista de 16 temas escritos à mão, casados por radical de palavra,
 * na ordem, primeiro que casar vence.
 *
 * O dono apontou o erro em 18/09/2026, e a frase dele é o resumo do problema:
 * "compradores de imóvel ganham margem não tem entidade fotografável, isso
 * está errado, porque existe um objeto que contextualiza com o conteúdo".
 * Tinha casas. Tinha imóveis. A lista é que não sabia.
 *
 * Três defeitos medidos naquele dia, e os três são do MÉTODO, não dos termos:
 *
 *   Um radical errado derruba tudo. O tema de moradia tinha "imovel", a
 *   manchete dizia "imóveis", e "imovel" não é prefixo de "imoveis": o L
 *   quebra. A pauta literalmente sobre imóveis caiu no skyline genérico.
 *
 *   A ordem rouba. Moradia é o penúltimo dos 16. "Aluguel pesa mais no
 *   orçamento e pressiona a economia" foi para notas de dólar, porque
 *   "economia" vem antes na lista.
 *
 *   São 16 gavetas para o mundo inteiro. Robotáxi, controlador de voo e dado
 *   do Census não têm gaveta, e caem todos no mesmo skyline.
 *
 * A saída é perguntar. O sistema já faz uma chamada de modelo para CONFERIR a
 * imagem; faltava uma para DESCREVER o que fotografar. Os 16 temas continuam,
 * como rede: chamada que falha cai neles, e não no vazio.
 */

/** Curto porque existe rede embaixo: falhar rápido custa menos que esperar. */
const TEMPO_LIMITE_MS = 30_000;

export type CenaDaPauta = {
  /** A busca, em inglês, porque é o idioma dos bancos de imagem. */
  consulta: string;
  /** O objeto em português, para o relatório dizer o que foi pedido. */
  objeto: string;
  /** A chamada não pôde ser feita, e quem chama deve usar o tema fixo. */
  falhou: boolean;
  motivo: string;
  /**
   * O que esta pergunta custou, em dólar.
   *
   * O ramo visual inteiro jogava `usage` fora, então o relatório somava
   * classificação, pacote factual e edição, e nada do visual. Dobrar as
   * chamadas deste ramo não mudava um centavo no número que alguém lê, e quem
   * fosse medir o efeito da mudança não teria com o que comparar.
   */
  custoUsd: number;
  /**
   * A tag do acervo próprio, escolhida de uma lista fechada (29/09/2026).
   *
   * Só existe quando quem chama pede (`comTag`), e é `null` quando o modelo
   * não achou cena no cardápio ou devolveu algo fora dele. Opcional no tipo
   * para os literais que já existem continuarem compilando.
   */
  tag?: string | null;
  /**
   * A segunda busca, mais ampla, para o degrau seguinte da escada da cena
   * (06/10/2026): o ambiente ou o objeto genérico do mesmo assunto. Vazia
   * quando o modelo não devolveu ou quando ela pedia o que a regra proíbe.
   */
  consultaAmpla?: string;
};

export type PautaParaCena = {
  titulo: string;
  resumo?: string;
  categoria?: string;
  /**
   * "EUA" ou "Brasil", quando a classificação sabe.
   *
   * O tema fixo já acrescentava isso à consulta, e o caminho da cena perdia:
   * uma pauta brasileira podia pedir cena americana. Aqui ele entra como
   * contexto, e a instrução decide onde encaixar.
   */
  pais?: string;
};

export type OpcoesDaCena = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  modelo?: string;
  /**
   * Pede também a tag do acervo próprio.
   *
   * Desligado por padrão, e é isso que mantém o prompt de produção byte a byte
   * igual enquanto a capacidade `acervo` não estiver ligada no projeto: quem
   * pede é o resolvedor, e só quando recebeu um acervo.
   */
  comTag?: boolean;
  /**
   * Por que o editor recusou fotos do canal que pergunta (06/10/2026,
   * aprendizado da fila). Entra na ENTRADA, e não na instrução, para a
   * instrução continuar a mesma para todo canal; ausente, a entrada também.
   */
  recusasDoEditor?: string[];
};

/** O trecho da entrada com as recusas do editor. Vazio quando não há o que dizer. */
export function trechoDasRecusas(recusas: string[] | undefined): string {
  const limpas = (recusas ?? []).map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4);
  if (limpas.length === 0) return "";
  return [
    "O EDITOR DESTE CANAL JÁ RECUSOU FOTOS ASSIM. Escolha outra cena, que não caia no mesmo motivo:",
    ...limpas.map((r) => `- ${r.slice(0, 160)}`),
  ].join("\n");
}

/**
 * As duas proibições são do dono, ditas com essas palavras em 18/09/2026:
 * "nunca pessoa identificável nem texto na imagem".
 *
 * Elas não são gosto. Pessoa anônima ilustrando "compradores de imóveis" é
 * escolher alguém para representar um grupo, e no caso de "brasileiros nos
 * EUA" seria inferir nacionalidade por aparência. E texto dentro da foto
 * compete com a manchete da peça, que já é o texto da peça.
 *
 * Aqui elas entram como PEDIDO. Quem as cobra de verdade é a conferência
 * visual, que abre a imagem: pedido não é garantia, e a régua tem que estar
 * dos dois lados.
 */
const SISTEMA = `Você escolhe o que fotografar para ilustrar uma notícia.

A publicação é brasileira, escreve em português e cobre os Estados Unidos.

Você recebe a manchete e o resumo. Devolva o OBJETO ou a CENA concreta que
ilustra o assunto, e uma busca em inglês para achar essa foto num banco de
imagens.

PRIMEIRO, O OBJETO DA NOTÍCIA. Antes de pensar em cena, pergunte: a manchete
nomeia uma COISA que tem forma física? Um programa com documento próprio (o
cartão da Social Security, o título do Tesouro), um produto (o Big Mac, o
iPhone, o Ozempic), um prédio (a sede do Fed), um veículo, uma moeda. Se
nomeia, ESSA coisa é a foto, e a busca pede ela pelo nome em inglês. O nome
do próprio objeto impresso nele (o "SOCIAL SECURITY" do cartão, a embalagem
do produto) é identidade do assunto e não conta como texto proibido.
Nunca ilustre um programa ou órgão com a pessoa histórica ligada a ele: o
fundador, quem assinou a lei, o retrato antigo. A notícia é de hoje.

REGRAS DURAS:
- Substantivo CONCRETO e fotografável: casa, rua residencial, prédio de
  escritório, canteiro de obras, prateleira de mercado, torre de controle,
  carro autônomo, fachada de tribunal. Nunca abstração: "economia",
  "oportunidade", "futuro" não se fotografam.
- A cena é no PAÍS DA PAUTA, que vem na entrada. Sem país declarado, assuma os
  Estados Unidos. Se a busca puder trazer outro país, acrescente o estado ou a
  cidade que a matéria cita, ou "united states", ou "brazil".
- NUNCA pessoa identificável. Nada de retrato, rosto, multidão em close nem
  "família feliz". Se a cena pedir gente, escolha o lugar onde a gente está,
  não a gente.
- NUNCA texto na imagem, salvo o nome do próprio objeto da notícia. Nada de placa legível, cartaz, manchete de jornal,
  tela com texto, letreiro. A peça já tem a manchete escrita por cima.
- E NÃO PEÇA o que só se fotografa com placa. "casas à venda" devolve placa de
  "for sale"; "loja fechada" devolve cartaz; "protesto" devolve faixa. Peça o
  LUGAR ou o OBJETO, e deixe o estado para a manchete: em vez de "casas à
  venda", peça "rua residencial americana"; em vez de "loja fechada", peça
  "fachada de loja vazia".
- Nada de logotipo nem marca de empresa que não seja o objeto da notícia.
- A busca tem de 3 a 7 palavras, em inglês, sem aspas e sem operadores.
- Devolva também uma BUSCA AMPLA: o ambiente ou o objeto genérico do mesmo
  assunto, de 2 a 5 palavras, para quando a primeira não render foto. Ela
  segue as mesmas regras. Ex.: para a torre de controle, "airport runway
  airplanes"; para o carro autônomo, "city street traffic united states".

EXEMPLOS
manchete: "Compradores de imóveis ganham margem de negociação com vendas no
menor nível em quase três anos nos EUA"
  objeto: rua residencial americana com casas
  consulta: american suburban residential street houses
  (repare: NÃO "for sale", que devolveria placa)

manchete: "Controladores de voo nos EUA terão apoio de IA de US$ 875 milhões"
  objeto: torre de controle de aeroporto
  consulta: airport control tower exterior united states
  ampla: airport runway airplanes

manchete: "Social Security Administration anuncia reajuste de 3,6% para
pagamentos de janeiro"
  objeto: o cartão da Social Security
  consulta: social security card united states
  ampla: social security benefits retirement
  (repare: o objeto do programa, e NÃO o retrato de Franklin Roosevelt, que
  criou o programa em 1935; o dono reprovou exatamente isso em 14/10/2026)

manchete: "McDonald's sobe preço do Big Mac nos EUA"
  objeto: o sanduíche Big Mac
  consulta: big mac burger mcdonalds

manchete: "Zoox pode ampliar frota de robotáxis em Nevada"
  objeto: carro autônomo numa rua de cidade
  consulta: autonomous vehicle city street sensors

Responda só com JSON:
{ "objeto": "o objeto ou cena, em português, em poucas palavras",
  "consulta": "a busca em inglês",
  "ampla": "a busca ampla em inglês" }`;

/**
 * O pedaço que só entra quando o acervo próprio está ligado.
 *
 * O modelo que já lê a matéria escolhe a tag de um cardápio fechado. Modelo
 * escolhendo de cardápio é confiável; lista de palavras adivinhando pelo título
 * não é (decisão de 29/09/2026, depois de "ice" casar dentro de "justice").
 * "nenhuma" é resposta válida e preferível a uma tag forçada: tag errada põe
 * no ar uma foto do acervo que não é da pauta, e a conferência visual não
 * reabre foto do acervo.
 */
export function instrucaoDaTag(): string {
  return `

TAG DO ACERVO
Escolha também a cena do nosso acervo que melhor ilustra a pauta, do cardápio
abaixo. Cada linha é um grupo e suas cenas; a tag é "grupo/cena", exatamente
como escrito (ex.: "moradia/rua_residencial"). Se nenhuma cena do cardápio
mostra o assunto, devolva "nenhuma": tag forçada é pior que tag nenhuma.

${cardapioParaOModelo()}

Com a tag, a resposta fica:
{ "objeto": "...", "consulta": "...", "ampla": "...", "tag": "grupo/cena ou nenhuma" }`;
}

/** A tag devolvida, se ela estiver no cardápio. Qualquer outra coisa é `null`. */
export function tagValida(valor: unknown): string | null {
  const t = texto(valor).toLowerCase().replace(/\s+/g, "");
  if (!t || t === "nenhuma") return null;
  return tagDoCatalogo(t) ? t : null;
}

type RespostaDoModelo = { objeto?: unknown; consulta?: unknown; ampla?: unknown; tag?: unknown };

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function naoDeuParaPerguntar(motivo: string, custoUsd = 0): CenaDaPauta {
  return { consulta: "", objeto: "", falhou: true, motivo, custoUsd };
}

/**
 * Palavras que denunciam que o modelo devolveu o que a regra proíbe.
 *
 * É rede de segurança barata, não substituto da conferência visual: ela pega o
 * pedido errado antes de gastar uma busca, e o que escapar aqui ainda passa
 * pelo modelo que abre a imagem.
 */
const PROIBIDAS = [
  /*
   * Só termos que NÃO colidem com cena legítima.
   *
   * A revisão desta mudança mediu o custo do falso positivo: "man made lake
   * aerial" era barrado por "man", e um acerto do filtro não reformula a
   * pergunta, ele declara falha e joga a pauta no tema fixo. Então "man",
   * "woman", "face" e "text" saíram: são os que mais colidem, e quem os pega
   * de verdade é a conferência visual, que abre a imagem.
   *
   * Plural e derivada entram, porque a régua casa palavra inteira: "persons"
   * não é "person".
   */
  "person", "persons", "people", "peoples", "family", "families",
  "portrait", "portraits", "faces", "crowd", "crowds", "human", "humans",
  "businessman", "businessmen", "businesswoman", "businesswomen",
  "child", "children", "student", "students", "men", "women",
  "worker", "workers", "sign", "signs", "signage", "banner", "banners",
  "poster", "posters", "billboard", "billboards", "newspaper", "newspapers",
  "headline", "headlines", "lettering", "typography", "logo", "logos",
  /*
   * Estados que só se fotografam com placa.
   *
   * Medido em 18/09/2026: a cena pediu "casas à venda" e as TRÊS candidatas do
   * Pexels vinham com "FOR SALE" legível, recusadas pela regra de texto. O
   * pedido brigava com a regra, e quem perde é a pauta, que cai na bandeira.
   */
  "for sale", "for rent", "sold", "closing down", "protest", "strike",
];

export function consultaProibida(consulta: string): string | null {
  const limpo = ` ${consulta.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  for (const p of PROIBIDAS) {
    if (limpo.includes(` ${p} `)) return p;
  }
  return null;
}

export async function cenaDaPauta(
  pauta: PautaParaCena,
  opcoes: OpcoesDaCena = {},
): Promise<CenaDaPauta> {
  const env = opcoes.env ?? process.env;
  const config = getAIProviderConfig(env);
  if (!config.isConfigured) return naoDeuParaPerguntar("sem credencial de modelo");

  const titulo = (pauta.titulo ?? "").trim();
  if (titulo.length === 0) return naoDeuParaPerguntar("pauta sem título");

  const modelo = opcoes.modelo || env.OPENAI_MODEL_VISUAL || config.triageModel;
  const entrada = [
    `MANCHETE: ${titulo}`,
    pauta.resumo ? `RESUMO: ${pauta.resumo.slice(0, 600)}` : "",
    pauta.categoria ? `EDITORIA: ${pauta.categoria}` : "",
    pauta.pais ? `PAÍS DA PAUTA: ${pauta.pais}` : "",
    trechoDasRecusas(opcoes.recusasDoEditor),
  ]
    .filter(Boolean)
    .join("\n");

  let resposta: RespostaDoModelo;
  let custoUsd = 0;
  try {
    const { data, usage } = await callOpenAIJSON<RespostaDoModelo>(
      [
        { role: "system", content: opcoes.comTag ? SISTEMA + instrucaoDaTag() : SISTEMA },
        { role: "user", content: entrada },
      ],
      modelo,
      env,
      opcoes.fetcher ?? fetch,
      /*
       * Sem `temperature`, de propósito.
       *
       * O modelo em produção recusa `temperature: 0`, e isso já custou uma
       * medição inteira em 17/09, quando quatro de quatro imagens foram
       * recusadas por um 400 de parâmetro. Aqui não há o que estabilizar: duas
       * descrições diferentes da mesma casa são as duas certas.
       */
      {},
      /*
       * O tempo limite estava DECLARADO e não era passado: a constante existia,
       * o comentário dela dizia "falhar rápido custa menos que esperar", e a
       * chamada usava o padrão de dois minutos do provedor. Numa manhã de fila
       * na OpenAI, cada pauta esperaria dois minutos antes de cair no tema fixo.
       * Achado na revisão adversarial desta mudança, antes de publicar.
       */
      TEMPO_LIMITE_MS,
    );
    resposta = data;
    custoUsd = usage.estimatedCostUsd;
  } catch (erro) {
    return naoDeuParaPerguntar(`chamada falhou: ${(erro as Error).message}`);
  }

  const consulta = texto(resposta.consulta).replace(/["']/g, "").slice(0, 120);
  const objeto = texto(resposta.objeto).slice(0, 120);
  /*
   * A tag sobrevive à consulta recusada (05/10/2026). A consulta vai para
   * banco de terceiro e por isso passa pelo filtro de pessoa e placa; a tag
   * aponta para o NOSSO acervo, que foi conferido na entrada. Perder a tag
   * porque a busca em inglês pediu "sign" jogaria fora a foto que já temos.
   */
  const comTag = opcoes.comTag ? { tag: tagValida(resposta.tag) } : {};

  if (consulta.split(/\s+/).filter(Boolean).length < 2) {
    return { ...naoDeuParaPerguntar("consulta devolvida curta demais para buscar", custoUsd), ...comTag };
  }

  const proibida = consultaProibida(consulta);
  if (proibida) {
    return { ...naoDeuParaPerguntar(`consulta pedia "${proibida}", que a regra proíbe`, custoUsd), ...comTag };
  }

  const ampla = texto(resposta.ampla).replace(/["']/g, "").slice(0, 120);
  const consultaAmpla =
    ampla.split(/\s+/).filter(Boolean).length >= 2 &&
    !consultaProibida(ampla) &&
    ampla.toLowerCase() !== consulta.toLowerCase()
      ? ampla
      : "";

  return {
    consulta,
    objeto,
    falhou: false,
    motivo: "",
    custoUsd,
    ...comTag,
    ...(consultaAmpla ? { consultaAmpla } : {}),
  };
}
