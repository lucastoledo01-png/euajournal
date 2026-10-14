import { REGRA_DO_MES_COM_ANO } from "@/lib/datas-no-texto";
import { instrucaoVigente, preencherMarcadores } from "../instrucoes";

/**
 * A forma da manchete de capa. Uma regra, num lugar só.
 *
 * ## O que estava errado
 *
 * O prompt pedia "de 3 a 10 palavras" e a guarda recusava acima de 12. A
 * referência que o produto persegue não cabe nessa faixa, e não por gosto: as
 * três capas medidas em 15/09/2026 têm 11, 15 e 16 palavras, de 61 a 116
 * caracteres, ocupando de duas a cinco linhas.
 *
 *   "SUS PARA QUEM TRABALHA": NOVA REGRA DE TRUMP CONDICIONA PARTE DO
 *   MEDICAID A 80 HORAS MENSAIS DE ATIVIDADE                      (105 car.)
 *
 *   AS FAMÍLIAS MAIS FORTES NÃO DEIXAM APENAS PATRIMÔNIO: TRANSMITEM
 *   HÁBITOS, RESPONSABILIDADE E PENSAMENTO INDEPENDENTE            (116 car.)
 *
 *   GILMAR MENDES EM SESSÃO SOBRE MORAES: "ATÉ A MÁFIA TEM ÉTICA"   (61 car.)
 *
 * Com o teto em 10 palavras, o que sai é "Corte adia regra de prazo": cabe na
 * tela, e não diz qual regra, de quem, nem a partir de quando. A faixa não era
 * um detalhe de prompt, era o produto.
 *
 * ## Por que o teto antigo existia, e por que ele não vale mais
 *
 * O comentário da guarda dizia que 12 palavras era limite DA ARTE, porque
 * acima disso o texto encolhe até ficar ilegível. Isso era verdade do desenho
 * anterior. Na gramática de jornal a faixa da manchete tem topo e base fixos
 * (de 58% a 90,5% da altura, 82% da largura) e o corpo do tipo é decidido pelo
 * navegador, entre 74px e 40px. Medindo: 130 caracteres em caixa alta cabem em
 * cinco linhas a 56px, com folga para a base da faixa.
 *
 * Então o teto continua existindo, e continua sendo da arte. Ele só está onde
 * a arte de verdade está, e não onde a arte antiga estava.
 *
 * ## Um lugar só
 *
 * Os números e o texto da regra moram aqui e são lidos por três consumidores:
 * o prompt do post de imagem única, o prompt do carrossel e a guarda que
 * confere o resultado. Já aconteceu de uma regra viver em três cópias neste
 * repositório e as cópias envelhecerem separadas; o custo foi uma peça
 * publicada certa e um diagnóstico mentindo sobre ela.
 */

/*
 * O ALVO de 10 palavras entrou em 06/10/2026; o PISO da guarda continua 6.
 *
 * O método do Not Journal, lido em 31 slides de 7 carrosséis e aprovado pelo
 * dono, é UMA frase com ator, verbo no presente, fato e escala: "China fecha
 * mais de 670 bancos em um ano: Pequim reestrutura o setor em meio à
 * desaceleração" (16 palavras), "Trump elogia rapidez da apuração no Brasil e
 * chama votação nos EUA de 'corrupta'" (14). Abaixo de 10 palavras não cabe a
 * escala, e é isso que o prompt pede.
 *
 * O piso da guarda NÃO subiu junto, e é deliberado: a faixa de 6 a 18 é a que
 * a guarda confere desde 16/09, e subir o piso para 10 transformaria toda
 * manchete de 8 ou 9 palavras, que é boa, em reescrita paga ou em post
 * descartado. O pedido muda o produto; a recusa continua sendo do que é rótulo.
 * O teto de 18 e 130 também não mudou: é da arte, e a arte não mudou.
 */
export const FORMA_DA_MANCHETE = {
  /** Abaixo disto é rótulo, não manchete: cabe na tela e não decide nada. */
  minimoDePalavras: 6,
  /** O que o prompt pede: dez palavras é onde cabe a escala (método de 06/10/2026). */
  alvoMinimoDePalavras: 10,
  /** Medido: acima disto nem a faixa da arte segura em corpo legível. */
  maximoDePalavras: 18,
  minimoDeCaracteres: 45,
  maximoDeCaracteres: 130,
} as const;

/**
 * A regra escrita para o modelo, igual nos dois prompts.
 *
 * Ela ensina a FORMA, e a forma é a única coisa aqui que não depende do fato.
 * O que preenche a forma continua vindo do pacote factual, e é por isso que o
 * bloco termina onde termina: pedir "gancho" sem lastro é como o hedge entrou
 * na redação, e a régua de alucinação recusa do mesmo jeito.
 *
 * Desde 05/10/2026 o TEXTO é editável no painel (etapa `manchete`), e os
 * NÚMEROS não: eles são o contrato que `social-guard.ts` confere. Por isso o
 * modelo escreve os tetos como marcadores, e quem os preenche é o código, com
 * os valores de `FORMA_DA_MANCHETE`. Uma versão do painel que apague o
 * marcador perde a frase do tamanho no prompt, e a guarda continua barrando.
 */
export const MODELO_DA_REGRA_DA_MANCHETE = `A MANCHETE DA CAPA

Ela é o post inteiro para quem não deslizou. Manchete ampla não dá o que decidir: "Fed mexe nos juros" (construção ilustrativa) serve para qualquer decisão, qualquer taxa e qualquer pessoa, e quem lê passa reto.

O MÉTODO, que é o do Not Journal: UMA frase, com quatro peças nesta ordem.
  [ator reconhecível] + [verbo no presente] + [o fato] + [a escala ou o detalhe que prova]
  "China fecha mais de 670 bancos em um ano: Pequim reestrutura o setor em meio à desaceleração" (Not Journal)
  "Trump elogia rapidez da apuração no Brasil e chama votação nos EUA de 'corrupta'" (Not Journal)
- O ator é quem fez ou disse: pessoa, empresa, governo, país. Nome que o leitor reconhece abre a frase.
- O verbo vai no presente: "fecha", "elogia", "corta", "compra". Nada de "teria", "pode vir a", "promete".
- O número vai EXATO, como está no pacote: "mais de 670 bancos", "4,2%", "US$ 500". Não arredonde, não converta.
- Fala e acusação vêm com dono: "chama de 'corrupta'", "segundo o BLS". Aspas só para palavra que alguém disse.
- Zero adjetivo de opinião: "histórico", "polêmico", "chocante", "enorme". O tamanho do fato é o número, não o adjetivo.

DE QUEM É ESTA NOTÍCIA. Quando o fato é uma regra, um preço ou um prazo que muda a vida de um grupo, esse grupo aparece na manchete, com as palavras que a própria fonte usa: quem investe em dólar, quem trabalha com tecnologia, quem paga aluguel, empresa que contrata. Quando o fato é o que um ator fez ou disse, o ator abre a frase, como no método acima, e o grupo entra só se a fonte o nomear. Medido nas nossas primeiras 79 manchetes: em 25 o sujeito era uma instituição ou um ato jurídico, e em 25 o leitor não aparecia de jeito nenhum.

NACIONALIDADE DE TERCEIRO PAÍS NUNCA ENTRA. Se a pessoa da história não é brasileira, a nacionalidade dela sai da manchete e é substituída pela profissão, pela área ou pelo cargo. O leitor está no Brasil e olha para os Estados Unidos; a nacionalidade de um terceiro não diz nada a ele.
  Errado (construção ilustrativa): "Engenheira argentina assume a divisão de chips de uma big tech nos EUA"
  Certo (construção ilustrativa): "Engenheira de chips assume a divisão de processadores de uma big tech nos EUA"

  Um país que não é o Brasil nem os Estados Unidos só fica na manchete quando ele é o OBJETO da notícia, como em "Coreia do Sul planeja investir US$ 200 bilhões nos EUA, com GNL no Alasca", e mesmo aí a outra metade precisa dizer o que aquilo muda para quem lê.

ÓRGÃO E ATO JURÍDICO NÃO ABREM. Corte, tribunal, juiz, liminar, decisão, regra, agência e departamento entram depois, como fiança do fato. Abre a manchete o que passou a valer ou deixou de valer, e para quem.
  Certo, e real (post de 04/10/2026): "Motorista tem direitos violados em busca sem mandado no Flock, decide juiz federal em Oklahoma"

JURISDIÇÃO NO FIM. Estado, cidade, corte ou distrito vão para a última posição. O leitor precisa saber se aquilo o alcança antes de saber onde foi decidido.
  Errado (construção ilustrativa): "Na Califórnia, lei estadual obriga empresas a informar a faixa salarial nas vagas"
  Certo (construção ilustrativa): "Quem procura emprego passa a ver a faixa salarial no anúncio da vaga, na Califórnia"

SIGLA NUNCA SOZINHA. Ou ela vem com três a cinco palavras que dizem o que é ("o CPI, o índice de preços ao consumidor"; "a Selic, a taxa básica de juros do Brasil"), ou sai. Fed, CPI, PCE e Selic crus não são manchete, são anotação de mesa de operação. O mesmo vale para termo técnico em inglês: "Profissionais de tecnologia veem agent orchestration crescer 1.721% nas vagas de bancos" (post real de 03/10/2026) deixa o leitor sem saber o que cresceu.

A FORMA. De duas partes, e os dois-pontos são UMA opção, não o padrão: nas 25 manchetes de referência medidas, só 2 usam dois-pontos. Vírgula, "e" e a frase corrida funcionam igual.

  [o que muda, e para quem] + [o detalhe que prova: número, prazo, data, quem decidiu]

  "Quem tem status de elite na Delta ou American recebe 90 dias na United" (post real de 05/10/2026)
  "Emprego nos EUA muda pouco e taxa de desemprego fica em 4,2% em setembro" (post real de 05/10/2026)
  "Gilmar Mendes em sessão sobre Moraes: 'até a máfia tem ética'"

TAMANHO: de {{alvo_de_palavras}} a {{maximo_de_palavras}} palavras, de {{minimo_de_caracteres}} a {{maximo_de_caracteres}} caracteres. São de três a quatro linhas na arte. Com menos de {{alvo_de_palavras}} palavras não cabe a escala, que é a metade que faz a manchete valer.

O DETALHE VEM DO PACOTE FACTUAL. Se não houver número, prazo nem citação, a segunda parte é o efeito concreto que a fonte descreve, com as palavras dela. E nomear o leitor é obrigação de FORMA, nunca licença para inventar alcance: o grupo afetado sai da fonte. Continua proibido escrever que algo "muda o cenário para brasileiros" quando o pacote não diz isso.

RETOMADA. Quando a mesma história volta, a manchete carrega o dado NOVO: a data, a etapa, quem fica de fora, o que passa a valer. Trocar "Fed" por "banco central americano" e "juros" por "taxa básica" não é manchete nova, é a mesma repetida.

PROIBIDO na manchete: pergunta, "entenda", "veja o que muda", "tudo sobre", "saiba mais", promessa de resultado, e adjetivo no lugar do fato ("decisão histórica", "mudança enorme"). O que prende a atenção é o fato com o detalhe, não o adjetivo sobre ele.`;


const TETOS_DA_MANCHETE = {
  minimo_de_palavras: FORMA_DA_MANCHETE.minimoDePalavras,
  alvo_de_palavras: FORMA_DA_MANCHETE.alvoMinimoDePalavras,
  maximo_de_palavras: FORMA_DA_MANCHETE.maximoDePalavras,
  minimo_de_caracteres: FORMA_DA_MANCHETE.minimoDeCaracteres,
  maximo_de_caracteres: FORMA_DA_MANCHETE.maximoDeCaracteres,
};


/**
 * As regras do dono depois da fila de 07/10/2026, com os pares reais.
 *
 * Fora do texto editável de propósito: o dono pediu cada uma "em código, senão
 * eu vou ficar num loop infinito corrigindo o erro", e uma versão do painel
 * gravada antes desta data (ou editada à mão) apagaria o pedido. Por isso o
 * bloco vem DEPOIS da regra vigente, sempre, como o contrato do JSON. A guarda
 * confere o que dá para conferir sem modelo (`manchete-com-contexto.ts`); este
 * texto ensina o resto, e os pares são as manchetes que o dono devolveu, com a
 * reescrita feita a partir do pacote factual de cada uma.
 */
export const REGRAS_DO_DONO_PARA_A_MANCHETE = `REGRAS DO DONO, que valem sobre qualquer outra regra de manchete acima:

1. A MANCHETE SE EXPLICA SOZINHA para um brasileiro que não leu a matéria: de quem ou do que ela fala, e por que importa. O sujeito é nomeado (pessoa, empresa, órgão, lugar), nunca um pronome.
2. PESSOA É APRESENTADA. Quem não é conhecido do grande público brasileiro entra com o cargo ou a empresa famosa ao lado do nome ("Bret Taylor, presidente do conselho da OpenAI,"; "Douglas Ruas, candidato ao governo do Rio,"). Trump, Lula, Musk, Bolsonaro, Moraes e afins dispensam.
3. FALA ENTRE ASPAS CARREGA O ASSUNTO. Fala que só faz sentido com a matéria do lado é proibida: "tal padrão", "isso", "esse acordo", "eles", "ele" dentro das aspas exigem que a manchete nomeie, FORA das aspas, do que se trata. Sem como nomear, corte a fala com reticências ou escolha outra fala conferida.
4. ${REGRA_DO_MES_COM_ANO}
5. VARIAÇÃO DIZ O QUE VARIOU. "Sobe", "cai", "avança", "recua", "dispara", "despenca" com percentual ou valor nomeiam a métrica: as ações, o valor de mercado, a avaliação, a receita, o índice. Vale para a manchete e para o lide da legenda.

Pares reais da fila de 07/10/2026 (o errado foi devolvido pelo dono; o certo foi escrito com o pacote factual da mesma pauta):
  Errado: "Bret Taylor: “É uma espécie de caos até que tal padrão exista”"
  Certo:  "Bret Taylor, presidente do conselho da OpenAI, sobre agentes de IA nas empresas: “É uma espécie de caos”"
  Errado: "SpaceX sobe quase 8%, atinge maior nível desde meados de junho e devolve Musk ao status de trilionário"
  Certo:  "Ações da SpaceX sobem quase 8% e devolvem Elon Musk ao status de trilionário"
  Errado: "Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ"
  Certo:  "Votos anulados de Garotinho podem eleger Douglas Ruas governador do Rio sem segundo turno contra Eduardo Paes"
  Fraco:  "Ronaldo Caiado oficializa apoio a Flávio Bolsonaro no segundo turno em Goiânia"
  Certo:  "Ronaldo Caiado, derrotado no primeiro turno, oficializa apoio a Flávio Bolsonaro contra Lula"
  Certo, e fica como está: "Anthropic amplia programa para startups com até US$ 45.000 em descontos e créditos"`;

/**
 * A regra do código, já com os números. É o texto que valia antes de 05/10/2026,
 * mais as regras do dono desde 06/10/2026 (o que sai sem painel, byte a byte o
 * que `regraDaMancheteVigente` devolve).
 */
export const REGRA_DA_MANCHETE = `${preencherMarcadores(MODELO_DA_REGRA_DA_MANCHETE, TETOS_DA_MANCHETE)}\n\n${REGRAS_DO_DONO_PARA_A_MANCHETE}`;

/** A regra que vale no ciclo em curso: a versão do painel, se ligada, com os números do código, e as regras do dono. */
export function regraDaMancheteVigente(): string {
  return `${preencherMarcadores(instrucaoVigente("manchete", MODELO_DA_REGRA_DA_MANCHETE), TETOS_DA_MANCHETE)}\n\n${REGRAS_DO_DONO_PARA_A_MANCHETE}`;
}
