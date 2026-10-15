import { describe, expect, it } from "vitest";
import sharp from "sharp";
import nextConfig from "../../../../next.config";
import { comporFotoInteira, enderecoParaBaixar, HOSTS_DA_FOTO_INTEIRA, origemPermitida, urlDaFotoInteira } from "./foto-inteira";

describe("a foto inteira do e-mail (14/10/2026)", () => {
  it("foto em pé sai inteira em 1200x720, sem corte", async () => {
    // Um retrato 3:4 com uma faixa vermelha no topo: a cabeça que o cover cortava.
    const retrato = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 40, g: 40, b: 40 } } })
      .composite([{ input: await sharp({ create: { width: 600, height: 40, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer(), left: 0, top: 0 }])
      .png()
      .toBuffer();
    const saida = await comporFotoInteira(retrato);
    const meta = await sharp(saida).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 720]);
    // O topo da foto (vermelho) aparece na primeira linha, no centro.
    const { data } = await sharp(saida).extract({ left: 600, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200);
    expect(data[1]).toBeLessThan(60);
  });

  it("só aceita https dos hosts conhecidos: não é proxy aberto", () => {
    expect(origemPermitida("https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg")).toBe(true);
    expect(origemPermitida("http://upload.wikimedia.org/x.jpg")).toBe(false);
    expect(origemPermitida("https://exemplo.com/x.jpg")).toBe(false);
    expect(urlDaFotoInteira("https://exemplo.com/x.jpg")).toBe("https://exemplo.com/x.jpg");
    expect(urlDaFotoInteira("https://images.pexels.com/photos/1/a.jpeg", "https://euajournal.com")).toBe(
      "https://euajournal.com/api/visual/foto-inteira?src=https%3A%2F%2Fimages.pexels.com%2Fphotos%2F1%2Fa.jpeg",
    );
  });

  it("baixa o Commons pela miniatura de 1600, e não o original", () => {
    expect(enderecoParaBaixar("https://upload.wikimedia.org/wikipedia/commons/0/07/Fed.jpg?utm_source=x")).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Fed.jpg?width=1600",
    );
  });

  it("todo host da rota está liberado no next/image", () => {
    const liberados = (nextConfig.images?.remotePatterns ?? []).map((p) => (typeof p === "string" ? p : String(p.hostname)));
    for (const h of HOSTS_DA_FOTO_INTEIRA) expect(liberados).toContain(h);
  });
});
