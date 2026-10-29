import { describe, expect, it } from "vitest";
import { disfarcarPalavrasPesadas } from "./palavras-pesadas";
import { legendaDoInstagram } from "./legenda-final";

describe("as palavras pesadas no Instagram", () => {
  it("disfarça as da lista, com flexão e caixa, e deixa o resto", () => {
    expect(disfarcarPalavrasPesadas("Governo diz que houve 10 assassinatos de apoiadores")).toBe(
      "Governo diz que houve 10 4ss4ss1n4t0s de apoiadores",
    );
    expect(disfarcarPalavrasPesadas("HOMICÍDIO E ESTUPRO")).toBe("H0M1C1D10 E 3STUPR0");
    expect(disfarcarPalavrasPesadas("A Câmara aprovou o projeto executado ontem")).toBe("A Câmara aprovou o projeto executado ontem");
  });

  it("é idempotente", () => {
    const uma = disfarcarPalavrasPesadas("o assassino foi preso");
    expect(disfarcarPalavrasPesadas(uma)).toBe(uma);
  });

  it("a legenda que vai ao Instagram sai disfarçada", () => {
    expect(legendaDoInstagram("Dez assassinatos foram confirmados.")).toContain("4ss4ss1n4t0s");
  });
});
