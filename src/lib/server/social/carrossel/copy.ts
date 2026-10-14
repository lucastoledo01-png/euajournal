/**
 * O texto de um carrossel: a mesma legenda de sempre, mais os slides.
 *
 * A decisão que organiza este módulo é reaproveitar `CopyDoPostSchema` inteiro
 * em vez de criar um contrato paralelo. A manchete e a legenda de um carrossel
 * têm exatamente o mesmo trabalho que num post de imagem única, e as duas
 * verificações mais importantes do Social Guard, a ancoragem da manchete e a
 * ancoragem da legenda, já operam sobre esses campos. Um contrato novo faria
 * essas duas verificações precisarem de um segundo caminho, e caminho duplicado
 * de guarda é como uma regra deixa de valer sem ninguém perceber.
 *
 * O que muda é o que vai NA legenda. Num carrossel o detalhe vive nos slides, e
 * repetir tudo na legenda é pedir para o leitor não deslizar.
 */

import { z } from "zod";
import { callOpenAIJSON, getAIProviderConfig } from "../../newsroom/ai-provider";
import { limparVicios } from "../../newsroom/anti-vicios";
import { REGRA_DO_DOLAR } from "../../editorial/dolar-em-portugues";
import { DESCRICAO_DO_LEITOR } from "../../editorial/linha-editorial";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import type { PautaAvaliada } from "../../editorial/guarda";
import {
  CopyDoPostSchema,
  LEGENDA_NO_METODO_NOT_JOURNAL,
  blocoDaCitacao,
  calendarioDaSemana,
  ctaDaPosicao,
  levaCta,
  type MarcaSocial,
} from "../copy";
import {
  ehEstruturaDaNoticia,
  papeisDoModelo,
  papeisPara,
  type EstruturaDoCarrossel,
  type PapelDeSlide,
} from "./estrutura";
import { regraDaMancheteVigente } from "../manchete";
import { instrucaoVigente } from "../../instrucoes";
import { vozSocialVigente } from "../voz";

/**
 * Corta na última palavra inteira que cabe.
 *
 * Mesmo aparador da copy de imagem única, e pela mesma razão: estouro de teto
 * não pode custar o post. A diferença é o que os tetos significam aqui, que é
 * densidade de slide e não tamanho de campo. Ver DENSIDADE abaixo.
 */
function aparar(limite: number) {
  return z.preprocess((v) => {
    if (typeof v !== "string" || v.length <= limite) return v;
    const bruto = v.slice(0, limite);
    const ultimoEspaco = bruto.lastIndexOf(" ");
    return (ultimoEspaco > limite * 0.6 ? bruto.slice(0, ultimoEspaco) : bruto).trimEnd();
  }, z.string());
}

/**
 * DENSIDADE: quanto de texto cabe confortavelmente num slide.
 *
 * Não são números de gosto. O canvas é 1080x1440 e o corpo tem uma faixa útil
 * de mais ou menos 900 por 700 pontos depois do cabeçalho, do rodapé e das
 * margens. O ajuste automático do render encolhe o texto até um piso e o piso
 * existe porque abaixo dele a peça fica ilegível no celular, e a regra do
 * pedido é explícita: se não cabe, reduzir informação ou acrescentar slide,
 * nunca diminuir a fonte até ficar ruim.
 *
 * Então o teto de caracteres é o que faz o texto caber ANTES de o ajuste
 * precisar encolher nada.
 */
const TITULO_DO_SLIDE = 70;
const CORPO_DO_SLIDE = 260;
/*
 * O corpo da NOTÍCIA é maior, e o aparador do schema segue o maior dos dois
 * (06/10/2026). O slide de notícia tem até dois blocos de 15 a 30 palavras, o
 * que dá até uns 400 caracteres, e a arte dele mede o texto no navegador
 * (`miolo_noticia`). O conteúdo permanente continua recebendo o pedido de 260
 * no prompt; o aparador só existe para estouro não custar o post.
 */
export const CORPO_DO_SLIDE_DA_NOTICIA = 420;
export const PALAVRAS_POR_BLOCO = { minimo: 15, maximo: 30 } as const;
const BULLET_DO_SLIDE = 90;
const MAXIMO_DE_BULLETS = 3;
const LADO_DA_COMPARACAO = 120;

export const SlideDeTextoSchema = z.object({
  /**
   * O papel que este slide cumpre, ecoado de volta pelo modelo.
   *
   * Serve para amarrar a resposta à estrutura pedida: sem isso, a única forma
   * de saber qual slide é qual seria a posição no array, e um modelo que
   * inverte dois slides produziria um carrossel que responde antes de
   * perguntar, sem nada que detectasse isso.
   */
  papel: z.string().min(1),
  titulo: aparar(TITULO_DO_SLIDE).pipe(z.string().min(3)),
  corpo: aparar(Math.max(CORPO_DO_SLIDE, CORPO_DO_SLIDE_DA_NOTICIA)).pipe(z.string()).default(""),
  bullets: z.array(aparar(BULLET_DO_SLIDE).pipe(z.string())).max(MAXIMO_DE_BULLETS).default([]),
  /** Só na comparação: o que vale de cada lado. Vazio nos outros papéis. */
  lado_a: aparar(LADO_DA_COMPARACAO).pipe(z.string()).default(""),
  lado_b: aparar(LADO_DA_COMPARACAO).pipe(z.string()).default(""),
});

export type SlideDeTexto = z.infer<typeof SlideDeTextoSchema>;

export const CopyDoCarrosselSchema = CopyDoPostSchema.extend({
  slides: z.array(SlideDeTextoSchema).min(1).max(7),
});

export type CopyDoCarrossel = z.infer<typeof CopyDoCarrosselSchema>;

/**
 * A legenda do carrossel é mais curta, e isso é garantido em código.
 *
 * `contexto` e `informacao_util` são o material dos slides, e repeti-los na
 * legenda faz o post entregar tudo antes do primeiro deslize. O prompt já pede
 * os dois vazios, e aqui eles são esvaziados de novo.
 *
 * Não é redundância: é o que torna `montarLegenda`, a função que a guarda e o
 * pipeline já usam, PROVADAMENTE igual à legenda curta do carrossel. A
 * alternativa era uma segunda função de legenda, e aí a guarda ancoraria um
 * texto e o post publicaria outro.
 *
 * ATUALIZADO em 06/10/2026: a legenda do carrossel deixou de ser curta. No
 * método do Not Journal ela conta MAIS que a capa e os slides, em lide e
 * `paragrafos`, e esses não são tocados aqui. Os dois campos antigos continuam
 * esvaziados, para uma resposta no formato antigo não repetir os slides.
 */
export function encurtarLegenda(copy: CopyDoCarrossel): void {
  copy.contexto = "";
  copy.informacao_util = "";
}

function descreverPapeis(papeis: PapelDeSlide[]): string {
  return papeis
    .map((p, i) => {
      const n = i + 1;
      if (p.escritoEmCodigo) {
        return `${n}. papel "${p.papel}": NÃO escreva este slide. Ele é montado em código. Não inclua no array.`;
      }
      const extra = p.variante === "comparacao_duas_colunas"
        ? ' Este slide tem DUAS COLUNAS: preencha "lado_a" e "lado_b" com o que vale de cada lado, e use "titulo" para nomear a diferença. Deixe "corpo" vazio.'
        : "";
      return `${n}. papel "${p.papel}": ${p.pede}.${extra}`;
    })
    .join("\n");
}

/**
 * O julgamento editorial do carrossel: quem lê e a régua de escopo. Editável
 * no painel desde 05/10/2026 (etapa `carrossel_copy`). Os papéis dos slides,
 * os tetos de caractere e o JSON são contrato e ficam no código.
 */
export const INSTRUCAO_PADRAO_CARROSSEL = `QUEM LÊ: ${DESCRICAO_DO_LEITOR}. Ainda não mora lá e não é especialista. Escreva como se explicasse para alguém inteligente que nunca leu um relatório técnico. Imigração não é assunto desta conta: não puxe a pauta para visto. Termo técnico só quando não há palavra comum, e aí explicado na mesma frase em que aparece. Nada de "payroll", "yield" e "guidance" soltos.

  NÃO (construção ilustrativa): "O yield da Treasury de 10 anos avançou com o guidance hawkish do Fomc."
  ASSIM: "Os juros que o governo americano paga para pegar dinheiro emprestado por 10 anos subiram, depois que o comitê do Fed, o Fomc, sinalizou juros altos por mais tempo."

  E só assim se o pacote factual sustentar. Explicar não autoriza acrescentar.

ESCOPO: a afirmação não pode ser maior que o fato que a sustenta. É o erro mais fácil de cometer num carrossel, porque há slides para preencher, e nele nenhuma palavra é inventada: o que é inventado é o alcance. Cinco trocas proibidas:

- possibilidade por certeza: se a fonte diz "pode", "em geral" ou "costuma", NÃO escreva "vai", "garante" ou "sempre";
- parte por todo: se a fonte fala de "algumas situações" ou "certos casos", NÃO escreva "todos", "qualquer" ou "em qualquer caso";
- um caso por uma regra: se a fonte descreve um exemplo ou uma decisão específica, NÃO afirme como regra geral;
- evidência por exigência: se a fonte diz que algo "pode ser apresentado" ou "é considerado", NÃO escreva "é obrigatório" ou "precisa";
- permissão por direito: se a fonte diz que algo é permitido em determinadas condições, NÃO escreva que a pessoa "tem direito" sem as condições.

Escopo correto vale mais que manchete bonita. Isso vale em especial para comparação, processo, custo e perfil profissional, que são os formatos em que a tentação de generalizar é maior.

A NOTÍCIA EM CARROSSEL, no método do Not Journal. O código só manda a notícia para cá quando o pacote tem material para pelo menos dois passos além da capa; o seu trabalho é contar esses passos, um por slide, sem encher.
- A ordem é escala, detalhe, explicação e consequência. A ESCALA é o número que dá o tamanho do fato ("mais de 670 bancos", "4,2%"). O DETALHE é o caso concreto: o exemplo, o nome, o lugar. A EXPLICAÇÃO é o porquê ou o risco, sempre com dono: "segundo o BLS", "disse o regulador". A CONSEQUÊNCIA é o que vem a seguir, com data quando o pacote tiver.
- Cada slide dá UM passo à frente. Se um passo não tem lastro no pacote, pule-o: o slide seguinte dá o próximo passo que tem.
- Nada de slide que repete a capa, que resume os anteriores ou que só diz que a notícia importa.
- O slide conta o FATO. Não escreva "para quem pensa em morar em...", "quem planeja investir..." nem quem é afetado, a menos que o pacote nomeie esse grupo com essas palavras: dizer a quem a notícia importa sem lastro é inventar alcance.
- Número exato, como está no pacote. Atribuição explícita em toda fala, estimativa e acusação. Zero adjetivo de opinião: "histórico", "polêmico", "chocante". O tamanho do fato é o número.
  Errado (construção ilustrativa): "Em um movimento histórico, o país fecha centenas de bancos."
  Certo (construção ilustrativa): "Foram mais de 670 bancos fechados em um ano, segundo o regulador. A maioria era de bancos rurais pequenos."`;

function comoEscreverOPermanente(): string {
  return `COMO ESCREVER CADA SLIDE:
- Uma ideia central por slide. Se duas ideias disputam o mesmo slide, escolha a que responde o papel dele.
- titulo: até ${TITULO_DO_SLIDE} caracteres. É o que a pessoa lê primeiro, grande na imagem.
- corpo: até ${CORPO_DO_SLIDE} caracteres, em no máximo três frases curtas. Escaneável, não parágrafo de artigo.
- bullets: até ${MAXIMO_DE_BULLETS} itens de até ${BULLET_DO_SLIDE} caracteres, só quando a informação é naturalmente uma lista. Preencha corpo OU bullets, não os dois cheios.
- Nada de linguagem jurídica, nada de lista enorme, nada de citação de regulamento.`;
}

/**
 * O roteiro do slide de notícia, no método do Not Journal (06/10/2026).
 *
 * Fica no CÓDIGO, e não no trecho editável, porque fala dos campos do JSON e
 * do tamanho que a guarda confere (`conferirBlocosDaNoticia`). O julgamento,
 * que é a ordem dos passos e o que conta como escala ou detalhe, está no
 * trecho editável e no `pede` de cada papel.
 */
function comoEscreverANoticia(): string {
  return `COMO ESCREVER CADA SLIDE DE NOTÍCIA:
- Cada slide dá UM passo à frente. Nenhum repete a capa nem o slide anterior com outras palavras.
- corpo: um ou dois blocos de ${PALAVRAS_POR_BLOCO.minimo} a ${PALAVRAS_POR_BLOCO.maximo} palavras cada, separados por UMA linha em branco. Frases completas, sem lista, em caixa normal: quem põe em caixa alta é a arte. É o único texto que vai para a arte.
- titulo: o nome do passo em até três palavras (escala, detalhe, explicação ou consequência). Ele NÃO vai para a arte; serve para a conferência saber o que o slide faz.
- bullets, lado_a e lado_b: vazios.
- Número exato, como está no pacote. Fala, estimativa e acusação com dono, explícito: "segundo o BLS", "disse Trump".
- Zero adjetivo de opinião ("histórico", "polêmico", "chocante"). A escala do fato é o número.`;
}

export function montarSystemDoCarrossel(
  marca: MarcaSocial,
  estrutura: EstruturaDoCarrossel,
  papeis: PapelDeSlide[],
): string {
  const paraEscrever = papeisDoModelo(papeis);

  return `
Você escreve um CARROSSEL do Instagram para a marca "${marca.nome}", no formato ${estrutura}.

NICHO:
${marca.nicho}

BRIEFING (vale sobre qualquer regra genérica abaixo):
${marca.extra}

REGRA QUE VALE SOBRE TODAS: você só pode afirmar o que está no PACOTE FACTUAL. Ele é a lista do que a fonte oficial diz. Número, prazo, taxa, nome, formulário e data que não estiverem lá não existem. Não deduza, não arredonde, não complete, não use o que você sabe do assunto. Isso vale para CADA slide, um por um: um slide sem lastro no pacote derruba o carrossel inteiro.

${REGRA_DO_DOLAR}

CANAL: isto é Instagram, não newsletter. NÃO existe despedida. Proibido "Até amanhã", "Equipe ${marca.nome}", "Boa leitura" e qualquer assinatura de e-mail.

${instrucaoVigente("carrossel_copy", INSTRUCAO_PADRAO_CARROSSEL)}

OS SLIDES, nesta ordem exata (${paraEscrever.length} slides para você escrever):
${descreverPapeis(papeis)}

${ehEstruturaDaNoticia(estrutura) ? comoEscreverANoticia() : comoEscreverOPermanente()}

O SLIDE 1 É O ÚNICO QUE APARECE NO FEED de quem não deslizou. Ele precisa funcionar sozinho: humano, claro, interessante, compreensível para quem não é advogado, e ancorado no pacote. Não é teaser: ele já diz do que se trata, e o "headline" abaixo é o texto dele.

${vozSocialVigente()}

${regraDaMancheteVigente()}

destaque: de 1 a 4 palavras copiadas LITERALMENTE do headline. Vazio se não houver nada óbvio.

${LEGENDA_NO_METODO_NOT_JOURNAL}

No carrossel, a legenda é a versão completa da notícia: quem não deslizou lê tudo nela, e quem deslizou encontra camadas que os slides não tinham. Ela pode retomar o número de um slide para dar o contexto dele, mas não copia o texto de slide nenhum.

Os campos da legenda: o lide em "gancho" e os parágrafos em "paragrafos", um parágrafo por item. "fato_principal", "contexto", "informacao_util" e "ressalva" vão VAZIOS. "cta" vai vazio: o convite é montado em código. "hashtags" vai vazio: hashtag e o fecho da legenda são do código.

Devolva JSON:
{"headline":"...","destaque":"...","gancho":"...","paragrafos":["...","..."],"fato_principal":"","contexto":"","informacao_util":"","ressalva":"","cta":"","hashtags":[],"slides":[{"papel":"...","titulo":"...","corpo":"...","bullets":[],"lado_a":"","lado_b":""}]}
`;
}

function montarUserDoCarrossel(pauta: PautaAvaliada, pacote: PacoteFactual | null): string {
  const p = pauta.grupo.primary;

  const partes = [
    `ASSUNTO: ${p.title}`,
    `FONTE OFICIAL: ${p.source_name}`,
    `EIXO: ${pauta.classificacao.eixo}`,
    ...(p.published_at ? [`PUBLICADA EM: ${p.published_at}`] : []),
    `CALENDÁRIO (do mais recente para o mais antigo): ${calendarioDaSemana()}`,
  ];

  if (pacote) {
    partes.push(
      "",
      "PACOTE FACTUAL, e nada fora dele pode ser afirmado em nenhum slide:",
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
    partes.push("", "TEXTO DA FONTE:", (pauta.enriquecimento?.texto ?? "").slice(0, 3000));
  }

  return partes.join("\n");
}

export type ResultadoDoCarrossel = {
  copy: CopyDoCarrossel;
  tokens: number;
  custoUsd: number;
};

export type OpcoesDoCarrossel = {
  estrutura: EstruturaDoCarrossel;
  slides: number;
  posicao?: number;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

/**
 * Ajusta a resposta do modelo à estrutura pedida, sem inventar slide.
 *
 * Aparar para baixo é seguro porque a ordem é significativa e os papéis vêm
 * na ordem da estrutura. Para CIMA não há conserto determinístico: escrever um
 * slide que o modelo não escreveu é publicar texto que ninguém redigiu, e é
 * exatamente a regra que o aparador do formato legado já registra.
 */
export function ajustarSlides(slides: SlideDeTexto[], papeis: PapelDeSlide[]): SlideDeTexto[] {
  return slides.slice(0, papeisDoModelo(papeis).length);
}

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

export async function gerarCopyDoCarrossel(
  pauta: PautaAvaliada,
  pacote: PacoteFactual | null,
  marca: MarcaSocial,
  opcoes: OpcoesDoCarrossel,
): Promise<ResultadoDoCarrossel> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const posicao = opcoes.posicao ?? 0;
  const comCta = levaCta(posicao) && Boolean(marca.keyword.trim());
  const papeis = papeisPara(opcoes.estrutura, opcoes.slides, comCta);

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDoCarrossel(marca, opcoes.estrutura, papeis) },
      { role: "user", content: montarUserDoCarrossel(pauta, pacote) },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  const copy = CopyDoCarrosselSchema.parse(semMarcacaoDeNegrito(limparVicios(data)));
  copy.slides = ajustarSlides(copy.slides, papeis);
  encurtarLegenda(copy);

  /*
   * O CTA continua sendo montado em código, e agora isso importa mais.
   *
   * Num carrossel o CTA tem slide próprio, e um slide de fechamento escrito
   * pelo modelo seria a mesma promessa inventada de antes, agora em corpo 60
   * dentro da arte. A palavra vem da keyword canônica; sem automação escutando
   * não há CTA, e o carrossel simplesmente não tem slide de fechamento.
   */
  copy.cta = comCta ? ctaDaPosicao(posicao, marca.keyword) : "";

  return { copy, tokens: usage.totalTokens, custoUsd: usage.estimatedCostUsd };
}

/**
 * Reescreve o carrossel corrigindo o que a guarda apontou.
 *
 * Os problemas chegam nomeados e com o índice do slide, porque "o slide 3
 * afirma 540 dias e o pacote não tem esse número" produz correção, e "melhore
 * o carrossel" produz outro texto com outros defeitos.
 */
export async function repararCopyDoCarrossel(
  copy: CopyDoCarrossel,
  problemas: Array<{ motivo: string; detalhe: string }>,
  pauta: PautaAvaliada,
  pacote: PacoteFactual | null,
  marca: MarcaSocial,
  opcoes: OpcoesDoCarrossel,
): Promise<ResultadoDoCarrossel> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const config = getAIProviderConfig(env);
  const posicao = opcoes.posicao ?? 0;
  const comCta = levaCta(posicao) && Boolean(marca.keyword.trim());
  const papeis = papeisPara(opcoes.estrutura, opcoes.slides, comCta);

  const lista = problemas.map((p, i) => `${i + 1}. [${p.motivo}] ${p.detalhe}`).join("\n");

  const instrucao = `
O carrossel abaixo foi recusado. Corrija APENAS os problemas listados e devolva o JSON inteiro.

PROBLEMAS A CORRIGIR:
${lista}

REGRAS DA CORREÇÃO:
- Não invente nada para tapar buraco. Se um número, prazo, formulário ou nome não está no pacote factual, REMOVA a frase inteira em vez de trocar por outro valor.
- Se um slide não tem lastro suficiente no pacote, ele pode ficar mais curto ou dizer menos. O que ele não pode é afirmar o que a fonte não diz.
- Não mexa no que não foi apontado. Slide que não tem problema fica exatamente como está, com o mesmo papel.
- Mantenha a ordem e a quantidade de slides.
- Não escreva despedida, assinatura nem "Até amanhã".
- Não prometa aprovação, elegibilidade, prazo ou custo.

CARROSSEL RECUSADO:
${JSON.stringify(copy, null, 2)}
`;

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDoCarrossel(marca, opcoes.estrutura, papeis) },
      { role: "user", content: `${montarUserDoCarrossel(pauta, pacote)}

${instrucao}` },
    ],
    config.editorModel,
    env,
    fetcher,
  );

  const corrigida = CopyDoCarrosselSchema.parse(semMarcacaoDeNegrito(limparVicios(data)));
  corrigida.slides = ajustarSlides(corrigida.slides, papeis);
  encurtarLegenda(corrigida);
  corrigida.cta = comCta ? ctaDaPosicao(posicao, marca.keyword) : "";

  return { copy: corrigida, tokens: usage.totalTokens, custoUsd: usage.estimatedCostUsd };
}
