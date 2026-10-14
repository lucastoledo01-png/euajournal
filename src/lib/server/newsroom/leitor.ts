import { instrucaoDoMesSemAno, mesesSemAno } from "@/lib/datas-no-texto";
import type { EditionContent, EditionStory } from "./schemas";
import { palavrasChave } from "../editorial/fingerprint";

/**
 * A newsletter é para quem quer morar nos EUA, não para quem advoga sobre isso.
 *
 * A edição de 09/09 saiu tecnicamente correta e ilegível para o público. Um
 * título real dela: "Na Califórnia, acordos nupciais geralmente não encerram o
 * I-864". Ninguém que está pensando em se mudar procura essa frase, e quem a
 * entende já não precisa da newsletter.
 *
 * As duas verificações aqui são determinísticas, e isso é escolha. Poderiam ser
 * uma pergunta ao modelo — "este texto está acessível?" —, e a resposta variaria
 * a cada execução, custaria uma chamada por edição e não diria O QUE consertar.
 * Contar termo técnico sem explicação e medir se a matéria diz para quem ela
 * importa dá um apontamento nominal, reproduzível e barato, que é o que o
 * reparo precisa para saber onde mexer.
 *
 * Nenhuma das duas BLOQUEIA a edição. Elas entram na lista de reparo, o gerador
 * tenta consertar duas vezes, e o que sobrar sobra registrado. Texto difícil é
 * defeito de redação, não fato inventado: derrubar a edição por causa dele
 * trocaria um problema de forma por um dia sem newsletter.
 */

/**
 * Termos que o público não conhece, e que a matéria precisa explicar na
 * primeira vez que usa.
 *
 * A lista é curta de propósito: é o vocabulário que apareceu de fato nas
 * edições, mais o que o dono do produto apontou. Uma lista enorme geraria
 * apontamento em toda edição e o reparo aprenderia a ignorar.
 */
export const TERMOS_TECNICOS = [
  "adjustment of status",
  "affidavit of support",
  "priority date",
  "public charge",
  "consular processing",
  "petitioner",
  "beneficiary",
  "injunction",
  "liminar",
  "writ",
  "waiver",
  "parole",
  "removal proceedings",
  "notice to appear",
  "request for evidence",
  "prima facie",
  "obrigação federal de suporte",
  "acordo pré-nupcial",
  "acordo pós-nupcial",
] as const;

/**
 * Número de formulário e sigla de visto: I-864, I-765, EB-2, H-1B, DS-160.
 *
 * Eles são o vocabulário diário desta vertical e não dá para proibir. O que dá
 * para exigir é que a primeira aparição venha com o que a coisa é.
 */
const CODIGO_TECNICO = /\b(?:[A-Z]{1,3}-\d{1,4}[A-Z]?\d?|NIW|EAD|USCIS|DHS|ICE|CBP)\b/g;

/**
 * O que conta como explicação logo depois do termo.
 *
 * Não se exige uma definição formal: basta o texto dizer, ali, o que aquilo é
 * ou para que serve. A janela é curta porque explicação que aparece três
 * parágrafos depois não ajuda quem travou na primeira leitura.
 */
const JANELA_DA_EXPLICACAO = 160;
const MARCAS_DE_EXPLICACAO = [
  "documento",
  "formulário",
  "formulario",
  "processo",
  "pedido",
  "visto",
  "autorização",
  "autorizacao",
  "permissão",
  "permissao",
  "que é",
  "que e",
  "ou seja",
  "isto é",
  "isto e",
  "usado para",
  "usada para",
  "serve para",
  "significa",
  "quando",
  "etapa",
  "regra",
  "decisão",
  "decisao",
  "agência",
  "agencia",
  "órgão",
  "orgao",
  /*
   * Marcas de FALA, e elas entraram por necessidade.
   *
   * A lista acima só reconhece explicação escrita no registro formal
   * ("documento em que...", "processo pelo qual..."). Depois que o tom do
   * produto passou a ser conversa, a explicação boa virou outra: "o I-765 é o
   * pedido de autorização de trabalho", "funciona assim", "na prática". Sem
   * estas marcas, o texto leve era apontado como jargão não explicado, ia para
   * o reparo, e o reparo devolvia o aposto jurídico. A régua desfazia, todo
   * dia, a mudança que o prompt pedia.
   */
  /*
   * "é o" e "é a" sozinhos ficaram de fora depois de tentados: em uma janela
   * de 160 caracteres eles aparecem em quase toda frase, e a régua parava de
   * apontar qualquer jargão. Marca que reconhece tudo não reconhece nada.
   * As que ficaram são as que só aparecem quando alguém está de fato
   * explicando, e a lista formal acima já cobre "é o pedido de autorização",
   * porque "pedido" e "autorização" estão nela.
   */
  "é quando",
  "e quando",
  "funciona assim",
  "na prática",
  "na pratica",
  "quer dizer",
  "em outras palavras",
  "nada mais é",
  "nada mais e",
  "vale para",
  "serve de",
];

/**
 * O termo aparece e, na janela seguinte DENTRO DO MESMO CAMPO, nada diz o que
 * ele é.
 *
 * A restrição ao campo não é detalhe. A primeira versão procurava no texto
 * inteiro concatenado, e uma palavra como "autorização" no `practical_impact`
 * passava a "explicar" um `waiver` que apareceu no `summary` cem caracteres
 * antes. Explicação que o leitor só encontra dois blocos depois não ajuda quem
 * travou na primeira leitura, e o teste que pegou isso existia justamente para
 * medir o teto de termos.
 */
function semExplicacao(campo: string, termo: string, posicao: number): boolean {
  const inicio = posicao + termo.length;
  const depois = campo.slice(inicio, inicio + JANELA_DA_EXPLICACAO).toLowerCase();
  return !MARCAS_DE_EXPLICACAO.some((m) => depois.includes(m));
}

/** Os campos que o leitor lê, na ordem em que ele lê. */
function camposDaMateria(s: EditionStory): string[] {
  return [s.title, s.summary, s.context, s.why_it_matters, s.practical_impact].filter(Boolean);
}

/**
 * O termo é explicado em algum lugar onde ele aparece?
 *
 * Basta uma aparição vir acompanhada do que a coisa é. Exigir explicação em
 * TODAS as aparições faria a segunda menção do mesmo formulário na mesma
 * matéria virar apontamento, o que é o oposto de texto natural.
 */
function explicadoEmAlgumCampo(campos: string[], termo: string): boolean {
  for (const campo of campos) {
    const minusculo = campo.toLowerCase();
    let pos = minusculo.indexOf(termo);
    while (pos >= 0) {
      if (!semExplicacao(minusculo, termo, pos)) return true;
      pos = minusculo.indexOf(termo, pos + 1);
    }
  }
  return false;
}

/**
 * Dois conjuntos de motivo, e a separação não é burocracia.
 *
 * `MotivoDeTexto` é o que se pode apontar olhando UM texto: jargão, relevância
 * e comprimento de título. O carrossel do Instagram usa exatamente essa régua,
 * pelo mesmo módulo, e por isso ela não pode crescer sem que ele cresça junto.
 *
 * `REDUNDANT_SUBHEAD` não cabe ali: ele nasce da relação entre DUAS linhas, o
 * título e a que vem embaixo. Quando ele foi acrescentado ao motivo único, o
 * `next build` recusou na hora, porque a guarda do social mapeia os achados
 * para os motivos dela e não conhece esse. O erro estava certo: a régua do
 * slide não deve herdar uma conferência que ele não faz.
 */
export type MotivoDeTexto =
  | "LEGAL_JARGON_OVERLOAD"
  | "LOW_READER_RELEVANCE"
  | "HEADLINE_TOO_LONG"
  | "FOREIGN_SUBJECT"
  | "COUNTRY_UNCLEAR";
export type MotivoDeLeitor = MotivoDeTexto | "REDUNDANT_SUBHEAD" | "MONTH_WITHOUT_YEAR";

export type AchadoDeLeitor = {
  indice: number;
  motivo: MotivoDeLeitor;
  descricao: string;
};

/** Acima disto a matéria virou peça jurídica. */
const TETO_DE_TERMOS_SEM_EXPLICACAO = 2;

/**
 * Comprimento de título que o celular aguenta.
 *
 * A 390px de largura, com o corpo em 22px, cabem cerca de 30 caracteres por
 * linha. Um título de 90 caracteres ocupa três linhas; de 120, quatro. O teto
 * aqui é editorial e não de CSS: reduzir a fonte para caber é o que produziu
 * texto minúsculo, e a saída certa é o título ser mais curto.
 */
const TETO_DO_TITULO = 95;

/**
 * Gentílico de terceiro país no título.
 *
 * O caso real: "O-1B para designer de cenários do México" e "Cirurgião
 * mexicano tem aprovação em caso de EB-2 NIW". O fato é verdadeiro e o visto
 * interessa, mas o leitor está no Brasil indo para os Estados Unidos, e a
 * nacionalidade de um terceiro não diz nada a ele. Pior: ela ocupa a primeira
 * metade da frase, que é onde deveria estar o que muda e para quem.
 *
 * `brasileiro` e `americano` ficam de fora da lista, porque são os dois países
 * da publicação. Este apontamento é REPARÁVEL, e não bloqueio: quando o país é
 * o OBJETO da regra, como no TPS de El Salvador, o gentílico é legítimo, e
 * quem decide isso é a reescrita com o pacote factual na mão.
 */
const GENTILICOS_DE_TERCEIRO_PAIS = [
  "mexicano", "mexicana", "mexicanos", "mexicanas",
  "salvadorenho", "salvadorenha", "salvadorenhos", "salvadorenhas",
  "venezuelano", "venezuelana", "venezuelanos", "venezuelanas",
  "colombiano", "colombiana", "colombianos", "colombianas",
  "cubano", "cubana", "cubanos", "cubanas",
  "haitiano", "haitiana", "haitianos", "haitianas",
  "argentino", "argentina", "argentinos", "argentinas",
  "peruano", "peruana", "peruanos", "peruanas",
  "indiano", "indiana", "indianos", "indianas",
  "chines", "chinesa", "chineses", "chinesas",
  "russo", "russa", "russos", "russas",
  "ucraniano", "ucraniana", "ucranianos", "ucranianas",
  "filipino", "filipina", "filipinos", "filipinas",
  "nigeriano", "nigeriana", "nigerianos", "nigerianas",
  "coreano", "coreana", "coreanos", "coreanas",
  "japones", "japonesa", "japoneses", "japonesas",
  "alemao", "alema", "alemaes",
  "frances", "francesa", "franceses", "francesas",
  "italiano", "italiana", "italianos", "italianas",
  "espanhol", "espanhola", "espanhois", "espanholas",
  "portugues", "portuguesa", "portugueses", "portuguesas",
];

function semAcento(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function gentilicoDeTerceiroPais(titulo: string): string | null {
  const limpo = ` ${semAcento(titulo).replace(/[^a-z0-9]+/g, " ")} `;
  for (const g of GENTILICOS_DE_TERCEIRO_PAIS) {
    if (limpo.includes(` ${g} `)) return g;
  }
  return null;
}

/**
 * O título não diz de que país ele fala.
 *
 * Em 17/09/2026 saiu um post com a manchete "Quem ganha menos quase não
 * participou do recorde de renda familiar em 2025". O dono leu e perguntou se
 * aquilo era sobre o Brasil ou sobre os Estados Unidos, e a pergunta é
 * legítima: a frase serve para os dois países, palavra por palavra.
 *
 * Para esta publicação isso é defeito grave por dois motivos. O leitor brasileiro
 * assume o Brasil por padrão, porque é onde ele está. E a mesma frase lida como
 * notícia do Brasil vira notícia dos EUA soando mal, que é o contrário da linha
 * editorial.
 *
 * A régua não exige a palavra "EUA": exige QUALQUER marca que situe o leitor, e
 * o Brasil serve igual, porque o problema é a ambiguidade e não a ausência de um
 * país específico. Instituição, cidade, estado, moeda local, figura pública e
 * termo que só existe num dos dois já bastam.
 *
 * É APONTAMENTO de reparo, nunca bloqueio: existe manchete legítima sem marca
 * geográfica, e quem decide com o pacote na mão é a reescrita.
 */
const MARCAS_DE_PAIS = [
  // Estados Unidos, o país da publicação
  "eua", "estados unidos", "americano", "americana", "americanos", "americanas",
  "norte-americano", "norte-americana",
  "washington", "casa branca", "wall street", "vale do silicio", "silicon valley",
  "nova york", "new york", "california", "texas", "florida", "chicago", "boston",
  "miami", "los angeles", "seattle", "atlanta", "houston", "dallas", "filadelfia",
  "nevada", "arizona", "ohio", "michigan", "illinois", "virginia", "maryland",
  "massachusetts", "colorado", "oregon", "utah", "minnesota", "wisconsin",
  "missouri", "tennessee", "kentucky", "alabama", "louisiana", "oklahoma",
  "kansas", "nebraska", "connecticut", "nova jersey", "new jersey", "pensilvania",
  "uscis", "dhs", "cbp", "fed", "federal reserve", "capitolio", "pentagono",
  "departamento de estado", "departamento do trabalho", "suprema corte",
  "census", "irs", "fbi", "medicare", "medicaid", "green card",
  "trump", "biden", "powell",
  // Termo que só existe lá (regra 8 do modelo de título), medido em 05/10/2026
  // no título "Hollywood atrai capital privado", que já situa sem "nos EUA".
  "hollywood", "dow jones", "nasdaq",
  // Brasil, que é o outro lado da comparação e situa igual
  "brasil", "brasileiro", "brasileira", "brasileiros", "brasileiras",
  "sao paulo", "rio de janeiro", "brasilia", "minas gerais",
  "stf", "supremo", "congresso nacional", "banco central", "selic", "ibge",
  "lula", "bolsonaro", "reais",
];

export function paisNaoIdentificavel(titulo: string): boolean {
  const limpo = ` ${semAcento(titulo).replace(/[^a-z0-9]+/g, " ")} `;
  return !MARCAS_DE_PAIS.some((m) => limpo.includes(` ${semAcento(m).replace(/[^a-z0-9]+/g, " ")} `));
}

export type AchadoSemIndice = { motivo: MotivoDeTexto; descricao: string };

/**
 * A régua de leitor sobre um texto qualquer, em campos.
 *
 * Ela foi extraída de dentro do laço de matérias sem mudar uma linha do que
 * decide, porque o carrossel do social precisa exatamente destas três verificações
 * e duplicá-las seria manter duas definições de "termo explicado" que divergem
 * na primeira calibração. Quem chama diz o que são os campos, qual é o título e
 * onde mora a relevância; o resto é igual para newsletter e para slide.
 */
export function conferirLinguagemDeUmTexto(entrada: {
  campos: string[];
  titulo: string;
  relevancia: string;
  /**
   * Onde o autor deve escrever a relevância, no vocabulário de quem chama.
   *
   * A newsletter tem campos com nome, e o reparo funciona muito melhor dizendo
   * "escreva em why_it_matters" do que "escreva a relevância". O carrossel não
   * tem esses campos, e por isso o texto genérico é o padrão.
   */
  ondeEscreverRelevancia?: string;
  /**
   * O teto de caracteres do título, quando quem chama tem outro (06/10/2026).
   *
   * Os 95 daqui são do título da newsletter e do portal, medidos num celular
   * de 390px em corpo de 22px. A capa do Instagram é outra peça: a faixa da
   * manchete tem topo e base fixos e o corpo do tipo é medido no navegador, e
   * cabe 130 (`FORMA_DA_MANCHETE`). O carrossel passa o teto da arte dele.
   */
  tetoDoTitulo?: number;
}): AchadoSemIndice[] {
  const achados: AchadoSemIndice[] = [];
  const campos = entrada.campos.filter(Boolean);
  const texto = campos.join("\n");

  const semExplicar = new Set<string>();

  for (const termo of TERMOS_TECNICOS) {
    if (texto.toLowerCase().includes(termo) && !explicadoEmAlgumCampo(campos, termo)) {
      semExplicar.add(termo);
    }
  }

  for (const achado of texto.matchAll(CODIGO_TECNICO)) {
    const codigo = achado[0];
    if (!explicadoEmAlgumCampo(campos, codigo.toLowerCase())) semExplicar.add(codigo);
  }

  if (semExplicar.size > TETO_DE_TERMOS_SEM_EXPLICACAO) {
    achados.push({
      motivo: "LEGAL_JARGON_OVERLOAD",
      descricao:
        `${semExplicar.size} termos técnicos aparecem sem dizer o que são: ` +
        `${[...semExplicar].join(", ")}. Explique cada um na primeira vez, em linguagem comum, ` +
        `ou reescreva a frase sem o termo.`,
    });
  }

  /*
   * Relevância: o texto diz para QUEM aquilo importa?
   *
   * O que se confere é se ele fala do leitor — alguém que quer morar, trabalhar,
   * estudar ou construir vida nos EUA — em vez de repetir o fato em outras
   * palavras, que é o que acontece quando o modelo preenche o campo por
   * obrigação.
   */
  const relevancia = entrada.relevancia.toLowerCase();
  const falaDoLeitor = [
    "quem",
    "você",
    "voce",
    "brasileir",
    "candidat",
    "solicitant",
    "estudant",
    "trabalhador",
    "profissional",
    "famíli",
    "famili",
    "imigrant",
    "empregador",
    "aplicant",
    "titular",
    "beneficiári",
    "beneficiari",
  ].some((m) => relevancia.includes(m));

  /*
   * Relevância vazia é resultado válido, e não falha.
   *
   * Nem toda pauta tem relevância com lastro. Uma liminar que só diz "a medida
   * está suspensa" não informa quem é afetado, e não existe frase de impacto
   * que o pacote sustente. Enquanto o vazio era apontado como problema, o laço
   * de reparo insistia, e a redação produzia o único texto possível: hedge que
   * o auditor semântico recusa. Em 16/09/2026 saiu assim, com QA 94:
   *
   *   "Pessoas sujeitas à nova regra podem ser afetadas, mas a fonte não
   *    informa quais grupos específicos estão abrangidos."
   *
   * Dois portões empurrando em direções opostas custam o dia inteiro. Este
   * cede, e o do lastro não: a régua de alucinação continua intacta.
   *
   * O que não muda é a régua para quem ESCREVEU alguma coisa. Relevância curta
   * ou que não fala com o leitor continua sendo apontada, porque aí houve
   * tentativa e ela saiu ruim.
   */
  if (relevancia.trim().length === 0) {
    // Silêncio deliberado. Segue para as outras conferências.
  } else if (relevancia.trim().length < 40 || !falaDoLeitor) {
    const onde = entrada.ondeEscreverRelevancia ? `Escreva em ${entrada.ondeEscreverRelevancia} ` : "Escreva ";
    achados.push({
      motivo: "LOW_READER_RELEVANCE",
      /*
       * Esta descrição pedia "o que essa pessoa deve fazer ou observar agora",
       * e o prompt do redator PROÍBE exatamente isso, com a palavra NUNCA.
       * O único texto que satisfazia os dois lados era a frase de hedge com
       * ressalva, que é o tique que o dono pediu para remover. As duas réguas
       * empurravam em direções opostas, e o texto ruim era o ponto de
       * equilíbrio entre elas.
       */
      descricao:
        `o texto explica o acontecimento e não diz por que ele importa para quem quer morar, ` +
        `trabalhar ou estudar nos EUA. ${onde}quem é afetado e qual o EFEITO da regra sobre ` +
        `essa pessoa, com o que a fonte afirma. Não escreva o que ela deve fazer, acompanhar ` +
        `ou observar, e não escreva que a fonte não informou: se o efeito não estiver na fonte, ` +
        `deixe o campo vazio.`,
    });
  }

  const gentilico = gentilicoDeTerceiroPais(entrada.titulo);
  if (gentilico) {
    achados.push({
      motivo: "FOREIGN_SUBJECT",
      descricao:
        `o título qualifica alguém como "${gentilico}", e quem lê está no Brasil indo para os ` +
        `Estados Unidos: a nacionalidade de um terceiro país não diz nada a essa pessoa. ` +
        `Troque pela profissão, pela área ou pela etapa do processo. Se o país for o OBJETO da ` +
        `regra, e não a ficha do personagem, mantenha e diga na outra metade o que aquilo muda ` +
        `para quem lê.`,
    });
  }

  if (paisNaoIdentificavel(entrada.titulo)) {
    achados.push({
      motivo: "COUNTRY_UNCLEAR",
      descricao:
        `o título não diz de que país ele fala, e serve para o Brasil e para os Estados Unidos ` +
        `com as mesmas palavras. Quem lê está no Brasil e assume o Brasil por padrão. Situe o ` +
        `leitor com o que a fonte já traz: o país, a cidade, o estado, o órgão, a moeda ou a ` +
        `figura pública. E quando o fato for americano e bom, o título diz o FATO primeiro; a ` +
        `ressalva vem na segunda metade, nunca abrindo a frase.`,
    });
  }

  const teto = entrada.tetoDoTitulo ?? TETO_DO_TITULO;
  if (entrada.titulo.length > teto) {
    achados.push({
      motivo: "HEADLINE_TOO_LONG",
      descricao:
        `o título tem ${entrada.titulo.length} caracteres e ocuparia ${Math.ceil(entrada.titulo.length / 30)} ` +
        `linhas num celular de 390px. Reescreva em até ${teto} caracteres, sem perder o fato.`,
    });
  }

  return achados;
}

/**
 * A linha de baixo repete a de cima?
 *
 * Em 16/09/2026 a edição saiu com o título "Corte adia regra para estudantes e
 * intercambistas" e, logo abaixo, "Corte adia regra para F-1, J-1 e I; a nova
 * data de vigência ainda não foi informada". A segunda linha não acrescentava
 * nada: era a primeira, com siglas no lugar das palavras.
 *
 * Nenhum portão via isso. A semelhança de título existia no sistema, mas
 * comparando a pauta de hoje com o HISTÓRICO, para não repetir pauta entre
 * dias. Faltava comparar os dois textos que o leitor vê um embaixo do outro.
 *
 * É APONTAMENTO, e não bloqueio, de propósito: defeito de redação manda a
 * edição para o reparo, não para o lixo. Derrubar o dia por forma repetiria o
 * erro que este módulo inteiro existe para não cometer.
 */
const LIMIAR_DE_REDUNDANCIA = 0.6;

/**
 * Quanto da linha de CIMA reaparece na de baixo.
 *
 * É contenção, e não Jaccard, e a diferença decidiu o caso real. O par de
 * 16/09 dá 0.27 de Jaccard, porque a linha de baixo acrescenta palavras
 * (siglas, "nova data", "não foi informada") e o denominador cresce. Só que
 * essas palavras são justamente a versão técnica do que já foi dito, e o
 * defeito é o título inteiro estar contido ali: 3 das 5 palavras do título
 * reaparecem, ou seja 0.60.
 *
 * Jaccard pune a linha longa por ser longa. Contenção pergunta o que interessa:
 * o leitor que já leu a linha de cima ganha alguma coisa lendo a de baixo?
 */
export function contencao(deCima: string, deBaixo: string): number {
  const cima = new Set(palavrasChave(deCima));
  if (cima.size === 0) return 0;
  const baixo = new Set(palavrasChave(deBaixo));

  let dentro = 0;
  for (const p of cima) if (baixo.has(p)) dentro += 1;
  return dentro / cima.size;
}

function conferirRedundancia(
  deCima: string,
  deBaixo: string,
  nomeDeCima: string,
  nomeDeBaixo: string,
): { motivo: "REDUNDANT_SUBHEAD"; descricao: string } | null {
  const cima = (deCima ?? "").trim();
  const baixo = (deBaixo ?? "").trim();
  if (cima.length < 15 || baixo.length < 15) return null;

  /*
   * Compara só a PRIMEIRA frase da linha de baixo.
   *
   * Um resumo de três parágrafos que começa repetindo o título e depois conta
   * o resto tem semelhança baixa no todo e é exatamente o defeito: o leitor
   * trava na primeira linha, que é onde ele decide continuar. Comparar o texto
   * inteiro deixaria esse caso passar.
   */
  const primeiraFrase = baixo.split(/(?<=[.!?])\s+/)[0] ?? baixo;
  const score = contencao(cima, primeiraFrase);
  if (score < LIMIAR_DE_REDUNDANCIA) return null;

  return {
    motivo: "REDUNDANT_SUBHEAD",
    descricao:
      `"${nomeDeBaixo}" repete "${nomeDeCima}" (${Math.round(score * 100)}% das palavras significativas ` +
      `de "${nomeDeCima}" reaparecem na primeira frase). ` +
      `A linha de baixo tem que ACRESCENTAR: quem é afetado, o prazo, o número, o que muda. ` +
      `Reescreva "${nomeDeBaixo}" começando de onde "${nomeDeCima}" parou, sem repetir o fato já dito.`,
  };
}

export function conferirLinguagemDoLeitor(edition: EditionContent, hoje: Date = new Date()): AchadoDeLeitor[] {
  const achados: AchadoDeLeitor[] = [];

  /*
   * Mês sem ano (14/10/2026): "sobem 3,60% em janeiro" numa edição de outubro
   * se lê como notícia velha. Confere o que o leitor vê primeiro: assunto,
   * headline, preheader e o título de cada matéria.
   */
  const topo = [edition.subject, edition.headline, edition.preheader].filter(Boolean).join(" | ");
  const mesesDoTopo = mesesSemAno(topo, hoje);
  if (mesesDoTopo.length > 0) {
    achados.push({ indice: -1, motivo: "MONTH_WITHOUT_YEAR", descricao: `assunto, headline ou preheader: ${instrucaoDoMesSemAno(mesesDoTopo, hoje)}` });
  }
  edition.stories.forEach((story, i) => {
    const meses = mesesSemAno(story.title, hoje);
    if (meses.length > 0) achados.push({ indice: i, motivo: "MONTH_WITHOUT_YEAR", descricao: `título: ${instrucaoDoMesSemAno(meses, hoje)}` });
  });

  // O par do topo da edição, que é o que o leitor vê antes de qualquer pauta.
  const doTopo = conferirRedundancia(edition.headline, edition.preheader, "headline", "preheader");
  if (doTopo) achados.push({ indice: -1, ...doTopo });

  edition.stories.forEach((story, i) => {
    const doTexto = conferirLinguagemDeUmTexto({
      campos: camposDaMateria(story),
      titulo: story.title,
      relevancia: `${story.why_it_matters} ${story.practical_impact}`,
      ondeEscreverRelevancia: '"why_it_matters" e "practical_impact"',
    });
    for (const a of doTexto) achados.push({ indice: i, ...a });

    const daPauta = conferirRedundancia(story.title, story.summary, "title", "summary");
    if (daPauta) achados.push({ indice: i, ...daPauta });
  });

  return achados;
}
