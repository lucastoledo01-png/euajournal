import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Uso: node producao-manual/_modelo-reel-foto/gerar_reels.mjs <pasta-com-reels.json> [id]
const RAIZ=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const D=path.resolve(process.argv[2]);const cfg=JSON.parse(readFileSync(path.join(D,"reels.json"),"utf8"));
const LOGO=path.join(RAIZ,"public/marca/eua-instagram-fundo-escuro.png");
const TRILHA=path.resolve(D,cfg.trilha);const F=path.resolve(D,cfg.fotos);
const R=cfg.reels;
const b=await chromium.launch();
for(const id of (process.argv[3]?[process.argv[3]]:Object.keys(R))){
 const c=R[id];
 if(c.bolha){execFileSync("ffmpeg",["-v","error","-y","-i",path.resolve(F,c.bolha.foto),"-vf",`crop=${c.bolha.crop},scale=600:600:flags=lanczos`,"-frames:v","1",`${D}/bolha_${id}.jpg`]);}
 const html=`<!doctype html><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap" rel="stylesheet"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{width:1080px;height:1920px;position:relative;overflow:hidden;font-family:Inter}
#top{position:absolute;left:0;right:0;top:0;height:560px;background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,0))}
#bot{position:absolute;left:0;right:0;top:800px;height:1120px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.8) 38%,rgba(0,0,0,.6) 70%,rgba(0,0,0,.25))}
#logo{position:absolute;left:100px;top:312px;width:210px}
#bolha{position:absolute;width:300px;height:300px;border-radius:50%;border:7px solid #fff;object-fit:cover;box-shadow:0 6px 30px rgba(0,0,0,.35)}
#blk{position:absolute;left:100px;width:840px;bottom:530px}
#cat{display:inline-block;color:#fff;font-weight:800;font-size:24px;letter-spacing:.14em;margin-bottom:22px}
#hd{color:#fff;font-weight:800;font-size:66px;line-height:1.1;text-transform:uppercase;letter-spacing:-.01em}
#hd em{font-style:normal;color:#ff3b53}
#rod{display:flex;justify-content:space-between;margin-top:30px;color:rgba(255,255,255,.78);font-weight:500;font-size:25px}
</style><div id=top></div><div id=bot></div><img id=logo src="file://${LOGO}">${c.bolha?`<img id=bolha src="file://${D}/bolha_${id}.jpg" style="left:${c.bolha.x??640}px;top:${c.bolha.y??300}px">`:""}
<div id=blk><div id=cat>${c.cat}</div><div id=hd>${c.h}</div></div>`;
 writeFileSync(`${D}/o_${id}.html`,html);
 const p=await b.newPage({viewport:{width:1080,height:1920}});
 await p.goto(`file://${D}/o_${id}.html`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
 // o título não pode passar da largura segura nem de 5 linhas
 const n=await p.evaluate(()=>Math.round(document.getElementById('hd').getBoundingClientRect().height/72));
 console.log(id,"linhas ~",n);
 await p.screenshot({path:`${D}/o_${id}.png`,omitBackground:true});await p.close();
 const dur=10,fps=30,fr=dur*fps;
 execFileSync("ffmpeg",["-v","error","-y","-i",`${F}/${c.foto}`,"-i",`${D}/o_${id}.png`,"-i",TRILHA,
  "-filter_complex",`[0:v]crop=${c.crop},scale=2160:3840:flags=lanczos,zoompan=z='1+${c.zoom??0.07}*on/${fr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1080x1920:fps=${fps},format=yuv420p[v];[v][1:v]overlay=0:0,format=yuv420p[o];[2:a]volume=0.55,afade=t=in:d=0.4,afade=t=out:st=9:d=1[a]`,
  "-map","[o]","-map","[a]","-t",String(dur),"-c:v","libx264","-crf","18","-preset","medium","-c:a","aac","-b:a","160k","-movflags","+faststart",`${D}/reel_${id}.mp4`]);
 console.log("ok",id);
}
await b.close();
