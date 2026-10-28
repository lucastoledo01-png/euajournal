import { describe, expect, it, vi } from "vitest";
import { hashDoPostDaLinha } from "@/lib/server/aprovacao/hash";
import { lerCargaV2, type LinhaDePost } from "@/lib/server/social/instagram/carga-v2";
import { montarContainer } from "@/lib/server/social/instagram/worker-service";
import { creditoDoReel, linhaDoReel, type ReelParaGravar } from "./gravar";

const SHA = "a".repeat(64);

function reel(extra: Partial<ReelParaGravar> = {}): ReelParaGravar {
  return {
    data: "2026-10-29",
    candidato: { id: "c1", fonte: "instagram", origemId: "178", autor: "fulano", permalink: "https://www.instagram.com/reel/x/" },
    manchete: "Trump anuncia tarifa de 50% sobre aço importado",
    legenda: "Trump anunciou nesta terça uma tarifa de 50% sobre o aço importado.\n\nO anúncio foi feito na Casa Branca.",
    molde: "a",
    desenho: { rotulo: "TARIFAS", linhas: ["TRUMP", "TARIFA", "AÇO"] },
    video: {
      url: "https://x.supabase.co/storage/v1/object/public/reels/p/reel.mp4",
      path: "p/reel.mp4",
      filename: "reel.mp4",
      mime: "video/mp4",
      sha256: SHA,
      bytes: 9_000_000,
      largura: 1080,
      altura: 1920,
      otimizado: false,
    },
    folhaUrl: null,
    ...extra,
  };
}

const VAGA = { quandoIso: "2026-10-29T14:22:00.000Z", slot: "2026-10-29-reel-11:22" };

describe("o Reel gravado", () => {
  it("é lido pelo worker como reel, sem a regra da foto", () => {
    const linha = linhaDoReel({ id: "p1" }, reel(), VAGA, "scheduled") as LinhaDePost;
    const carga = lerCargaV2(linha);
    expect(carga.ok).toBe(true);
    if (!carga.ok) return;
    expect(carga.carga.formato).toBe("reel");
    expect(carga.carga.artefatos).toHaveLength(1);
    expect(carga.carga.artefatos[0].mime).toBe("video/mp4");
  });

  it("fecha a legenda com o Siga e o crédito do vídeo na última linha", () => {
    const linha = linhaDoReel({ id: "p1" }, reel(), VAGA, "draft");
    const linhas = String(linha.caption).split("\n");
    expect(linhas.at(-2)).toBe("Siga @eua.journal");
    expect(linhas.at(-1)).toBe("Vídeo: @fulano (Instagram)");
  });

  it("tem hash de aprovação pelo SHA-256 do MP4", () => {
    const linha = linhaDoReel({ id: "p1" }, reel(), VAGA, "draft");
    expect(hashDoPostDaLinha(linha)).toMatch(/^[0-9a-f]{64}$/);
    const outro = linhaDoReel({ id: "p1" }, reel({ video: { ...reel().video, sha256: "b".repeat(64) } }), VAGA, "draft");
    expect(hashDoPostDaLinha(outro)).not.toBe(hashDoPostDaLinha(linha));
  });

  it("recusa artefato que não é MP4", () => {
    const linha = linhaDoReel({ id: "p1" }, reel({ video: { ...reel().video, mime: "image/png" } }), VAGA, "scheduled");
    const carga = lerCargaV2(linha as LinhaDePost);
    expect(carga.ok).toBe(false);
  });

  it("crédito sem autor não vira linha", () => {
    expect(creditoDoReel("youtube", null)).toBe("");
    expect(creditoDoReel("youtube", "Canal X")).toBe("Vídeo: Canal X (YouTube)");
    expect(creditoDoReel("instagram", "@fulano")).toBe("Vídeo: @fulano (Instagram)");
  });
});

describe("o container do Reel", () => {
  const env = { INSTAGRAM_ACCOUNT_ID: "1", INSTAGRAM_ACCESS_TOKEN: "t" };

  it("manda media_type=REELS com video_url, e nunca image_url", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "cont-1" }), { status: 200 }));
    const id = await montarContainer(["https://x/reel.mp4"], "legenda", env, fetcher as unknown as typeof fetch, undefined, true);
    expect(id).toBe("cont-1");
    const corpo = new URLSearchParams(String(((fetcher.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect(corpo.get("media_type")).toBe("REELS");
    expect(corpo.get("video_url")).toBe("https://x/reel.mp4");
    expect(corpo.get("share_to_feed")).toBe("true");
    expect(corpo.has("image_url")).toBe(false);
  });

  it("a imagem única continua com image_url", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "cont-2" }), { status: 200 }));
    await montarContainer(["https://x/a.png"], "legenda", env, fetcher as unknown as typeof fetch);
    const corpo = new URLSearchParams(String(((fetcher.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect(corpo.get("image_url")).toBe("https://x/a.png");
    expect(corpo.has("media_type")).toBe(false);
  });
});
