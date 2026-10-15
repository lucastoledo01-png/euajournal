import { describe, expect, it } from "vitest";
import { ABERTURAS_NEUTRAS, molduraNeutra } from "./pipeline";
import { EditionContentSchema } from "./schemas";

const historia = (title: string) => ({ title }) as never;

describe("moldura neutra da edição", () => {
  it("abre com uma frase leve, sem fato e sem repetir as pautas do índice (14/10/2026)", () => {
    const m = molduraNeutra({ stories: [historia("Fed corta juros."), historia("Emprego sobe nos EUA")] });
    expect(ABERTURAS_NEUTRAS).toContain(m.intro);
    expect(m.intro).not.toContain("Fed corta juros");
    for (const a of ABERTURAS_NEUTRAS) {
      expect(a.length).toBeGreaterThanOrEqual(40);
      expect(a).not.toMatch(/\u2014/);
    }
    expect(m.quick_bits).toEqual([]);
    expect(m.closing.length).toBeGreaterThanOrEqual(10);
  });

  it("cabe nos limites do schema da edição, mesmo com títulos curtos ou longos", () => {
    const curtos = molduraNeutra({ stories: [historia("A"), historia("B")] });
    expect(EditionContentSchema.shape.intro.safeParse(curtos.intro).success).toBe(true);
    const longos = molduraNeutra({ stories: Array.from({ length: 6 }, () => historia("x".repeat(200))) });
    expect(EditionContentSchema.shape.intro.safeParse(longos.intro).success).toBe(true);
    expect(EditionContentSchema.shape.closing.safeParse(longos.closing).success).toBe(true);
  });
});
