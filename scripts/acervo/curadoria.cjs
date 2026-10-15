#!/usr/bin/env node
/**
 * Ferramentas da curadoria do acervo próprio (14/10/2026).
 *
 * É o processo do primeiro lote, à mão, virado comando. Quem usa é o subagent
 * `curador-acervo` (.claude/agents/curador-acervo.md) ou uma pessoa.
 *
 *   node scripts/acervo/curadoria.cjs folha <saida> --busca "q1" "q2"
 *   node scripts/acervo/curadoria.cjs folha <saida> --categoria "Nome da categoria"
 *   node scripts/acervo/curadoria.cjs folha <saida> --arquivo "Nome.jpg" "Outro.jpg"
 *       folha de contato numerada (<saida>.jpg) e os dados de cada foto (<saida>.json)
 *
 *   node scripts/acervo/curadoria.cjs baixar <lote>
 *       baixa cada item de <lote>/lote.json em <lote>/orig, pela versão de 3000 px
 *
 *   node scripts/acervo/curadoria.cjs cortar <lote>
 *       corta em 3:4 (com <lote>/ajustes.json: cx, cy, zoom por arquivo), grava em
 *       <lote>/saida, escreve <lote>/saida/creditos.json e a folha <lote>/conferencia.jpg
 *
 * lote.json: [{ "nome": "grupo-pais-assunto-detalhe-01.jpg", "pagina": "https://commons.wikimedia.org/wiki/File:...",
 *               "autor": "...", "licenca": "CC BY 4.0" }]
 *
 * O Commons responde 429 a rajada: tudo aqui é um pedido por vez, com pausa.
 */
const fs = require("fs");
const path = require("path");
const sharp = require(path.join(__dirname, "../../node_modules/sharp"));

const UA = { "User-Agent": "eua.journal/1.0 (https://euajournal.com; curadoria do acervo)" };
const API = "https://commons.wikimedia.org/w/api.php";
const LICENCAS_PROIBIDAS = /NC|ND|fair use|non-free/i;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  for (let t = 0; t < 5; t++) {
    const r = await fetch(url, { headers: UA });
    const tx = await r.text();
    try { return JSON.parse(tx); } catch { await espera(6000 * (t + 1)); }
  }
  throw new Error("Commons não respondeu JSON: " + url);
}

const limpar = (v) => String(v ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const LICENCA_EM_PT = { "Public domain": "domínio público", Attribution: "CC BY" };

async function folha(saida, modo, termos) {
  const vistos = new Map();
  for (const q of termos) {
    const base = `${API}?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=360&iiextmetadatafilter=LicenseShortName|Artist|DateTimeOriginal|ImageDescription`;
    const sel =
      modo === "--busca" ? `&generator=search&gsrnamespace=6&gsrlimit=24&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}`
      : modo === "--categoria" ? `&generator=categorymembers&gcmtype=file&gcmlimit=40&gcmtitle=${encodeURIComponent("Category:" + q)}`
      : `&titles=${encodeURIComponent("File:" + q.replace(/^File:/, ""))}`;
    const d = await json(base + sel);
    const paginas = Object.values(d.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const p of paginas) {
      const ii = p.imageinfo?.[0];
      if (!ii || ii.width < 1080 || ii.height < 1080) continue;
      const m = ii.extmetadata ?? {};
      const licenca = limpar(m.LicenseShortName?.value);
      if (!licenca || LICENCAS_PROIBIDAS.test(licenca)) continue;
      if (!vistos.has(p.title)) {
        vistos.set(p.title, {
          titulo: p.title,
          pagina: ii.descriptionurl,
          thumb: ii.thumburl,
          w: ii.width,
          h: ii.height,
          licenca: LICENCA_EM_PT[licenca] ?? licenca,
          autor: limpar(m.Artist?.value).replace(/\s+from\s+.*$/i, "").slice(0, 80),
          data: limpar(m.DateTimeOriginal?.value).slice(0, 10),
          descricao: limpar(m.ImageDescription?.value).slice(0, 300),
        });
      }
    }
    await espera(1500);
  }
  const lista = [...vistos.values()].slice(0, 16);
  fs.writeFileSync(saida + ".json", JSON.stringify(lista, null, 1));
  if (lista.length === 0) { console.log(saida, 0); return; }
  const cel = 360, cols = 4, rows = Math.ceil(lista.length / cols);
  const comps = [];
  for (let i = 0; i < lista.length; i++) {
    await espera(400);
    try {
      const b = Buffer.from(await (await fetch(lista[i].thumb, { headers: UA })).arrayBuffer());
      const img = await sharp(b).resize(cel, cel, { fit: "contain", background: "#222" }).toBuffer();
      const x = (i % cols) * cel, y = Math.floor(i / cols) * (cel + 30);
      comps.push({ input: img, left: x, top: y + 30 });
      const rot = `${i} · ${lista[i].w}x${lista[i].h} · ${lista[i].licenca}`.replace(/&/g, "e").replace(/</g, "");
      comps.push({ input: Buffer.from(`<svg width="${cel}" height="30"><rect width="100%" height="100%" fill="#000"/><text x="6" y="21" font-size="19" fill="#ff0" font-family="Arial">${rot}</text></svg>`), left: x, top: y });
    } catch {}
  }
  await sharp({ create: { width: cols * cel, height: rows * (cel + 30), channels: 3, background: "#111" } }).composite(comps).jpeg({ quality: 80 }).toFile(saida + ".jpg");
  console.log(saida, lista.length);
}

async function baixar(lote) {
  const L = JSON.parse(fs.readFileSync(path.join(lote, "lote.json"), "utf8"));
  fs.mkdirSync(path.join(lote, "orig"), { recursive: true });
  for (const o of L) {
    const dest = path.join(lote, "orig", o.nome);
    if (fs.existsSync(dest)) continue;
    const arquivo = decodeURIComponent((o.pagina || "").split("File:")[1] || "");
    const alvo = arquivo ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(arquivo)}?width=3000` : o.url;
    for (let t = 0; t < 5; t++) {
      const r = await fetch(alvo, { headers: UA, redirect: "follow" });
      if (r.ok) { fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); break; }
      console.log("de novo", o.nome, r.status);
      await espera(20000 * (t + 1));
    }
    await espera(4000);
  }
  console.log("baixadas", fs.readdirSync(path.join(lote, "orig")).length, "de", L.length);
}

async function cortar(lote) {
  const L = JSON.parse(fs.readFileSync(path.join(lote, "lote.json"), "utf8"));
  const arqAjustes = path.join(lote, "ajustes.json");
  const AJ = fs.existsSync(arqAjustes) ? JSON.parse(fs.readFileSync(arqAjustes, "utf8")) : {};
  const saida = path.join(lote, "saida");
  fs.mkdirSync(saida, { recursive: true });
  const creditos = {};
  const miniaturas = [];
  for (const o of L) {
    const src = path.join(lote, "orig", o.nome);
    if (!fs.existsSync(src)) { console.log("FALTA", o.nome); continue; }
    const m = await sharp(src).rotate().metadata();
    const W = m.autoOrient?.width ?? m.width, H = m.autoOrient?.height ?? m.height;
    const a = { cx: 0.5, cy: 0.5, zoom: 1, ...(AJ[o.nome] || {}) };
    let h = Math.min(H, Math.round((W * 4) / 3));
    let w = Math.round((h * 3) / 4);
    w = Math.round(w / a.zoom); h = Math.round(h / a.zoom);
    const left = Math.max(0, Math.min(W - w, Math.round(a.cx * W - w / 2)));
    const top = Math.max(0, Math.min(H - h, Math.round(a.cy * H - h / 2)));
    const buf = await sharp(src).rotate().extract({ left, top, width: w, height: h }).jpeg({ quality: 92 }).toBuffer();
    fs.writeFileSync(path.join(saida, o.nome), buf);
    creditos[o.nome] = { autor: o.autor || "", licenca: o.licenca, original: o.pagina };
    const ampliacao = (2880 / h).toFixed(2);
    miniaturas.push({ nome: o.nome, buf: await sharp(buf).resize(270, 360).toBuffer(), info: `${w}x${h} x${ampliacao}${ampliacao > 2 ? " RECUSA" : ""}` });
  }
  fs.writeFileSync(path.join(saida, "creditos.json"), JSON.stringify(creditos, null, 1));
  const cols = 8, cw = 270, ch = 404, rows = Math.ceil(miniaturas.length / cols);
  const comps = [];
  miniaturas.forEach((t, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    const n = t.nome.replace(".jpg", "");
    comps.push({ input: t.buf, left: x, top: y + 44 });
    comps.push({ input: Buffer.from(`<svg width="${cw}" height="44"><rect width="100%" height="100%" fill="#000"/><text x="4" y="17" font-size="13" fill="#ff0" font-family="Arial">${i} ${n.slice(0, 34)}</text><text x="4" y="36" font-size="13" fill="#0ff" font-family="Arial">${n.slice(34, 60)} ${t.info}</text></svg>`), left: x, top: y });
  });
  if (comps.length) await sharp({ create: { width: cols * cw, height: rows * ch, channels: 3, background: "#111" } }).composite(comps).jpeg({ quality: 82 }).toFile(path.join(lote, "conferencia.jpg"));
  console.log("cortadas", miniaturas.length, "->", saida);
}

const [, , cmd, alvo, modo, ...resto] = process.argv;
(async () => {
  if (cmd === "folha") await folha(alvo, modo, resto);
  else if (cmd === "baixar") await baixar(alvo);
  else if (cmd === "cortar") await cortar(alvo);
  else { console.error("uso: folha | baixar | cortar (ver o cabeçalho do arquivo)"); process.exit(2); }
})().catch((e) => { console.error(e); process.exit(1); });
