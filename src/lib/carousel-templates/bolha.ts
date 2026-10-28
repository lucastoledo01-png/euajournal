/**
 * Onde a bolha pode ficar na capa de jornal, e a geometria para conferir.
 *
 * A bolha morava num lugar só, cravado no CSS: 4 por cento da esquerda, 19 do
 * topo, 44 de largura. Em 29/09/2026 ela saiu em cima do rosto de Biden, num
 * retrato oficial com o rosto no centro, e o dono pediu (06/10/2026) que ela
 * nunca mais cubra rosto. Para isso ela precisa de para onde ir, e este
 * arquivo é a lista desses lugares.
 *
 * Fica em `carousel-templates`, e não no servidor, porque são DUAS pontas que
 * precisam da mesma tabela: o desenho, que escreve a posição no HTML, e a
 * decisão, que confere se a posição cruza um rosto. Duas cópias da mesma
 * tabela é como a regra da gramática já envelheceu em três lugares.
 *
 * Tudo é em fração do canvas, e não em pixel, pela mesma razão do CSS: o
 * canvas sai dos tokens, e uma posição em pixel quebraria no dia em que ele
 * mudar de tamanho.
 */

/**
 * O canvas do feed, 3:4. É o padrão dos tokens (`tokens.ts`), e é contra ele
 * que a posição é decidida antes do render; o render confere de novo com o
 * canvas que os tokens do banco trouxerem.
 */
export const CANVAS_DO_FEED = { width: 1080, height: 1440 } as const;

/** Um retângulo em fração do canvas: 0 é a borda de cima ou da esquerda, 1 a oposta. */
export type CaixaNormalizada = { x: number; y: number; largura: number; altura: number };

export type PosicaoDaBolha = {
  chave: string;
  /** Borda esquerda do círculo, fração da LARGURA do canvas. */
  esquerda: number;
  /** Borda de cima do círculo, fração da ALTURA do canvas. */
  topo: number;
  /** Diâmetro, fração da LARGURA do canvas (o CSS usa aspect-ratio 1). */
  diametro: number;
};

/**
 * As zonas que a bolha nunca ocupa, independentemente da foto.
 *
 * A marca do topo: `.j-marca` tem topo 7,5%, esquerda 9% e 52px de altura,
 * com largura automática. O arquivo é 800x143, então a 52px a marca tem 291px,
 * que num canvas de 1080 vai até 36%. A caixa abaixo arredonda para cima.
 * Desde 06/10/2026 a marca do topo é a do Instagram, mais compacta (480x129:
 * a 52px tem 193px, até 27%), e a caixa continua cobrindo com folga.
 *
 * A faixa do texto: `.j-texto` começa em 64% da altura e vai até a base, com
 * o chapéu de editoria e a manchete apoiados embaixo. A manchete curta deixa
 * espaço livre no alto da faixa, mas a longa usa a faixa inteira, e a posição
 * é decidida antes de saber qual das duas a peça vai ter.
 */
export const ZONA_DA_MARCA: CaixaNormalizada = { x: 0.09, y: 0.075, largura: 0.28, altura: 0.04 };
export const TOPO_DA_FAIXA_DO_TEXTO = 0.64;

/**
 * A ordem é a preferência.
 *
 * Primeiro o lugar de sempre, que é o desenho aprovado. Depois o espelho dele
 * e as variações no mesmo tamanho, e só então os tamanhos menores: a bolha
 * de 30% ainda se lê no celular, e abaixo disso ela vira um ponto. Melhor
 * capa sem bolha do que bolha que ninguém reconhece.
 *
 * Toda posição termina acima de 63% da altura, um ponto antes da faixa do
 * texto, e nenhuma entra na zona da marca. Há teste conferindo as duas coisas
 * para cada linha, porque é fácil acrescentar uma posição e esquecer a conta.
 */
export const POSICOES_DA_BOLHA: readonly PosicaoDaBolha[] = [
  { chave: "padrao", esquerda: 0.04, topo: 0.19, diametro: 0.44 },
  { chave: "direita", esquerda: 0.52, topo: 0.19, diametro: 0.44 },
  { chave: "direita_alta", esquerda: 0.52, topo: 0.05, diametro: 0.44 },
  { chave: "esquerda_baixa", esquerda: 0.04, topo: 0.3, diametro: 0.44 },
  { chave: "direita_baixa", esquerda: 0.52, topo: 0.3, diametro: 0.44 },
  { chave: "media_direita_alta", esquerda: 0.6, topo: 0.05, diametro: 0.36 },
  { chave: "media_esquerda_baixa", esquerda: 0.04, topo: 0.36, diametro: 0.36 },
  { chave: "media_direita_baixa", esquerda: 0.6, topo: 0.36, diametro: 0.36 },
  { chave: "pequena_direita_alta", esquerda: 0.66, topo: 0.04, diametro: 0.3 },
  { chave: "pequena_esquerda_alta", esquerda: 0.04, topo: 0.15, diametro: 0.3 },
  { chave: "pequena_esquerda_baixa", esquerda: 0.04, topo: 0.405, diametro: 0.3 },
  { chave: "pequena_direita_baixa", esquerda: 0.66, topo: 0.405, diametro: 0.3 },
  // Bolha de destaque (27/10/2026): o rosto do personagem ou a nota de dolar
  // em tamanho de protagonista, a direita da marca e acima da manchete.
  { chave: "grande_direita_alta", esquerda: 0.5, topo: 0.05, diametro: 0.46 },
];

export const POSICAO_PADRAO = POSICOES_DA_BOLHA[0];

/**
 * Onde a bolha pode ficar no MIOLO da notícia em carrossel (06/10/2026).
 *
 * O miolo tem outra divisão de peso: o texto ocupa a metade de baixo
 * (`.jn-texto` começa em 50% da altura), e a bolha do segundo personagem é
 * menor que a da capa. A regra é a mesma da capa: nunca em cima de rosto, e
 * sem posição livre não há bolha. Toda posição termina acima de 49% da altura
 * e nenhuma entra na zona da marca; há teste das duas contas.
 */
export const TOPO_DA_FAIXA_DO_TEXTO_DO_MIOLO = 0.5;

export const POSICOES_DA_BOLHA_DO_MIOLO: readonly PosicaoDaBolha[] = [
  { chave: "miolo_direita", esquerda: 0.63, topo: 0.15, diametro: 0.3 },
  { chave: "miolo_esquerda", esquerda: 0.07, topo: 0.15, diametro: 0.3 },
  { chave: "miolo_direita_baixa", esquerda: 0.63, topo: 0.26, diametro: 0.3 },
  { chave: "miolo_esquerda_baixa", esquerda: 0.07, topo: 0.26, diametro: 0.3 },
  { chave: "miolo_pequena_direita_alta", esquerda: 0.7, topo: 0.05, diametro: 0.24 },
  { chave: "miolo_pequena_direita_baixa", esquerda: 0.7, topo: 0.3, diametro: 0.24 },
  { chave: "miolo_pequena_esquerda_baixa", esquerda: 0.07, topo: 0.3, diametro: 0.24 },
  { chave: "miolo_grande_direita", esquerda: 0.5, topo: 0.09, diametro: 0.42 },
];

export function posicaoPorChave(chave: string | null | undefined): PosicaoDaBolha | null {
  return (
    POSICOES_DA_BOLHA.find((p) => p.chave === chave) ??
    POSICOES_DA_BOLHA_DO_MIOLO.find((p) => p.chave === chave) ??
    null
  );
}

/** O círculo em pixels do canvas. */
export type Circulo = { cx: number; cy: number; raio: number };

export function circuloDaPosicao(p: PosicaoDaBolha, canvas: { width: number; height: number }): Circulo {
  const diametro = p.diametro * canvas.width;
  return {
    cx: p.esquerda * canvas.width + diametro / 2,
    cy: p.topo * canvas.height + diametro / 2,
    raio: diametro / 2,
  };
}

/** Caixa normalizada para pixels do canvas. */
export function caixaEmPixels(c: CaixaNormalizada, canvas: { width: number; height: number }) {
  return {
    x0: c.x * canvas.width,
    y0: c.y * canvas.height,
    x1: (c.x + c.largura) * canvas.width,
    y1: (c.y + c.altura) * canvas.height,
  };
}

/**
 * O círculo encosta no retângulo, com folga?
 *
 * A folga cresce o retângulo para os quatro lados. A conta é a de sempre: o
 * ponto do retângulo mais próximo do centro do círculo, e a distância dele
 * até o centro comparada com o raio.
 */
export function circuloCruzaCaixa(
  circulo: Circulo,
  caixa: { x0: number; y0: number; x1: number; y1: number },
  folgaPx = 0,
): boolean {
  const x0 = caixa.x0 - folgaPx;
  const y0 = caixa.y0 - folgaPx;
  const x1 = caixa.x1 + folgaPx;
  const y1 = caixa.y1 + folgaPx;
  const px = Math.max(x0, Math.min(circulo.cx, x1));
  const py = Math.max(y0, Math.min(circulo.cy, y1));
  const dx = circulo.cx - px;
  const dy = circulo.cy - py;
  return dx * dx + dy * dy < circulo.raio * circulo.raio;
}

/**
 * O pedaço do arquivo que aparece na peça, com `object-fit: cover`.
 *
 * É a MESMA conta de `medir`, no script de ajuste (`layout-render.ts`), que
 * recorta o pedaço da foto atrás da marca para decidir a versão do logotipo:
 * escala pelo maior dos dois lados, centraliza, e o que sobra para fora é
 * cortado. A foto quase nunca tem a proporção da peça, então o rosto que está
 * no meio do ARQUIVO pode estar em outro lugar da PEÇA, ou fora dela.
 *
 * Devolve o retângulo em pixels do arquivo de origem.
 */
export function recorteDoCover(
  larguraDaImagem: number,
  alturaDaImagem: number,
  larguraDoCanvas: number,
  alturaDoCanvas: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const escala = Math.max(larguraDoCanvas / larguraDaImagem, alturaDoCanvas / alturaDaImagem);
  const sw = larguraDoCanvas / escala;
  const sh = alturaDoCanvas / escala;
  return {
    sx: (larguraDaImagem - sw) / 2,
    sy: (alturaDaImagem - sh) / 2,
    sw,
    sh,
  };
}

/** O estilo inline que põe o círculo numa posição. Vazio para a padrão, que o CSS já desenha. */
export function estiloDaPosicao(p: PosicaoDaBolha | null): string {
  if (!p || p.chave === POSICAO_PADRAO.chave) return "";
  const pct = (v: number) => `${+(v * 100).toFixed(2)}%`;
  return `left:${pct(p.esquerda)};top:${pct(p.topo)};width:${pct(p.diametro)};`;
}
