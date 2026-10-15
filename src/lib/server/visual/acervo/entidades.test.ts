import { describe, expect, it } from "vitest";
import { assetDoAcervo, assuntosDaEntidade } from "./na-resolucao";
import type { EntidadeVisual } from "../tipos";
import type { ImagemDoAcervo } from "./acervo";

const entidade = (nome: string, qid: string | null): EntidadeVisual =>
  ({ nome, normalizado: nome.toLowerCase(), tipo: "person", qid, imagemPrincipal: null, categoriaCommons: null, siteOficial: null, origem: "", confianca: 90, evidencias: [] }) as EntidadeVisual;

describe("o acervo casa pelo QID (14/10/2026)", () => {
  it("o rótulo longo do Wikidata acha o arquivo de nome curto", () => {
    const chaves = assuntosDaEntidade(entidade("Luiz Inácio Lula da Silva", "Q37181"));
    expect(chaves[0]).toBe("lula");
    expect(chaves).toContain("luiz_inacio_lula_da_silva");
  });

  it("sem QID na tabela, vale o nome, como antes", () => {
    expect(assuntosDaEntidade(entidade("Donald Trump", null))).toEqual(["donald_trump"]);
  });
});

describe("a foto de terceiro no acervo leva o crédito", () => {
  const img: ImagemDoAcervo = {
    id: "1", arquivo: "pessoas-eua-donald_trump-retrato-01.jpg", grupo: "pessoas", pais: "eua", assunto: "donald_trump", detalhe: "retrato",
    tag: "pessoas/donald_trump", repositorio: "supabase_storage", caminho: "x/y.jpg", urlPublica: "https://exemplo/y.jpg", largura: 2160, altura: 2880,
    orientacao: "retrato", tom: "escuro", luminanciaDoTopo: 0.2, autor: "Daniel Torok", licenca: "domínio público",
    originalRef: "https://commons.wikimedia.org/wiki/File:Trump.jpg", rightsStatus: "verified", usos: 0, ultimoUsoEm: null,
  };

  it("autor, licença e a página do original vão para o asset", () => {
    const a = assetDoAcervo(img, entidade("Donald Trump", "Q22686"));
    expect(a.author).toBe("Daniel Torok");
    expect(a.attribution).toBe("Daniel Torok (domínio público)");
    expect(a.sourcePageUrl).toBe("https://commons.wikimedia.org/wiki/File:Trump.jpg");
  });

  it("foto própria, sem autor, segue sem atribuição", () => {
    const a = assetDoAcervo({ ...img, autor: "", originalRef: null }, null);
    expect(a.attribution).toBe("");
    expect(a.sourcePageUrl).toBe("https://exemplo/y.jpg");
  });
});
