import { describe, expect, it } from "vitest";
import { candidatosEmMemoria, type CandidatoDeReel, type PreparoDoReel } from "@/lib/server/social/reels/candidatos";
import { tarefasEmMemoria } from "../tarefas-store";
import { abrirEscritaDoReel, conferirTextoDoReel, entregarEscritaDoReel, materialDoCandidato, reabrirEscritaDoReel } from "./tarefa";

const PREPARO: PreparoDoReel = {
  videoUrl: "https://x/origem.mp4",
  videoPath: "p/c1/origem.mp4",
  folhaUrl: "https://x/folha.jpg",
  original: { largura: 1280, altura: 720, segundos: 32 },
  corte: { a: { x: 0, y: 20, largura: 1280, altura: 692 }, b: { x: 440, y: 0, largura: 404, altura: 720 } },
  tarefaId: null,
};

function candidato(): CandidatoDeReel {
  return {
    id: "c1",
    projectId: "p1",
    fonte: "instagram",
    origemId: "178",
    permalink: "https://www.instagram.com/reel/x/",
    urlVideo: "https://cdn/x.mp4",
    autor: "perfil",
    titulo: "Trump anuncia tarifa de 50% sobre aço importado",
    legenda: "Trump anunciou nesta terça, na Casa Branca, tarifa de 50% sobre o aço importado.",
    publicadoEm: "2026-10-28T10:00:00Z",
    metricas: { historia: "Trump anuncia tarifa de 50% sobre aço" },
    nota: 70,
    estado: "escolhida",
    motivo: null,
    preparo: { ...PREPARO },
    texto: null,
    socialPostId: null,
    criadaEm: "2026-10-28T10:00:00Z",
    atualizadaEm: "2026-10-28T10:00:00Z",
  };
}

const BOM = {
  molde: "a",
  rotulo: "Tarifas",
  categoria: "Economia",
  linhas: ["TRUMP", "TARIFA DE 50%", "SOBRE O AÇO"],
  destaque: 1,
  legenda: {
    gancho: "Trump anunciou nesta terça uma tarifa de 50% sobre o aço importado.",
    paragrafos: ["O anúncio foi feito na Casa Branca."],
  },
};

describe("o texto do Reel", () => {
  const material = materialDoCandidato(candidato(), PREPARO);

  it("aceita o texto ancorado no material, com o corte proposto do molde", () => {
    const r = conferirTextoDoReel(BOM, material);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto.rotulo).toBe("TARIFAS");
    expect(r.texto.corte).toEqual(PREPARO.corte.a);
    expect(r.texto.manchete).toBe("TRUMP TARIFA DE 50% SOBRE O AÇO");
  });

  it("recusa número que o material não tem", () => {
    const r = conferirTextoDoReel({ ...BOM, linhas: ["TRUMP", "TARIFA DE 75%", "SOBRE O AÇO"] }, material);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivos.join(" ")).toContain("SEM_LASTRO");
  });

  it("tira o travessão sozinho e recusa corte fora do vídeo", () => {
    const r = conferirTextoDoReel(
      { ...BOM, legenda: { gancho: "Trump anunciou nesta terça uma tarifa de 50% — sobre o aço importado.", paragrafos: [] }, corte: { x: 1000, y: 0, largura: 400, altura: 300 } },
      material,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // `limparVicios` já troca o travessão; a conferência é a rede de baixo.
    expect(r.motivos.some((m) => m.startsWith("[TRAVESSAO]"))).toBe(false);
    expect(r.motivos.some((m) => m.startsWith("[CORTE]"))).toBe(true);
  });
});

describe("o laço da tarefa", () => {
  it("aceita, grava o texto no candidato, e a reprovação do painel reabre com o motivo", async () => {
    const tarefas = tarefasEmMemoria();
    const candidatos = candidatosEmMemoria([candidato()]);
    const c = candidatos.todos[0];
    const t = await abrirEscritaDoReel("p1", "2026-10-28", materialDoCandidato(c, PREPARO), tarefas);
    c.preparo = { ...PREPARO, tarefaId: t.id };

    const r = await entregarEscritaDoReel(t, BOM, "claude", { tarefas, candidatos });
    expect(r.desfecho).toBe("pronto");
    expect(c.texto?.molde).toBe("a");

    c.estado = "pronta";
    c.socialPostId = "post-1";
    const reaberta = await reabrirEscritaDoReel(c, "a linha do meio está errada", { tarefas, candidatos });
    expect(reaberta?.estado).toBe("reparar");
    expect(String(reaberta?.instrucao.user)).toContain("a linha do meio está errada");
    expect(c.estado).toBe("escolhida");
    expect(c.texto).toBeNull();
    expect(c.socialPostId).toBe("post-1");
  });

  it("descarta depois do teto de reparos, e o candidato vai junto", async () => {
    const tarefas = tarefasEmMemoria();
    const candidatos = candidatosEmMemoria([candidato()]);
    let t = await abrirEscritaDoReel("p1", "2026-10-28", materialDoCandidato(candidatos.todos[0], PREPARO), tarefas);
    const ruim = { ...BOM, linhas: ["TRUMP", "TARIFA DE 75%", "AÇO"] };
    const env = { MAX_SOCIAL_REPAIR_ATTEMPTS: "2" };
    let r = await entregarEscritaDoReel(t, ruim, "claude", { tarefas, candidatos, env });
    expect(r.desfecho).toBe("reparar");
    t = (await tarefas.porId(t.id))!;
    r = await entregarEscritaDoReel(t, ruim, "claude", { tarefas, candidatos, env });
    expect(r.desfecho).toBe("reparar");
    t = (await tarefas.porId(t.id))!;
    r = await entregarEscritaDoReel(t, ruim, "claude", { tarefas, candidatos, env });
    expect(r.desfecho).toBe("descartado");
    expect(candidatos.todos[0].estado).toBe("descartada");
  });
});

describe("o molde do vídeo vertical", () => {
  it("vídeo vertical vai sempre para o molde B, com o corte do B", () => {
    const vertical = {
      ...PREPARO,
      original: { largura: 720, altura: 1280, segundos: 32 },
      corte: { a: { x: 0, y: 300, largura: 720, altura: 720 }, b: PREPARO.corte.b },
    };
    const material = materialDoCandidato(candidato(), vertical);
    const r = conferirTextoDoReel(BOM, material);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto.molde).toBe("b");
    expect(r.texto.corte).toEqual(PREPARO.corte.b);
  });

  it("vertical que embrulha um vídeo deitado fica no A, com o corte do meio", () => {
    const embrulho = {
      ...PREPARO,
      original: { largura: 720, altura: 1280, segundos: 28 },
      corte: { a: { x: 24, y: 540, largura: 672, altura: 358 }, b: null },
    };
    const r = conferirTextoDoReel(BOM, materialDoCandidato(candidato(), embrulho));
    expect(r.ok && r.texto.molde).toBe("a");
    expect(r.ok && r.texto.corte).toEqual(embrulho.corte.a);
  });

  it("vídeo horizontal pode ficar no A", () => {
    const r = conferirTextoDoReel(BOM, materialDoCandidato(candidato(), PREPARO));
    expect(r.ok && r.texto.molde).toBe("a");
  });
});
