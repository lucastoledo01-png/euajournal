import { instrucaoDoMesSemAno, mesesSemAno } from "@/lib/datas-no-texto";
import type { PacoteFactual } from "../editorial/pacote-factual";

/**
 * A manchete precisa se explicar sozinha: as regras do dono de 06/10/2026.
 *
 * O dono leu a fila de 07/10/2026 e devolveu cinco posts. Três defeitos eram
 * de TEXTO, e nenhum deles era fato errado, que é o que a ancoragem confere.
 * Eram manchetes que não diziam nada a quem não conhecia a história:
 *
 * - "Bret Taylor: “É uma espécie de caos até que tal padrão exista”". Quem é
 *   Bret Taylor, e que padrão? A fala só faz sentido com a matéria do lado.
 * - "Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem
 *   anulados no RJ". Vencer o quê? Quem é Douglas Ruas?
 * - "SpaceX sobe quase 8%...". Sobe 8% em quê? Ações, avaliação, receita?
 *
 * Nas palavras dele, cada um precisava virar regra em CÓDIGO, "senão eu vou
 * ficar num loop infinito corrigindo o erro". O prompt pede (e pede com os
 * exemplos reais, em `manchete.ts`); este módulo confere, e o que ele acha
 * volta para a reescrita com o problema nomeado, como o resto da guarda.
 *
 * O que dá para conferir sem modelo, e é só isso que está aqui:
 *
 * 1. Fala entre aspas com dêitico ("tal padrão", "isso", "eles") cujo
 *    referente não está na manchete, fora das aspas.
 * 2. Pessoa que abre a manchete ou que fala nela, sem ser conhecida do
 *    público brasileiro e sem cargo ou empresa que a apresente.
 * 3. Manchete sem sujeito reconhecível: abre com pronome, ou não nomeia
 *    ninguém (nem pessoa, nem empresa, nem lugar).
 * 4. Variação ("sobe", "cai", "dispara"...) com número sem a métrica que
 *    variou ("ações", "valor de mercado", "receita", "índice").
 *
 * Tudo aqui é puro e não chama nada, para a guarda, o script de refação e
 * outra frente (a seleção) poderem ler as mesmas listas.
 */

export type ProblemaDeContexto = {
  regra: "citacao_com_deitico" | "pessoa_sem_apresentacao" | "sem_sujeito" | "variacao_sem_metrica" | "mes_sem_ano";
  detalhe: string;
};

function semAcento(texto: string): string {
  return (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizar(texto: string): string {
  return semAcento(texto)
    .toLowerCase()
    .replace(/[^a-z0-9%$&\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Quem o público brasileiro reconhece sem apresentação                */
/* ------------------------------------------------------------------ */

/**
 * Pessoas que o leitor médio no Brasil reconhece pelo nome, sem cargo.
 *
 * A régua do dono: quem fala na manchete é conhecido do grande público
 * brasileiro OU entra apresentado por empresa famosa ou cargo ("Bret Taylor,
 * presidente do conselho da OpenAI"). A lista é curta de propósito: errar
 * para fora custa uma aposição na manchete ("Sam Altman, CEO da OpenAI"),
 * errar para dentro é o post que o dono devolve. Exportada para a seleção
 * (outra frente) poder ler a mesma régua de fama, se quiser.
 */
export const FAMOSOS_PARA_O_PUBLICO_BRASILEIRO = [
  // EUA e mundo
  "Donald Trump",
  "Joe Biden",
  "Barack Obama",
  "Kamala Harris",
  "JD Vance",
  "Elon Musk",
  "Jeff Bezos",
  "Mark Zuckerberg",
  "Bill Gates",
  "Warren Buffett",
  "Steve Jobs",
  "Taylor Swift",
  "Vladimir Putin",
  "Xi Jinping",
  "Volodymyr Zelensky",
  "Javier Milei",
  "Benjamin Netanyahu",
  "Emmanuel Macron",
  "Papa Leão XIV",
  "Papa Francisco",
  // Brasil
  "Lula",
  "Luiz Inácio Lula da Silva",
  "Jair Bolsonaro",
  "Flávio Bolsonaro",
  "Eduardo Bolsonaro",
  "Michelle Bolsonaro",
  "Alexandre de Moraes",
  "Gilmar Mendes",
  "Fernando Haddad",
  "Geraldo Alckmin",
  "Tarcísio de Freitas",
  "Ronaldo Caiado",
  "Ciro Gomes",
  "Simone Tebet",
  "Marina Silva",
  "Michel Temer",
  "Dilma Rousseff",
  "Eduardo Paes",
  "Pablo Marçal",
  "Nikolas Ferreira",
  "Neymar",
] as const;

/** Sobrenomes que sozinhos já identificam (a manchete escreve "Musk", "Trump"). */
const SOBRENOMES_FAMOSOS = new Set(
  ["trump", "biden", "obama", "musk", "bezos", "zuckerberg", "putin", "milei", "lula", "bolsonaro", "moraes", "haddad", "alckmin", "zelensky", "netanyahu", "macron"],
);

export function ehFamosoParaOPublico(nome: string): boolean {
  const n = normalizar(nome);
  if (!n) return false;
  if (FAMOSOS_PARA_O_PUBLICO_BRASILEIRO.some((f) => normalizar(f) === n)) return true;
  const partes = n.split(" ");
  // "Musk" sozinho, ou "Elon Musk": o sobrenome famoso basta.
  if (partes.some((p) => SOBRENOMES_FAMOSOS.has(p))) return true;
  // "Caiado" casa "Ronaldo Caiado": o nome do pacote às vezes vem só com o sobrenome.
  return FAMOSOS_PARA_O_PUBLICO_BRASILEIRO.some((f) => {
    const fp = normalizar(f).split(" ");
    return partes.length === 1 && fp.length > 1 && fp[fp.length - 1] === partes[0];
  });
}

/**
 * Palavras de cargo, função ou apresentação. Com uma delas na manchete, a
 * pessoa está apresentada ("CEO da Sierra", "governador do Rio", "bilionário").
 */
const CARGO =
  /\b(ceo|presidente|fundador|fundadora|cofundador|cofundadora|co-fundador|dono|dona|diretor|diretora|executivo|executiva|chefe|secretario|secretaria|ministro|ministra|governador|governadora|senador|senadora|deputado|deputada|prefeito|prefeita|vereador|vereadora|candidato|candidata|juiz|juiza|bilionario|bilionaria|investidor|investidora|economista|analista|porta-voz|lider|vice|conselho|chanceler|premie|primeiro-ministro|primeira-ministra|rei|rainha|papa|tecnico|treinador|jogador|jogadora|atacante|cantor|cantora|ator|atriz|apresentador|apresentadora|empresario|empresaria|magnata|cientista|professor|professora|pesquisador|pesquisadora|comandante|general|embaixador|embaixadora|procurador|procuradora|ex-[a-z]+|influenciador|influenciadora|youtuber|piloto|astronauta|bispo|pastor)\b/;

/** "Bret Taylor, da Sierra": a aposição com a empresa também apresenta. */
const APOSICAO_DE_EMPRESA = /,\s*(d[oa]s?|de)\s+\p{Lu}/u;

function temApresentacao(moldura: string): boolean {
  return CARGO.test(normalizar(moldura)) || APOSICAO_DE_EMPRESA.test(moldura);
}

/* ------------------------------------------------------------------ */
/* Falas entre aspas                                                   */
/* ------------------------------------------------------------------ */

const ASPAS = /[“"«‘]([^”"»’“\n]{3,400})[”"»’]/g;

function falasDaManchete(headline: string): string[] {
  return [...headline.matchAll(ASPAS)].map((m) => m[1].trim());
}

function foraDasAspas(headline: string): string {
  return headline.replace(ASPAS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Dêiticos e anafóricos: palavras que apontam para algo que só a matéria diz.
 *
 * Com acento, e sem normalizar: "esta" (dêitico) e "está" (verbo) só se
 * separam pelo acento. Pronome sozinho ("isso", "eles") não tem referente que
 * a manchete possa nomear do lado de fora, então é recusa sempre; determinante
 * ("tal padrão", "essa regra") passa quando o nome que vem depois dele está na
 * manchete, fora das aspas.
 */
const PRONOMES_DEITICOS = new Set([
  "isso", "isto", "aquilo", "disso", "disto", "daquilo", "nisso", "nisto", "naquilo",
  "ele", "ela", "eles", "elas", "dele", "dela", "deles", "delas",
]);
const DETERMINANTES_DEITICOS = new Set([
  "tal", "tais", "esse", "essa", "esses", "essas", "este", "esta", "estes", "estas",
  "desse", "dessa", "desses", "dessas", "deste", "desta", "destes", "destas",
  "nesse", "nessa", "nesses", "nessas", "neste", "nesta", "nestes", "nestas",
  "aquele", "aquela", "aqueles", "aquelas", "daquele", "daquela", "naquele", "naquela",
]);

/** O radical que casa "padrão" com "padrões" e "regra" com "regras". */
function radical(palavra: string): string {
  const n = normalizar(palavra);
  return n.length > 5 ? n.slice(0, 5) : n;
}

export function deiticosSemReferente(headline: string): string[] {
  const fora = normalizar(foraDasAspas(headline));
  const radicaisDeFora = new Set(fora.split(" ").filter((p) => p.length >= 4).map(radical));
  const achados: string[] = [];
  for (const fala of falasDaManchete(headline)) {
    const palavras = fala.toLowerCase().split(/[^\p{L}-]+/u).filter(Boolean);
    for (let i = 0; i < palavras.length; i += 1) {
      const p = palavras[i];
      if (PRONOMES_DEITICOS.has(p)) {
        achados.push(`"${p}"`);
        continue;
      }
      if (DETERMINANTES_DEITICOS.has(p)) {
        const nome = palavras[i + 1] ?? "";
        if (!nome || nome.length < 3 || !radicaisDeFora.has(radical(nome))) achados.push(`"${p} ${nome}"`.trim());
      }
    }
  }
  return [...new Set(achados)];
}

/* ------------------------------------------------------------------ */
/* Pessoa sem apresentação                                             */
/* ------------------------------------------------------------------ */

function contemNome(texto: string, nome: string): boolean {
  const t = ` ${normalizar(texto)} `;
  const n = normalizar(nome);
  if (!n) return false;
  if (t.includes(` ${n} `)) return true;
  const partes = n.split(" ").filter((p) => p.length >= 3);
  const sobrenome = partes[partes.length - 1];
  return Boolean(sobrenome) && partes.length > 1 && t.includes(` ${sobrenome} `);
}

/**
 * As pessoas que a manchete põe em cena: a que fala (pela citação conferida
 * ou por `quem_fala`) e a que abre a frase. Outras pessoas no meio da manchete
 * ("apoio a Flávio Bolsonaro") não são o sujeito, e a régua não as cobra.
 */
function pessoasEmCena(
  headline: string,
  contexto: { pacote?: Pick<PacoteFactual, "people" | "citacoes"> | null; quemFala?: string | null },
): string[] {
  const nomes = new Set<string>();
  const falas = falasDaManchete(headline).map(normalizar);
  if (contexto.quemFala?.trim() && falas.length > 0) nomes.add(contexto.quemFala.trim());
  for (const c of contexto.pacote?.citacoes ?? []) {
    const original = normalizar(c.original);
    const traducao = normalizar(c.traducao);
    if (falas.some((f) => f.length > 8 && (original.includes(f) || traducao.includes(f) || f.includes(traducao)))) {
      // O autor da citação às vezes vem só com o sobrenome ("Taylor"): o nome cheio vem do pacote.
      const cheio = (contexto.pacote?.people ?? []).find((p) => contemNome(p, c.autor) || normalizar(p).endsWith(normalizar(c.autor)));
      nomes.add(cheio ?? c.autor);
    }
  }
  /*
   * Quem abre a frase: a pessoa do pacote cujo nome aparece nas primeiras
   * quatro palavras. O nome inteiro manda; o sobrenome sozinho só vale quando
   * ninguém mais do pacote o tem. Medido no ensaio de 06/10/2026: "Ronaldo
   * Caiado oficializa..." casava também "Gracinha Caiado" pelo sobrenome, e a
   * manchete certa era recusada por uma pessoa que nem estava nela.
   */
  const abertura = foraDasAspas(headline).split(/\s+/).slice(0, 4).join(" ");
  const pessoas = (contexto.pacote?.people ?? []).filter((p) => normalizar(p).split(" ").length >= 2);
  const inteiros = pessoas.filter((p) => ` ${normalizar(abertura)} `.includes(` ${normalizar(p)} `));
  if (inteiros.length > 0) {
    for (const p of inteiros) nomes.add(p);
  } else {
    const sobrenome = (p: string) => normalizar(p).split(" ").pop() ?? "";
    for (const p of pessoas) {
      const unico = pessoas.filter((q) => sobrenome(q) === sobrenome(p)).length === 1;
      if (unico && contemNome(abertura, p)) nomes.add(p);
    }
  }
  // Sem pacote: "Nome Sobrenome: “fala”", o formato que o dono devolveu.
  const prefixo = /^([^:“"«]{3,60}):\s*[“"«]/.exec(headline.trim());
  if (prefixo && nomes.size === 0) {
    const candidato = prefixo[1].trim();
    if (/^(\p{Lu}[\p{L}.'-]*\s?){1,4}$/u.test(candidato)) nomes.add(candidato);
  }
  return [...nomes];
}

export function pessoasSemApresentacao(
  headline: string,
  contexto: { pacote?: Pick<PacoteFactual, "people" | "citacoes"> | null; quemFala?: string | null } = {},
): string[] {
  const moldura = foraDasAspas(headline);
  if (temApresentacao(moldura)) return [];
  return pessoasEmCena(headline, contexto).filter((p) => !ehFamosoParaOPublico(p));
}

/* ------------------------------------------------------------------ */
/* Sujeito reconhecível                                                */
/* ------------------------------------------------------------------ */

const ABRE_COM_PRONOME = /^(ele|ela|eles|elas|isso|isto|aquilo|este|esta|esse|essa|tal|o mesmo|a mesma|os mesmos|as mesmas)\b/i;

/**
 * A manchete diz de quem ou do que ela fala?
 *
 * Abrir com pronome é a manchete que pressupõe a anterior. E não nomear
 * ninguém, nem pessoa, nem empresa, nem órgão, nem lugar, é a manchete que
 * serve para qualquer história: "Empresas cortam vagas em ritmo mais lento".
 * Nome aqui é palavra com maiúscula fora da primeira posição, sigla, marca
 * escrita como marca ("SpaceX", "iPhone") ou um nome do pacote.
 */
export function semSujeitoReconhecivel(
  headline: string,
  pacote?: Pick<PacoteFactual, "people" | "organizations" | "places"> | null,
): string | null {
  const limpa = foraDasAspas(headline).trim();
  if (ABRE_COM_PRONOME.test(limpa)) {
    return `a manchete abre com "${limpa.split(/\s+/)[0]}", um pronome: nomeie de quem ou do que ela fala`;
  }
  const palavras = limpa.split(/\s+/).filter(Boolean);
  const temNomeProprio = palavras.some((p, i) => {
    const w = p.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "");
    if (!w) return false;
    if (/^\p{Lu}{2,}/u.test(w)) return true; // sigla: EUA, TSE, OpenAI
    if (/^\p{L}+\p{Lu}/u.test(w)) return true; // SpaceX, iPhone
    return i > 0 && /^\p{Lu}/u.test(w);
  });
  if (temNomeProprio) return null;
  const entidades = [...(pacote?.people ?? []), ...(pacote?.organizations ?? []), ...(pacote?.places ?? [])];
  if (entidades.some((e) => contemNome(limpa, e))) return null;
  // A primeira palavra com maiúscula pode ser o nome ("Anthropic amplia..."): conta quando é nome no pacote.
  const primeira = normalizar(palavras[0] ?? "");
  if (primeira && entidades.some((e) => normalizar(e).split(" ").includes(primeira))) return null;
  return "a manchete não nomeia ninguém (pessoa, empresa, órgão ou lugar): diga de quem é a notícia";
}

/* ------------------------------------------------------------------ */
/* Variação sem métrica                                                */
/* ------------------------------------------------------------------ */

/** Verbos de variação, em todas as conjugações que a manchete e o lide usam (sem acento). */
const VERBO_DE_VARIACAO =
  /\b(sob(e|em|iu|iram|ir|indo)|ca(i|em|iu|iram|ir|indo)|avanc(a|am|ou|aram|ar)|avanca(m|r)?|recu(a|am|ou|aram|ar)|dispar(a|am|ou|aram|ar)|despenc(a|am|ou|aram|ar)|salt(a|am|ou|aram|ar)|tomb(a|am|ou|aram|ar)|cresc(e|em|eu|eram|er)|aument(a|am|ou|aram|ar)|diminu(i|em|iu|iram|ir)|encolh(e|em|eu|eram|er)|valoriz(a|am|ou|aram|ar)|desvaloriz(a|am|ou|aram|ar)|ganh(a|am|ou|aram)|perd(e|em|eu|eram)|recuper(a|am|ou|aram)|desab(a|am|ou|aram))\b/;

/** O valor que faz a variação ser uma variação medida: percentual, pontos ou dinheiro. */
const VALOR = /(\d[\d.,]*\s?%|\d[\d.,]*\s+(pontos?|p\.?p\.?)\b|(us|r|a|c)?\$\s?\d|€\s?\d)/;

/**
 * A métrica que variou. Sem ela, "SpaceX sobe quase 8%" não diz se subiram as
 * ações, a avaliação ou a receita (a regra do dono, 06/10/2026). Lista de
 * palavras e não de frases inteiras, comparada sem acento.
 */
const METRICA =
  /\b(acao|acoes|papel|papeis|valor de mercado|avaliacao|avaliada|valuation|receita|receitas|lucro|lucros|prejuizo|faturamento|vendas|venda|indice|ibovespa|bolsa|bolsas|s&p|nasdaq|dow|dolar|euro|bitcoin|cripto|criptomoeda|preco|precos|cotacao|taxa|taxas|juros|inflacao|pib|desemprego|emprego|empregos|vagas|producao|exportacoes|importacoes|petroleo|ouro|salario|salarios|renda|patrimonio|fortuna|audiencia|aprovacao|rejeicao|intencao de voto|intencoes de voto|pesquisa|votos|populacao|gastos|custo|custos|aluguel|alugueis|tarifa|tarifas|divida|deficit|superavit|consumo|demanda|estoques|participacao|margem|assinantes|usuarios|downloads|matriculas|turistas|pedidos|contratacoes|rendimento|investimento|investimentos|arrecadacao|mensalidade|financiamento|hipoteca|credito|exportacao|importacao|safra|frete|combustivel|gasolina|diesel|energia|conta de luz)\b/;

/**
 * As orações com variação medida e sem métrica.
 *
 * A oração vai de pontuação a pontuação ("SpaceX sobe quase 8%" é uma, "atinge
 * maior nível desde junho" é outra), e a métrica pode estar em qualquer lugar
 * dela: antes do verbo ("As ações da SpaceX subiram") ou depois do número ("sobe
 * 8% no valor de mercado"). O valor tem de vir logo depois do verbo, em até
 * oito palavras, para "cresce e emprega 8% mais gente" não virar falso alarme.
 */
export function variacoesSemMetrica(texto: string): string[] {
  const achados: string[] = [];
  for (const bruta of (texto || "").split(/[.;:!?\n]|,\s+(?=\p{L})/u)) {
    const oracao = bruta.trim();
    if (!oracao) continue;
    const n = semAcento(oracao).toLowerCase();
    const verbo = VERBO_DE_VARIACAO.exec(n);
    if (!verbo) continue;
    const depois = n.slice(verbo.index).split(/\s+/).slice(0, 9).join(" ");
    if (!VALOR.test(depois)) continue;
    if (METRICA.test(n)) continue;
    achados.push(oracao);
  }
  return achados;
}

/* ------------------------------------------------------------------ */
/* Tudo junto, para a guarda                                           */
/* ------------------------------------------------------------------ */

export function conferirContextoDaManchete(
  headline: string,
  contexto: {
    pacote?: Pick<PacoteFactual, "people" | "organizations" | "places" | "citacoes"> | null;
    quemFala?: string | null;
    /** O lide da legenda (`copy.gancho`): a variação sem métrica é conferida nele também. */
    lide?: string;
    /** O dia da conferência, para o mês sem ano. Padrão: agora. */
    hoje?: Date;
  } = {},
): ProblemaDeContexto[] {
  const problemas: ProblemaDeContexto[] = [];

  const deiticos = deiticosSemReferente(headline);
  if (deiticos.length > 0) {
    problemas.push({
      regra: "citacao_com_deitico",
      detalhe:
        `a fala entre aspas só faz sentido com a matéria do lado (${deiticos.join(", ")} sem o referente nomeado fora das aspas): ` +
        `nomeie na manchete do que a fala trata ("sobre o padrão aberto para agentes de IA"), corte a fala com reticências ou escolha outra fala que carregue o assunto`,
    });
  }

  const semApresentacao = pessoasSemApresentacao(headline, contexto);
  if (semApresentacao.length > 0) {
    problemas.push({
      regra: "pessoa_sem_apresentacao",
      detalhe:
        `${semApresentacao.join(", ")} não é conhecido do grande público brasileiro e entra sem apresentação: ` +
        `ponha o cargo ou a empresa famosa ao lado do nome ("Bret Taylor, presidente do conselho da OpenAI,"), ou abra pelo fato`,
    });
  }

  const sujeito = semSujeitoReconhecivel(headline, contexto.pacote ?? null);
  if (sujeito) problemas.push({ regra: "sem_sujeito", detalhe: sujeito });

  for (const [onde, texto] of [
    ["manchete", headline],
    ["lide da legenda", contexto.lide ?? ""],
  ] as const) {
    for (const oracao of variacoesSemMetrica(texto)) {
      problemas.push({
        regra: "variacao_sem_metrica",
        detalhe:
          `${onde}: "${oracao.slice(0, 90)}" diz que algo variou sem dizer O QUÊ: ` +
          `nomeie a métrica ("as ações da SpaceX sobem 8%", "o valor de mercado", "a receita", "o índice S&P 500")`,
      });
    }
  }

  // Mês que já passou neste ano, sem o ano: lido como notícia velha (14/10/2026).
  const meses = mesesSemAno(headline, contexto.hoje ?? new Date());
  if (meses.length > 0) {
    problemas.push({ regra: "mes_sem_ano", detalhe: `manchete: ${instrucaoDoMesSemAno(meses, contexto.hoje ?? new Date())}` });
  }

  return problemas;
}
