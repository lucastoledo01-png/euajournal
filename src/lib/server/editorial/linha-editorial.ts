/**
 * A linha editorial, escrita UMA vez, para as duas leituras de uma pauta.
 *
 * Em 16/09/2026 a publicação deixou de ser sobre imigração e passou a ser
 * sobre os Estados Unidos para brasileiros. O pivô reescreveu o eixo e a
 * régua de relevância do classificador, e parou ali:
 *
 *   - a abertura do classificador continuou dizendo "publicação sobre
 *     imigração, o leitor quer se mudar legalmente", e a `leitura` continuou
 *     medindo "o projeto de mudança do leitor";
 *   - o verificador de finalistas, que é a segunda leitura e só roda no
 *     Instagram, ganhou a lista nova de eixos e manteve todo o resto: leitor
 *     que planeja se mudar, relevância como "o quanto muda a vida de quem
 *     planeja a mudança", e `eua_desfavoravel` do ponto de vista da mudança;
 *   - `seguranca` entrou no schema em 16/09 e nunca entrou em prompt nenhum.
 *
 * Medido em 29/09: em 23, 24, 26 e 28/09 o verificador recusou TODAS as
 * pautas que avaliou ("notícia de tecnologia sem conexão com a decisão de
 * imigrar", "trata de juros e Bolsa, não de imigração"), com 41 e 30 pautas
 * aprovadas pelo classificador nos dois primeiros dias. Zero post nos quatro.
 * A newsletter não sentia porque não passa pelo verificador.
 *
 * É o mesmo defeito da variante da capa em três cópias: a regra existia em
 * dois prompts, mudou em um, e a conferência entre eles passou a comparar a
 * régua nova com a velha. Daqui em diante, quem muda a linha muda aqui, e as
 * duas leituras mudam juntas. O teste `linha-editorial.test.ts` falha se um
 * dos dois prompts voltar a escrever a própria versão.
 *
 * Em 05/10/2026 o dono tirou imigração da pauta e fechou o leitor: é o
 * brasileiro que sonha com os EUA, e não quem já mora lá. A linha é notícia
 * positiva dos EUA e notícia ruim do Brasil, aproveitando o que está em alta.
 * O eixo `imigracao` continua existindo para o classificador ROTULAR a pauta,
 * porque é o rótulo que permite recusá-la em `decidirPauta`; sem ele, uma
 * notícia de visto cairia em "politica" e passaria.
 */

import { instrucaoVigente } from "../instrucoes";
import { LINHA_PADRAO, type LinhaDoProjeto, type PoliticaBrasileira } from "./linha-do-projeto";

/**
 * O leitor, numa frase de decisão (dono, 14/10/2026). É a fonte única: os
 * prompts dos três canais, do QA, da triagem e do carrossel leem daqui, e cada
 * canal acrescenta só a SUA voz. Até esta data havia oito versões, e elas se
 * contradiziam ("sonha", "investir", "estudar", "quem quer morar").
 */
export const DESCRICAO_DO_LEITOR =
  "o brasileiro que pensa em morar nos EUA e acompanha o país para tomar decisões de dinheiro e de carreira";

/** A pergunta que decide se uma pauta é do leitor. */
export const PERGUNTA_DO_LEITOR = "um brasileiro com esse plano se importaria com isso?";

export const LEITOR = `
A publicação é brasileira e é sobre os ESTADOS UNIDOS: economia, trabalho e carreira, custo de vida, tecnologia, empresas, política com efeito prático, cultura e cidades. Imigração NÃO é assunto da publicação: visto, green card, processo migratório, deportação e fronteira ficam fora.
O leitor é ${DESCRICAO_DO_LEITOR}. Ele lê para entender o que está mudando lá e o que isso muda no plano dele.
A pergunta de toda pauta: ${PERGUNTA_DO_LEITOR} Se o "sim" precisa de esforço, a resposta é não.
Notícia dos EUA entra positiva ou neutra: o fato que retrata o país como lugar hostil ou que fecha portas fica fora.
Notícia do Brasil entra quando mexe no mesmo plano: dólar, juros, imposto, carreira, patrimônio. Disputa regional, figura sem projeção nacional e bastidor ficam fora.
Pessoa e empresa entram pelo que o brasileiro reconhece. Quem não é conhecido aqui é apresentado pelo cargo e pela empresa na primeira menção.
Palavra do dia a dia do brasileiro, sobretudo no título. Programa, órgão ou termo americano vira o que ele é em português, com o nome original só se ajudar a reconhecer: "a aposentadoria pública dos EUA (Social Security)", "reajuste", não "ajuste de custo de vida". O título se entende sem saber inglês.
`.trim();

export const REGRA_PAIS = `
pais: "EUA" se o fato acontece nos Estados Unidos ou é decidido por autoridade americana. "Brasil" se acontece no Brasil ou é decidido por autoridade brasileira. "outro" nos demais casos.
`.trim();

export const REGRA_LEITURA = `
leitura: como o FATO chega à vida, ao bolso, ao trabalho ou ao plano do leitor, não o tom do texto.
- "oportunidade": abre, amplia, acelera, barateia ou protege algo. Exemplos: prazo estendido, juros menores, emprego em alta, preço que cai, produto que chega.
- "neutra": informa sem mudar nada em nenhuma direção, ou muda algo sem lado claro. Consulta pública, nomeação, dado estatístico, lançamento, mudança de formulário, resultado de empresa.
- "desfavoravel": fecha, encarece, atrasa ou ameaça algo, ou retrata os EUA como lugar hostil, perigoso ou arbitrário. Exemplos: taxa maior, prazo maior, batida policial, agente acusado de crime, corte de benefício.
Dado econômico comum não é desfavorável por ter subido ou descido: preço de imóvel que sobe 0,25% é "neutra", não retrato hostil do país.
`.trim();

export const REGRA_EIXO = `
eixo: a editoria da pauta.
- "economia": juros, inflação, emprego, mercado, câmbio, empresa que contrata ou demite em massa, decisão do Fed.
- "trabalho": salário, carreira, profissão em alta, jornada, sindicato, o que muda para quem trabalha.
- "custo_de_vida": o que muda o bolso. Moradia, aluguel, energia, combustível, mercado, plano de saúde, imposto sobre renda ou consumo. NÃO entra preço de commodity nem balanço de empresa: só entra se a matéria disser o efeito no preço que a pessoa paga.
- "politica": governo, Congresso, eleição, decisão de corte com efeito prático, medida do Executivo. O fato, nunca a disputa partidária pela disputa.
- "tecnologia": produto, empresa de tecnologia, inteligência artificial, plataforma, o que muda no que a pessoa usa.
- "cultura": comportamento, sociedade, cidade, educação, esporte, o que a vida americana tem de diferente.
- "seguranca": crime, violência, policiamento, segurança pública, dado de criminalidade, nos EUA ou no Brasil.
- "imigracao": visto, green card, status, processo migratório, deportação, fronteira, cidadania. Rotule assim sempre que o assunto for esse: a pauta fica FORA da linha e é recusada.
- "brasil": fato brasileiro com efeito prático sobre patrimônio, empresa, carreira ou segurança, que pesa na comparação com os EUA.
- "outro": o que não couber acima.
`.trim();

export const REGRA_RELEVANCIA = `
relevancia: 0 a 10, e a régua depende do país.

Para notícia dos EUA: quanto o fato interessa a ${DESCRICAO_DO_LEITOR}, e quanto mostra o país como lugar onde a vida anda.
Nomeação de cargo sem efeito prático é 1. Nota de rodapé de mercado é 2. Decisão do Fed sobre juros é 7, porque mexe no câmbio e no preço aqui. Assunto em alta entre brasileiros sobe um ponto. Lei que muda o que se paga de imposto, empresa grande demitindo em massa, cidade que virou destino de brasileiros, tecnologia que troca o jeito de trabalhar: 7 a 9.

Para notícia do Brasil: quanto existe ali um PROBLEMA FACTUAL CONCRETO que afeta quem tem patrimônio, empresa ou carreira, e que pesa na decisão de ficar ou sair. Notícia setorial, disputa comercial, safra, exportação e balanço de empresa não pesam nessa decisão: valem 1 a 3, por maior que seja o número envolvido. Vale de 6 a 9 quando há fato verificável com alcance: mudança de alíquota, decisão que muda regra do jogo, número de inflação, câmbio, juros, dado de violência, decisão institucional com efeito prático. Fofoca de bastidor, disputa de cargo, declaração de político e pesquisa eleitoral isolada valem 1 a 3.

Para notícia de terceiro país: só interessa se afetar brasileiro que quer viver ou investir nos EUA. Caso contrário, 0.
`.trim();

/*
 * O leitor e a régua de relevância são JULGAMENTO editorial e o dono pode
 * reescrevê-los no painel (RF-26, 05/10/2026). País, leitura e eixo NÃO: os
 * três nomeiam os valores que o schema da classificação aceita, e um valor
 * renomeado no painel viraria classificação inválida sem erro de compilação.
 *
 * Os dois prompts chamam ESTAS funções, nunca `instrucaoVigente` direto: é o
 * que mantém a régua num lugar só, que é a razão de este arquivo existir.
 */
export function leitorVigente(): string {
  return instrucaoVigente("linha_editorial_leitor", LEITOR);
}

export function relevanciaVigente(): string {
  return instrucaoVigente("linha_editorial_relevancia", REGRA_RELEVANCIA);
}

/* ------------------------------------------------------------------ */
/* O recorte do dono de 06/10/2026                                     */
/* ------------------------------------------------------------------ */

/*
 * As decisões do dono sobre a auditoria da notícia quente
 * (`docs/auditorias/noticia-quente-2026-10-06.md`, seção 5), na parte que é
 * LINHA: o que entra e o que fica fora. Moram aqui pela razão do topo deste
 * arquivo: classificador e verificador leem o mesmo texto, ou a divergência
 * entre os dois volta a ser régua contra régua.
 *
 * Não passam pelo painel (RF-26) de propósito. Cada regra abaixo tem um campo
 * do schema ou um ramo de `decidirPauta` que depende dela
 * (`citacao_de_famoso`, `quem_fala`, o modo da política brasileira), e um
 * texto reescrito no painel que contradissesse o código viraria a mesma
 * recusa silenciosa de 23 a 28/09. Pelo mesmo motivo o bloco vem DEPOIS da
 * régua de relevância editável, e diz que vale sobre ela.
 */

export {
  EIXOS_DA_CITACAO,
  LINHA_PADRAO,
  MODOS_DA_POLITICA_BRASILEIRA,
  eixosDoBrasil,
  linhaDoProjeto,
  type LinhaDoProjeto,
  type PoliticaBrasileira,
} from "./linha-do-projeto";

const POLITICA_BRASILEIRA: Record<PoliticaBrasileira, string> = {
  so_mercado: `
POLÍTICA BRASILEIRA: entra só quando o fato mexe com dólar, Bolsa, juros, imposto, regra do jogo ou a relação com os EUA. Disputa partidária, campanha, pesquisa eleitoral e declaração de político seguem a régua de relevância acima (1 a 3).
`.trim(),
  eleicao: `
POLÍTICA BRASILEIRA E ELEIÇÃO, abertura temporária do período eleitoral (segundo turno). Esta regra vale SOBRE a régua de relevância acima para notícia do Brasil:
- Política brasileira e eleição ENTRAM em qualquer tom, boa ou ruim: candidatos, segundo turno, pesquisa, debate, apoio, aliança, bastidor e notícia de campanha, decisão do TSE e do STF sobre a eleição, reação do mercado ao resultado.
- Rotule com pais "Brasil" e eixo "politica". Declaração de candidato ou de político sobre a eleição é "political_statement", e mesmo assim entra.
- Relevância: notícia central da eleição (resultado, pesquisa nacional, debate, apoio decisivo, fala de candidato que repercutiu) vale 6 a 8; bastidor e fofoca de campanha com nome conhecido nacionalmente vale 5 a 6; nota de candidato a vereador ou deputado sem alcance nacional vale 1 a 3.
- ALCANCE NACIONAL, para o público de massa: a abertura é para a eleição que o PAÍS acompanha. Entram a disputa presidencial, figuras nacionais (presidente, ministro, ministro do STF, comando do Congresso, governador de estado grande, candidato forte à Presidência), instituição nacional (TSE, STF, Congresso) e o efeito no mercado. Disputa estadual ou municipal, recontagem e anulação de voto num estado, e candidato pouco conhecido fora do próprio estado valem 1 a 3, salvo quando uma figura nacional é a protagonista. Ponha em atores PRIMEIRO quem está no centro da notícia.
- A abertura é SÓ para a política do Brasil. Campanha, pesquisa, arrecadação e disputa partidária dos EUA (midterms, aprovação do presidente, voto de um grupo) seguem a régua de relevância de sempre.
`.trim(),
  fora: `
POLÍTICA BRASILEIRA: fica FORA. Notícia do Brasil só entra quando o fato mexe com o bolso (eixo "economia" ou "custo_de_vida"). Campanha, eleição, disputa e decisão institucional valem 0 a 2.
`.trim(),
};

/**
 * O que vale para todo projeto desde 06/10/2026, qualquer que seja o modo da
 * política brasileira.
 */
export const REGRA_DO_RECORTE = `
GEOPOLÍTICA DO MUNDO: guerra, eleição, protesto e chefe de governo de outro país só entram quando os EUA são o protagonista ou o ator (decisão americana, tropas americanas, acordo assinado pelos EUA, sanção americana). Nesse caso pais "EUA". Sem os EUA no centro, pais "outro" e relevância 0, por maior que seja a história.

CITAÇÃO DE FAMOSO, formato próprio. citacao_de_famoso: true quando a notícia é, no essencial, a FALA de uma pessoa famosa (CEO de empresa grande, bilionário, chefe de governo ou de Estado, presidente de banco central) sobre economia, trabalho, tecnologia, mercado ou os EUA, e a matéria traz a fala entre aspas. quem_fala: o nome dessa pessoa como aparece na matéria. Famosa quer dizer conhecida do leitor brasileiro comum (Musk, Bezos, Sam Altman, Jensen Huang, Powell): executivo que só o setor conhece não é citação de famoso, mesmo à frente de empresa grande, e a notícia dele vale pelo fato da empresa. A citação assim NÃO perde nota por ser fala: vale a relevância do assunto (o CEO da Nvidia dizendo que data centers vão criar 1 milhão de empregos nos EUA vale 6 a 7). Ataque, ofensa e reação a adversário em campanha nos EUA não são citação de famoso. Fora do formato, citacao_de_famoso false e quem_fala vazio.

ESPORTE: só entra como negócio, audiência ou recorde (o jogo mais assistido, o preço do anúncio do Super Bowl, a venda de um time, o contrato recorde, a NFL no Brasil como negócio). Resultado de partida, placar, classificação, escalação e lesão valem 0.

NOTÍCIA RUIM DOS EUA E IMIGRAÇÃO continuam FORA, qualquer que seja o alcance: execução, ICE, batida, tiroteio e crise nos EUA são leitura "desfavoravel"; visto, deportação, fronteira e status migratório são "imigracao".
`.trim();

/** O bloco do recorte para o modo do projeto, o mesmo nos dois prompts. */
export function regraDoRecorte(linha: LinhaDoProjeto = LINHA_PADRAO): string {
  return `${POLITICA_BRASILEIRA[linha.politicaBrasileira]}\n\n${REGRA_DO_RECORTE}`;
}
