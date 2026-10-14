import { AITokenUsage, callOpenAIJSON, getAIProviderConfig } from "./ai-provider";
import { DESCRICAO_DO_LEITOR } from "../editorial/linha-editorial";
import { NewsCandidate } from "./collector";
import { DeduplicatedGroup } from "./deduplicator";
import { RankedCandidate } from "./ranker";
import { EditionContent, EditionContentSchema, QAResult, QAResultSchema } from "./schemas";
import { limparVicios } from "./anti-vicios";
import {
  DESCRICAO_DA_FORMA,
  aplicarFormaDoAssunto,
  ordemDasFormas,
  separarFormasDasOpcoes,
  type FormaDoAssunto,
} from "./assunto";
import { REGRA_DO_DOLAR } from "../editorial/dolar-em-portugues";
import type { ClaimNaoSustentada, PacoteFactual } from "../editorial/pacote-factual";
import { validarAncoragem } from "../editorial/pacote-factual";
import type { ResultadoDeClaims } from "../editorial/claims-semanticas";
import { conferirLinguagemDoLeitor } from "./leitor";
import { auditarClaims } from "../editorial/claims-semanticas";
import { instrucaoVigente } from "../instrucoes";

/**
 * Um apontamento que o redator precisa resolver.
 *
 * `indice` é a pauta, ou -1 quando o apontamento é da edição inteira, que é o
 * caso dos apontamentos do auditor: ele avalia o conjunto e nem sempre diz de
 * qual pauta está falando.
 */
export type ProblemaEditorial = {
  indice: number;
  /**
   * `leitor` é o quarto tipo, e ele difere dos outros três.
   *
   * `fato`, `claim` e `qa` são sobre a edição estar CERTA. `leitor` é sobre ela
   * ser LEGÍVEL para quem quer morar nos EUA. Um texto pode estar impecável nos
   * três primeiros e continuar escrito para advogado, que foi o caso da edição
   * de 09/09.
   *
   * Ele é reparável e nunca bloqueia: derrubar a edição por texto difícil
   * trocaria um problema de forma por um dia sem newsletter.
   */
  tipo: "fato" | "claim" | "qa" | "leitor";
  descricao: string;
};

export type RodadaDeReparo = {
  tentativa: number;
  problemasRecebidos: string[];
  problemasRestantes: string[];
};

/**
 * Teto de tentativas de correção.
 *
 * Duas. A primeira resolve o caso comum, que é uma frase de consequência sem
 * lastro. A partir da terceira, o padrão observado é o modelo trocar um
 * problema por outro, e cada volta custa uma geração inteira.
 */
export const MAX_TENTATIVAS_DE_REPARO = 2;

export type AncoragemDaPauta = {
  /** Posição da pauta na edição, para casar com a lista de selecionadas. */
  indice: number;
  titulo: string;
  ancorado: boolean;
  conferidos: number;
  naoSustentadas: ClaimNaoSustentada[];
};

export type PipelineResult = {
  edition: EditionContent;
  qaResult: QAResult;
  selectedCandidates: NewsCandidate[];
  totalUsage: AITokenUsage;
  /** Vazio quando nenhum pacote factual estruturado foi fornecido. */
  ancoragem: AncoragemDaPauta[];
  /** Auditoria de consequência, causa, impacto, comparação e previsão. */
  claimsSemanticas: ResultadoDeClaims;
  tentativasDeReparo: number;
  rodadasDeReparo: RodadaDeReparo[];
  /** Passou nas conferências de fato? Falso significa que não deve publicar. */
  aprovado: boolean;
  /** Por que não passou. Vazio quando aprovado. */
  bloqueios: string[];
  /** O que sobrou depois da última tentativa. */
  problemasRestantes: ProblemaEditorial[];
  /**
   * As pautas que saíram da edição para que ela pudesse sair.
   *
   * Vazio no dia normal. Preenchido quando o reparo não resolveu e a matéria
   * foi retirada em vez de derrubar a edição inteira.
   */
  pautasRemovidas: Array<{ indice: number; titulo: string; motivo: string }>;
  /**
   * O que não bloqueia e precisa chegar a quem aprova.
   *
   * Vazio no fluxo de antes. Com `notaDeAviso`, a nota baixa do auditor vem
   * para cá em vez de ir para `bloqueios` (decisão do dono, 05/10/2026).
   */
  avisos: string[];
  /** O custo da edição separado por etapa, para o livro do dia (RNF-14). */
  custosPorEtapa: { redacao: number; auditoria_qa: number; auditoria_claims: number };
  /**
   * As pautas como o auditor as leu na ÚLTIMA conferência, na ordem dele e
   * antes de qualquer retirada (06/10/2026). Os apontamentos do auditor dizem
   * "a segunda matéria" contando por esta lista, e não pela edição final, que
   * já pode ter perdido uma pauta. É o que `nova-redacao.ts` usa para saber
   * qual pauta tirar da próxima redação.
   */
  pautasAuditadas: Array<{ url: string; titulo: string; texto: string }>;
};

/**
 * Como o portão trata o que não é fato inventado.
 *
 * Opcional e vazio por padrão: sem ele, o pipeline decide exatamente como
 * antes.
 */
export type OpcoesDoPortao = {
  /**
   * Nota abaixo da qual o auditor gera AVISO, e não bloqueio.
   *
   * O dono decidiu em 05/10/2026 que nota baixa de QA vira aviso para quem
   * aprova, e que o risco de alucinação continua bloqueando sozinho. É a
   * divergência que ficou registrada em 18/09 ("ou o piso sai, ou o documento
   * é corrigido"): o piso sai do portão e vai para a fila de aprovação. Quem
   * passa isto passa também `notaMinimaDeQA = 0`.
   */
  notaDeAviso?: number;
  /**
   * As formas do assunto das edições anteriores, da mais nova para a mais
   * antiga (06/10/2026). Com elas, o assunto passa pelo rodízio das cinco
   * formas: o pedido diz a forma da vez e o código escolhe a opção dela.
   * Ausente (refação, scripts), a escolha é a de antes.
   */
  formasRecentesDoAssunto?: ReadonlyArray<FormaDoAssunto | null>;
};

/**
 * Identidade editorial da publicação, vinda do projeto.
 *
 * O prompt era uma constante com "desbuguei.ia", "público de criadores de
 * conteúdo" e "proibido jargão de TI" escritos no meio, e o sistema é
 * multi-projeto desde a migração, mas a voz não era. `editorial_prompt_extra`
 * existia na tabela `projects`, era carregado em `projects.ts` e **não era
 * usado em lugar nenhum**: mudar o projeto no banco não mudava uma vírgula do
 * texto gerado.
 *
 * O que fica fixo aqui é o que não depende de vertical (e-mail
 * autossuficiente, anti-alucinação, ausência de vício de linguagem de IA,
 * regras do assunto. O que é da marca vem de fora.
 */
export type MarcaEditorial = {
  nome: string;
  nicho: string;
  /** Voz, público e regras próprias da vertical. */
  extra: string;
  /** Frase exata que encerra a edição. */
  assinatura: string;
};

/**
 * Só a rede de segurança para quando o projeto não define a voz. Não é a
 * marca de ninguém: se este texto aparecer numa edição publicada, o projeto
 * está com os campos vazios.
 */
export const MARCA_PADRAO: MarcaEditorial = {
  nome: "a publicação",
  nicho: "Noticias do dia",
  extra: "Tom informativo, direto e humano.",
  assinatura: "Até amanhã.",
};

/**
 * O julgamento editorial do redator da newsletter: para quem se escreve, a
 * ordem de prioridade, o título, o tamanho, o tom e a régua de fato. Editável
 * no painel desde 05/10/2026 (etapa `newsletter_redacao`). A identidade do
 * projeto, a assinatura e o JSON de saída são contrato e ficam no montador.
 */
export const INSTRUCAO_PADRAO_NEWSLETTER = `PARA QUEM VOCÊ ESCREVE (isto vale sobre qualquer outra regra de estilo):
Uma pessoa comum, no Brasil: ${DESCRICAO_DO_LEITOR}. Ela ainda não mora lá. Não é economista nem advogada e não conhece o vocabulário técnico. Ela é adulta, inteligente e ocupada.
A pergunta que cada matéria responde é: "por que isso importa para quem tem esse plano?". Se a matéria não responde isso, ela não está pronta, por mais correta que esteja.
Imigração não é assunto desta publicação: não transforme matéria de economia, trabalho ou tecnologia em conversa sobre visto.

ORDEM DE PRIORIDADE, quando duas coisas entrarem em conflito:
1. VERDADE FACTUAL. Nada fora do pacote.
2. ESCOPO CORRETO. Caso individual não vira regra geral; decisão de um estado não vira decisão nacional.
3. RELEVÂNCIA para ${DESCRICAO_DO_LEITOR}.
4. CLAREZA para quem não é da área.
5. ATRATIVIDADE: dar vontade de ler. Aqui isso tem forma concreta, e não é adjetivo. É frase curta, verbo direto, parágrafo de duas a quatro linhas, e falar COM o leitor.
   Pesado (construção ilustrativa): "O Bureau of Labor Statistics informou que o Consumer Price Index registrou variação positiva de 0,4% em setembro na comparação com agosto, com ajuste sazonal."
   Leve, mesmo fato, mesmo lastro: "Os preços nos EUA subiram 0,4% em setembro. É a conta de agosto para setembro, já sem o efeito da época do ano."
6. BREVIDADE.
Nunca inverta. Título atraente que sacrifica precisão está errado. Mas "tecnicamente correto" não autoriza título que ninguém teria vontade de abrir: os dois primeiros são pisos, não desculpas.

TÍTULO DE CADA MATÉRIA (campo "title"):
Estrutura que funciona: O QUE MUDOU + PARA QUEM ISSO IMPORTA. Ou: OPORTUNIDADE/IMPACTO + CONTEXTO.
- Específico, humano, compreensível sem conhecimento jurídico.
- Positivo quando o fato permitir. Positividade não é promessa: nada de "agora ficou fácil", "qualquer pessoa pode", "garantido", "lucro certo".
- No máximo 95 caracteres. Título mais longo que isso ocupa quatro linhas num celular, e quase todo leitor abre no celular.

Títulos REAIS que saíram e não deveriam ter saído:
- "Agentes sem acordo de 2026 não concluem registro nos exchanges de 2027 nos EUA" (edição de 23/09/2026): usa "exchanges" como se o leitor soubesse o que é, e não diz a quem interessa.
- "Próximo mandato começa com juros altos e economia em desaceleração" (edição de 04/10/2026): "próximo mandato" esconde exatamente a informação que o leitor procura: mandato de quem, e em que país.
Uma direção melhor para o segundo, SE o pacote sustentar (construção ilustrativa): "Quem assumir o comando do Fed pega juros altos e economia mais lenta nos EUA". Se o pacote não sustentar "mais lenta", não escreva "mais lenta".

DE QUEM É ESTA NOTÍCIA, e isto vem antes da forma:
Quem, entre as pessoas que leem, sente a mudança? Esse grupo TEM QUE APARECER no título, com as palavras que a fonte usa: quem investe em dólar, quem trabalha com tecnologia, quem paga aluguel, empresa que contrata, profissional de saúde.
QUANDO A FONTE NÃO DIZ QUEM É AFETADO, o título diz o que MUDOU e para onde, sem inventar afetado. "Nevada deixa de limitar a frota de robotáxis da Zoox a 100 veículos" está certo; "Usuários de robotáxi em Nevada são afetados pela expiração do limite" está errado, porque a fonte informa o limite e não informa que usuários são afetados. A mesma regra vale para vínculo causal: se a fonte traz os dois fatos e não liga um ao outro, o título não liga. "Compradores ganham margem COM as vendas em queda" afirma uma causa que a fonte não afirmou; "Vendas de imóveis caem e a margem de negociação aumenta" conta os dois fatos sem inventar a ligação.
Nomear o afetado é obrigação de FORMA quando a fonte o nomeia, e nunca licença para deduzir consequência. Entre um título sem destinatário e um título com destinatário inventado, o certo é o primeiro.
Medido nas nossas 79 primeiras manchetes: em 25 o sujeito era uma instituição ou um ato jurídico, e em 25 o leitor não aparecia de jeito nenhum. Nas 25 manchetes da referência, o sujeito é um ator reconhecível com verbo no presente, e quando a notícia é dos EUA o efeito aqui entra no próprio título ("Chuvas nos EUA e alta do petróleo elevam preço da soja").

NACIONALIDADE DE TERCEIRO PAÍS NÃO ENTRA NO TÍTULO. Se a pessoa da história não é brasileira, a nacionalidade sai e entra a profissão, a área ou o cargo. O leitor está no Brasil e olha para os Estados Unidos; a nacionalidade de um terceiro não diz nada a ele.
  Errado (construção ilustrativa): "Engenheira argentina assume a divisão de chips de uma big tech nos EUA"
  Errado (construção ilustrativa): "Chef mexicano abre o restaurante mais caro de Nova York"
  Certo (construção ilustrativa): "Engenheira de chips assume a divisão de processadores de uma big tech nos EUA"
Um país que não é o Brasil nem os Estados Unidos só fica quando é o OBJETO da notícia, como em "Coreia do Sul planeja investir US$ 200 bilhões nos EUA, com GNL no Alasca" (edição de 01/10/2026), e mesmo aí a outra metade diz o que muda para quem lê.

DE QUE PAÍS É ESTA NOTÍCIA, e isto tem que caber NO TÍTULO.
O leitor está no Brasil e assume o Brasil por padrão, porque é onde ele está. Um título que serve para os dois países com as mesmas palavras é um título que ele vai ler errado.
  Errado, porque serve para os dois: "Quem ganha menos quase não participou do recorde de renda familiar em 2025"
  Certo: "Renda familiar nos EUA bate recorde, e o avanço se concentrou no topo"
Não precisa ser a palavra "EUA": serve o órgão, a cidade, o estado, a moeda, a figura pública ou o termo que só existe lá. E quando a pauta É sobre o Brasil, o Brasil aparece pelo mesmo motivo.

O FATO PRIMEIRO, A RESSALVA DEPOIS.
Quando o acontecimento é positivo e tem um porém, o título abre pelo que ACONTECEU e fecha pelo porém. Abrir pela falta inverte a notícia: o leitor recebe como se a má notícia fosse o fato, e o fato virasse detalhe.
  Errado: "Quem ganha menos quase não participou do recorde de renda familiar"
  Certo: "Renda familiar nos EUA bate recorde, e o avanço se concentrou no topo"
Isto NÃO é licença para enfeitar. O porém continua no título, com as palavras da fonte. O que muda é a ordem, e a ordem é o que decide o sentido que fica.
Quando a notícia é ruim de ponta a ponta, ela é ruim no título também: não invente lado bom que o pacote não sustenta.

JURISDIÇÃO NO FIM. Estado, cidade, corte ou distrito vão para a última posição, nunca antes do sujeito.
  Errado (construção ilustrativa): "Na Califórnia, lei estadual obriga empresas a informar a faixa salarial nas vagas"
  Certo (construção ilustrativa): "Quem procura emprego passa a ver a faixa salarial no anúncio da vaga, na Califórnia"
  Certo, e real (edição de 03/10/2026): "Administração Trump fica impedida de construir muro no Big Bend, no Texas"

RETOMADA DE PAUTA: quando a mesma história volta, o título carrega o dado NOVO, a data, a etapa, quem fica de fora. Trocar "Fed" por "banco central americano" e "juros" por "taxa básica" não é título novo.

PROIBIDO no título da matéria:
- abrir com o nome do órgão praticando ato burocrático: "Departamento do Trabalho publica regra referente a...", "Receita Federal anuncia atualização relacionada a...", "Ordem judicial determina..."
- "determinadas pessoas", "certos casos", "alguns requerentes" sem dizer quais, quando o pacote diz quais
- sigla SOZINHA (Fed, CPI, FAA, Selic), sem o que ela é ou para quem serve
- linguagem processual: "encerra a obrigação", "vedada a renúncia", "consta no rol taxativo"

JARGÃO: explique na primeira vez, sempre.
O leitor não sabe o que é payroll, CPI, PCE, Treasury, yield, Fomc, IPO, buyback, layoff, 401(k), exchange de plano de saúde, injunction, Selic, IPCA, spread.
Quando o termo for necessário, explique ali mesmo, em uma oração curta: "o CPI, o índice de preços ao consumidor dos EUA, ...". Não explique o que o pacote não diz: se o pacote não define o termo, use a descrição genérica do tipo de dado e siga.
Quando o termo NÃO for necessário, não use. "O payroll segue resiliente no agregado das métricas" não informa nada a quem lê; "os EUA quase não criaram vagas em setembro" informa.

FRASE E PARÁGRAFO:
- Uma ideia por parágrafo.
- Frases curtas. Nunca duas ou três subordinadas jurídicas na mesma frase.
- Deixe explícito quando é caso individual, exemplo, decisão específica de um estado ou regra geral. Não generalize um caso.

E-MAIL AUTOSSUFICIENTE, MAS CURTO:
- O leitor termina informado sem clicar em nada. Isso e' sobre completude, nao sobre tamanho.
- NAO crie "teasers" nem suspense convidando a sair do e-mail.
- TAMANHO POR PAUTA, e a regra e' rigida:
  * "summary" da pauta 1: no maximo 110 palavras, em DOIS ou TRES paragrafos curtos separados por uma linha em branco.
  * "summary" das demais: no maximo 70 palavras, em um ou dois paragrafos curtos.
  * "context": no maximo 40 palavras, e SO na pauta 1. Nas outras, deixe vazio.
  * "practical_impact": UMA frase, no maximo 25 palavras. Objetiva: o que muda, para quem, a partir de quando.
  * "why_it_matters": no maximo 25 palavras.
  * "humor_line": opcional. Use em no maximo uma pauta da edicao, e so quando o assunto comportar.
- Corte adjetivo, repeticao e frase que so prepara a proxima. Se uma frase pode sair sem perder informacao, ela sai.

CADA LINHA ACRESCENTA, NENHUMA REPETE A DE CIMA:
- O "title" da pauta diz o que mudou. O "summary" NÃO reescreve o title com outras palavras: ele começa onde o title parou, com o que o title não coube.
- O "headline" da edição e o "preheader" seguem a mesma regra, e é ali que o erro aparece mais. O preheader não é resumo do headline: ele é a segunda informação.
  Errado, porque repete (edição real de 30/09/2026): headline "Agentes sempre ativos chegam a assinantes de alto nível" e preheader "Os dots chegam a assinantes de alto nível enquanto a segurança mira ações autônomas".
  Certo, porque acrescenta (edição real de 04/10/2026): headline "Capital privado ganha espaço e muda a produção de filmes em Hollywood" e preheader "Filmes independentes podem sair em um ano, contra cinco a dez no modelo tradicional".
- Teste antes de entregar: se você apagar a linha de baixo, alguma informação some? Se não some, ela está errada e precisa ser reescrita.
- A edicao inteira deve ser lida em menos de tres minutos.

DIRETRIZES DE TOM & ESTILO:
1. Tom: conversa entre duas pessoas informadas. Alguém que entende do assunto contando para um amigo no caminho do trabalho, dentro do tom que o briefing acima define. Não é o tom de um jornal, apesar do nome da publicação, e não é o de um escritório de advocacia.
   RITMO, e isto é regra de forma, não de gosto:
   - Parágrafo de duas a quatro linhas. Nunca um bloco único de oito linhas.
   - Alterne frase curta com uma frase mais longa que respira. Três frases longas seguidas viram texto de manual.
   - Fale com o leitor em segunda pessoa quando fizer sentido. Isso é endereçamento, e é permitido.
   - Comece pelo que aconteceu. A primeira frase da pauta nunca começa pelo nome de um órgão praticando ato.
   - Zero emoji no corpo do texto. Zero gíria. Leve não é frouxo.
2. LINGUAGEM ACESSÍVEL: o leitor é ${DESCRICAO_DO_LEITOR}, e não advogado.
   - Primeiro a palavra comum, a sigla depois e só se ela ajudar: "a taxa básica de juros dos EUA, decidida pelo Fed".
   - Nome completo de norma, de processo judicial e de órgão em inglês não entra no corpo. "Bureau of Labor Statistics" é "o escritório de estatísticas do trabalho", ou simplesmente "o governo americano" quando o pacote permitir. O nome oficial cabe no campo da fonte, não na frase que a pessoa lê.
   - Se o termo técnico pode sair sem perder informação, ele sai. Explicar é o segundo melhor caminho; o primeiro é não precisar explicar.
   - Quando explicar, explique em fala e em frase própria: "o payroll é o relatório mensal de vagas criadas fora da agricultura." Não em aposto no meio da frase, cercado de vírgulas, que é o que dá cara de manual.
3. NEGRITO, e ele tem função: o leitor passa o olho antes de ler.
   - Marque com dois asteriscos o número, o prazo, a data, o valor e o nome que decidem a notícia: "vale a partir de **15 de outubro**", "o desemprego foi de 4,2% para **4,3%**".
   - No máximo duas marcações por parágrafo. Negrito em tudo é negrito em nada.
   - Só marque o que está no pacote factual. Negrito não cria lastro.
4. Personalidade: leveza NÃO é piada, e as duas não caem juntas. Assunto sensível (dinheiro, saúde, situação legal de alguém) pede sobriedade no FATO, e continua pedindo ritmo leve na FRASE. Observação seca é bem-vinda quando o assunto comporta; piada sobre a vida de alguém, nunca.
5. SEM VÍCIOS DE LINGUAGEM DE IA: PROIBIDO usar clichês como "Em um mundo onde...", "No cenário atual...", "Não é apenas X, é Y", "Desvendando...", "Vale ressaltar...", "Sem dúvida...", "Em suma...". Seja autêntico, humano e direto!
6. FOCO PRÁTICO: cada pauta DEVE deixar claro o que muda, para quem muda e a partir de quando, para o público descrito no briefing.
7. RELEVÂNCIA SEM INVENTAR COMPORTAMENTO: a fonte fala de regra, prazo e decisão. Ela NUNCA fala do que as pessoas fazem, acompanham, observam, esperam ou pretendem.
   Escreva (construção ilustrativa) "o reajuste vale para quem paga aluguel em Nova York e começa em janeiro" (efeito da regra, está na fonte).
   NÃO escreva "inquilinos acompanham o reajuste" nem "inquilinos devem observar a nova data" (comportamento das pessoas, não está em fonte nenhuma e será reprovado por falta de lastro).
   Quando quiser falar com o leitor, fale com ele: "se você paga aluguel em Nova York, o valor antigo vale até dezembro". Isso é endereçamento, não afirmação sobre terceiros.
   E quando o pacote não sustentar NENHUMA relevância, deixe o campo vazio. Uma pauta sem "por que importa" é melhor que uma pauta com relevância inventada, e o silêncio aqui é decisão editorial, não falha. Antes de deixar vazio, releia o pacote procurando o efeito: quando ele está declarado, escrever é melhor que calar. Mas silêncio em várias pautas da mesma edição NÃO é erro, e não force nenhuma para cumprir cota: há dias em que as fontes só trazem a regra e o prazo, e inventar o efeito nessas é o que faz a edição inteira ser reprovada por alucinação.
8. RIGOR ANTI-ALUCINAÇÃO EXTREMO: Não invente preços, nomes, números, prazos ou datas. Toda afirmação factual precisa estar estritamente contida no pacote de informações fornecido. Se um detalhe relevante não está no pacote, você tem UMA saída: escreva o que se sabe e pare. Não preencha a lacuna e não anuncie que ela existe.

9. NÃO FALE DA REPORTAGEM, FALE DO FATO: o leitor não quer saber o que a matéria deixou de dizer. Proibido, em qualquer campo: "a fonte não informa", "a fonte não detalha", "não foi informado", "o G1 não diz", "não há detalhes sobre". Texto mais curto é melhor que texto que confessa o que não tem.
   A exceção é UMA por edição, e só quando a falta É a notícia: se a pauta é um prazo adiado e a nova data ainda não saiu, isso se escreve falando da divulgação, não da reportagem. Assim: "a nova data ainda não foi divulgada". Nunca assim: "a fonte não informa a nova data".`;

/**
 * Como se escreve o assunto do e-mail. Etapa própria (`newsletter_assunto`)
 * porque é outro julgamento, com outra régua: o título da pauta informa, o
 * assunto faz abrir. Editável no painel desde 05/10/2026.
 */
export const INSTRUCAO_PADRAO_ASSUNTO = `ASSUNTO DO E-MAIL (regras para "subject_options" e "subject"), no método do The News:

O assunto é sobre UMA história, a mais forte do dia, e não um resumo da edição. Ele não tenta dar conta das outras pautas: quem abre o e-mail encontra o resto lá dentro.

A FORMA, que o código confere e conserta:
- tudo em caixa baixa, nomes próprios e siglas inclusive ("stf", "lula", "nike"); só "R$" e "US$" ficam como são;
- de 2 a 7 palavras e até uns 40 caracteres;
- sem ponto final; interrogação, quando for pergunta, fica;
- sem travessão e sem dois-pontos.

AS CINCO FORMAS. Escreva as opções em formas DIFERENTES entre si, escolhendo as que a história permite. Os exemplos são assuntos reais do The News e ensinam a forma; o fato sai da edição de hoje, nunca do exemplo.
1. pergunta direta, que a edição responde: "quem vai sofrer impeachment?", "canadá vai entrar na união europeia?", "você comeria um biscoito de plástico?"
2. dois ou três nomes da história, lado a lado: "nikolas & vorcaro", "lula, trump e delcy na onu"
3. personagem com um detalhe curioso: "o advogado que apostou R$ 5 bi no tigrinho", "o herói do 11 de setembro"
4. cena ou número que intriga: "a balada com 20 homens e 120 mulheres", "a nike saiu do top-100"
5. o momento: "o dia que o stf rachou", "a reviravolta eleitoral"

Como chegar lá: leia a pauta mais forte, ache o fato central e, dentro dele, o nome, o número, a cena ou a virada que faria alguém perguntar "como assim?". O assunto nasce desse elemento, não do resumo.

A VERDADE VEM ANTES DA CURIOSIDADE:
- Tudo no assunto está na edição: o nome, o número, a cena. Número que não está no texto não entra.
- Pergunta só quando a edição RESPONDE a pergunta. Pergunta que a edição não responde é promessa falsa.
- Nada de promessa que a matéria não entrega, nada de "você não vai acreditar", nada de mistério sobre o que não existe.
- Curiosidade não autoriza inverter o fato. Se o leitor pode entender o contrário lendo só o assunto, ele está errado. Um caso do tipo (construção ilustrativa): um juiz suspende uma regra que LIMITAVA o reajuste de aluguel, e o assunto sai como "reajuste em pausa", que sugere que o reajuste foi suspenso. Vale para toda inversão do mesmo tipo: barrar uma taxa não é criar uma taxa, adiar um prazo não é encerrar um prazo, negar um recurso não é conceder.

PROIBIDO em subject_options e subject:
- formato "Empresa X anuncia Y: entenda o impacto";
- "entenda", "saiba tudo", "veja como", "descubra", "confira", "revoluciona", "o futuro de...", "a nova era de...";
- resumir a edição ou empilhar duas notícias numa linha;
- tom de release, de blog corporativo ou de portal de SEO;
- adjetivo vazio: "inovador", "revolucionário", "impressionante", "surpreendente";
- emoji.

Teste antes de escolher: a frase seria mandada assim, de verdade, num grupo de WhatsApp? Exemplo RUIM, descritivo, do nosso próprio arquivo: "o depósito de imigração rende juros". Ele descreve; não dá vontade de abrir.

O PREHEADER continua sendo nosso, e não o do The News: uma linha editorial que completa o assunto com o fato seguinte (quem, quanto, quando), sem propaganda e sem repetir o assunto.`;

/**
 * O pedido do rodízio das formas do assunto, no prompt da edição (06/10/2026).
 *
 * Fica no PEDIDO, e não na instrução editável do painel, porque é contrato de
 * saída (RF-26): quantas opções e em que forma. A instrução aprovada continua
 * dizendo o que cada forma é. Sem histórico pedido, não há rodízio e o pedido
 * fica vazio.
 */
export function pedidoDoRodizio(recentes: ReadonlyArray<FormaDoAssunto | null> | undefined): string {
  if (!recentes) return "";
  const ordem = ordemDasFormas(recentes);
  const vez = ordem[0];
  return `ASSUNTO DESTA EDIÇÃO, no rodízio das cinco formas:
- A forma da vez é "${vez}" (${DESCRICAO_DA_FORMA[vez]}). Escreva DUAS opções nessa forma.
- As outras três opções vão em formas diferentes, nesta ordem de preferência: ${ordem
    .slice(1, 4)
    .map((f) => `"${f}"`)
    .join(", ")}.
- Marque cada opção com a forma dela em "forma". O código escolhe a primeira opção da forma da vez que cumpre a regra; a verdade continua vindo antes da forma: se a história não permite a forma da vez sem inventar, escreva as duas opções dela assim mesmo dentro da verdade, ou deixe que as outras formas resolvam.
`;
}

export function montarSystemEditorial(marca: MarcaEditorial): string {
  return `
Você é o editor-chefe sênior e redator da publicação "${marca.nome}", inspirada no formato autossuficiente e rico de newsletters como "The News".

NICHO DA PUBLICAÇÃO:
${marca.nicho}

BRIEFING EDITORIAL DESTA PUBLICAÇÃO (vale sobre qualquer regra genérica abaixo):
${marca.extra}

${instrucaoVigente("newsletter_redacao", INSTRUCAO_PADRAO_NEWSLETTER)}
10. ASSINATURA OBRIGATÓRIA: A edição deve encerrar a variável "final_line" exatamente com:
"${marca.assinatura}"

${instrucaoVigente("newsletter_assunto", INSTRUCAO_PADRAO_ASSUNTO)}

ESTRUTURA DO JSON DE SAÍDA (retorne exclusivamente este JSON estrito):
{
  "subject_options": [
    { "forma": "pergunta | nomes | personagem | cena | momento", "texto": "uma opção de assunto seguindo a regra ASSUNTO DO E-MAIL acima, na forma marcada. Escreva 5 opções, todas sobre a mesma história; quantas em cada forma está no pedido da edição" }
  ],
  "subject": "A opção mais forte entre as subject_options: caixa baixa, de 2 a 7 palavras, até 40 caracteres, sem ponto final",
  "preheader": "De 60 a 110 caracteres. NÃO é resumo do headline: é a informação seguinte, a que mais interessa a quem vai decidir se lê. Quem é afetado, o prazo, o número. Se ela repetir o headline com outras palavras, está errada.",
  "headline": "O título da edição, uma frase afirmativa de até 70 caracteres, em linguagem comum, dizendo o que mudou. Não começa por nome de órgão, não usa sigla sozinha, não é pergunta.",
  "intro": "Saudação matinal super leve e descontraída dando o bom dia e o clima da edição.",
  "stories": [
    {
      "rank": 1,
      "category": "Categoria curta da pauta, coerente com o nicho da publicação",
      "title": "O QUE MUDOU + PARA QUEM IMPORTA. Máximo 95 caracteres. Sem jargão sozinho, sem órgão praticando ato burocrático. Tem que dar para saber de que país é a notícia lendo só o título. Fato positivo com porém abre pelo fato.",
      "summary": "O fato contado inteiro, em parágrafos curtos de duas a quatro linhas separados por uma linha em branco, respeitando o teto de palavras da diretriz de tamanho. Começa pelo que aconteceu, não pelo nome do órgão. Não repete o title. Marque com dois asteriscos o número, a data e o prazo que decidem a notícia, no máximo dois por parágrafo.",
      "context": "Contexto do mercado ou da ferramenta.",
      "why_it_matters": "Por que isso importa para ${DESCRICAO_DO_LEITOR}. Diga QUEM é afetado, com substantivo concreto: brasileiros que, estudantes que, profissionais que, famílias que. Descreva o EFEITO da regra sobre essas pessoas. NUNCA afirme o que elas fazem, acompanham, observam, esperam, planejam ou devem fazer. Se o pacote factual NÃO disser quem é afetado nem qual o efeito, deixe este campo VAZIO (string vazia). Campo vazio é resposta correta; frase com ressalva do tipo 'pode afetar, mas a fonte não informa quem' é erro.",
      "practical_impact": "O que muda na prática: o que a regra passa a exigir ou permitir, para quem vale e a partir de quando. Só o que a fonte afirma. NUNCA o que a pessoa precisa fazer, observar ou acompanhar. Se o pacote factual NÃO disser o que muda na prática, deixe este campo VAZIO (string vazia): campo vazio é resposta correta, e inventar consequência aqui é o que faz a edição ser reprovada por alucinação.",
      "humor_line": "Observação curta e humana sobre a pauta. Vazia quando o assunto não comporta leveza.",
      "source_name": "Nome da fonte original",
      "source_url": "URL da fonte"
    }
  ],
  "quick_bits": [
    { "title": "Nota Rápida", "text": "Super resumo completo de 1 a 2 frases sobre outra novidade útil de IA ou redes sociais.", "url": "URL opcional" }
  ],
  "closing": "Recado final convidando o leitor a compartilhar a edição com alguém que se interessa pelo assunto do briefing editorial. Não cite tema que não seja o desta publicação.",
  "final_line": "A assinatura exata definida no briefing."
}
`;
}

/**
 * Quantas pautas a edição comporta.
 *
 * Era 4 a 6, fixo. Depois de um filtro editorial isso é uma armadilha: num dia
 * em que só 3 pautas passam, ou a edição não sai ou o filtro é ignorado. Quem
 * manda agora é a configuração editorial, e o padrão aqui só existe para
 * quem chama sem informar.
 */
export type LimitesDaEdicao = { minimo: number; maximo: number };

const LIMITES_PADRAO: LimitesDaEdicao = { minimo: 2, maximo: 4 };

export async function runNewsroomPipeline(
  rankedCandidates: RankedCandidate[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  /** Identidade da publicação. Ausente cai na marca padrão. */
  marca: MarcaEditorial = MARCA_PADRAO,
  limites: LimitesDaEdicao = LIMITES_PADRAO,
  /**
   * Pacote factual por URL da pauta.
   *
   * Sem ele o redator recebe o resumo cru do feed e a checagem de ancoragem
   * não roda, que é como a edição saiu com uma operação policial inventada.
   */
  pacotes: Map<string, PacoteFactual> = new Map(),
  maxTentativasDeReparo: number = MAX_TENTATIVAS_DE_REPARO,
  /**
   * Nota mínima do auditor. `0` desliga o corte por nota.
   *
   * Era 85, e bloqueava. Isso contradizia a decisão já registrada em
   * `docs/decisoes.md`, tomada depois do incidente em que a edição do dia
   * inteiro ficava retida por tom, gramática ou nota baixa: o portão deveria
   * olhar só o risco de alucinação, porque fato inventado não se desfaz com
   * errata e vírgula errada se desfaz.
   *
   * O piso sobreviveu à decisão e ninguém percebeu, até 18/09/2026, quando a
   * redação rodou três vezes com notas 80, 76 e 93 sobre material do mesmo dia.
   * Um corte duro sobre um juízo graduado de modelo é uma trava que abre e
   * fecha sozinha, e a medição do classificador, em `classificador.ts:40-70`,
   * já mostrou que nem `seed` nem `temperature` estabilizam isso neste modelo.
   *
   * Desligado por decisão do dono em 18/09/2026. O que NÃO mudou, e é o ponto:
   * `hallucination_risk` continua bloqueando, e as duas ancoragens duras
   * também. A régua de fato inventado está intacta; o que saiu foi a nota de
   * qualidade percebida, que é opinião graduada e não detecção de invenção.
   */
  notaMinimaDeQA: number = 0,
  opcoesDoPortao: OpcoesDoPortao = {},
): Promise<PipelineResult> {
  const config = getAIProviderConfig(env);

  const topRanked = rankedCandidates.slice(0, limites.maximo);
  if (topRanked.length < limites.minimo) {
    throw new Error(
      `Número insuficiente de pautas qualificadas para gerar a edição (encontradas ${topRanked.length}, mínimo ${limites.minimo}).`,
    );
  }

  let selectedCandidates = topRanked.map((r) => r.group.primary);

  const factualPackage = topRanked.map((item, index) => {
    const pacote = pacotes.get(item.group.primary.url);
    const base = {
      rank: index + 1,
      title: item.group.primary.title,
      source: item.group.primary.source_name,
      url: item.group.primary.url,
      secondary_sources: item.group.secondary_sources,
      category: item.group.primary.category,
      published_at: item.group.primary.published_at,
    };

    if (!pacote) {
      return {
        ...base,
        facts_summary: item.group.primary.description,
        full_content: item.group.primary.content.slice(0, 1000),
      };
    }

    return {
      ...base,
      verified_facts: pacote.verified_facts,
      people: pacote.people,
      organizations: pacote.organizations,
      places: pacote.places,
      dates: pacote.dates,
      numbers: pacote.numbers,
      /** O que a matéria não diz. Está aqui para o redator não preencher. */
      gaps: pacote.gaps,
      source_urls: pacote.source_urls,
    };
  });

  const temPacoteEstruturado = topRanked.some((item) => pacotes.has(item.group.primary.url));

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUsd = 0;
  const custosPorEtapa = { redacao: 0, auditoria_qa: 0, auditoria_claims: 0 };

  const userWritingPrompt = `
Por favor, redija a edição de hoje da ${marca.nome} no estilo do "The News", 100% autossuficiente (o leitor recebe a informação completa dentro do e-mail sem precisar clicar em links para ler mais).

Pacote factual fornecido:
${JSON.stringify(factualPackage, null, 2)}

REGRA DE FATO, acima de qualquer outra:
- Nome próprio, número, data, valor, prazo, cargo, programa, operação, lei e órgão só podem aparecer se estiverem no pacote factual acima. Nenhuma exceção.
- ${REGRA_DO_DOLAR}
- Você NÃO tem conhecimento próprio sobre estes assuntos. O que não está no pacote não aconteceu.
- Nunca dê nome a uma operação, investigação, programa ou regra que o pacote não nomeia.
- Nunca acrescente o momento ("nesta semana", "em setembro") se a data não estiver no pacote.
- Nunca complete o que está em "gaps". E não transforme a lacuna em frase: "gaps" é a sua lista do que NÃO escrever, não é material de redação. O leitor não quer um inventário do que a reportagem não apurou.

CONCLUSÃO TAMBÉM É FATO:
- Consequência, causa, impacto, comparação, tendência e previsão só entram se o pacote sustentar. Elas parecem opinião e funcionam como afirmação factual para quem lê.
- Proibido, quando o pacote não disser: "isso encarece as compras", "isso barateia o aluguel", "deve gerar empregos", "prejudica empresas", "muda o cenário para brasileiros", "a tendência é de aumento", "o impacto deve ser grande".
- Se o pacote não diz o que a medida faz, você não sabe o que ela provoca. Escreva o que aconteceu e pare ali.
- Certo: "A medida foi aprovada e segue para sanção."
- Errado: "A medida deve baratear as compras internacionais." (afirma efeito que ninguém disse)
- Errado também: "A medida foi aprovada e segue para sanção. A fonte não informa o que muda para o consumidor." (a segunda frase fala da reportagem, e não do fato)
- Transição, ordem das ideias e tom são seus. Fato e consequência, não.

${pedidoDoRodizio(opcoesDoPortao.formasRecentesDoAssunto)}
Requisitos obrigatórios:
- Gere exatamente ${topRanked.length} pauta(s), uma para cada item do pacote factual, respeitando os limites de palavras da diretriz de tamanho.
- Traga 2 a 3 itens rápidos em "quick_bits", de uma linha cada.
- Idioma: Português do Brasil natural, no tom que o briefing editorial define.
- NÃO use chamadas tipo 'clique aqui para continuar lendo'. Entregue o valor completo no e-mail.
- Retorne EXCLUSIVAMENTE a estrutura JSON especificada.
`;

  /*
   * Escrever, conferir, corrigir, conferir de novo.
   *
   * O QA reprovava e o dia acabava ali. Reprovar sem tentar consertar é
   * desperdiçar uma edição inteira por causa de duas frases, e as duas frases
   * costumam ser as mesmas: uma consequência que o material não sustenta.
   *
   * O reparo é cirúrgico e tem teto. O redator recebe de volta só o que foi
   * apontado, o motivo e o pacote factual, reescreve, e tudo é conferido de
   * novo. Passou do teto sem passar nas conferências, a edição não sai. Um
   * laço sem teto tentaria para sempre e gastaria para sempre.
   */
  /*
   * A forma do assunto é conferida em código, e não só pedida (06/10/2026).
   *
   * Caixa baixa, sem ponto final e sem travessão são consertados aqui; o
   * tamanho escolhe entre as opções que a própria redação escreveu. Roda em
   * toda versão da edição, inclusive a dos reparos, porque o reparo reescreve
   * o JSON inteiro e pode devolver o assunto fora da forma.
   */
  const comFormaDoAssunto = (edicao: EditionContent): EditionContent => {
    const r = aplicarFormaDoAssunto(edicao, opcoesDoPortao.formasRecentesDoAssunto);
    if (r.mudou) console.log(`[NEWSROOM] assunto ajustado à forma: "${r.antes}" -> "${r.edicao.subject}"`);
    if (r.problemas.length) console.warn(`[NEWSROOM] assunto fora da forma: ${r.problemas.join(", ")}`);
    if (r.formaDaVez) {
      console.log(
        `[NEWSROOM] forma do assunto: ${r.forma ?? "sem forma"} (a vez era ${r.formaDaVez}` +
          `${r.forma === r.formaDaVez ? "" : ", caiu para a seguinte"})`,
      );
    }
    return r.edicao;
  };

  const escreverEdicao = async (promptUsuario: string): Promise<EditionContent> => {
    const resposta = await callOpenAIJSON<EditionContent>(
      [
        { role: "system", content: montarSystemEditorial(marca) },
        { role: "user", content: promptUsuario },
      ],
      config.editorModel,
      env,
      fetcher,
    );

    totalPromptTokens += resposta.usage.promptTokens;
    totalCompletionTokens += resposta.usage.completionTokens;
    totalCostUsd += resposta.usage.estimatedCostUsd;
    custosPorEtapa.redacao += resposta.usage.estimatedCostUsd;

    try {
      // Antes da validação: o travessão é removido em toda string da edição.
      // O prompt já pede; isto garante. Uma edição bem escrita perde
      // credibilidade numa única frase que abre com traço longo.
      return comFormaDoAssunto(EditionContentSchema.parse(separarFormasDasOpcoes(limparVicios(resposta.data))));
    } catch {
      console.warn("[NEWSROOM QA] Ajustando formato do JSON...");
      const bruto = separarFormasDasOpcoes(limparVicios(resposta.data)) as Record<string, unknown>;
      bruto.final_line = marca.assinatura;
      return comFormaDoAssunto(EditionContentSchema.parse(bruto));
    }
  };

  const textoDaPauta = (story: EditionContent["stories"][number]): string =>
    [
      story.title,
      story.summary,
      story.context,
      story.why_it_matters,
      story.practical_impact,
      story.humor_line ?? "",
    ]
      .filter(Boolean)
      .join(" ");

  /*
   * Ancoragem dura: conferência determinística, sem modelo no meio.
   *
   * Compara nome próprio, número e data do texto contra o pacote. Foi assim
   * que "Operação Compliance Zero" seria pega mesmo se o auditor aprovasse.
   *
   * Sem pacote estruturado não há contra o que conferir, e a lista volta
   * vazia. Vazio aqui significa "não conferido", não "aprovado", e por isso
   * existe `temPacoteEstruturado`.
   */
  /*
   * Pacote da edição inteira.
   *
   * Abertura, giro rápido e fechamento não pertencem a uma pauta só, e por
   * isso ficavam sem conferência nenhuma. Foi lá que passou "os ganhos médios
   * por hora subiram 0,3% em agosto", com o "em agosto" acrescentado: o
   * auditor pegou no fim, depois de o reparo já ter gastado as tentativas em
   * outra coisa. Conferir contra a união dos pacotes coloca esse texto na
   * primeira rodada, junto com o resto.
   */
  const pacoteDaEdicao = (): PacoteFactual | null => {
    const todos = [...pacotes.values()];
    if (todos.length === 0) return null;
    return {
      verified_facts: todos.flatMap((p) => p.verified_facts),
      people: todos.flatMap((p) => p.people),
      organizations: todos.flatMap((p) => p.organizations),
      places: todos.flatMap((p) => p.places),
      dates: todos.flatMap((p) => p.dates),
      numbers: todos.flatMap((p) => p.numbers),
      gaps: todos.flatMap((p) => p.gaps),
      source_urls: todos.flatMap((p) => p.source_urls),
      texto_de_origem: todos.map((p) => p.texto_de_origem).join("\n\n"),
    };
  };

  const textoAvulso = (edicao: EditionContent): string =>
    [
      edicao.intro,
      ...(edicao.quick_bits ?? []).map((q) => `${q.title} ${q.text ?? ""}`),
      edicao.closing,
    ]
      .filter(Boolean)
      .join(" ");

  const conferirAncoragem = (edicao: EditionContent): AncoragemDaPauta[] => {
    if (!temPacoteEstruturado) return [];

    const porPauta = edicao.stories.map((story, i) => {
      const pacote = pacotes.get(topRanked[i]?.group.primary.url ?? "");
      if (!pacote) {
        return { indice: i, titulo: story.title, ancorado: true, conferidos: 0, naoSustentadas: [] };
      }
      const r = validarAncoragem(textoDaPauta(story), pacote);
      return {
        indice: i,
        titulo: story.title,
        ancorado: r.ancorado,
        conferidos: r.conferidos,
        naoSustentadas: r.naoSustentadas,
      };
    });

    const uniao = pacoteDaEdicao();
    if (!uniao) return porPauta;

    const r = validarAncoragem(textoAvulso(edicao), uniao);
    return [
      ...porPauta,
      {
        indice: -1,
        titulo: "abertura, giro rápido e fechamento",
        ancorado: r.ancorado,
        conferidos: r.conferidos,
        naoSustentadas: r.naoSustentadas,
      },
    ];
  };

  const auditarQA = async (edicao: EditionContent): Promise<QAResult> => {
    const qaPrompt = `
Você é o auditor de qualidade e de fatos desta publicação.

Analise esta edição produzida contra os fatos originais fornecidos:

PACOTE FACTUAL ORIGINAL (é a íntegra do que a redação recebeu; o que não está aqui não foi fornecido):
${JSON.stringify(factualPackage, null, 2)}

EDIÇÃO PRODUZIDA:
${JSON.stringify(edicao, null, 2)}

O QUE É ALUCINAÇÃO AQUI:
Marque "hallucination_risk" como true quando o texto ACRESCENTAR informação que o pacote não tem: um fato, um nome, um número, uma data, uma consequência, um efeito, uma comparação ou uma previsão que não estejam ali.

O QUE NÃO É:
- Paráfrase fiel. Se o pacote diz que o texto foi aprovado pela Câmara e pelo Senado, escrever que ele "avançou no Congresso" é a mesma informação com outras palavras. Sinônimo, resumo, ordem diferente e escolha de verbo não são acréscimo.
- Ressalva NÃO é mais comportamento desejado. O texto fala do fato, nunca da reportagem. Frase do tipo "a fonte não informa", "não foi detalhado" ou "o veículo não diz" é DEFEITO DE REDAÇÃO: aponte em "issues" e derrube "tone_check_passed". Não é alucinação, então "hallucination_risk" continua false. A única forma tolerada é falar da divulgação quando a falta é a própria notícia ("a nova data ainda não foi divulgada"), no máximo uma vez na edição inteira.
- Assunto e opções de assunto. São chamadas curtas e podem ser perguntas. Avalie se afirmam algo FALSO, não se resumem demais. "A taxa das blusinhas está no fim?" é pergunta legítima quando o pacote diz que o texto foi aprovado e aguarda sanção; "A taxa das blusinhas acabou" seria falso.
- IMPRECISÃO DE REDAÇÃO. Chamar de "decisões" um conjunto que inclui um relatório, ou atribuir ao país o que uma juíza decidiu, é imprecisão: a informação existe no pacote e foi mal resumida. Isso vai para "issues" e derruba "passed", mas NÃO é alucinação.
- FECHAMENTO E CONVITE AO LEITOR. O "closing" convida a compartilhar a edição com quem se interessa pelo assunto da publicação. Descrever esse público NÃO é afirmar fato do dia: a audiência é definida pelo briefing editorial, não pelo pacote factual. Se a publicação é para quem quer morar nos Estados Unidos, escrever "compartilhe com quem planeja trabalhar ou estudar lá" não acrescenta nenhuma informação sobre a notícia, mesmo que o pacote daquele dia só trate de trabalho. Só é alucinação se o convite afirmar um FATO que o pacote não tem: um prazo, um preço, uma regra, um número.

A pergunta que separa as duas coisas: a informação existe no pacote?
- Não existe: alucinação, hallucination_risk = true.
- Existe e foi mal descrita: imprecisão, hallucination_risk = false, e descreva em "issues".

Na dúvida entre pedantismo e omissão, pergunte: um leitor que só tem o pacote factual seria induzido a acreditar em algo que não está nele? Se não, não é alucinação.

Avalie os pontos abaixo e responda EXCLUSIVAMENTE com o JSON:
{
  "passed": boolean,
  "hallucination_risk": boolean,
  "tone_check_passed": boolean,
  "grammar_passed": boolean,
  "story_count_valid": boolean,
  "issues": ["lista de problemas se houver"],
  "score": número de 0 a 100
}
`;

    const resposta = await callOpenAIJSON<QAResult>(
      [
        { role: "system", content: "Você é um auditor rigoroso de fatos e qualidade editorial." },
        { role: "user", content: qaPrompt },
      ],
      config.triageModel,
      env,
      fetcher,
    );

    totalPromptTokens += resposta.usage.promptTokens;
    totalCompletionTokens += resposta.usage.completionTokens;
    totalCostUsd += resposta.usage.estimatedCostUsd;
    custosPorEtapa.auditoria_qa += resposta.usage.estimatedCostUsd;

    return QAResultSchema.parse(resposta.data);
  };

  const auditarSemantica = async (edicao: EditionContent): Promise<ResultadoDeClaims> => {
    if (!temPacoteEstruturado) {
      return { claims: [], naoSustentadas: [], custoUsd: 0, tokens: 0, erro: null };
    }

    const auditaveis = edicao.stories
      .map((story, i) => {
        const pacote = pacotes.get(topRanked[i]?.group.primary.url ?? "");
        return pacote ? { indice: i, titulo: story.title, texto: textoDaPauta(story), pacote } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const uniao = pacoteDaEdicao();
    if (uniao) {
      auditaveis.push({
        indice: -1,
        titulo: "abertura, giro rápido e fechamento",
        texto: textoAvulso(edicao),
        pacote: uniao,
      });
    }

    const r = await auditarClaims(auditaveis, env, fetcher);
    totalCostUsd += r.custoUsd;
    custosPorEtapa.auditoria_claims += r.custoUsd;
    return r;
  };

  let parsedEdition = await escreverEdicao(userWritingPrompt);
  let ancoragem = conferirAncoragem(parsedEdition);
  let parsedQA = await auditarQA(parsedEdition);
  let semantica = await auditarSemantica(parsedEdition);

  const rodadas: RodadaDeReparo[] = [];
  let tentativas = 0;

  const problemasDe = (
    anc: AncoragemDaPauta[],
    qa: QAResult,
    sem: ResultadoDeClaims,
  ): ProblemaEditorial[] => {
    const lista: ProblemaEditorial[] = [];

    for (const a of anc) {
      for (const c of a.naoSustentadas.filter((x) => x.severidade === "bloqueio")) {
        lista.push({
          indice: a.indice,
          tipo: "fato",
          descricao: `${c.tipo} "${c.valor}" não está no pacote factual (em: "${c.onde}")`,
        });
      }
    }

    for (const c of sem.naoSustentadas) {
      lista.push({
        indice: c.pauta,
        tipo: "claim",
        descricao: `${c.tipo} sem sustentação: "${c.trecho}". ${c.motivo}`,
      });
    }

    // Apontamento do auditor entra no reparo mesmo quando não bloqueia:
    // imprecisão de redação merece uma tentativa de conserto, e nota baixa
    // costuma vir de imprecisão acumulada. O que o apontamento não faz é
    // derrubar a edição sozinho: quem decide isso é `bloqueia`.
    for (const issue of qa.issues) {
      lista.push({ indice: -1, tipo: "qa", descricao: issue });
    }

    /*
     * Linguagem do leitor: juridiquês, relevância e comprimento de título.
     *
     * Entra na mesma lista de reparo dos outros apontamentos, e de propósito:
     * o gerador já sabe reescrever "somente o necessário" a partir de uma lista
     * nominal, e criar um segundo laço de reparo dobraria o custo de cada
     * edição para resolver o mesmo tipo de problema.
     */
    for (const a of conferirLinguagemDoLeitor(parsedEdition)) {
      lista.push({ indice: a.indice, tipo: "leitor", descricao: `${a.motivo}: ${a.descricao}` });
    }
    if (qa.hallucination_risk && qa.issues.length === 0) {
      lista.push({ indice: -1, tipo: "qa", descricao: "auditor marcou risco de alucinação sem detalhar" });
    }

    return lista;
  };

  /*
   * O que impede a edição de sair.
   *
   * Diferente da lista de reparo. Fato inventado, conclusão sem lastro e risco
   * de alucinação bloqueiam. Imprecisão de redação não: ela vira apontamento,
   * o reparo tenta consertar, e se sobrar, sobra registrada.
   */
  const bloqueia = (anc: AncoragemDaPauta[], qa: QAResult, sem: ResultadoDeClaims): string[] => {
    const motivos: string[] = [];
    const duros = anc.filter((a) => !a.ancorado);
    if (duros.length > 0) motivos.push(`REJECT_UNGROUNDED_CLAIM em ${duros.length} matéria(s)`);
    if (sem.naoSustentadas.length > 0) {
      motivos.push(`UNGROUNDED_EDITORIAL_CLAIM em ${sem.naoSustentadas.length} conclusão(ões)`);
    }
    if (qa.hallucination_risk) motivos.push("REJECT_EDITORIAL_QA: hallucination_risk");
    if (notaMinimaDeQA > 0 && qa.score < notaMinimaDeQA) {
      motivos.push(`REJECT_EDITORIAL_QA: nota ${qa.score} abaixo do piso ${notaMinimaDeQA}`);
    }
    /*
     * Auditoria que NÃO RODOU não é conclusão reprovada.
     *
     * A chamada ao modelo volta com `erro` preenchido em timeout, 429 e 5xx da
     * OpenAI, e isso entrava aqui como bloqueio: uma instabilidade de dois
     * segundos do fornecedor derrubava a newsletter do dia. São coisas
     * diferentes, e só uma delas é sobre o texto estar certo.
     *
     * Vira apontamento, e o apontamento viaja: quem grava o run registra que a
     * edição saiu sem a auditoria semântica daquele dia.
     */
    return motivos;
  };

  let problemas = problemasDe(ancoragem, parsedQA, semantica);

  while (problemas.length > 0 && tentativas < maxTentativasDeReparo) {
    tentativas += 1;

    const promptDeReparo = `
A edição abaixo foi reprovada na conferência de fatos. Reescreva SOMENTE o necessário para resolver cada apontamento, mantendo o resto exatamente como está.

PACOTE FACTUAL (é tudo o que a redação tem; nada fora daqui existe):
${JSON.stringify(factualPackage, null, 2)}

EDIÇÃO ATUAL:
${JSON.stringify(parsedEdition, null, 2)}

APONTAMENTOS:
${problemas.map((p) => `- ${p.indice >= 0 ? `pauta ${p.indice + 1}` : "edição"}: ${p.descricao}`).join("\n")}

COMO CORRIGIR:
- LEGAL_JARGON_OVERLOAD: o caminho preferido é TIRAR o termo, e não explicá-lo. "Os EUA quase não criaram vagas em setembro" resolve sem citar relatório nenhum. Quando o termo precisar ficar, explique em fala, numa frase à parte e curta: "o CPI é o índice de preços ao consumidor dos EUA." Não invente o que o termo significa: se o pacote não diz, descreva o tipo de dado ou de documento e siga.
- LOW_READER_RELEVANCE: escreva quem é afetado e qual o efeito da regra sobre essa pessoa, com o que o pacote afirma. O público é ${DESCRICAO_DO_LEITOR}, não advogado. Se o pacote NÃO sustenta quem é afetado nem qual o efeito, esvazie o campo em vez de escrever ressalva: "a fonte não detalhou" não é relevância, é confissão dentro do texto, e será reprovada por falta de lastro.
- HEADLINE_TOO_LONG: reescreva o título mais curto, mantendo o fato. Corte a qualificação jurídica e mantenha o que mudou e para quem.
- COUNTRY_UNCLEAR: o título serve para o Brasil e para os EUA com as mesmas palavras. Ponha no título a marca que a fonte já traz: o país, a cidade, o estado, o órgão, a moeda ou a figura pública. "Quem ganha menos quase não participou do recorde de renda familiar em 2025" vira "Renda familiar nos EUA bate recorde, e o avanço se concentrou no topo". Repare que a correção resolve duas coisas de uma vez: situa o país e põe o fato antes da ressalva.
- FOREIGN_SUBJECT: tire o gentílico do título e ponha no lugar a profissão, a área ou o cargo. "Engenheira argentina assume a divisão de chips de uma big tech nos EUA" vira "Engenheira de chips assume a divisão de processadores de uma big tech nos EUA" (construção ilustrativa). Se o país for o OBJETO da regra, e não a ficha do personagem, mantenha o país e use a outra metade do título para dizer o que aquilo muda para quem lê daqui.
- MONTH_WITHOUT_YEAR: escreva o ano ao lado do mês e ponha no futuro o que ainda vai acontecer ("vão subir 3,6% em janeiro de 2027"). Não troque nenhum outro fato.
- REDUNDANT_SUBHEAD: NÃO mexa na linha de cima. Reescreva a de baixo com a informação que ela não trouxe: quem é afetado, o prazo, o número, o que muda a partir de quando, sempre com o que o pacote afirma. Se depois de tirar a repetição não sobrar informação nova no pacote, a linha de baixo pode ficar mais curta.
- Afirmação que o pacote não sustenta: remova a afirmação ou troque pelo que o pacote diz. Se depois disso faltar informação, o texto fica mais curto, e está certo. NÃO escreva que a fonte não informou: isso fala da reportagem, e o leitor quer o fato.
- Nome, número ou data fora do pacote: tire. Não substitua por outro nome, número ou data.
- Não invente nada novo para tapar o buraco deixado pela correção.
- Não mexa em pauta que não foi apontada.
- Mantenha o mesmo número de pautas, a mesma ordem e a assinatura.

Retorne EXCLUSIVAMENTE a edição inteira no mesmo formato JSON.
`;

    parsedEdition = await escreverEdicao(promptDeReparo);
    ancoragem = conferirAncoragem(parsedEdition);
    parsedQA = await auditarQA(parsedEdition);
    semantica = await auditarSemantica(parsedEdition);

    const restantes = problemasDe(ancoragem, parsedQA, semantica);
    rodadas.push({
      tentativa: tentativas,
      problemasRecebidos: problemas.map((p) => p.descricao),
      problemasRestantes: restantes.map((p) => p.descricao),
    });
    problemas = restantes;
  }

  /*
   * A edição inteira não morre por causa de uma pauta.
   *
   * Este é o defeito que custou as manhãs de 13, 14 e 15 de setembro de 2026,
   * e mais três tentativas no dia 16: `bloqueia` reprovava a edição toda
   * quando UMA conclusão de UMA matéria não se sustentava. Como o juiz é um
   * modelo, e modelo muda de ideia entre chamadas, o mesmo texto passava numa
   * rodada e reprovava na seguinte. Medido: 5 edições em 13 manhãs.
   *
   * A troca é de escopo, não de rigor. A pauta com problema continua sem ser
   * publicada; o que muda é que ela sai da edição em vez de levar as outras
   * junto. E existe um piso: se sobrar menos que o mínimo, a edição não sai,
   * porque aí o problema não é de uma matéria, é do dia.
   *
   * O que NÃO é salvável desta forma fica de fora de propósito: risco de
   * alucinação e nota do auditor são julgamentos sobre a edição inteira, e
   * não apontam para uma matéria que dê para remover.
   */
  const pautasAuditadas = parsedEdition.stories.map((story, i) => ({
    url: topRanked[i]?.group.primary.url ?? story.source_url,
    titulo: story.title,
    texto: textoDaPauta(story),
  }));

  const comProblema = new Set<number>();
  for (const a of ancoragem) if (!a.ancorado) comProblema.add(a.indice);
  for (const c of semantica.naoSustentadas) if (c.pauta >= 0) comProblema.add(c.pauta);

  const pautasRemovidas: Array<{ indice: number; titulo: string; motivo: string }> = [];
  let molduraTrocada = "";
  const sobrariam = parsedEdition.stories.length - comProblema.size;

  /*
   * O piso é o maior entre o mínimo configurado e DOIS.
   *
   * `EditionContentSchema` exige `stories` com pelo menos 2, e o mínimo
   * editorial vem do ambiente: alguém pode pôr 1 em `EDITORIAL_MIN_PAUTAS` e,
   * sem esta linha, a remoção deixaria uma edição de uma pauta só, que o
   * schema recusa na primeira revalidação lá na frente. Melhor não remover e
   * bloquear do que produzir uma edição que não existe.
   */
  const pisoDePautas = Math.max(limites.minimo, 2);

  if (comProblema.size > 0 && sobrariam >= pisoDePautas) {
    for (const indice of [...comProblema].sort((a, b) => a - b)) {
      const story = parsedEdition.stories[indice];
      if (!story) continue;

      const daAncoragem = ancoragem
        .find((a) => a.indice === indice && !a.ancorado)
        ?.naoSustentadas.map((c) => `${c.tipo} "${c.valor}"`)
        .join(", ");
      const daSemantica = semantica.naoSustentadas
        .filter((c) => c.pauta === indice)
        .map((c) => `${c.tipo}: ${c.motivo}`)
        .join("; ");

      pautasRemovidas.push({
        indice,
        titulo: story.title,
        motivo: [daAncoragem, daSemantica].filter(Boolean).join(" | ") || "sem lastro no pacote factual",
      });
    }

    /*
     * As duas listas são cortadas juntas, e isso não é zelo: a imagem do feed
     * é lida por `selectedCandidates[i]` com o MESMO índice das pautas. Cortar
     * só uma faria cada matéria herdar a foto da matéria seguinte.
     */
    parsedEdition = {
      ...parsedEdition,
      stories: parsedEdition.stories.filter((_, i) => !comProblema.has(i)),
    };
    selectedCandidates = selectedCandidates.filter((_, i) => !comProblema.has(i));
    ancoragem = ancoragem
      .filter((a) => !comProblema.has(a.indice))
      .map((a, i) => ({ ...a, indice: i }));
    semantica = { ...semantica, naoSustentadas: [] };
  }

  /*
   * Abertura, giro rápido e fechamento também saem, e não a edição.
   *
   * Até 05/10/2026 só a frase sem lastro DENTRO de uma matéria tinha saída: a
   * matéria era removida. A mesma frase na abertura, no giro rápido ou no
   * fechamento não pertence a matéria nenhuma, e a edição inteira caía. Foi o
   * que aconteceu no primeiro ensaio da produção na véspera: QA 96, uma
   * conclusão, edição barrada.
   *
   * Esses três trechos não carregam fato que as matérias não carreguem: são
   * moldura. Então a moldura com problema é trocada por uma versão escrita
   * aqui, só com os títulos já auditados, e o giro rápido sai, porque ele não
   * é mais renderizado no e-mail. Nada novo é afirmado, e o aviso registra a
   * troca para quem aprova ver.
   */
  const molduraSemLastro =
    ancoragem.some((a) => a.indice === -1 && !a.ancorado) || semantica.naoSustentadas.some((c) => c.pauta < 0);
  if (molduraSemLastro && parsedEdition.stories.length >= pisoDePautas) {
    const motivoDaMoldura = [
      ...ancoragem
        .filter((a) => a.indice === -1 && !a.ancorado)
        .flatMap((a) => a.naoSustentadas.map((c) => `${c.tipo} "${c.valor}"`)),
      ...semantica.naoSustentadas.filter((c) => c.pauta < 0).map((c) => `${c.tipo}: ${c.motivo}`),
    ].join("; ");
    parsedEdition = { ...parsedEdition, ...molduraNeutra(parsedEdition) };
    ancoragem = ancoragem.filter((a) => a.indice !== -1);
    semantica = { ...semantica, naoSustentadas: semantica.naoSustentadas.filter((c) => c.pauta >= 0) };
    molduraTrocada = `abertura e fechamento trocados por versão neutra, giro rápido retirado (${motivoDaMoldura || "sem lastro"})`;
  }

  const bloqueios = bloqueia(ancoragem, parsedQA, semantica);
  const aprovado = bloqueios.length === 0;

  const avisos: string[] = [];
  if (molduraTrocada) avisos.push(`MOLDURA_NEUTRA: ${molduraTrocada}`);
  const notaDeAviso = opcoesDoPortao.notaDeAviso ?? 0;
  if (notaDeAviso > 0 && parsedQA.score < notaDeAviso) {
    avisos.push(`QA_LOW_SCORE: nota ${parsedQA.score} abaixo de ${notaDeAviso} (aviso, não bloqueia)`);
  }
  if (semantica.erro) avisos.push(`auditoria de conclusões não rodou: ${semantica.erro}`);

  return {
    edition: parsedEdition,
    qaResult: parsedQA,
    ancoragem,
    claimsSemanticas: semantica,
    tentativasDeReparo: tentativas,
    rodadasDeReparo: rodadas,
    aprovado,
    bloqueios,
    problemasRestantes: problemas,
    selectedCandidates,
    pautasRemovidas,
    avisos,
    custosPorEtapa,
    pautasAuditadas,
    totalUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      estimatedCostUsd: totalCostUsd,
    },
  };
}

/**
 * A moldura da edição sem afirmação nenhuma, só com os títulos já auditados.
 *
 * Usada quando a abertura, o giro rápido ou o fechamento trazem algo sem
 * lastro. Os limites são os de `EditionContentSchema`: a abertura tem de 40 a
 * 800 caracteres, e o fechamento pelo menos 10.
 */
export function molduraNeutra(edicao: Pick<EditionContent, "stories">): Pick<EditionContent, "intro" | "closing" | "quick_bits"> {
  const titulos = edicao.stories.map((s) => s.title.trim().replace(/[.!?]+$/, "")).filter(Boolean);
  const lista =
    titulos.length <= 1
      ? titulos.join("")
      : `${titulos.slice(0, -1).join("; ")}; e ${titulos[titulos.length - 1]}`;
  let intro = `Bom dia. Nesta edição: ${lista}.`;
  if (intro.length > 800) intro = `${intro.slice(0, 796).replace(/\s+\S*$/, "")}...`;
  if (intro.length < 40) intro = `Bom dia. Estas são as notícias de hoje sobre os Estados Unidos: ${lista}.`;
  return { intro, closing: "Essas foram as notícias de hoje.", quick_bits: [] };
}

