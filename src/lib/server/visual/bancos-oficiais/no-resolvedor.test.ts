import { describe, expect, it, vi } from "vitest";
import { buscarSegundaFoto, resolveVisualAsset, type Conferente } from "../resolver";
import type { DefinicaoDoBanco, FotoDoBanco } from "./tipos";

/**
 * Os bancos oficiais dentro do resolvedor (06/10/2026): pela entidade, antes
 * do Commons na ordem de conferência, com as mesmas barreiras, e sem nunca
 * derrubar a pauta.
 */

const ENV = { PEXELS_API_KEY: "chave-de-teste" };

/** Wikidata devolve Flávio Bolsonaro (Q5), o Commons uma foto de 2023 dele. */
function mundo() {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);
    if (url.includes("wbsearchentities")) {
      return new Response(JSON.stringify({ search: [{ id: "Q1", label: "Flávio Bolsonaro", description: "político brasileiro" }] }));
    }
    if (url.includes("wbgetentities")) {
      return new Response(
        JSON.stringify({
          entities: {
            Q1: {
              claims: {
                P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
                // O retrato de referência (06/10/2026): sem ele, nenhuma foto do Flávio teria a identidade conferida.
                P18: [{ mainsnak: { datavalue: { value: "Flávio Bolsonaro 2023.jpg" } } }],
              },
            },
          },
        }),
      );
    }
    if (url.includes("commons.wikimedia.org")) {
      return new Response(
        JSON.stringify({
          query: {
            pages: {
              "1": {
                title: "File:Flávio Bolsonaro 2023.jpg",
                imageinfo: [
                  {
                    url: "https://upload.wikimedia.org/Flavio_Bolsonaro_2023.jpg",
                    descriptionurl: "https://commons.wikimedia.org/wiki/File:Flavio_Bolsonaro_2023.jpg",
                    width: 2400,
                    height: 1600,
                    mime: "image/jpeg",
                    extmetadata: {
                      LicenseShortName: { value: "CC BY 2.0" },
                      Artist: { value: "Alguém" },
                      ImageDescription: { value: "Flávio Bolsonaro em 2023" },
                      DateTimeOriginal: { value: "2023-03-01" },
                    },
                  },
                ],
              },
            },
          },
        }),
      );
    }
    if (url.includes("api.pexels.com")) return new Response(JSON.stringify({ photos: [] }));
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

const PAUTA = {
  storyId: "s-flavio",
  titulo: "Flávio Bolsonaro lança pré-candidatura e fala em unir a direita",
  resumo: "O senador Flávio Bolsonaro anunciou a pré-candidatura.",
  categoria: "brasil",
  classificacao: { atores: ["Flávio Bolsonaro"], lugares: ["Brasília"], acontecimento: ["pré-candidatura"], pais: "Brasil" },
};

function foto(id: string, data: string): FotoDoBanco {
  return {
    banco: "camara",
    id,
    titulo: "Sessão do Congresso Nacional",
    descricao: `Senador Flávio Bolsonaro (PL - RJ) durante a sessão de ${data}.`,
    imageUrl: `https://www.camara.leg.br/internet/bancoimagem/banco/${id}.jpg`,
    paginaUrl: "https://www.camara.leg.br/banco-imagens/pesquisar?buscar=Fl%C3%A1vio%20Bolsonaro",
    autor: "Kayo Magalhães",
    data,
    largura: 3244,
    altura: 2000,
    licenca: "CC BY (Câmara dos Deputados)",
    licencaUrl: "https://www.camara.leg.br/banco-imagens/pesquisar",
  };
}

const camaraFalsa = (fotos: FotoDoBanco[] | Error): DefinicaoDoBanco => ({
  id: "camara",
  nome: "Câmara dos Deputados",
  pais: "BR",
  hostsDeImagem: ["www.camara.leg.br"],
  buscar: vi.fn(async () => {
    if (fotos instanceof Error) throw fotos;
    return { fotos, nota: `${fotos.length} foto(s)` };
  }),
});

const aprovaTudo: Conferente = async () => ({
  aprovada: true,
  descricao: "o senador discursando",
  motivo: "é a pessoa da manchete",
  paisAparente: "Brasil",
  confianca: 95,
  falhou: false,
});

describe("bancos oficiais no resolvedor", () => {
  it("ligados: a foto atual do banco oficial ganha da foto de 2023 do Commons, com o crédito curto", async () => {
    const banco = camaraFalsa([foto("velha", "2025-03-10"), foto("nova", "2026-05-21")]);
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: mundo(),
      somenteLeitura: true,
      conferenciaVisual: aprovaTudo,
      bancosOficiais: [banco],
    });
    expect(r.status).toBe("SELECTED");
    expect(r.caminho).toBe("entidade");
    expect(r.asset?.source).toBe("banco_oficial");
    expect(r.asset?.imageUrl).toContain("nova");
    expect(r.asset?.attribution).toBe("Foto: Kayo Magalhães/Câmara dos Deputados");
    expect(r.legenda).toBe("Foto: Kayo Magalhães/Câmara dos Deputados");
    expect(r.asset?.metadata).toMatchObject({ banco: "camara", autor: "Kayo Magalhães", data: "2026-05-21" });
    /*
     * Com a pessoa na manchete (06/10/2026, "imagem certeira"), a vice não sai
     * daqui: a bolha é procurada na vez dela por `buscarSegundaFoto`, com a
     * identidade conferida contra o retrato de referência (teste abaixo).
     */
    expect(r.assetSecundario).toBeNull();
    const prova = r.asset?.metadata.verificacao as { tipo: string; como: string };
    expect(prova.tipo).toBe("identidade");
    expect(prova.como).toContain("retrato de referência");
    expect(r.fontesConsultadas.some((f) => f.fonte === "banco_oficial")).toBe(true);
  });

  it("desligados: nenhum banco é consultado e a resolução é a de antes", async () => {
    const banco = camaraFalsa([foto("nova", "2026-05-21")]);
    const r = await resolveVisualAsset(PAUTA, { env: ENV, fetcher: mundo(), somenteLeitura: true, conferenciaVisual: aprovaTudo });
    expect(banco.buscar).not.toHaveBeenCalled();
    expect(r.asset?.source).toBe("wikimedia_commons");
    expect(r.fontesConsultadas.some((f) => f.fonte === "banco_oficial")).toBe(false);
  });

  it("banco fora do ar: o Commons segue, e a falha fica anotada", async () => {
    const banco = camaraFalsa(new Error("www.camara.leg.br respondeu 503"));
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: mundo(),
      somenteLeitura: true,
      conferenciaVisual: aprovaTudo,
      bancosOficiais: [banco],
    });
    expect(r.status).toBe("SELECTED");
    expect(r.asset?.source).toBe("wikimedia_commons");
    const nota = r.fontesConsultadas.find((f) => f.fonte === "banco_oficial")?.nota ?? "";
    expect(nota).toContain("falhou (www.camara.leg.br respondeu 503)");
  });

  it("a foto do banco recusada pela conferência visual passa a vez para o Commons", async () => {
    const banco = camaraFalsa([foto("nova", "2026-05-21")]);
    // A identidade confere (é o Flávio); a conferência de sempre recusa o plano aberto.
    const recusaOBanco: Conferente = async (asset, ctx) => ({
      ...(await aprovaTudo(asset, { titulo: "" })),
      aprovada: Boolean(ctx.papel) || !asset.imageUrl.includes("camara.leg.br"),
      motivo: "plenário cheio, a pessoa não é o assunto",
    });
    const r = await resolveVisualAsset(PAUTA, {
      env: ENV,
      fetcher: mundo(),
      somenteLeitura: true,
      conferenciaVisual: recusaOBanco,
      bancosOficiais: [banco],
    });
    expect(r.asset?.source).toBe("wikimedia_commons");
    expect(r.recusados.some((x) => x.origem === "banco_oficial" && x.motivo === "VISUAL_CHECK_FAILED")).toBe(true);
  });

  it("a busca extra da bolha também pergunta aos bancos oficiais", async () => {
    const banco = camaraFalsa([foto("bolha", "2026-05-21")]);
    const r = await buscarSegundaFoto(
      PAUTA,
      { imageUrl: "https://upload.wikimedia.org/Flavio_Bolsonaro_2023.jpg" },
      {
        nome: "Flávio Bolsonaro",
        normalizado: "flavio bolsonaro",
        tipo: "politician",
        qid: "Q1",
        // A bolha de pessoa exige o retrato de referência (06/10/2026).
        imagemPrincipal: "Flávio Bolsonaro 2023.jpg",
        categoriaCommons: null,
        siteOficial: null,
        origem: "teste",
        confianca: 90,
        evidencias: [],
      },
      { env: ENV, fetcher: mundo(), conferenciaVisual: aprovaTudo, bancosOficiais: [banco] },
    );
    expect(r.asset?.source).toBe("banco_oficial");
    expect(r.nota).toContain("bancos oficiais: 1");
  });
});
