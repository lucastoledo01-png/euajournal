import { describe, expect, it, vi } from "vitest";
import { rodarRadar } from "./radar";
import type { NewsCandidate } from "./collector";

const cand = (url: string, publicada = "2026-10-28T15:00:00Z"): NewsCandidate => ({
  id: url, url, title: `Título ${url}`, source_name: "G1", priority: 1, published_at: publicada,
  description: "", content: "", category: "x", score: 1, dedupe_key: url, window_hours: 24,
});
const projeto = (modo?: string) => ({ id: "p1", settings: modo ? { capacidades: { radar: modo } } : {} });

describe("o radar de notícias", () => {
  it("sem a capacidade, não lê a rede nem grava", async () => {
    const coletar = vi.fn(async () => [cand("https://g1.globo.com/a")]);
    const r = await rodarRadar(projeto(), { coletar });
    expect(r.modo).toBe("off");
    expect(coletar).not.toHaveBeenCalled();
  });

  it("em enforce grava as novas como collected, sem classificação", async () => {
    const gravarNovas = vi.fn(async (_p: string, l: unknown[]) => ({ gravadas: l.length, reaproveitadas: 0, jaClassificadas: [], erros: [] }));
    const store = { gravarNovas, buscarDaJanela: vi.fn() } as never;
    const r = await rodarRadar(projeto("enforce"), {
      coletar: async () => [cand("https://g1.globo.com/a"), cand("https://folha.uol.com.br/b", "2026-10-28T15:30:00Z")],
      store,
    });
    expect(r.gravadas).toBe(2);
    expect(r.maisNova).toBe("2026-10-28T15:30:00Z");
    const linhas = gravarNovas.mock.calls[0][1] as Array<{ status: string; classificacao?: unknown }>;
    expect(linhas.every((l) => l.status === "collected" && !l.classificacao)).toBe(true);
  });

  it("em dry_run só conta o que é novo e não grava", async () => {
    const gravarNovas = vi.fn();
    const store = { gravarNovas, buscarDaJanela: vi.fn(async () => new Map([["https://g1.globo.com/a", {}]])) } as never;
    const r = await rodarRadar(projeto("dry_run"), {
      coletar: async () => [cand("https://g1.globo.com/a"), cand("https://folha.uol.com.br/b")],
      store,
    });
    expect(r.novas).toBe(1);
    expect(gravarNovas).not.toHaveBeenCalled();
  });

  it("falha de coleta vira erro no desfecho, sem lançar", async () => {
    const r = await rodarRadar(projeto("enforce"), { coletar: async () => { throw new Error("rede caiu"); }, store: {} as never });
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toContain("rede caiu");
  });
});
