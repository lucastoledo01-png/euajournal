import { esc, juntarValores, manterCodigosJuntos, pad2, protegerQuebras, safeImageUrl } from "./util";
import { overlayBrand } from "./shell";
import { MARCA } from "@/lib/marca";
import { POSICAO_PADRAO, POSICOES_DA_BOLHA_DO_MIOLO, estiloDaPosicao, posicaoPorChave } from "./bolha";
import type {
  InstagramSlide,
  InstagramSlideType,
  SlideVariant,
  VariantContext,
  VariantOutput,
} from "./types";

/**
 * Catálogo de variantes de layout por tipo de slide. O painel do admin escolhe
 * qual usar por formato; nada aqui é editável pelo painel (só código).
 *
 * Toda variante compõe as primitivas do `base-css.ts` — não declara CSS novo.
 * O tema (cores/tipo) vem das `var(--s-*)`, então as variantes raramente
 * precisam do `ctx.tokens`.
 */

function eyebrow(ctx: VariantContext, slide: InstagramSlide): string {
  const label = slide.eyebrow?.trim() || ctx.eyebrowLabel;
  return `<span class="s-eyebrow eb-${ctx.format}">${esc(label)}</span>`;
}

/**
 * Divide o título em duas linhas: a primeira em display pesada, a segunda em
 * serifa itálica na cor de destaque. É a assinatura do design impresso, e o
 * que faz uma capa parecer capa e não texto grande.
 *
 * A IA já pode dizer qual é o trecho de destaque em `highlight_text`. Quando
 * não diz, o corte cai no meio das palavras — determinístico de propósito: o
 * mesmo título tem que render sempre o mesmo slide, senão o preview do painel
 * e o post publicado divergem.
 */
export function dividirTitulo(titulo: string, destaque?: string): { forte: string; italico: string } {
  const t = String(titulo ?? "").trim();
  const d = String(destaque ?? "").trim();

  if (d && t.toLowerCase().endsWith(d.toLowerCase())) {
    return { forte: t.slice(0, t.length - d.length).trim(), italico: d };
  }

  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length < 4) return { forte: t, italico: "" };

  const corte = Math.ceil(palavras.length / 2);
  return { forte: palavras.slice(0, corte).join(" "), italico: palavras.slice(corte).join(" ") };
}

function tituloHtml(slide: InstagramSlide, classe = ""): string {
  const { forte, italico } = dividirTitulo(slide.title, slide.highlight_text);
  const segunda = italico ? `<span class="it">${esc(italico)}</span>` : "";
  return `<div class="e-title${classe ? " " + classe : ""}">${esc(forte)}${segunda}</div>`;
}

/** Marca de abertura da capa — o mesmo asterisco/sol do design. */
function marcaEditorial(): string {
  return `<div class="e-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.4v3M12 18.6v3M2.4 12h3M18.6 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/></svg></div>`;
}

/**
 * Linhas do terminal. A primeira vira o comando (em destaque); as demais, a
 * saída. Sem linha nenhuma o cartão não é desenhado — melhor um slide simples
 * que um terminal vazio.
 */
function terminalHtml(arquivo: string, linhas: string[]): string {
  if (!linhas.length) return "";
  const corpo = linhas
    .map((l, i) => `<div class="l${i === 0 ? " cmd" : ""}">${esc(l)}</div>`)
    .join("");
  return `<div class="e-term">
  <div class="bar"><u></u><u></u><u></u><span>${esc(arquivo)}</span></div>
  <div class="lines">${corpo}</div>
</div>`;
}

function photo(url: string, placeholderClass = "ph"): string {
  const safe = safeImageUrl(url);
  if (safe) return `<div class="s-photo" style="background-image:url('${safe.replace(/'/g, "%27")}')"></div>`;
  return `<div class="s-photo ${placeholderClass}"></div>`;
}

function bulletsHtml(points: string[]): string {
  return points
    .filter(Boolean)
    .map((p) => `<div class="s-bullet"><span class="i">✓</span><span class="x">${esc(p)}</span></div>`)
    .join("");
}

function ctaButton(ctx: VariantContext, slide: InstagramSlide): string {
  const keyword = slide.highlight_text?.trim();
  if (keyword) return `Comente <span class="s-kw">${esc(keyword.toUpperCase())}</span>`;
  return esc(slide.cta_text?.trim() || ctx.ctaText);
}

// --------------------------------------------------------------------------
// CAPA
// --------------------------------------------------------------------------

const coverFullbleedPortrait: SlideVariant = {
  key: "fullbleed_portrait",
  label: "Retrato full-bleed + card social",
  render: (slide, ctx): VariantOutput => ({
    full: true,
    onDark: true,
    body: `
${photo(slide.bg_image_url)}
<div class="s-grad"></div>
<div class="s-overlay">
  ${overlayBrand()}
  <div>
    <div class="s-profile" style="margin-bottom:22px">
      <span class="s-avatar">b.</span>
      <div><div class="s-pname">${MARCA.nome} <span class="s-check">✓</span></div><div class="s-phandle">${MARCA.instagramHandle}</div></div>
    </div>
    <div class="s-title" style="color:#fff;text-shadow:0 4px 20px rgba(0,0,0,0.7)">${esc(slide.title)}</div>
  </div>
</div>`,
  }),
};

// --------------------------------------------------------------------------
// NOTÍCIA SEM FOTO (capa de texto)
// --------------------------------------------------------------------------

/**
 * Capa de texto da notícia: a manchete é a arte.
 *
 * Existe para quando o resolvedor visual não encontrou fotografia licenciada e
 * editorialmente adequada. Isso não é erro nem versão pior da peça com foto: é
 * a forma honesta de publicar uma pauta para a qual não há imagem legítima. Por
 * isso a peça não carrega nenhuma marca de ausência.
 *
 * O que a antecessora (`brand_card`) fazia de errado não era faltar imagem, era
 * cercar o vazio: `.s-card.dark` tem fundo próprio, raio e `min-height:360px`,
 * e um retângulo preenchido e vazio anuncia que ali faltou alguma coisa. Vazio
 * só lê como falta quando está cercado.
 *
 * Aqui não há cartão, moldura, nem área reservada. Três elementos ancorados uns
 * nos outros e apoiados na base do campo: rótulo editorial, régua e manchete. O
 * que sobra em cima é margem, e margem é encerrada pela marca do cabeçalho.
 *
 * O corpo do tipo NÃO é calculado por estimativa de largura de caractere. A
 * primeira versão fazia isso e a manchete de 65 caracteres encostava no rodapé:
 * Playfair Display 800 é largo, a média assumida errava para baixo, e cada
 * linha a mais custa muita altura. Quem mede é o navegador, pelo mesmo
 * `SCRIPT_DE_AJUSTE` que os layouts desenhados já usam, e que roda depois de
 * `document.fonts.ready` justamente porque medir com a fonte de fallback dá
 * outro número.
 */
/**
 * A capa sem foto, na identidade nova.
 *
 * O que MUDOU é a pele: fundo azul-marinho, marca no alto, chapéu espaçado e
 * manchete em caixa alta, as mesmas quatro coisas da peça com foto. Ela estava
 * na paleta anterior, creme com serifa e acento laranja, e assinada
 * `@imigra.us`: no feed, dois posts do mesmo dia pareciam de dois perfis.
 *
 * O que NÃO mudou, e é o motivo de esta peça existir em vez de um "fundo azul
 * com a manchete em cima": ela MEDE o corpo do tipo no navegador
 * (`data-ajuste`) e impede que "I-765" quebre no meio
 * (`manterCodigosJuntos`). Trocar isso por um template fixo devolveria os dois
 * defeitos que ela resolve.
 */
const coverNoticiaSemFoto: SlideVariant = {
  key: "noticia_sem_foto",
  label: "Capa de texto: a manchete é a arte",
  render: (slide, ctx): VariantOutput => {
    /*
     * Sem cair em `ctx.eyebrowLabel`, de propósito. Quando o classificador não
     * soube nomear a editoria, `arte.ts` manda o campo vazio; imprimir aqui o
     * rótulo padrão do formato seria inventar uma editoria para preencher
     * espaço, que é exatamente o que esta peça não faz.
     */
    const editoria = (slide.eyebrow ?? "").trim();
    const titulo = String(slide.title ?? "").trim().replace(/\s+/g, " ");

    return {
      full: true,
      onDark: true,
      body: `
<div class="n-fundo"></div>
<img class="j-marca" src="${esc(MARCA.logoInstagramEscuro)}" alt="" />
<div class="n-texto">
  ${editoria ? `<span class="j-chapeu">${esc(editoria)}</span>` : ""}
  <div class="n-manchete lay-texto" data-ajuste="encolher" data-min="40" data-max="104"><span>${protegerQuebras(esc(titulo))}</span></div>
</div>`,
    };
  },
};

/**
 * Capa do carrossel: manchete marcada, com foto quando existe.
 *
 * A diferença para a capa da notícia é intencional e é de produto. Notícia é o
 * fato do dia e sai em serifa sobre creme; conteúdo permanente é material de
 * referência e sai em faixa escura com a frase-chave marcada. Quem rola o feed
 * distingue os dois antes de ler.
 *
 * O que é marcado vem de `highlight_text`, e a guarda do carrossel só deixa
 * passar destaque que seja trecho literal da manchete. Se o trecho não for
 * encontrado no título, nada é marcado: o texto sai inteiro, sem cor, em vez de
 * sair com a cor no lugar errado.
 *
 * O corpo do tipo é medido pelo navegador, como na capa da notícia, e por isso
 * o bloco da manchete tem altura definida: `SCRIPT_DE_AJUSTE` mede o espaço
 * disponível ANTES de mexer na fonte, e num bloco sem altura não há o que medir.
 */
function marcarDestaque(titulo: string, destaque: string): string {
  /*
   * Os valores são colados ANTES de fatiar (regra do dono, 06/10/2026): o
   * destaque pode começar no meio de "US$ 45.000", e cada fatia escapada à
   * parte deixaria o espaço comum na fronteira do `mark`. A troca é de um
   * caractere por um, então os índices do mapa abaixo continuam valendo, e o
   * U+00A0 conta como espaço na busca do trecho.
   */
  const limpo = juntarValores(titulo.trim().replace(/\s+/g, " "));
  const alvo = (destaque ?? "").trim().replace(/\s+/g, " ");
  if (!alvo) return manterCodigosJuntos(esc(limpo));

  /* Índice do trecho no título, ignorando caixa e acento. O mapa devolve a
     posição ORIGINAL de cada caractere normalizado, porque remover acento muda
     o comprimento da string e cortar pelo índice normalizado erraria a fatia. */
  const mapa: number[] = [];
  let normal = "";
  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i]
      .replace(/\u00a0/g, " ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    for (let k = 0; k < c.length; k += 1) {
      normal += c[k];
      mapa.push(i);
    }
  }
  const alvoNormal = alvo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const at = normal.indexOf(alvoNormal);
  if (at < 0 || !alvoNormal) return manterCodigosJuntos(esc(limpo));

  /*
   * Marcar quase tudo é não marcar nada.
   *
   * O destaque é escrito pela copy e às vezes ele é a manchete inteira menos
   * duas palavras. Pintado, isso vira um retângulo laranja ocupando a peça, e o
   * olho perde a referência do que era para ser enfatizado. Acima de 60% do
   * título, a manchete sai limpa: ausência de marcador é melhor que marcador
   * sem função.
   */
  if (alvoNormal.length > normal.length * 0.6) return manterCodigosJuntos(esc(limpo));

  const inicio = mapa[at];
  const fim = mapa[at + alvoNormal.length - 1] + 1;

  return (
    manterCodigosJuntos(esc(limpo.slice(0, inicio))) +
    `<mark>${manterCodigosJuntos(esc(limpo.slice(inicio, fim)))}</mark>` +
    manterCodigosJuntos(esc(limpo.slice(fim)))
  );
}

const coverCarrosselDestaque: SlideVariant = {
  key: "capa_destaque",
  label: "Capa de carrossel: manchete marcada",
  render: (slide): VariantOutput => {
    const comFoto = Boolean((slide.bg_image_url ?? "").trim());
    const titulo = String(slide.title ?? "");

    /*
     * A editoria só aparece na capa sem foto.
     *
     * Com foto, o topo já tem conteúdo e o rótulo vira ruído sobre a imagem.
     * Sem foto, o mesmo topo é um campo escuro vazio, e vazio nesse tamanho não
     * lê como respiro: lê como peça que não terminou de carregar.
     */
    const editoria = (slide.eyebrow ?? "").trim();
    const topo =
      !comFoto && editoria
        ? `<div class="k-topo"><span class="k-editoria">${esc(editoria)}</span><span class="k-regua"></span></div>`
        : "";

    return {
      full: true,
      onDark: true,
      body: `
${comFoto ? `<div class="k-foto">${photo(slide.bg_image_url)}</div>` : ""}
<div class="k-capa${comFoto ? " com-foto" : ""}">
  <span class="k-handle">${MARCA.instagramHandle}</span>
  ${topo}
  <div class="k-manchete"><span>${marcarDestaque(titulo, slide.highlight_text ?? "")}</span></div>
</div>`,
    };
  },
};

// --------------------------------------------------------------------------
// GRAMÁTICA DE JORNAL
// --------------------------------------------------------------------------

/**
 * O gabarito de jornal: foto sangrando, chapéu de editoria, manchete em caixa
 * alta no rodapé.
 *
 * É um gabarito só, e é isso que o torna barato de operar. A capa e o miolo
 * usam a mesma peça; a capa apenas acrescenta a bolha, que é uma segunda
 * imagem em círculo. Não há um desenho para cada posição do carrossel, e não
 * há decisão de layout por post.
 *
 * As medidas vieram de medição das referências, não de estimativa: bloco de
 * texto de 70% a 90,5% da altura, margem lateral de 9%, degradê nascendo na
 * metade. Estão no CSS, comentadas lá.
 *
 * O corpo da manchete é teto, não valor: quem decide é o navegador, pelo
 * `SCRIPT_DE_AJUSTE`, porque manchete de 60 e de 120 caracteres não cabem no
 * mesmo tamanho. Sem isso, ou a curta fica pequena ou a longa transborda.
 */
/**
 * O círculo da bolha, na posição decidida pelos rostos da foto de fundo.
 *
 * Quem decide é `social/bolha-sem-rosto.ts` (06/10/2026); aqui só se desenha.
 * A posição padrão não ganha estilo inline, porque o CSS já a desenha: a capa
 * sem rosto no caminho sai com o mesmo HTML de antes, mais o atributo que diz
 * onde a bolha está, para o render poder medir.
 */
function bolhaNaPosicao(url: string, chave: string | undefined): string {
  const posicao = posicaoPorChave(chave) ?? POSICAO_PADRAO;
  const estilo = estiloDaPosicao(posicao);
  return (
    `<div class="j-bolha" data-posicao="${esc(posicao.chave)}"${estilo ? ` style="${estilo}"` : ""}>` +
    `<img src="${esc(url)}" alt="" /></div>`
  );
}

function jornal(
  slide: InstagramSlide,
  ctx: VariantContext,
  opcoes: { comBolha?: boolean } = {},
): VariantOutput {
  const foto = (slide.bg_image_url ?? "").trim();
  const bolha = (slide.inset_image_url ?? "").trim();
  const chapeu = (slide.eyebrow ?? "").trim();

  /*
   * O miolo imprime o CORPO, e não só o título.
   *
   * Ele era descartado: o modelo escrevia até 260 caracteres de explicação, a
   * guarda conferia a ancoragem deles, e a peça mostrava só o título de 70. O
   * slide saía com uma linha onde a referência tem quatro, e o que o leitor
   * deslizava para ver não estava lá.
   *
   * Título e corpo ocupam o MESMO bloco, no mesmo corpo de tipo, porque é
   * assim na referência: a primeira frase afirma e o resto explica, sem troca
   * de tamanho no meio. Por isso o título ganha ponto final quando não tem: é
   * o que separa as duas frases quando elas viram uma só corrida de texto.
   */
  const corpo = (slide.body ?? "").trim();
  const itens = (slide.bullet_points ?? []).filter((b) => (b ?? "").trim());
  const temTexto = Boolean(corpo || itens.length);
  const titulo = protegerQuebras(esc(slide.title)) + (corpo && !/[.!?:"»]$/.test(slide.title.trim()) ? "." : "");

  /*
   * Com corpo, o teto do tipo cai, e o piso também.
   *
   * O bloco passa a carregar até 330 caracteres em vez de 70, e manter o teto
   * de 74px só faria o ajuste descer os mesmos passos, mais devagar. O piso
   * cai junto porque a faixa é a mesma: 330 caracteres a 40px não cabem nela,
   * e o excesso seria cortado em silêncio pelo `overflow: hidden`.
   */
  return {
    full: true,
    onDark: true,
    body: `
<div class="j-fundo"></div>
${foto ? `<div class="j-foto">${photo(foto)}</div>` : ""}
<div class="j-grad"></div>
${/*
   A marca vai com as DUAS versões, e quem escolhe é o brilho da foto.

   O arquivo padrão tem o "usa" em branco, desenhado para foto escura, e em céu
   claro ele sumia: a peça saía com meia marca, só o ".journal" vermelho. O
   `data-claro` carrega a versão de tinta escura, e o script de ajuste mede o
   pedaço da foto que fica atrás do logotipo para decidir. Ver escolherMarca, no script de ajuste.
*/ ""}
<img class="j-marca" src="${esc(MARCA.logoInstagramEscuro)}" data-claro="${esc(MARCA.logoInstagramClaro)}" alt="" />
${opcoes.comBolha && bolha ? bolhaNaPosicao(bolha, slide.inset_position) : ""}
<div class="j-texto">
  ${chapeu ? `<span class="j-chapeu">${esc(chapeu)}</span>` : ""}
  <div class="j-manchete lay-texto" data-ajuste="encolher" data-max="${temTexto ? 44 : 54}" data-min="${temTexto ? 26 : 36}">
    <span>${titulo}${corpo ? ` ${esc(corpo)}` : ""}${itens.map((b) => `<i>${esc(b)}</i>`).join("")}</span>
  </div>
  ${/*
     Não existe convite de arrastar, e isso foi MEDIDO, não suposto.

     O argumento a favor dele era razoável: a peça de várias telas precisa
     dizer que tem várias telas, e os pontos do Instagram são pequenos. O
     argumento perdeu para a evidência. Em 16/09/2026 foram baixadas quatro
     capas de carrossel reais de @notjournal.ai e @braziljournal, as duas
     referências do produto, e nenhuma das quatro traz convite nenhum. A
     referência de recorte enviada pelo dono também não traz.

     O leitor de Instagram já sabe arrastar. Dizer isso na peça gasta uma linha
     para ensinar o que ninguém precisa aprender, e é a linha que denuncia que
     a peça foi feita para performar, e não para informar.
  */ ""}
</div>`,
  };
}

const capaJornal: SlideVariant = {
  key: "capa_jornal",
  label: "Jornal: capa com foto e bolha",
  render: (slide, ctx): VariantOutput => jornal(slide, ctx, { comBolha: true }),
};

const mioloJornal: SlideVariant = {
  key: "miolo_jornal",
  label: "Jornal: miolo com foto",
  render: (slide, ctx): VariantOutput => jornal(slide, ctx),
};

/**
 * Separa a primeira frase do resto.
 *
 * O negrito da referencia cai na TESE, que e sempre a primeira frase do
 * segundo paragrafo, e o resto segue em peso normal. Sem esta separacao ou o
 * paragrafo inteiro sai em negrito, que e um bloco preto no meio da peca, ou
 * nada sai, e o olho nao encontra onde parar.
 */
export function primeiraFrase(texto: string): { tese: string; resto: string } {
  const limpo = texto.trim();
  if (!limpo) return { tese: "", resto: "" };

  // O ponto que encerra frase, e nao o de sigla ou de numero: exige espaço e
  // letra maiúscula depois.
  const corte = limpo.search(/[.!?](?=\s+[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ])/);
  if (corte < 0) return { tese: limpo, resto: "" };

  return { tese: limpo.slice(0, corte + 1), resto: limpo.slice(corte + 1).trim() };
}

/**
 * Quanto texto cabe no recorte, com o corpo travado em 46px.
 *
 * Medido no navegador em 16/09/2026, por busca binária, com frase de português
 * real (acento, cedilha e palavra longa), e no PIOR caso de divisão entre a
 * abertura e o segundo parágrafo: 216 caracteres com foto e 474 sem. O número
 * aqui desconta cerca de 7 por cento disso, porque a medição usa uma frase e a
 * redação escreve outra.
 *
 * Este orçamento existe porque o corpo do tipo não negocia mais. Antes, texto
 * grande demais encolhia a fonte, e o dono apontou o efeito: cada slide do
 * carrossel saía com um tamanho, o que denuncia peça montada por máquina. Com
 * o tipo fixo, sobrou uma escolha honesta: o que não cabe não entra neste
 * desenho, e a peça sai na gramática de jornal, que se vira com qualquer
 * tamanho de texto.
 *
 * Cortar o texto seria a terceira opção, e é a pior: a peça de hoje saiu com
 * "a conta de morar pesa mais que a de comer no" e parou ali, no meio da
 * frase.
 */
export const CAPACIDADE_DO_RECORTE = { comFoto: 200, semFoto: 440 } as const;

/**
 * O texto desta pauta cabe no recorte?
 *
 * Conta o que vai para a peça: chapéu, título, corpo e itens, mais os dois
 * pontos e os espaços que o desenho acrescenta entre eles.
 */
export function cabeNoRecorte(entrada: {
  chapeu?: string;
  titulo?: string;
  corpo?: string;
  itens?: string[];
  temFoto: boolean;
}): boolean {
  const chapeu = (entrada.chapeu ?? "").trim();
  const titulo = (entrada.titulo ?? "").trim();
  const corpo = (entrada.corpo ?? "").trim();
  const itens = (entrada.itens ?? []).filter((i) => (i ?? "").trim());

  const total =
    (chapeu ? chapeu.length + 2 : 0) +
    titulo.length +
    (corpo ? corpo.length + 1 : 0) +
    itens.reduce((soma, i) => soma + i.trim().length + 1, 0);

  return total <= (entrada.temFoto ? CAPACIDADE_DO_RECORTE.comFoto : CAPACIDADE_DO_RECORTE.semFoto);
}

/**
 * O recorte de post: a peça que parece alguém comentando a notícia.
 *
 * É a segunda gramática de capa, ao lado da capa de jornal, e a diferença
 * entre as duas não é de gosto. A capa de jornal AFIRMA: foto sangrando,
 * chapéu de editoria, manchete em caixa alta sobre o degradê. O recorte
 * COMENTA: fundo branco, autor no topo, texto corrido em caixa baixa, peso na
 * frase e não na imagem.
 *
 * Isso muda o que a peça consegue dizer. A capa de jornal carrega um fato e
 * uma foto; o recorte carrega um fato, uma imagem de apoio E uma leitura do
 * fato, porque tem duas áreas de texto separadas pela mídia. É o formato para
 * o dia em que a notícia sozinha não explica nada, e alguém precisa dizer o
 * que ela significa.
 *
 * O desenho veio de uma referência enviada pelo dono em 16/09/2026 e foi
 * remedido para 1080 por 1440. O que NÃO foi copiado é o selo de verificado:
 * o perfil não é verificado, e desenhar o selo seria afirmar que é.
 */
function recorteDePost(slide: InstagramSlide, ctx: VariantContext): VariantOutput {
  const foto = (slide.bg_image_url ?? "").trim();
  const chapeu = (slide.eyebrow ?? "").trim();
  const titulo = (slide.title ?? "").trim();
  const corpo = (slide.body ?? "").trim();
  const itens = (slide.bullet_points ?? []).filter((b) => (b ?? "").trim());

  /*
   * O chapéu vira o começo da frase, e não uma linha por cima dela.
   *
   * Na capa de jornal ele é uma sobrancelha solta; aqui a referência o usa
   * dentro do texto, colado em dois-pontos: "Meta One: a Meta acaba de". É o
   * que faz a peça ler como fala, e não como manchete.
   */
  const abertura = chapeu
    ? `<b>${esc(chapeu)}:</b> ${esc(titulo)}`
    : `<b>${esc(titulo)}</b>`;

  const { tese, resto } = primeiraFrase(corpo);
  const segundo = tese
    ? `<p><b>${esc(tese)}</b>${resto ? ` ${esc(resto)}` : ""}</p>`
    : "";

  const lista = itens.length
    ? `<p>${itens.map((b) => esc(b)).join("<br />")}</p>`
    : "";

  /*
   * O bloco inteiro encolhe junto, texto e mídia na mesma caixa.
   *
   * Poderia ser um bloco por parágrafo, com percentuais fixos para cada um, e
   * seria pior: o segundo parágrafo é o que mais varia de tamanho, e dar
   * altura fixa a ele obrigaria a escolher entre desperdiçar espaço no texto
   * curto ou cortar o longo. Com uma caixa só, o ajuste resolve os dois.
   */
  return {
    full: true,
    body: `
<div class="r-pagina">
  <div class="r-autor">
    <img class="r-ava" src="${esc(MARCA.avatar)}" alt="" />
    <span class="r-quem">
      <span class="r-nome">${esc(MARCA.nome)}</span>
      <span class="r-arroba">${esc(MARCA.instagramHandle)}</span>
    </span>
  </div>
  ${/*
     Sem `data-ajuste`, e é o ponto do desenho.

     O carrossel é lido em sequência: tipo que muda de tamanho de um slide para
     o outro denuncia a peça montada por máquina. Aqui o corpo é 46px em todos
     os slides, e o que não couber não é encolhido, é recusado, em
     `cabeNoRecorte`.
  */ ""}
  <div class="r-texto">
    <span>
      <p>${abertura}</p>
      ${foto ? `<div class="r-midia">${photo(foto)}</div>` : ""}
      ${segundo}
      ${lista}
    </span>
  </div>
</div>`,
  };
}

const capaRecorte: SlideVariant = {
  key: "recorte_post",
  label: "Recorte: post de rede social, fundo claro",
  render: (slide, ctx): VariantOutput => recorteDePost(slide, ctx),
};

const mioloRecorte: SlideVariant = {
  key: "miolo_recorte",
  label: "Recorte: miolo em post de rede social",
  render: (slide, ctx): VariantOutput => recorteDePost(slide, ctx),
};

/**
 * O último slide, que pede a inscrição.
 *
 * Na referência esta peça vende um terminal no WhatsApp, e o desenho inteiro
 * gira em torno de um celular com a conversa. Aqui o produto é outro: a
 * newsletter diária. Copiar a moldura do celular seria copiar o argumento de
 * venda de um produto que não é o nosso, e o leitor sairia esperando mensagem
 * no WhatsApp.
 *
 * O que se mantém é a gramática: fundo cheio, uma frase grande com uma palavra
 * em destaque, e a ação isolada num bloco de cor.
 */
const ctaNewsletter: SlideVariant = {
  key: "cta_newsletter",
  label: "Jornal: chamada da newsletter",
  render: (slide, ctx): VariantOutput => {
    const palavra = (slide.highlight_text ?? "").trim().toUpperCase() || "NEWS";

    return {
      full: true,
      onDark: true,
      body: `
<div class="j-cta">
  <img class="j-marca" src="${esc(MARCA.logoInstagramEscuro)}" alt="" />
  <div class="j-cta-titulo">Receba isso <em>antes</em> de todo mundo.</div>
  <div class="j-cta-linha">${esc(slide.body || ctx.ctaText || "A edição do dia no seu e-mail, todo dia às 6h. De graça.")}</div>
  <span class="j-cta-palavra">Comente ${esc(palavra)}</span>
</div>`,
    };
  },
};

// --------------------------------------------------------------------------
// NOTÍCIA EM CARROSSEL (método do Not Journal, 06/10/2026)
// --------------------------------------------------------------------------

/**
 * O slide de notícia: foto sangrando, chapéu da editoria e um ou dois blocos
 * de texto em caixa alta na metade de baixo.
 *
 * É a gramática de jornal com outra divisão de peso. Na capa a foto manda e a
 * manchete é a base; aqui o texto é o motivo de o slide existir, então o
 * degradê sobe até a metade e o bloco ocupa a metade de baixo inteira. A foto
 * continua sendo a primeira coisa que se vê, porque no método todo slide é
 * foto, e é a mesma pessoa em fotos diferentes quando a história tem um
 * protagonista.
 *
 * Não reusa a função `jornal` de propósito: a bolha da capa estava sendo
 * reposicionada em outra frente (feat/bolha-sem-rosto), e um desenho próprio
 * deixa as duas mudanças sem se encostar. A bolha daqui usa a mesma classe de
 * base, `j-bolha`, mais um modificador de tamanho e lugar. Depois da junção
 * das duas frentes (06/10/2026) ela também desvia de rosto, com posições
 * próprias do miolo (`POSICOES_DA_BOLHA_DO_MIOLO`).
 */
/**
 * A bolha do miolo, na posição decidida pelos rostos da foto do slide
 * (06/10/2026). A mesma regra da capa: quem decide é o ciclo, contra a tabela
 * de `bolha.ts`, e o render mede o círculo de novo e o tira se encostar num
 * rosto. Sem posição decidida, a primeira do miolo.
 */
function bolhaDoMiolo(url: string, chave: string | undefined): string {
  const posicao = posicaoPorChave(chave) ?? POSICOES_DA_BOLHA_DO_MIOLO[0];
  return (
    `<div class="j-bolha jn-bolha" data-posicao="${esc(posicao.chave)}" style="${estiloDaPosicao(posicao)}">` +
    `<img src="${esc(url)}" alt="" /></div>`
  );
}

const mioloNoticia: SlideVariant = {
  key: "miolo_noticia",
  label: "Notícia: miolo com foto e blocos de texto",
  render: (slide): VariantOutput => {
    const foto = (slide.bg_image_url ?? "").trim();
    const bolha = (slide.inset_image_url ?? "").trim();
    const chapeu = (slide.eyebrow ?? "").trim();
    const blocos = String(slide.body ?? "")
      .split(/\n\s*\n/)
      .map((b) => b.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    return {
      full: true,
      onDark: true,
      body: `
<div class="j-fundo"></div>
${foto ? `<div class="j-foto">${photo(foto)}</div>` : ""}
<div class="jn-grad"></div>
<img class="j-marca" src="${esc(MARCA.logoInstagramEscuro)}" data-claro="${esc(MARCA.logoInstagramClaro)}" alt="" />
${bolha ? bolhaDoMiolo(bolha, slide.inset_position) : ""}
<div class="jn-texto">
  ${chapeu ? `<span class="j-chapeu">${esc(chapeu)}</span>` : ""}
  <div class="jn-blocos lay-texto" data-ajuste="encolher" data-max="54" data-min="30">
    <span>${blocos.map((b) => `<p>${protegerQuebras(esc(b))}</p>`).join("")}</span>
  </div>
</div>`,
    };
  },
};

/**
 * O último slide da notícia: o convite para assinar a newsletter.
 *
 * Fundo preto, a marca na versão de fundo escuro, uma frase e um elemento
 * visual honesto: uma caixa de entrada desenhada em HTML, com a NOSSA edição
 * no topo e as outras linhas em cinza, sem remetente nenhum. Nada de captura
 * de tela de outro produto, e nada que pareça uma conversa de WhatsApp, que
 * era o argumento de venda da referência e não é o nosso.
 *
 * O remetente é desenhado em CSS, e não com `MARCA.avatar`: o arquivo do
 * avatar ainda desenha ".usa" (achado em 06/10/2026, ao renderizar esta peça),
 * e a peça que convida a assinar não pode sair com a marca antiga.
 *
 * ATUALIZADO no mesmo dia: o avatar foi refeito a partir do ícone do site, e
 * o remetente passou a ser o arquivo. O desenho em CSS punha o ponto antes do
 * "eua", que era a marca antiga.
 *
 * A linha de como pedir o link só aparece quando há palavra de comentário
 * escutada pela automação. Sem ela o convite continua de pé, porque a
 * newsletter existe com ou sem listener.
 */
const ctaAssinatura: SlideVariant = {
  key: "cta_assinatura",
  label: "Notícia: convite para assinar a newsletter",
  render: (slide): VariantOutput => {
    const palavra = (slide.highlight_text ?? "").trim().toUpperCase();
    return {
      full: true,
      onDark: true,
      body: `
<div class="ja-fundo"></div>
<img class="j-marca" src="${esc(MARCA.logoInstagramEscuro)}" alt="" />
<div class="ja-celular" aria-hidden="true">
  <div class="ja-tela">
    <div class="ja-topo"><span>Caixa de entrada</span></div>
    <div class="ja-linha ja-nossa">
      <img class="ja-ava" src="${esc(MARCA.avatar)}" alt="" />
      <div class="ja-msg">
        <div class="ja-de">${esc(MARCA.nome)}<span>hoje</span></div>
        <div class="ja-assunto">a edição de hoje chegou</div>
        <div class="ja-previa">${esc(MARCA.tagline)}</div>
      </div>
    </div>
    <div class="ja-linha"><u></u><div class="ja-msg"><i></i><i></i></div></div>
    <div class="ja-linha"><u></u><div class="ja-msg"><i></i><i></i></div></div>
  </div>
</div>
<div class="ja-texto">
  <div class="ja-titulo">Assine a newsletter do <em>${esc(MARCA.nome)}</em>.</div>
  <div class="ja-linha-sub">${esc(MARCA.tagline)} No seu <span class="ja-inteiro">e-mail</span>, de graça.</div>
  ${palavra ? `<span class="ja-palavra">Comente ${esc(palavra)} e receba o link</span>` : ""}
</div>`,
    };
  },
};

/**
 * O último slide que pede para seguir o perfil (27/10/2026).
 *
 * Existe para os posts que saem sem newsletter: o convite de assinar não faz
 * sentido numa peça que não tem edição para oferecer. Mesmo fundo preto e mesma
 * gramática do convite, só com o perfil no lugar da caixa de entrada.
 */
const ctaSiga: SlideVariant = {
  key: "cta_siga",
  label: "Notícia: convite para seguir o perfil",
  render: (slide): VariantOutput => {
    // Miniaturas do perfil: as capas dos posts do dia, quando quem monta a peça as passa.
    const tiles = ((slide as unknown as { tile_urls?: string[] }).tile_urls ?? []).slice(0, 6);
    // Faltou capa para fechar a grade de seis: o resto é o avatar da marca, sem repetir post.
    const celulas = [...tiles, ...Array(Math.max(0, 6 - tiles.length)).fill(MARCA.avatar)];
    const grade = tiles.length ? celulas.map((u) => `<i><img src="${esc(u)}" alt="" /></i>`).join("") : "";
    return {
      full: true,
      onDark: true,
      body: `
<div class="ja-fundo"></div>
<div class="js-topo">
  <div class="ja-titulo">Siga o <em>${esc(MARCA.nome)}</em>.</div>
  <div class="js-tag">${esc(MARCA.tagline)}</div>
</div>
<div class="js-cel" aria-hidden="true">
  <div class="js-perfil">
    <img class="js-ava" src="${esc(MARCA.avatar)}" alt="" />
    <div>
      <div class="js-nome">${esc(MARCA.instagramHandle.replace(/^@/, ""))}</div>
      <div class="js-bio">${esc(MARCA.tagline)}</div>
    </div>
  </div>
  <div class="js-botao">Seguir</div>
  ${grade ? `<div class="js-grade">${grade}</div>` : ""}
</div>`,
    };
  },
};

const coverBrandCard: SlideVariant = {
  key: "brand_card",
  label: "Fundo claro + card da marca",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title">${esc(slide.title)}</div>
  ${slide.body ? `<div class="s-sub">${esc(slide.body)}</div>` : ""}
  <div class="s-card dark" style="min-height:360px;justify-content:flex-end">
    <div class="s-phandle" style="color:#a1a1aa">${MARCA.instagramHandle}</div>
    <div style="font-family:'Playfair Display',serif;font-size:40px;font-weight:800;color:#fff">${esc(slide.eyebrow || MARCA.nome)}</div>
  </div>
</div>`,
  }),
};

const coverResultShowcase: SlideVariant = {
  key: "result_showcase",
  label: "Resultado + selo de passos",
  render: (slide): VariantOutput => ({
    full: true,
    onDark: true,
    body: `
${photo(slide.bg_image_url, "ph")}
<div class="s-grad"></div>
<div class="s-overlay">
  ${overlayBrand()}
  <div style="display:flex;flex-direction:column;gap:22px">
    ${slide.eyebrow ? `<span class="step-count">${esc(slide.eyebrow)}</span>` : ""}
    <div class="s-title" style="color:#fff;text-shadow:0 4px 20px rgba(0,0,0,0.7)">${esc(slide.title)}</div>
  </div>
  <div class="s-swipe">Passo a passo completo →</div>
</div>`,
  }),
};

const coverResultFullbleed: SlideVariant = {
  key: "result_fullbleed",
  label: "Só o resultado (formato prompt)",
  render: (slide, ctx): VariantOutput => ({
    full: true,
    onDark: true,
    body: `
${photo(slide.bg_image_url, "ph")}
<div class="s-grad soft"></div>
<span class="prompt-badge">${esc(ctx.eyebrowLabel)}</span>
<div class="s-overlay">
  ${overlayBrand()}
  <div class="s-title" style="color:#fff;text-shadow:0 4px 20px rgba(0,0,0,0.8)">${esc(slide.title)}</div>
</div>`,
  }),
};

// --------------------------------------------------------------------------
// INTRO / CONTEÚDO
// --------------------------------------------------------------------------

const introBigStatement: SlideVariant = {
  key: "big_statement",
  label: "Declaração grande",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title sm">${esc(slide.title)}</div>
  ${slide.body ? `<div class="s-sub">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

const contentBullets: SlideVariant = {
  key: "bullets",
  label: "Título + bullets no cartão",
  render: (slide): VariantOutput => ({
    body: `
<div class="s-mid">
  <span class="s-label lbl-step">${esc(slide.eyebrow || "DETALHES")}</span>
  <div class="s-title sm">${esc(slide.title)}</div>
  ${slide.body ? `<div class="s-sub">${esc(slide.body)}</div>` : ""}
  ${slide.bullet_points.length ? `<div class="s-card">${bulletsHtml(slide.bullet_points)}</div>` : ""}
</div>`,
  }),
};

const contentHighlight: SlideVariant = {
  key: "highlight",
  label: "Título + parágrafo em destaque",
  render: (slide): VariantOutput => ({
    body: `
<div class="s-mid">
  <span class="s-label lbl-step">${esc(slide.eyebrow || "DETALHES")}</span>
  <div class="s-title sm">${esc(slide.title)}</div>
  <div class="s-card"><div class="p">${esc(slide.body)}</div></div>
</div>`,
  }),
};

const practicalGoldDark: SlideVariant = {
  key: "gold_dark_card",
  label: "Cartão escuro “como aplicar”",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  <span class="s-label lbl-step">${esc(slide.eyebrow || `PASSO ${pad2(slide.index)} DE ${pad2(ctx.total)}`)}</span>
  <div class="s-title sm">${esc(slide.title)}</div>
  <div class="s-card dark">
    <span class="s-label lbl-gold">\u{1F4A1} COMO APLICAR EM REDES &amp; VENDAS</span>
    <div class="p">${esc(slide.body)}</div>
  </div>
</div>`,
  }),
};

const quotePull: SlideVariant = {
  key: "pull_quote",
  label: "Citação em destaque",
  render: (slide): VariantOutput => ({
    body: `
<div class="s-mid">
  <div class="s-title" style="font-style:italic">“${esc(slide.body || slide.title)}”</div>
  ${slide.body ? `<div class="s-sub">${esc(slide.title)}</div>` : ""}
</div>`,
  }),
};

// --------------------------------------------------------------------------
// TUTORIAL
// --------------------------------------------------------------------------

const stepCodeBlock: SlideVariant = {
  key: "code_block",
  label: "Passo com bloco de código",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title sm">${esc(slide.title)}</div>
  ${slide.bullet_points[0] ? `<div class="s-code">${esc(slide.bullet_points[0])}</div>` : ""}
  ${slide.body ? `<div class="s-sub">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

const stepChecklist: SlideVariant = {
  key: "checklist",
  label: "Passo com checklist",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title sm">${esc(slide.title)}</div>
  ${
    slide.bullet_points.length
      ? `<div class="s-card">${bulletsHtml(slide.bullet_points)}</div>`
      : slide.body
        ? `<div class="s-card"><div class="p">${esc(slide.body)}</div></div>`
        : ""
  }
</div>`,
  }),
};

const tipLightCard: SlideVariant = {
  key: "light_card",
  label: "Dica de fechamento",
  render: (slide): VariantOutput => ({
    body: `
<div class="s-mid">
  <span class="s-label lbl-step">${esc(slide.eyebrow || "FECHAMENTO")}</span>
  <div class="s-title sm">${esc(slide.title)}</div>
  <div class="s-card"><div class="p">${esc(slide.body)}</div></div>
</div>`,
  }),
};

// --------------------------------------------------------------------------
// PROMPT
// --------------------------------------------------------------------------

const galleryImageCaption: SlideVariant = {
  key: "image_caption",
  label: "Imagem + legenda curta",
  render: (slide, ctx): VariantOutput => ({
    full: true,
    onDark: true,
    body: `
${photo(slide.bg_image_url, "ph")}
<div class="s-grad soft"></div>
<div class="s-overlay" style="justify-content:space-between">
  <span class="s-counter" style="align-self:flex-end;background:rgba(255,255,255,0.16);color:#fff">${pad2(slide.index)} / ${pad2(ctx.total)}</span>
  ${slide.title ? `<div class="gallery-cap">${esc(slide.title)}</div>` : ""}
</div>`,
  }),
};

const personalizationPromptSwap: SlideVariant = {
  key: "prompt_swap",
  label: "Prompt base com campo a trocar",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-mid">
  ${eyebrow(ctx, slide)}
  <div class="s-title sm">${esc(slide.title)}</div>
  ${slide.body ? `<div class="s-code">${esc(slide.body)}</div>` : ""}
  ${slide.bullet_points[0] ? `<div class="s-sub">${esc(slide.bullet_points[0])}</div>` : ""}
</div>`,
  }),
};

// --------------------------------------------------------------------------
// CTA
// --------------------------------------------------------------------------

const ctaDarkCard: SlideVariant = {
  key: "dark_card",
  label: "Cartão escuro com botão",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="s-cta">
  <span class="ico">\u{1F4E9}</span>
  <div class="t">${esc(slide.title)}</div>
  ${slide.body ? `<div class="b">${esc(slide.body)}</div>` : ""}
  <div class="btn">${ctaButton(ctx, slide)}</div>
</div>`,
  }),
};

// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// TUTORIAL — design claro aprovado (sistema impresso)
// --------------------------------------------------------------------------

const coverEditorialClaro: SlideVariant = {
  key: "editorial_claro",
  label: "Capa clara — marca, título partido e botão",
  render: (slide): VariantOutput => ({
    body: `
<div class="e-wrap center">
  ${marcaEditorial()}
  ${tituloHtml(slide)}
  <div class="e-btn">START</div>
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

const stepTerminalClaro: SlideVariant = {
  key: "terminal_claro",
  label: "Passo claro — terminal com comando e saída",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${terminalHtml(slide.eyebrow?.trim() || "terminal", slide.bullet_points)}
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

const stepNumeradoClaro: SlideVariant = {
  key: "numerado_claro",
  label: "Passo claro — lista numerada",
  render: (slide, ctx): VariantOutput => {
    const linhas = slide.bullet_points
      .map((b, i) => `<div class="row"><span class="n">${pad2(i + 1)}</span><span class="t">${esc(b)}</span></div>`)
      .join("");

    return {
      body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${linhas ? `<div class="e-nums">${linhas}</div>` : ""}
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
</div>`,
    };
  },
};

const tipEditorialClaro: SlideVariant = {
  key: "destaque_claro",
  label: "Dica clara — parágrafo e citação",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
  ${slide.highlight_text ? `<div class="e-quote">${esc(slide.highlight_text)}</div>` : ""}
</div>`,
  }),
};

const ctaEditorialClaro: SlideVariant = {
  key: "keyword_claro",
  label: "CTA claro — palavra-chave em destaque",
  render: (slide, ctx): VariantOutput => {
    // A palavra-chave é o que a pessoa comenta para receber o Direct: sai de
    // `highlight_text` quando a IA a informa, senão do CTA do formato.
    const chave = slide.highlight_text?.trim();
    const chamada = slide.cta_text?.trim() || ctx.ctaText;

    return {
      body: `
<div class="e-wrap center">
  ${tituloHtml(slide)}
  ${chave ? `<div class="e-kw">${esc(chave)}</div>` : ""}
  <div class="e-kw-line">${esc(chamada)}</div>
</div>`,
    };
  },
};

/**
 * Slide de imagem em tela cheia — o resultado do prompt, sem texto por cima.
 * É o corpo do formato `prompt`: a pessoa vê primeiro o que poderia criar.
 */
const galleryTelaCheia: SlideVariant = {
  key: "tela_cheia",
  label: "Imagem em tela cheia (resultado do prompt)",
  render: (slide): VariantOutput => ({
    full: true,
    onDark: true,
    body: photo(slide.bg_image_url),
  }),
};

// --------------------------------------------------------------------------
// EVERGREEN: o carrossel de conteúdo permanente
//
// Três variantes, e as três na mesma família visual da capa de texto do Social
// V2 (as classes `e-*`), porque um carrossel que muda de linguagem visual entre
// o slide 1 e o slide 2 não parece o mesmo post. As variantes de conteúdo que já
// existiam usam as classes `s-*`, do outro design aprovado, e misturar os dois
// dentro de uma peça é exatamente o que o comentário de `chrome.ts` diz que não
// se converte por troca de cor.
//
// Nenhuma delas declara CSS novo além da primitiva de duas colunas, que a folha
// não tinha porque nenhuma variante anterior comparava nada.
// --------------------------------------------------------------------------

/**
 * Conteúdo permanente: rótulo, título e o corpo.
 *
 * O corpo entra como lista quando o texto é naturalmente uma lista, e como
 * parágrafo quando não é. Quem decide é o conteúdo que chegou, não o formato:
 * uma lista de um item é um parágrafo com marcador, e um parágrafo partido em
 * três bullets é uma lista inventada.
 */
const conteudoEvergreen: SlideVariant = {
  key: "conteudo_editorial",
  label: "Conteúdo permanente: título e corpo",
  render: (slide, ctx): VariantOutput => {
    const bullets = (slide.bullet_points ?? []).filter(Boolean);
    const linhas = bullets
      .map((b, i) => `<div class="row"><span class="n">${pad2(i + 1)}</span><span class="t">${esc(b)}</span></div>`)
      .join("");

    return {
      body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${bullets.length > 1 ? `<div class="e-nums">${linhas}</div>` : ""}
  ${slide.body ? `<div class="e-lede lay-texto e-corpo" data-ajuste="encolher" data-min="26" data-max="42"><span>${manterCodigosJuntos(esc(slide.body))}</span></div>` : ""}
  ${bullets.length === 1 ? `<div class="e-quote">${esc(bullets[0])}</div>` : ""}
</div>`,
    };
  },
};

/**
 * A ressalva, que é o slide que evita o post enganar.
 *
 * O texto vai na citação e não no corpo de propósito: uma ressalva em corpo de
 * parágrafo se lê como continuação da explicação, e o que ela faz é interromper.
 */
const ressalvaEvergreen: SlideVariant = {
  key: "ressalva_editorial",
  label: "Ressalva: o que a fonte não diz",
  render: (slide, ctx): VariantOutput => ({
    body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${slide.body ? `<div class="e-quote">${esc(slide.body)}</div>` : ""}
</div>`,
  }),
};

/**
 * A comparação, lado a lado.
 *
 * Os dois lados vêm em `bullet_points[0]` e `bullet_points[1]`, e os rótulos
 * em `highlight_text` separados por " | ". É feio como contrato e é o que
 * `InstagramSlide` oferece sem acrescentar campo ao schema que o caminho legado
 * também valida — e acrescentar campo lá para uso exclusivo do evergreen faria
 * o schema do legado carregar peso que ele nunca usa.
 *
 * Sem os dois lados, esta variante não desenha meia comparação: cai no corpo,
 * porque um quadro comparativo com uma coluna vazia é pior que um parágrafo.
 */
const comparacaoDuasColunas: SlideVariant = {
  key: "comparacao_duas_colunas",
  label: "Comparação: duas colunas com régua",
  render: (slide, ctx): VariantOutput => {
    const lados = (slide.bullet_points ?? []).filter(Boolean);
    const rotulos = String(slide.highlight_text ?? "")
      .split("|")
      .map((r) => r.trim())
      .filter(Boolean);

    if (lados.length < 2) {
      return {
        body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  ${slide.body ? `<div class="e-lede">${esc(slide.body)}</div>` : ""}
</div>`,
      };
    }

    return {
      body: `
<div class="e-wrap">
  ${eyebrow(ctx, slide)}
  ${tituloHtml(slide, "sm")}
  <div class="e-duo">
    <div class="col">
      ${rotulos[0] ? `<span class="rot">${esc(rotulos[0])}</span>` : ""}
      <span class="val">${esc(lados[0])}</span>
    </div>
    <span class="risco"></span>
    <div class="col">
      ${rotulos[1] ? `<span class="rot">${esc(rotulos[1])}</span>` : ""}
      <span class="val">${esc(lados[1])}</span>
    </div>
  </div>
</div>`,
    };
  },
};

export const SLIDE_VARIANTS: Record<InstagramSlideType, Record<string, SlideVariant>> = {
  cover: {
    fullbleed_portrait: coverFullbleedPortrait,
    brand_card: coverBrandCard,
    noticia_sem_foto: coverNoticiaSemFoto,
    capa_destaque: coverCarrosselDestaque,
    capa_jornal: capaJornal,
    recorte_post: capaRecorte,
    result_showcase: coverResultShowcase,
    result_fullbleed: coverResultFullbleed,
    editorial_claro: coverEditorialClaro,
  },
  intro: { big_statement: introBigStatement },
  content: {
    bullets: contentBullets,
    highlight: contentHighlight,
    conteudo_editorial: conteudoEvergreen,
    miolo_jornal: mioloJornal,
    miolo_noticia: mioloNoticia,
    miolo_recorte: mioloRecorte,
    comparacao_duas_colunas: comparacaoDuasColunas,
  },
  quote_highlight: { pull_quote: quotePull, ressalva_editorial: ressalvaEvergreen },
  practical_impact: { gold_dark_card: practicalGoldDark },
  step: {
    terminal_claro: stepTerminalClaro,
    numerado_claro: stepNumeradoClaro,
    code_block: stepCodeBlock,
    checklist: stepChecklist,
  },
  tip: { destaque_claro: tipEditorialClaro, light_card: tipLightCard },
  gallery: { tela_cheia: galleryTelaCheia, image_caption: galleryImageCaption },
  personalization: { prompt_swap: personalizationPromptSwap },
  cta: {
    keyword_claro: ctaEditorialClaro,
    dark_card: ctaDarkCard,
    cta_newsletter: ctaNewsletter,
    cta_assinatura: ctaAssinatura,
    cta_siga: ctaSiga,
  },
};

/** `{ cover: [{key,label},…], … }` — o que o painel do admin lista. */
export function variantCatalog(): Record<string, Array<{ key: string; label: string }>> {
  const out: Record<string, Array<{ key: string; label: string }>> = {};
  for (const [slideType, variants] of Object.entries(SLIDE_VARIANTS)) {
    out[slideType] = Object.values(variants).map((v) => ({ key: v.key, label: v.label }));
  }
  return out;
}

export function firstVariantKey(slideType: InstagramSlideType): string {
  const variants = SLIDE_VARIANTS[slideType];
  const keys = variants ? Object.keys(variants) : [];
  return keys[0] ?? "";
}
