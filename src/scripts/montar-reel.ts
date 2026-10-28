/**
 * Monta um Reel 9:16 a partir de um vídeo, nos moldes do eua.journal (28/10/2026).
 *
 *   npx tsx src/scripts/montar-reel.ts --video <arquivo.mp4> --formato a|b \
 *     --linhas "LINHA 1|*LINHA EM DESTAQUE*|LINHA 3" [--rotulo TRAGÉDIA] [--categoria MUNDO] \
 *     [--corte x:y:largura:altura] [--saida <arquivo.mp4>]
 *
 * Os dois moldes, documentados em `docs/reels.md`:
 *
 *   a  o vídeo dentro da moldura do template (`reel/molde-a.jpg`, as bandeiras,
 *      o Capitólio e a Casa Branca), com o rótulo na faixa vermelha e a manchete
 *      em três linhas embaixo, a do meio em vermelho;
 *   b  o vídeo em tela cheia, com a marca no alto, a editoria numa etiqueta
 *      vermelha e a manchete em caixas brancas.
 *
 * `--corte` recorta o vídeo de origem antes de encaixar, em pixels do arquivo
 * original: é como se tira a marca e a legenda de quem publicou primeiro. Sem
 * corte, o vídeo entra inteiro, centralizado. O áudio original é mantido.
 *
 * Não publica nada: grava o MP4. Publicar é com `_publicar-reel-manual.ts`.
 * Precisa de ffmpeg no PATH e do Chromium do Playwright.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PASTA = path.dirname(fileURLToPath(import.meta.url));

type Formato = "a" | "b";

type Pedido = {
  video: string;
  formato: Formato;
  linhas: string[];
  rotulo: string;
  categoria: string;
  corte: { x: number; y: number; largura: number; altura: number } | null;
  saida: string;
};

/** Onde o vídeo entra no molde A, em pixels do 1080x1920 (medido no template de 28/10/2026). */
export const MOLDURA_A = { x: 44, y: 609, largura: 992, altura: 537 };

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : undefined;
}

export function lerCorte(bruto: string | undefined): Pedido["corte"] {
  if (!bruto) return null;
  const n = bruto.split(":").map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x) || x < 0)) throw new Error("--corte é x:y:largura:altura");
  return { x: n[0], y: n[1], largura: n[2], altura: n[3] };
}

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "*TEXTO*" é a linha em destaque (vermelha no molde A). */
export function linhasDoTexto(bruto: string): Array<{ texto: string; destaque: boolean }> {
  return bruto
    .split("|")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("*") && l.endsWith("*") ? { texto: l.slice(1, -1), destaque: true } : { texto: l, destaque: false }));
}

const FONTES =
  '<link href="https://fonts.googleapis.com/css2?family=Anton&family=Epilogue:wght@300;800&family=Source+Serif+4:wght@700&display=swap" rel="stylesheet">';

/**
 * Molde A: o fundo é o template com o rótulo e a manchete cobertos e escritos
 * de novo. A faixa vermelha é redesenhada por cima da antiga, no mesmo
 * enviesado, e a manchete ganha uma faixa escura que se funde ao fundo nas
 * bordas. A moldura fica como está: o vídeo entra por cima dela no ffmpeg.
 */
function htmlDoMoldeA(p: Pedido, fundo: string): string {
  const linhas = linhasDoTexto(p.linhas.join("|"));
  return `<!doctype html><meta charset=utf-8>${FONTES}<style>
*{box-sizing:border-box}html,body{margin:0}body{width:1080px;height:1920px;position:relative;overflow:hidden;background:#050a1c url(${fundo}) 0 0/1080px 1920px no-repeat}
.abs{position:absolute}
#ban{left:112px;top:314px;width:892px;height:216px}
#banin{position:absolute;inset:0;background:linear-gradient(180deg,#e3172d 0%,#b30c1d 55%,#8d0614 100%);transform:skewX(-12deg);box-shadow:0 0 30px rgba(229,30,50,.35)}
#btt{display:inline-block}
#bt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Anton,sans-serif;font-style:italic;color:#fff;letter-spacing:.01em;transform:skewX(-8deg);text-shadow:0 5px 0 rgba(0,0,0,.25);white-space:nowrap}
#faixa{left:0;right:0;top:1196px;height:368px;background:linear-gradient(180deg,rgba(5,9,26,0) 0%,rgba(5,9,26,.97) 9%,rgba(5,9,26,.97) 91%,rgba(5,9,26,0) 100%)}
#hd{left:60px;right:60px;top:1214px;height:340px;display:flex;flex-direction:column;justify-content:center;align-items:center}
.ln{display:inline-block;font-family:Anton,sans-serif;color:#fff;text-transform:uppercase;line-height:1.02;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.5)}
.ln.r{color:#e31b2e}
</style>
<div id=ban class=abs><div id=banin></div><div id=bt><span id=btt>${escapar(p.rotulo)}</span></div></div>
<div id=faixa class=abs></div>
<div id=hd class=abs>${linhas.map((l) => `<div class="ln${l.destaque ? " r" : ""}">${escapar(l.texto)}</div>`).join("")}</div>
<script>
// Cada linha cresce até caber: o rótulo em 780px, a manchete em 940px.
function caber(el, max, de, ate){let t=de;el.style.fontSize=t+'px';while(el.getBoundingClientRect().width>max&&t>ate){t-=2;el.style.fontSize=t+'px'}}
document.fonts.ready.then(()=>{caber(document.getElementById('btt'),760,176,90);for(const l of document.querySelectorAll('.ln'))caber(l,940,118,64);document.body.dataset.pronto='1'});
</script>`;
}

/** Molde B: só a camada de cima, transparente, sobre o vídeo em tela cheia. */
function htmlDoMoldeB(p: Pedido): string {
  const linhas = linhasDoTexto(p.linhas.join("|"));
  return `<!doctype html><meta charset=utf-8>${FONTES}<style>
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{width:1080px;height:1920px;position:relative;overflow:hidden}
.abs{position:absolute}
#topo{left:0;right:0;top:0;height:320px;background:linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,0))}
#sc{left:0;right:0;bottom:0;height:900px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.6) 45%,rgba(0,0,0,.72))}
#tab{left:70px;top:110px;color:#fff;font-family:Epilogue;font-weight:800;font-size:54px;letter-spacing:-.01em;text-shadow:0 2px 14px rgba(0,0,0,.55)}#tab b{color:#e5334b}#tab i{font-style:normal;font-weight:300}
#base{left:91px;right:60px;bottom:250px}
#cat{display:inline-block;margin:0 0 18px 16px;background:#e5334b;color:#fff;font-family:"Source Serif 4";font-weight:700;font-size:28px;letter-spacing:.06em;padding:7px 18px 5px}
.ln{display:block;width:max-content;max-width:930px;margin-bottom:8px;background:#fff;color:#111;font-family:"Source Serif 4";font-weight:700;font-size:62px;line-height:80px;padding:2px 18px 0;white-space:nowrap}
</style>
<div id=topo class=abs></div><div id=sc class=abs></div>
<div id=tab class=abs>eua<b>.</b><i>journal</i></div>
<div id=base class=abs>${p.categoria ? `<div id=cat>${escapar(p.categoria.toUpperCase())}</div>` : ""}${linhas.map((l) => `<div class=ln>${escapar(l.texto)}</div>`).join("")}</div>
<script>
function caber(el,max,de,ate){let t=de;el.style.fontSize=t+'px';el.style.lineHeight=Math.round(t*1.29)+'px';while(el.scrollWidth>max&&t>ate){t-=2;el.style.fontSize=t+'px';el.style.lineHeight=Math.round(t*1.29)+'px'}}
document.fonts.ready.then(()=>{for(const l of document.querySelectorAll('.ln'))caber(l,930,62,40);document.body.dataset.pronto='1'});
</script>`;
}

async function renderizar(html: string, saida: string, transparente: boolean): Promise<void> {
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1920 } });
    await pagina.setContent(html, { waitUntil: "networkidle" });
    await pagina.waitForFunction(() => document.body.dataset.pronto === "1", null, { timeout: 20_000 });
    await pagina.screenshot({ path: saida, omitBackground: transparente });
  } finally {
    await navegador.close();
  }
}

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
}

/**
 * O filtro do vídeo: o corte, e depois o encaixe. No molde A o vídeo cobre a
 * moldura (preenche e corta o que sobra); no B, a tela inteira.
 */
export function filtroDoVideo(corte: Pedido["corte"], largura: number, altura: number): string {
  const recorte = corte ? `crop=${corte.largura}:${corte.altura}:${corte.x}:${corte.y},` : "";
  return `${recorte}scale=${largura}:${altura}:force_original_aspect_ratio=increase,crop=${largura}:${altura},setsar=1`;
}

export async function montarReel(p: Pedido): Promise<string> {
  const pasta = mkdtempSync(path.join(os.tmpdir(), "reel-"));
  try {
    const camada = path.join(pasta, "camada.png");
    const codificacao = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest"];
    if (p.formato === "a") {
      const fundo = `data:image/jpeg;base64,${readFileSync(path.join(PASTA, "reel", "molde-a.jpg")).toString("base64")}`;
      await renderizar(htmlDoMoldeA(p, fundo), camada, false);
      const m = MOLDURA_A;
      ffmpeg([
        "-loop", "1", "-i", camada, "-i", p.video,
        "-filter_complex", `[1:v]${filtroDoVideo(p.corte, m.largura, m.altura)}[v];[0:v][v]overlay=${m.x}:${m.y}:shortest=1[s]`,
        "-map", "[s]", "-map", "1:a?", ...codificacao, p.saida,
      ]);
    } else {
      await renderizar(htmlDoMoldeB(p), camada, true);
      ffmpeg([
        "-i", p.video, "-loop", "1", "-i", camada,
        "-filter_complex", `[0:v]${filtroDoVideo(p.corte, 1080, 1920)}[v];[v][1:v]overlay=0:0:shortest=1[s]`,
        "-map", "[s]", "-map", "0:a?", ...codificacao, p.saida,
      ]);
    }
    return p.saida;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

async function main() {
  const video = argumento("--video");
  const formato = (argumento("--formato") ?? "a").toLowerCase();
  const linhas = argumento("--linhas");
  if (!video || !linhas || (formato !== "a" && formato !== "b")) {
    throw new Error('use --video <arquivo> --formato a|b --linhas "L1|*L2*|L3" (ver o topo do arquivo)');
  }
  const saida = argumento("--saida") ?? video.replace(/\.mp4$/i, `-eua-${formato}.mp4`);
  const feito = await montarReel({
    video,
    formato,
    linhas: [linhas],
    rotulo: argumento("--rotulo") ?? "",
    categoria: argumento("--categoria") ?? "",
    corte: lerCorte(argumento("--corte")),
    saida,
  });
  const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "csv=p=0", feito]).toString().trim();
  console.log(`pronto: ${feito} (${info})`);
}

if (process.argv[1] && /montar-reel\.(ts|js)$/.test(process.argv[1])) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
}

