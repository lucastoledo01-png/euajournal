import { execFileSync } from "node:child_process";

/**
 * O corte automático do vídeo de origem (28/10/2026).
 *
 * O vídeo que bomba em outro perfil chega com a marca dele: logotipo no canto,
 * legenda gravada, faixa de manchete. O que essas coisas têm em comum é que
 * NÃO MEXEM enquanto o vídeo mexe, e têm contraste. Então:
 *
 *   1. o ffmpeg tira 12 quadros pequenos, em tons de cinza;
 *   2. o pixel que quase não varia entre os quadros E tem borda forte perto é
 *      sobreposição;
 *   3. o corte é o maior retângulo sem sobreposição, na proporção do molde.
 *
 * Onde erra: vídeo de câmera parada (entrevista com fundo liso) parece todo
 * sobreposição nas bordas do cenário; por isso o Claude vê o corte desenhado
 * na folha de quadros e pode trocar. Sem sobreposição achada, não há corte, e
 * o molde encaixa o vídeo inteiro.
 */

export type Corte = { x: number; y: number; largura: number; altura: number };

/** Proporção do lugar do vídeo em cada molde: A é a moldura (992x537), B a tela cheia. */
export const ASPECTO_DO_MOLDE = { a: 992 / 537, b: 1080 / 1920 } as const;

/**
 * Pura: dos quadros (cinza, um byte por pixel) à máscara de sobreposição.
 * `variacao` é o desvio padrão máximo para contar como parado; `borda` é o
 * gradiente mínimo no quadro médio para contar como desenho.
 */
export function mascaraDeSobreposicao(
  quadros: Uint8Array[],
  largura: number,
  altura: number,
  opcoes: { variacao?: number; borda?: number } = {},
): boolean[][] {
  const limiteDeVariacao = opcoes.variacao ?? 6;
  const limiteDeBorda = opcoes.borda ?? 40;
  const n = quadros.length;
  const media = new Float64Array(largura * altura);
  const desvio = new Float64Array(largura * altura);
  for (let i = 0; i < largura * altura; i++) {
    let soma = 0;
    for (const q of quadros) soma += q[i];
    const m = soma / n;
    let var_ = 0;
    for (const q of quadros) var_ += (q[i] - m) ** 2;
    media[i] = m;
    desvio[i] = Math.sqrt(var_ / n);
  }
  const em = (x: number, y: number) => media[Math.min(altura - 1, Math.max(0, y)) * largura + Math.min(largura - 1, Math.max(0, x))];
  const parado: boolean[][] = [];
  for (let y = 0; y < altura; y++) {
    const linha: boolean[] = [];
    for (let x = 0; x < largura; x++) {
      const gradiente = Math.max(Math.abs(em(x + 1, y) - em(x - 1, y)), Math.abs(em(x, y + 1) - em(x, y - 1)));
      linha.push(desvio[y * largura + x] <= limiteDeVariacao && gradiente >= limiteDeBorda);
    }
    parado.push(linha);
  }
  // Dilata um pixel: a borda do desenho é o que tem gradiente, o miolo da letra também é desenho.
  return parado.map((linha, y) =>
    linha.map((_, x) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (parado[y + dy]?.[x + dx]) return true;
      return false;
    }),
  );
}

/**
 * Pura: o maior retângulo na proporção pedida que não toca a máscara, na grade
 * da máscara. Percorre os retângulos máximos livres (histograma por linha) e
 * encaixa em cada um o maior retângulo da proporção, centralizado.
 */
export function maiorRetanguloLivre(mascara: boolean[][], aspecto: number): Corte | null {
  const altura = mascara.length;
  const largura = mascara[0]?.length ?? 0;
  if (!altura || !largura) return null;
  const alturas = new Array<number>(largura).fill(0);
  let melhor: Corte | null = null;
  const considerar = (x0: number, x1: number, yBase: number, h: number) => {
    const w = x1 - x0;
    let lw = w;
    let lh = Math.floor(w / aspecto);
    if (lh > h) {
      lh = h;
      lw = Math.floor(h * aspecto);
    }
    if (lw <= 0 || lh <= 0) return;
    if (!melhor || lw * lh > melhor.largura * melhor.altura) {
      melhor = { x: x0 + Math.floor((w - lw) / 2), y: yBase - h + 1 + Math.floor((h - lh) / 2), largura: lw, altura: lh };
    }
  };
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) alturas[x] = mascara[y][x] ? 0 : alturas[x] + 1;
    const pilha: number[] = [];
    for (let x = 0; x <= largura; x++) {
      const h = x < largura ? alturas[x] : 0;
      let inicio = x;
      while (pilha.length && alturas[pilha[pilha.length - 1]] >= h) {
        const topo = pilha.pop()!;
        const esquerda = pilha.length ? pilha[pilha.length - 1] + 1 : 0;
        if (alturas[topo] > 0) considerar(esquerda, x, y, alturas[topo]);
        inicio = esquerda;
      }
      void inicio;
      pilha.push(x);
    }
  }
  return melhor;
}

/**
 * Pura: o corte em pixels do vídeo original, ou `null` quando a máscara está
 * limpa (o molde encaixa o vídeo inteiro) ou quando sobra pouco demais
 * (menos de 35% do maior retângulo da proporção que caberia no quadro
 * inteiro: é melhor o Claude decidir olhando).
 */
export function corteDaMascara(
  mascara: boolean[][],
  aspecto: number,
  original: { largura: number; altura: number },
): Corte | null {
  const algum = mascara.some((l) => l.some(Boolean));
  if (!algum) return null;
  const r = maiorRetanguloLivre(mascara, aspecto);
  const gh = mascara.length;
  const gw = mascara[0].length;
  const cheio = maiorRetanguloLivre(mascara.map((l) => l.map(() => false)), aspecto);
  if (!r || !cheio || (r.largura * r.altura) / (cheio.largura * cheio.altura) < 0.35) return null;
  const ex = original.largura / gw;
  const ey = original.altura / gh;
  // Arredonda para dentro e para par (o x264 pede dimensão par): nunca um pixel na sobreposição.
  const x = Math.ceil((r.x * ex) / 2) * 2;
  const y = Math.ceil((r.y * ey) / 2) * 2;
  const largura = Math.floor(((r.x + r.largura) * ex - x) / 2) * 2;
  const altura = Math.floor(((r.y + r.altura) * ey - y) / 2) * 2;
  return { x, y, largura, altura };
}

export function medidasDoVideo(arquivo: string): { largura: number; altura: number; segundos: number } {
  const saida = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", arquivo,
  ]).toString();
  const j = JSON.parse(saida) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
  return { largura: j.streams?.[0]?.width ?? 0, altura: j.streams?.[0]?.height ?? 0, segundos: Number(j.format?.duration ?? 0) };
}

/** Mede o corte de um arquivo: 12 quadros de 64 px de largura, pelo ffmpeg. */
export function medirCorte(arquivo: string, aspecto: number): { corte: Corte | null; original: { largura: number; altura: number } } {
  const m = medidasDoVideo(arquivo);
  if (!m.largura || !m.altura) return { corte: null, original: m };
  const gw = 64;
  const gh = Math.max(8, Math.round((m.altura / m.largura) * gw / 2) * 2);
  const fps = 12 / Math.max(1, m.segundos);
  const bruto = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", arquivo, "-vf", `fps=${fps.toFixed(4)},scale=${gw}:${gh},format=gray`, "-frames:v", "12", "-f", "rawvideo", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const tamanho = gw * gh;
  const quadros: Uint8Array[] = [];
  for (let i = 0; i + tamanho <= bruto.length; i += tamanho) quadros.push(new Uint8Array(bruto.subarray(i, i + tamanho)));
  if (quadros.length < 4) return { corte: null, original: m };
  return { corte: corteDaMascara(mascaraDeSobreposicao(quadros, gw, gh), aspecto, m), original: m };
}

/**
 * A folha de quadros: seis quadros em 3x2, com o corte desenhado em amarelo.
 * É o que o Claude vê no chat (o chat não toca vídeo) e o painel mostra ao lado
 * do vídeo.
 */
export function folhaDeQuadros(arquivo: string, saida: string, corte: Corte | null): string {
  const m = medidasDoVideo(arquivo);
  const fps = 6 / Math.max(1, m.segundos);
  const caixa = corte ? `drawbox=x=${corte.x}:y=${corte.y}:w=${corte.largura}:h=${corte.altura}:color=yellow@0.9:t=8,` : "";
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", arquivo,
    "-vf", `fps=${fps.toFixed(4)},${caixa}scale=360:-2,tile=3x2:padding=6:color=white`,
    "-frames:v", "1", "-q:v", "4", saida,
  ]);
  return saida;
}
