import { describe, expect, it } from "vitest";
import { configDosReels, horaDaRodada, rodarDescoberta, type DepsDaDescoberta } from "./descoberta";
import { videosDaMidia } from "./instagram";
import { calorDoAssunto, consultasDoYoutube, ordenarVideos } from "./ordem";
import { notaPorVisualizacoes, segundosDaDuracao } from "./youtube";
import type { VideoAchado } from "./tipos";

const AGORA = Date.parse("2026-10-28T15:00:00Z");

function video(extra: Partial<VideoAchado> = {}): VideoAchado {
  return {
    fonte: "instagram",
    origemId: "1",
    permalink: "https://www.instagram.com/reel/1/",
    urlVideo: "https://cdn/1.mp4",
    autor: "perfil",
    titulo: "Trump anuncia tarifa nos EUA",
    legenda: "",
    publicadoEm: "2026-10-28T10:00:00Z",
    metricas: {},
    notaDaFonte: 50,
    ...extra,
  };
}

describe("os vídeos do Instagram", () => {
  const midia = [
    { id: "a", media_type: "VIDEO", media_url: "https://cdn/a.mp4", like_count: 9000, comments_count: 300, timestamp: "2026-10-28T12:00:00Z", caption: "Trump na Casa Branca" },
    { id: "b", media_type: "IMAGE", media_url: "https://cdn/b.jpg", like_count: 100, comments_count: 1, timestamp: "2026-10-28T12:00:00Z" },
    { id: "c", media_type: "VIDEO", like_count: 100, comments_count: 1, timestamp: "2026-10-28T12:00:00Z" },
    { id: "d", media_type: "VIDEO", media_url: "https://cdn/d.mp4", like_count: 100, comments_count: 1, timestamp: "2026-10-20T12:00:00Z" },
  ];

  it("fica só com vídeo, com arquivo, dentro da janela", () => {
    const v = videosDaMidia("perfil", midia, { agoraMs: AGORA, janelaHoras: 48 });
    expect(v.map((x) => x.origemId)).toEqual(["a"]);
    expect(v[0].urlVideo).toBe("https://cdn/a.mp4");
    expect(v[0].notaDaFonte).toBeGreaterThan(25);
  });
});

describe("o YouTube", () => {
  it("lê a duração ISO", () => {
    expect(segundosDaDuracao("PT1M5S")).toBe(65);
    expect(segundosDaDuracao("PT45S")).toBe(45);
    expect(segundosDaDuracao("xx")).toBeNull();
  });

  it("dá nota pelas visualizações por hora", () => {
    expect(notaPorVisualizacoes(100_000, 10)).toBe(80);
    expect(notaPorVisualizacoes(0, 10)).toBe(0);
  });
});

describe("a ordem", () => {
  const ranking = [{ titulo: "Trump anuncia tarifa de 50% sobre aço", calor: 80 }];

  it("tira o que está fora do nicho", () => {
    const r = ordenarVideos([video({ titulo: "Gol do Flamengo no Brasileirão", origemId: "f" }), video()], ranking);
    expect(r.foraDoNicho.map((v) => v.origemId)).toEqual(["f"]);
    expect(r.ordenados).toHaveLength(1);
  });

  it("o calor do assunto sobe a nota", () => {
    expect(calorDoAssunto(video(), ranking).calor).toBe(80);
    const r = ordenarVideos(
      [video({ origemId: "frio", titulo: "Wall Street fecha em alta nos EUA", notaDaFonte: 60 }), video({ origemId: "quente", notaDaFonte: 50 })],
      ranking,
    );
    expect(r.ordenados[0].origemId).toBe("quente");
  });

  it("as buscas juntam as histórias quentes e os termos, sem repetir, até quatro", () => {
    const c = consultasDoYoutube(["Trump", "Wall Street", "Casa Branca", "Fed"], ranking);
    expect(c.length).toBe(4);
    expect(new Set(c.map((x) => x.toLowerCase())).size).toBe(4);
  });
});

describe("o relógio e a configuração", () => {
  it("roda no primeiro quarto de cada hora das 9h às 17h", () => {
    const config = configDosReels(null);
    expect(horaDaRodada(config, new Date("2026-10-28T12:10:00Z"), "America/Sao_Paulo").naJanela).toBe(true);
    expect(horaDaRodada(config, new Date("2026-10-28T12:25:00Z"), "America/Sao_Paulo").naJanela).toBe(false);
    expect(horaDaRodada(config, new Date("2026-10-28T21:10:00Z"), "America/Sao_Paulo").naJanela).toBe(false);
  });

  it("campo torto cai no padrão daquele campo", () => {
    const c = configDosReels({ settings: { reels: { inicio: "25:00", perfis_ig: ["@NotJournal.ai", "x y"] } } });
    expect(c.inicio).toBe("09:00");
    expect(c.perfisInstagram).toEqual(["notjournal.ai"]);
  });
});

describe("a rodada", () => {
  function deps(gravados: VideoAchado[][]): DepsDaDescoberta {
    return {
      credencialDoInstagram: async () => ({}),
      perfisDeReferencia: async () => [],
      ranking: async () => [],
      chaveDoYoutube: "",
      gravar: async (v) => (gravados.push(v), { gravados: v.length, erro: null }),
    };
  }

  it("em off não faz nada", async () => {
    const g: VideoAchado[][] = [];
    const r = await rodarDescoberta({ settings: {} }, deps(g));
    expect(r.modo).toBe("off");
    expect(r.instagram).toEqual([]);
  });

  it("em dry_run não grava candidato, e avisa da chave do YouTube", async () => {
    const g: VideoAchado[][] = [];
    const r = await rodarDescoberta({ settings: { capacidades: { reels: "dry_run" } } }, deps(g));
    expect(g).toHaveLength(0);
    expect(r.avisos.join(" ")).toContain("YOUTUBE_API_KEY");
  });
});
