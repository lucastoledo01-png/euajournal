import { describe, expect, it } from "vitest";
import { instrucaoDoMesSemAno, mesesSemAno } from "./datas-no-texto";

const OUTUBRO = new Date("2026-10-15T12:00:00Z");

describe("mês sem ano na manchete", () => {
  it("o caso de 14/10/2026: janeiro numa edição de outubro, sem o ano", () => {
    expect(mesesSemAno("Benefícios médios nos EUA sobem 3,60% em janeiro", OUTUBRO)).toEqual(["janeiro"]);
  });

  it("com o ano escrito, passa", () => {
    expect(mesesSemAno("Aposentadorias vão subir 3,6% em janeiro de 2027", OUTUBRO)).toEqual([]);
    expect(mesesSemAno("Prazo vai até março/2027", OUTUBRO)).toEqual([]);
  });

  it("o mês corrente e os que ainda vêm neste ano dispensam o ano", () => {
    expect(mesesSemAno("Fed decide juros em outubro e de novo em dezembro", OUTUBRO)).toEqual([]);
  });

  it("acento e caixa não escondem o mês", () => {
    expect(mesesSemAno("Reajuste começa em MARÇO", OUTUBRO)).toEqual(["março"]);
    expect(mesesSemAno("reajuste começa em marco", OUTUBRO)).toEqual(["março"]);
  });

  it("passado explícito deste ano não precisa de ano", () => {
    expect(mesesSemAno("Ações atingem maior nível desde meados de junho", OUTUBRO)).toEqual([]);
    expect(mesesSemAno("Inflação de março passado foi revista", OUTUBRO)).toEqual([]);
  });

  it("palavra que contém o nome do mês não conta", () => {
    expect(mesesSemAno("Maioria dos americanos aprova", OUTUBRO)).toEqual([]);
  });

  it("a instrução diz o ano e o tempo do verbo", () => {
    const t = instrucaoDoMesSemAno(["janeiro"], OUTUBRO);
    expect(t).toContain("em janeiro de 2027");
    expect(t).toContain("futuro");
  });
});
