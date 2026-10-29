import { describe, expect, it } from "vitest";
import { acoesDaPeca, filtroDaSituacao, situacaoDaPeca } from "./situacao";

/*
 * Os dois cartões incoerentes da fila de 06/10/2026: a matéria das 12:00
 * "aprovada" com só "Cancelar peça", já no ar; e a das 06:07 "aguardando",
 * também no ar. Com a fila em ensaio as duas saíram no horário, como deviam.
 */

describe("a situação junta a fila com a tabela da peça", () => {
  it("no ar vence o estado da fila", () => {
    expect(situacaoDaPeca({ estado: "aprovada" }, true)).toBe("publicada");
    expect(situacaoDaPeca({ estado: "aguardando" }, true)).toBe("publicada");
    expect(situacaoDaPeca({ estado: "cancelada" }, true)).toBe("publicada");
  });

  it("fora do ar, o estado da fila decide", () => {
    expect(situacaoDaPeca({ estado: "aguardando" }, false)).toBe("aguardando");
    expect(situacaoDaPeca({ estado: "aprovada" }, false)).toBe("aprovada");
    expect(situacaoDaPeca({ estado: "refazendo" }, false)).toBe("refazendo");
    expect(situacaoDaPeca({ estado: "descartada" }, false)).toBe("fora");
    expect(situacaoDaPeca({ estado: "cancelada" }, false)).toBe("fora");
  });

  it("os quatro filtros cobrem todas as situações", () => {
    expect(filtroDaSituacao("aguardando")).toBe("aguardando");
    expect(filtroDaSituacao("aprovada")).toBe("aprovadas");
    expect(filtroDaSituacao("refazendo")).toBe("aguardando");
    expect(filtroDaSituacao("reprovada")).toBe("reprovadas");
    expect(filtroDaSituacao("fora")).toBe("reprovadas");
    expect(filtroDaSituacao("publicada")).toBe("publicadas");
  });
});

describe("os botões espelham o que o servidor aceita", () => {
  it("a matéria aprovada que já está no ar não oferece cancelar (o cartão incoerente de 06/10)", () => {
    const a = acoesDaPeca({ estado: "aprovada", liberadoEm: null }, "publicada", "dry_run");
    expect(a).toMatchObject({ aprovar: false, reprovar: false, editar: false, cancelar: false });
  });

  it("no ensaio, a peça no ar ainda aguardando pode ser aprovada ou reprovada, para o canal aprender, e nunca editada", () => {
    const a = acoesDaPeca({ estado: "aguardando", liberadoEm: null }, "publicada", "dry_run");
    expect(a).toMatchObject({ aprovar: true, reprovar: true, editar: false, cancelar: false });
    expect(a.nota).toMatch(/Já está no ar/);
  });

  it("valendo, peça no ar não se decide mais", () => {
    expect(acoesDaPeca({ estado: "aguardando", liberadoEm: null }, "publicada", "enforce")).toMatchObject({ aprovar: false, reprovar: false });
  });

  it("aguardando tem tudo; aprovada não liberada pode voltar atrás; liberada, nada", () => {
    expect(acoesDaPeca({ estado: "aguardando", liberadoEm: null }, "aguardando", "enforce")).toMatchObject({
      aprovar: true,
      reprovar: true,
      editar: true,
      cancelar: true,
    });
    expect(acoesDaPeca({ estado: "aprovada", liberadoEm: null }, "aprovada", "enforce")).toMatchObject({
      aprovar: false,
      reprovar: true,
      editar: true,
      cancelar: true,
    });
    expect(acoesDaPeca({ estado: "aprovada", liberadoEm: "2026-10-06T09:07:00Z" }, "aprovada", "enforce")).toMatchObject({
      reprovar: false,
      cancelar: false,
    });
  });

  it("refazendo só cancela; fora do ar, nada", () => {
    expect(acoesDaPeca({ estado: "refazendo", liberadoEm: null }, "refazendo", "enforce")).toMatchObject({ aprovar: false, cancelar: true });
    expect(acoesDaPeca({ estado: "cancelada", liberadoEm: null }, "fora", "enforce")).toMatchObject({ cancelar: false, reprovar: false });
  });
});
