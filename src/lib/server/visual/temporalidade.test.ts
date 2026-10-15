import { describe, expect, it } from "vitest";
import {
  analisarTemporalidade,
  contradicaoSemantica,
  dataDoAsset,
  lerContextoHistorico,
  pautaSensivelAoTempo,
  retratoNaoCentral,
} from "./temporalidade";
import type { EntidadeVisual } from "./tipos";

/**
 * Os dois erros que a fase 2 cometeu em produção.
 *
 * Uma fotografia de 1937 do Bureau of Labor Statistics ilustrando notícia
 * sobre criação de emprego. O arquivo se chama "1,500,000 drop in employment".
 * Entidade certíssima, sentido oposto.
 *
 * E retratos oficiais de chefes de Estado escolhidos para pautas em que eles
 * não eram o assunto, porque retrato de presidente é a imagem mais bem
 * catalogada do Wikimedia para qualquer coisa ligada a governo.
 */

// O caso real, com os metadados que o Commons devolve.
const FOTO_DE_1937 = {
  sourceAssetId:
    "File:1,500,000 drop in employment, Senate Committee told by government labor statistics chief. " +
    "Washington, D.C., Jan. 4. Armed with many charts and his head full of figures, Isador Lubin, Chief LCCN2016872803.jpg",
  imageContextType: "institution" as const,
  metadata: {
    data: "1937",
    descricao:
      "Title: 1,500,000 drop in employment, Senate Committee told by government labor statistics chief. " +
      "Washington, D.C., Jan. 4. Isador Lubin, Chief of the Bureau of Labor Statistics, today estimated " +
      "before the Special Senate Committee that 1,500,000 persons lost industrial jobs.",
    categorias: "Images from the Library of Congress|Harris & Ewing Collection|Bureau of Labor Statistics",
  },
};

const PAUTA_DE_EMPREGO = {
  titulo: "EUA criam 162 mil empregos, contra 53 mil esperados",
  resumo: "O relatório mensal do mercado de trabalho veio acima da projeção dos analistas.",
  entidade: { nome: "Bureau of Labor Statistics", tipo: "government_agency" } as EntidadeVisual,
};

describe("o caso da foto de 1937", () => {
  it("é recusada, e o motivo nomeia o acontecimento histórico", () => {
    const r = analisarTemporalidade(FOTO_DE_1937, PAUTA_DE_EMPREGO, 2026);

    expect(r.recusa).toBe("HISTORICAL_EVENT_MISMATCH");
    expect(r.assetDate).toBe(1937);
    expect(r.assetAgeYears).toBe(89);
    expect(r.historicalEventSpecific).toBe(true);
    expect(r.archiveImage).toBe(true);
  });

  it("a contradição de sentido também é detectada, sozinha", () => {
    const c = contradicaoSemantica(
      "EUA criam 162 mil empregos",
      "1,500,000 drop in employment, persons lost industrial jobs",
    );

    expect(c).not.toBeNull();
    expect(c!.pauta).toBe("positivo");
    expect(c!.imagem).toBe("negativo");
  });
});

describe("data da obra", () => {
  it("lê a data declarada antes de tudo", () => {
    const r = dataDoAsset({ sourceAssetId: "File:foto 2020.jpg", metadata: { data: "1998" } });
    expect(r.ano).toBe(1998);
    expect(r.origem).toBe("data declarada");
  });

  it("cai para o nome do arquivo quando não há campo", () => {
    const r = dataDoAsset({ sourceAssetId: "File:Sede do USCIS 2011.jpg", metadata: {} });
    expect(r.ano).toBe(2011);
  });

  it("sem data devolve null, e isso não é recusa", () => {
    const r = dataDoAsset({ sourceAssetId: "File:Predio.jpg", metadata: {} });
    expect(r.ano).toBeNull();
  });

  it("ignora número que não é ano", () => {
    const r = dataDoAsset({ sourceAssetId: "File:Lote 5400 documentos.jpg", metadata: {} });
    expect(r.ano).toBeNull();
  });
});

describe("imagem antiga que continua válida", () => {
  const entidadeInstitucional = { nome: "USCIS", tipo: "government_agency" } as EntidadeVisual;

  it("fachada de prédio de 2011 numa pauta de processo passa", () => {
    const r = analisarTemporalidade(
      {
        sourceAssetId: "File:USCIS headquarters building 2011.jpg",
        imageContextType: "institution",
        metadata: { data: "2011", descricao: "Headquarters of the U.S. Citizenship and Immigration Services." },
      },
      {
        titulo: "USCIS amplia prazo de renovação do EAD",
        resumo: "A agência publicou nova orientação.",
        entidade: entidadeInstitucional,
      },
      2026,
    );

    expect(r.recusa).toBeNull();
    expect(r.archiveImage).toBe(true);
    expect(r.temporalRelevanceScore).toBeGreaterThan(50);
  });

  it("retrato oficial recente da pessoa certa passa", () => {
    const juiza = { nome: "Jane Doe", tipo: "public_official" } as EntidadeVisual;
    const r = analisarTemporalidade(
      {
        sourceAssetId: "File:Official portrait of Judge Jane Doe 2023.jpg",
        imageContextType: "official_portrait",
        metadata: { data: "2023", descricao: "Official portrait of Judge Jane Doe." },
      },
      { titulo: "Juíza Jane Doe decide sobre o Diversity Visa", entidade: juiza, centralidade: 100 },
      2026,
    );

    expect(r.recusa).toBeNull();
    expect(r.historicalEventSpecific).toBe(false);
  });

  /** 14/10/2026: o Lula do começo dos anos 2000 numa pauta de decreto de 2026. */
  it("retrato com mais de cinco anos é recusado: a pessoa aparece como está hoje", () => {
    const lula = { nome: "Luiz Inácio Lula da Silva", tipo: "person" } as EntidadeVisual;
    const r = analisarTemporalidade(
      { sourceAssetId: "File:Lula 2015.jpg", imageContextType: "entity_portrait", metadata: { data: "2015" } },
      { titulo: "Lula regulamenta marco dos games", entidade: lula, centralidade: 100 },
      2026,
    );
    expect(r.recusa).toBe("TEMPORAL_MISMATCH");
    expect(r.detalhe).toContain("como está hoje");
  });

  it("imagem sem data não é recusada por falta de data", () => {
    const r = analisarTemporalidade(
      { sourceAssetId: "File:Sede.jpg", imageContextType: "institution", metadata: { descricao: "Sede da agência." } },
      { titulo: "Agência muda regra", entidade: { nome: "USCIS", tipo: "institution" } as EntidadeVisual },
      2026,
    );

    expect(r.recusa).toBeNull();
    expect(r.assetAgeYears).toBeNull();
    expect(r.temporalRelevanceScore).toBe(65);
  });
});

describe("pauta de indicador é mais dura", () => {
  it("reconhece o tipo de pauta", () => {
    expect(pautaSensivelAoTempo("EUA criam 162 mil empregos")).toBe(true);
    expect(pautaSensivelAoTempo("Dólar sobe após dado fiscal")).toBe(true);
    expect(pautaSensivelAoTempo("USCIS abre novo escritório em Miami")).toBe(false);
  });

  it("foto institucional de outro ciclo econômico é recusada por idade", () => {
    const r = analisarTemporalidade(
      {
        sourceAssetId: "File:Bureau of Labor Statistics building 1985.jpg",
        imageContextType: "institution",
        metadata: { data: "1985", descricao: "The Bureau of Labor Statistics building." },
      },
      PAUTA_DE_EMPREGO,
      2026,
    );

    expect(r.recusa).toBe("TEMPORAL_MISMATCH");
    expect(r.detalhe).toMatch(/indicador/);
  });

  it("a mesma foto numa pauta não sensível passa", () => {
    const r = analisarTemporalidade(
      {
        sourceAssetId: "File:Bureau of Labor Statistics building 1985.jpg",
        imageContextType: "institution",
        metadata: { data: "1985", descricao: "The Bureau of Labor Statistics building." },
      },
      {
        titulo: "Agência publica novo formulário",
        entidade: { nome: "Bureau of Labor Statistics", tipo: "government_agency" } as EntidadeVisual,
      },
      2026,
    );

    expect(r.recusa).toBeNull();
  });
});

describe("acontecimento histórico específico", () => {
  it("registro antigo de evento com data e quantidade é marcado", () => {
    const r = lerContextoHistorico(FOTO_DE_1937, 89);
    expect(r.eventoEspecifico).toBe(true);
    expect(r.acervo).toBe(true);
  });

  it("foto recente de alguém discursando NÃO é histórica", () => {
    const r = lerContextoHistorico(
      {
        sourceAssetId: "File:Secretary delivers remarks Jan. 5 2024.jpg",
        metadata: { descricao: "The Secretary delivers remarks at the department." },
      },
      2,
    );
    expect(r.eventoEspecifico).toBe(false);
  });

  it("fachada antiga não é acontecimento", () => {
    const r = lerContextoHistorico(
      { sourceAssetId: "File:Courthouse building 1970.jpg", metadata: { descricao: "The courthouse building." } },
      56,
    );
    expect(r.eventoEspecifico).toBe(false);
  });
});

describe("contradição semântica em outros eixos", () => {
  const casos: Array<[string, string, string]> = [
    ["Congresso aprova o projeto", "Senate rejects the bill", "aprovacao x rejeicao"],
    ["Regra entra em vigor em outubro", "Judge suspended the rule", "vigor x suspensao"],
    ["Empresa abre fábrica no Texas", "Plant closure leaves workers", "abertura x fechamento"],
    ["EUA ampliam o programa de vistos", "New restriction tightens entry", "expansao x restricao"],
  ];

  for (const [pauta, imagem, eixo] of casos) {
    it(`pega o eixo "${eixo}"`, () => {
      const c = contradicaoSemantica(pauta, imagem);
      expect(c?.eixo).toBe(eixo);
    });
  }

  it("assuntos diferentes não são contradição", () => {
    expect(contradicaoSemantica("USCIS amplia prazo do EAD", "Vista aérea de Miami")).toBeNull();
  });

  it("concordância não é contradição", () => {
    expect(contradicaoSemantica("EUA criam empregos", "Hiring surge in manufacturing")).toBeNull();
  });
});

describe("retrato de figura pública que não é o assunto", () => {
  const presidente = { nome: "Presidente da República", tipo: "politician" } as EntidadeVisual;

  it("recusa quando a pessoa só aparece na pauta", () => {
    const r = retratoNaoCentral({ imageContextType: "official_portrait" }, presidente, 20);
    expect(r.recusa).toBe("NON_CENTRAL_PUBLIC_FIGURE");
    expect(r.detalhe).toMatch(/não é o assunto/);
  });

  it("aceita quando a pessoa é o assunto", () => {
    const r = retratoNaoCentral({ imageContextType: "official_portrait" }, presidente, 100);
    expect(r.recusa).toBeNull();
  });

  it("não se aplica a foto de instituição", () => {
    const r = retratoNaoCentral({ imageContextType: "institution" }, presidente, 10);
    expect(r.recusa).toBeNull();
  });

  it("não se aplica quando a entidade não é pessoa", () => {
    const orgao = { nome: "USCIS", tipo: "government_agency" } as EntidadeVisual;
    expect(retratoNaoCentral({ imageContextType: "entity_portrait" }, orgao, 10).recusa).toBeNull();
  });

  it("sem centralidade calculada, não inventa recusa", () => {
    expect(retratoNaoCentral({ imageContextType: "official_portrait" }, presidente, undefined).recusa).toBeNull();
  });
});
