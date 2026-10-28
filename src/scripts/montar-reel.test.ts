import { describe, expect, it } from "vitest";
import { filtroDoVideo, lerCorte, linhasDoTexto } from "./montar-reel";

describe("montar-reel", () => {
  it("o corte é x:y:largura:altura, e torto é recusado", () => {
    expect(lerCorte("0:385:720:390")).toEqual({ x: 0, y: 385, largura: 720, altura: 390 });
    expect(lerCorte(undefined)).toBeNull();
    expect(() => lerCorte("1:2:3")).toThrow();
    expect(() => lerCorte("a:b:c:d")).toThrow();
  });

  it("a linha entre asteriscos é a do destaque", () => {
    expect(linhasDoTexto("UM| *DOIS* |TRÊS")).toEqual([
      { texto: "UM", destaque: false },
      { texto: "DOIS", destaque: true },
      { texto: "TRÊS", destaque: false },
    ]);
  });

  it("o filtro corta antes e depois preenche o quadro sem distorcer", () => {
    expect(filtroDoVideo({ x: 0, y: 385, largura: 720, altura: 390 }, 992, 537)).toBe(
      "crop=720:390:0:385,scale=992:537:force_original_aspect_ratio=increase,crop=992:537,setsar=1",
    );
    expect(filtroDoVideo(null, 1080, 1920)).toBe("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1");
  });
});
