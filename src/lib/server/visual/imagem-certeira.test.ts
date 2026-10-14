import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { resolveVisualAsset, type Conferente, type PautaParaImagem } from "./resolver";
import { protagonistasDaManchete, resolverProtagonista } from "./protagonista";
import { textoLidoTemAMarca } from "./verificacao-do-protagonista";
import { comporCartaoDaMarca, FUNDO_CLARO, LADO_DO_CARTAO, arquivoDeLogotipoValido, urlDoCartaoDaMarca } from "./cartao-da-marca";
import { dadosDaMarca, valoresVigentes } from "./wikidata";
import { escolherEntidadeVisual } from "./entidade-visual";
import { MOTIVOS_DE_RECUSA, type VerificacaoDoProtagonista } from "./tipos";

/**
 * "A gente precisa ser 100% certeiro" (o dono, revendo a fila de 07/10/2026).
 *
 * Os casos são os da fila REAL daquele dia, com os títulos, as manchetes e os
 * atores que a classificação gravou. Ver "A foto do casamento na pauta do
 * Caiado" em `aprendizados-e-incidentes.md` e "O protagonista da manchete" em
 * `decisoes.md`.
 */

const CAIADO = {
  fonte: "Caiado oficializa apoio a Flávio no segundo turno em evento em Goiânia",
  manchete: "Ronaldo Caiado oficializa apoio a Flávio Bolsonaro no segundo turno em Goiânia",
  atores: [
    "Ronaldo Caiado",
    "Flávio Bolsonaro",
    "Tarcísio de Freitas",
    "Rogério Marinho",
    "Wilder Morais",
    "Daniel Vilela",
    "Gracinha Caiado",
    "Gustavo Gayer",
  ],
};
const ANTHROPIC = {
  fonte: "Anthropic expands Claude Startups program in bid to snag founders and fast-growing companies",
  manchete: "Anthropic amplia programa para startups com até US$ 45.000 em descontos e créditos",
  atores: ["Anthropic", "Claude", "OpenAI", "Google", "Beth Robertson"],
};
const ANDURIL = {
  fonte: "Anduril lands $2.9 billion Navy submarine shipyard contract days after Luckey joins Pentagon weapons group",
  manchete: "Anduril consegue contrato de até US$ 2,9 bilhões com a U.S. Navy para submarinos",
  atores: ["Anduril", "U.S. Navy", "Pentagon", "Department of Defense", "Palmer Luckey", "Newt Gingrich", "Elon Musk", "Chris Brose", "Emil Michael"],
};
const BRET = {
  fonte: "Meta joins with group of companies to tame ‘chaos’ of doing business with AI bots",
  manchete: "Bret Taylor: “É uma espécie de caos até que tal padrão exista”",
  atores: ["Meta", "Walmart", "Stripe", "OpenAI", "Sierra", "Bret Taylor", "Amazon"],
};

describe("o protagonista sai da manchete, e não da lista de atores", () => {
  it("Caiado: o Ronaldo, e não a Gracinha, mesmo com só o sobrenome no título da fonte", () => {
    const p = protagonistasDaManchete([undefined, CAIADO.fonte], CAIADO.atores);
    expect(p.map((x) => x.nome)).toEqual(["Ronaldo Caiado", "Flávio Bolsonaro"]);
    expect(p[0].forma).toBe("parte do nome");
  });

  it("Caiado: na manchete da peça, nome completo", () => {
    const p = protagonistasDaManchete([CAIADO.manchete, CAIADO.fonte], CAIADO.atores);
    expect(p[0]).toMatchObject({ nome: "Ronaldo Caiado", titulo: 0, forma: "nome completo" });
    expect(p.map((x) => x.nome)).not.toContain("Gracinha Caiado");
  });

  it("Anthropic vem antes de Claude", () => {
    expect(protagonistasDaManchete([undefined, ANTHROPIC.fonte], ANTHROPIC.atores).map((x) => x.nome)).toEqual(["Anthropic", "Claude"]);
  });

  it("Anduril é o primeiro, embora seja o nome mais curto da lista", () => {
    const p = protagonistasDaManchete([ANDURIL.manchete, ANDURIL.fonte], ANDURIL.atores);
    expect(p[0].nome).toBe("Anduril");
  });

  it("Bret Taylor: a manchete da peça vence o título da fonte, que fala da Meta", () => {
    const p = protagonistasDaManchete([BRET.manchete, BRET.fonte], BRET.atores);
    expect(p[0].nome).toBe("Bret Taylor");
    expect(p.map((x) => x.nome)).toContain("Meta");
  });

  it("Garotinho e Ruas: os dois são protagonistas, na ordem da manchete", () => {
    const p = protagonistasDaManchete(
      ["Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ"],
      ["MPE", "TSE", "Anthony Garotinho", "Douglas Ruas", "Eduardo Paes"],
    );
    expect(p.map((x) => x.nome)).toEqual(["Douglas Ruas", "Anthony Garotinho"]);
  });

  it("país e veículo não são protagonistas", () => {
    expect(protagonistasDaManchete(["EUA e Brasil fecham acordo, diz CNN"], ["EUA", "Brasil", "CNN"])).toEqual([]);
  });

  it("nome que o Wikidata resolve como lugar passa a vez ao seguinte", async () => {
    const resolver = vi.fn(async (nome: string) =>
      nome === "Claude"
        ? { entidade: entidade("Claude", "place", "Q979959"), nota: "cidade do Texas" }
        : { entidade: entidade("Anthropic", "company", "Q116758847"), nota: "empresa" },
    );
    const r = await resolverProtagonista(
      { titulo: "Claude da Anthropic ganha programa", atores: ["Claude", "Anthropic"] },
      { resolver: resolver as never },
    );
    expect(r.entidade?.nome).toBe("Anthropic");
  });

  it("Wikidata fora do ar: a manchete nomeia alguém e não se sabe quem, então nada de cena", async () => {
    const resolver = vi.fn(async () => ({ entidade: null, nota: "Wikidata falhou: fetch failed" }));
    const r = await resolverProtagonista({ titulo: CAIADO.fonte, atores: CAIADO.atores }, { resolver: resolver as never });
    expect(r.indeterminado).toBe(true);
  });
});

describe("a escolha da entidade não corta mais o protagonista curto", () => {
  it("com oito atores, quem o título nomeia é consultado", async () => {
    const consultados: string[] = [];
    const fetcher = vi.fn(async (entrada: string | URL) => {
      const url = new URL(String(entrada));
      if (url.searchParams.get("action") === "wbsearchentities") consultados.push(url.searchParams.get("search") ?? "");
      return new Response(JSON.stringify({ search: [] }));
    }) as unknown as typeof fetch;
    await escolherEntidadeVisual({ atores: CAIADO.atores, lugares: [], acontecimento: [], titulo: CAIADO.fonte }, { fetcher });
    expect(consultados).toContain("Ronaldo Caiado");
  });
});

describe("a marca lida na foto", () => {
  it("confere o nome da empresa no texto que o modelo leu", () => {
    expect(textoLidoTemAMarca("ANDURIL", "Anduril Industries")).toBe(true);
    expect(textoLidoTemAMarca("SPACE X", "SpaceX")).toBe(true);
    expect(textoLidoTemAMarca("ANTHROPIC", "Anthropic")).toBe(true);
    expect(textoLidoTemAMarca("", "Anthropic")).toBe(false);
    expect(textoLidoTemAMarca("METAVERSE CAFE", "Meta")).toBe(false);
    expect(textoLidoTemAMarca("Lockheed Martin", "Anduril Industries")).toBe(false);
  });
});

describe("o Wikidata da marca", () => {
  it("o CEO que deixou o cargo (P582) não é representante", () => {
    const claims = {
      P169: [
        { mainsnak: { datavalue: { value: { id: "Q-antigo" } } }, qualifiers: { P582: [{}] } },
        { mainsnak: { datavalue: { value: { id: "Q-atual" } } } },
      ],
    };
    expect(valoresVigentes(claims, "P169")).toEqual(["Q-atual"]);
  });

  it("lê logotipo, CEO e fundador, e descarta fundador que não é gente", async () => {
    const fetcher = vi.fn(async (entrada: string | URL) => {
      const ids = new URL(String(entrada)).searchParams.get("ids") ?? "";
      if (ids === "Q116758847") {
        return new Response(
          JSON.stringify({
            entities: {
              Q116758847: {
                claims: {
                  P154: [{ mainsnak: { datavalue: { value: "Anthropic logo.svg" } } }],
                  P169: [{ mainsnak: { datavalue: { value: { id: "Q-dario" } } } }],
                  P112: [{ mainsnak: { datavalue: { value: { id: "Q-empresa" } } } }],
                },
              },
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          entities: {
            "Q-dario": {
              labels: { en: { value: "Dario Amodei" } },
              claims: {
                P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
                P18: [{ mainsnak: { datavalue: { value: "Dario Amodei.jpg" } } }],
              },
            },
            "Q-empresa": { labels: { en: { value: "Holding" } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q4830453" } } } }] } },
          },
        }),
      );
    }) as unknown as typeof fetch;
    const d = await dadosDaMarca("Q116758847", { fetcher });
    expect(d.logotipo).toBe("Anthropic logo.svg");
    expect(d.representantes).toEqual([
      { qid: "Q-dario", nome: "Dario Amodei", papel: "ceo", imagemPrincipal: "Dario Amodei.jpg", categoriaCommons: null },
    ]);
  });
});

describe("o cartão do logotipo", () => {
  it("logotipo escuro vai sobre papel claro, inteiro dentro da área segura dos recortes", async () => {
    // Um "logotipo" preto de 600x150 com fundo transparente.
    const logo = await sharp({ create: { width: 600, height: 150, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } })
      .png()
      .toBuffer();
    const { png, fundo } = await comporCartaoDaMarca(logo);
    expect(fundo).toBe("claro");
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(LADO_DO_CARTAO);
    expect(meta.height).toBe(LADO_DO_CARTAO);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    // O canto é o fundo; o centro do logotipo (42% da altura) é tinta.
    expect(px(5, 5)).toBe(FUNDO_CLARO.r);
    expect(px(800, Math.round(LADO_DO_CARTAO * 0.42))).toBeLessThan(40);
    // Fora da faixa do recorte 3:4 (200 px de cada lado) não há tinta.
    expect(px(150, Math.round(LADO_DO_CARTAO * 0.42))).toBe(FUNDO_CLARO.r);
    // Abaixo de 55% da altura (a faixa da manchete na capa), só fundo.
    expect(px(800, Math.round(LADO_DO_CARTAO * 0.6))).toBe(FUNDO_CLARO.r);
  });

  it("a rota só aceita nome de arquivo do Commons", () => {
    expect(arquivoDeLogotipoValido("Anthropic logo.svg")).toBe(true);
    expect(arquivoDeLogotipoValido("../etc/passwd")).toBe(false);
    expect(arquivoDeLogotipoValido("https://evil.example/x.svg")).toBe(false);
    expect(urlDoCartaoDaMarca("File:Anthropic logo.svg", "https://casaloti.ia.br")).toBe(
      "https://casaloti.ia.br/api/visual/cartao-da-marca?arquivo=Anthropic%20logo.svg",
    );
  });
});

/* ------------------------------------------------------------------------- */
/* O resolvedor, com o mundo de mentira.                                      */
/* ------------------------------------------------------------------------- */

function entidade(nome: string, tipo: "person" | "company" | "place", qid: string) {
  return {
    nome,
    normalizado: nome.toLowerCase(),
    tipo,
    qid,
    imagemPrincipal: null,
    categoriaCommons: null,
    siteOficial: null,
    origem: "teste",
    confianca: 90,
    evidencias: [],
  };
}

type Item = { qid: string; label: string; p31: string; p18?: string; p373?: string; p154?: string; p169?: string[]; p112?: string[] };
type Arquivo = { nome: string; descricao?: string; largura?: number };

/** Wikidata, Commons, Pexels e Openverse de mentira, contando quem foi chamado. */
function mundo(cfg: { itens: Item[]; arquivosPorCategoria?: Record<string, Arquivo[]>; arquivos?: Arquivo[] }) {
  const chamadas: string[] = [];
  const porNome = new Map(cfg.itens.map((i) => [i.label.toLowerCase(), i]));
  const porQid = new Map(cfg.itens.map((i) => [i.qid, i]));
  const todos = new Map<string, Arquivo>();
  for (const a of cfg.arquivos ?? []) todos.set(a.nome, a);
  for (const lista of Object.values(cfg.arquivosPorCategoria ?? {})) for (const a of lista) todos.set(a.nome, a);
  const pagina = (a: Arquivo, i: number) => [
    String(i),
    {
      title: `File:${a.nome}`,
      imageinfo: [
        {
          url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(a.nome)}`,
          descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(a.nome)}`,
          width: a.largura ?? 2400,
          height: 1600,
          mime: a.nome.endsWith(".svg") ? "image/svg+xml" : "image/jpeg",
          extmetadata: {
            LicenseShortName: { value: "CC BY 4.0" },
            Artist: { value: "Fotógrafo" },
            ImageDescription: { value: a.descricao ?? a.nome },
            DateTimeOriginal: { value: "2025-05-01" },
          },
        },
      ],
    },
  ];
  const fetcher = vi.fn(async (entrada: string | URL) => {
    const url = new URL(String(entrada));
    chamadas.push(url.host + url.pathname);
    const p = url.searchParams;
    if (url.host.includes("wikidata.org") && p.get("action") === "wbsearchentities") {
      const i = porNome.get((p.get("search") ?? "").toLowerCase());
      return new Response(JSON.stringify({ search: i ? [{ id: i.qid, label: i.label, description: i.label }] : [] }));
    }
    if (url.host.includes("wikidata.org") && p.get("action") === "wbgetentities") {
      const entities: Record<string, unknown> = {};
      for (const id of (p.get("ids") ?? "").split("|")) {
        const i = porQid.get(id);
        if (!i) continue;
        const v = (x: unknown) => [{ mainsnak: { datavalue: { value: x } } }];
        const claims: Record<string, unknown> = { P31: v({ id: i.p31 }), P17: v({ id: "Q30" }) };
        if (i.p18) claims.P18 = v(i.p18);
        if (i.p373) claims.P373 = v(i.p373);
        if (i.p154) claims.P154 = v(i.p154);
        if (i.p169) claims.P169 = i.p169.map((q) => ({ mainsnak: { datavalue: { value: { id: q } } } }));
        if (i.p112) claims.P112 = i.p112.map((q) => ({ mainsnak: { datavalue: { value: { id: q } } } }));
        entities[id] = { claims, labels: { en: { value: i.label } } };
      }
      return new Response(JSON.stringify({ entities }));
    }
    if (url.pathname.includes("Special:FilePath")) {
      // O logotipo renderizado em PNG pelo Commons: um retângulo escuro, que vira o cartão.
      const png = await sharp({ create: { width: 600, height: 150, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } }).png().toBuffer();
      return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
    }
    if (url.host.includes("commons.wikimedia.org")) {
      if (p.get("titles")) {
        const nome = (p.get("titles") ?? "").replace(/^File:/, "");
        const a = todos.get(nome);
        return new Response(JSON.stringify({ query: { pages: a ? Object.fromEntries([pagina(a, 1)]) : {} } }));
      }
      if (p.get("generator") === "categorymembers") {
        const cat = (p.get("gcmtitle") ?? "").replace(/^Category:/, "");
        const lista = cfg.arquivosPorCategoria?.[cat] ?? [];
        return new Response(JSON.stringify({ query: { pages: Object.fromEntries(lista.map((a, i) => pagina(a, i + 1))) } }));
      }
      return new Response(JSON.stringify({ query: { pages: {} } }));
    }
    if (url.host.includes("api.pexels.com")) {
      // O salão de casamento de 06/10/2026: não pode nunca ser pedido para pauta com protagonista.
      return new Response(
        JSON.stringify({
          photos: [
            {
              src: { large2x: "https://images.pexels.com/photos/37606503/pexels-photo-37606503.jpeg" },
              photographer: "Paloma Lima",
              photographer_url: "https://pexels.com/@x",
              url: "https://www.pexels.com/photo/elegant-wedding-ceremony-setup-in-sao-paulo-37606503/",
            },
          ],
        }),
      );
    }
    if (url.host.includes("openverse")) return new Response(JSON.stringify({ results: [] }));
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetcher, chamadas };
}

const ENV = { PEXELS_API_KEY: "chave-de-teste" };

/** Um modelo de mentira que responde pelo PAPEL, como o de verdade faz. */
function modelo(regras: {
  identidade?: (url: string) => boolean;
  marca?: (url: string) => boolean;
  logotipo?: (url: string) => boolean;
  geral?: (url: string) => boolean;
}): { conferente: Conferente; papeis: string[] } {
  const papeis: string[] = [];
  const conferente: Conferente = async (asset, ctx) => {
    const papel = ctx.papel ?? "assunto";
    papeis.push(`${papel}:${asset.imageUrl}`);
    const regra = papel === "identidade" ? regras.identidade : papel === "marca" ? regras.marca : papel === "logotipo" ? regras.logotipo : regras.geral;
    const aprovada = regra ? regra(asset.imageUrl) : true;
    return {
      aprovada,
      descricao: `${papel} ${aprovada ? "ok" : "não"}`,
      motivo: aprovada ? "confere" : "não confere",
      paisAparente: null,
      confianca: aprovada ? 95 : 90,
      falhou: false,
      ...(papel === "marca" || papel === "logotipo" ? { textoLido: aprovada ? "ANTHROPIC" : "" } : {}),
    };
  };
  return { conferente, papeis };
}

function pauta(base: { fonte: string; manchete?: string; atores: string[] }, extra: Partial<PautaParaImagem> = {}): PautaParaImagem {
  return {
    storyId: "s",
    titulo: base.fonte,
    ...(base.manchete ? { manchete: base.manchete } : {}),
    resumo: "",
    categoria: "politica",
    classificacao: { atores: base.atores, lugares: [], acontecimento: ["apoio"], pais: "EUA" },
    ...extra,
  };
}

describe("a pauta do Caiado nunca mais sai com o salão de casamento", () => {
  const itens: Item[] = [
    { qid: "Q-caiado", label: "Ronaldo Caiado", p31: "Q5", p18: "Ronaldo Caiado 2023.jpg", p373: "Ronaldo Caiado" },
    { qid: "Q-flavio", label: "Flávio Bolsonaro", p31: "Q5" },
    { qid: "Q-gracinha", label: "Gracinha Caiado", p31: "Q5" },
  ];

  it("sem foto do Caiado conferida, a pauta fica sem foto, e o banco de cena nem é consultado", async () => {
    const { fetcher, chamadas } = mundo({
      itens,
      arquivos: [{ nome: "Ronaldo Caiado 2023.jpg", largura: 300 }],
      arquivosPorCategoria: { "Ronaldo Caiado": [{ nome: "Ronaldo Caiado em casamento.jpg" }] },
    });
    const { conferente } = modelo({ identidade: () => false });
    const r = await resolveVisualAsset(pauta(CAIADO), { env: ENV, fetcher, somenteLeitura: true, conferenciaVisual: conferente });
    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.motivo).toBe(MOTIVOS_DE_RECUSA.FOTO_DO_PROTAGONISTA_NAO_VERIFICADA);
    // O Caiado foi tentado primeiro; sem foto dele, a vez passou ao Flávio, também sem foto conferida.
    expect(r.fontesConsultadas.some((f) => f.nota.startsWith("Ronaldo Caiado sem foto verificada"))).toBe(true);
    expect(r.protagonista?.nome).toBe("Flávio Bolsonaro");
    expect(chamadas.some((c) => c.includes("pexels"))).toBe(false);
    expect(r.recusados.some((x) => x.motivo === MOTIVOS_DE_RECUSA.IDENTIDADE_NAO_CONFERIDA)).toBe(true);
  });

  it("com a foto dele conferida contra o retrato de referência, é ela", async () => {
    const { fetcher } = mundo({
      itens,
      arquivos: [{ nome: "Ronaldo Caiado 2023.jpg", largura: 300 }],
      arquivosPorCategoria: { "Ronaldo Caiado": [{ nome: "Ronaldo Caiado discursa em Goiânia.jpg" }] },
    });
    const { conferente, papeis } = modelo({});
    const r = await resolveVisualAsset(pauta(CAIADO), { env: ENV, fetcher, somenteLeitura: true, conferenciaVisual: conferente });
    expect(r.status).toBe("SELECTED");
    expect(r.asset?.sourceAssetId).toBe("File:Ronaldo Caiado discursa em Goiânia.jpg");
    const v = r.asset?.metadata.verificacao as VerificacaoDoProtagonista;
    expect(v).toMatchObject({ regra: "protagonista_da_manchete", tipo: "identidade", protagonista: "Ronaldo Caiado" });
    expect(v.referencia).toContain("Ronaldo%20Caiado%202023.jpg");
    // A identidade foi perguntada ANTES da conferência de sempre.
    expect(papeis[0]).toMatch(/^identidade:/);
  });
});

describe("pauta de empresa: a marca, depois o logotipo, depois quem a representa", () => {
  const anthropic: Item = {
    qid: "Q-anthropic",
    label: "Anthropic",
    p31: "Q4830453",
    p373: "Anthropic",
    p154: "Anthropic logo.svg",
    p169: ["Q-dario"],
  };
  const dario: Item = { qid: "Q-dario", label: "Dario Amodei", p31: "Q5", p18: "Dario Amodei.jpg", p373: "Dario Amodei" };
  const claude: Item = { qid: "Q-claude", label: "Claude", p31: "Q515" };

  it("sem foto com a marca legível, o cartão do logotipo oficial (P154), e não os racks de servidor", async () => {
    const { fetcher, chamadas } = mundo({
      itens: [anthropic, dario, claude],
      arquivos: [{ nome: "Anthropic logo.svg" }],
      arquivosPorCategoria: { Anthropic: [{ nome: "Escritório sem placa.jpg" }] },
    });
    const { conferente } = modelo({ marca: () => false });
    const r = await resolveVisualAsset(pauta(ANTHROPIC, { categoria: "tecnologia" }), {
      env: ENV,
      fetcher,
      somenteLeitura: true,
      conferenciaVisual: conferente,
    });
    expect(r.status).toBe("SELECTED");
    expect(r.asset?.imageUrl).toBe("https://casaloti.ia.br/api/visual/cartao-da-marca?arquivo=Anthropic%20logo.svg");
    expect((r.asset?.metadata.verificacao as VerificacaoDoProtagonista).tipo).toBe("logotipo");
    expect(r.asset?.attribution).toContain("Wikimedia Commons");
    expect(chamadas.some((c) => c.includes("pexels"))).toBe(false);
  });

  it("foto com a marca legível vence o logotipo", async () => {
    const { fetcher } = mundo({
      itens: [anthropic, dario],
      arquivos: [{ nome: "Anthropic logo.svg" }],
      arquivosPorCategoria: { Anthropic: [{ nome: "Fachada da Anthropic com o nome.jpg" }] },
    });
    const { conferente } = modelo({});
    const r = await resolveVisualAsset(pauta(ANTHROPIC), { env: ENV, fetcher, somenteLeitura: true, conferenciaVisual: conferente });
    expect(r.asset?.sourceAssetId).toBe("File:Fachada da Anthropic com o nome.jpg");
    const v = r.asset?.metadata.verificacao as VerificacaoDoProtagonista;
    expect(v.tipo).toBe("marca");
    expect(v.veredicto?.textoLido).toBe("ANTHROPIC");
  });

  it("sem marca e sem logotipo publicável, CEO que o público brasileiro não reconhece não vira foto (14/10/2026)", async () => {
    // Antes, a foto de Dario Amodei entrava como representante da Anthropic. O dono recusou
    // Satya Nadella e Franklin Roosevelt pelo mesmo motivo: rosto desconhecido não conta a história.
    const { fetcher } = mundo({
      itens: [{ ...anthropic, p154: undefined }, dario],
      arquivos: [{ nome: "Dario Amodei.jpg", largura: 300 }],
      arquivosPorCategoria: { Anthropic: [], "Dario Amodei": [{ nome: "Dario Amodei no palco.jpg" }] },
    });
    const { conferente, papeis } = modelo({});
    const r = await resolveVisualAsset(pauta(ANTHROPIC), { env: ENV, fetcher, somenteLeitura: true, conferenciaVisual: conferente });
    expect(r.status).toBe("NO_VALID_IMAGE");
    // Nem chegou a conferir o rosto: o filtro é antes, e não custa chamada de modelo.
    expect(papeis.some((p) => p.startsWith("identidade:"))).toBe(false);
  });

  it("o representante que não confere com o retrato não entra, e a pauta fica sem foto", async () => {
    const { fetcher, chamadas } = mundo({
      itens: [{ ...anthropic, p154: undefined }, dario],
      arquivos: [{ nome: "Dario Amodei.jpg", largura: 300 }],
      arquivosPorCategoria: { Anthropic: [], "Dario Amodei": [{ nome: "Outro homem de terno.jpg" }] },
    });
    const { conferente } = modelo({ identidade: () => false });
    const r = await resolveVisualAsset(pauta(ANTHROPIC), { env: ENV, fetcher, somenteLeitura: true, conferenciaVisual: conferente });
    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.motivo).toBe(MOTIVOS_DE_RECUSA.FOTO_DO_PROTAGONISTA_NAO_VERIFICADA);
    expect(chamadas.some((c) => c.includes("pexels"))).toBe(false);
  });
});

describe("dois nomes na manchete", () => {
  it("sem retrato de referência do primeiro (Ruas), a foto é do segundo (Garotinho), conferida", async () => {
    const { fetcher, chamadas } = mundo({
      itens: [
        { qid: "Q-ruas", label: "Douglas Ruas", p31: "Q5", p373: "Douglas Ruas" },
        { qid: "Q-garotinho", label: "Anthony Garotinho", p31: "Q5", p18: "Garotinho 2011.jpg", p373: "Anthony Garotinho" },
      ],
      arquivos: [{ nome: "Garotinho 2011.jpg" }],
      arquivosPorCategoria: { "Douglas Ruas": [{ nome: "Douglas Ruas 2023.jpg" }], "Anthony Garotinho": [{ nome: "Garotinho 2011.jpg" }] },
    });
    const { conferente } = modelo({});
    const r = await resolveVisualAsset(
      pauta(
        {
          fonte: "MPE defende desistência de Garotinho que pode dar vitória a Ruas no RJ",
          manchete: "Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ",
          atores: ["MPE", "TSE", "Anthony Garotinho", "Douglas Ruas", "Eduardo Paes"],
        },
        { categoria: "politica" },
      ),
      { env: ENV, fetcher, somenteLeitura: true, conferenciaVisual: conferente },
    );
    expect(r.status).toBe("SELECTED");
    expect(r.protagonista?.nome).toBe("Anthony Garotinho");
    expect(r.asset?.sourceAssetId).toBe("File:Garotinho 2011.jpg");
    // A foto do Ruas sem referência foi recusada, e o motivo ficou no relatório.
    expect(r.recusados.some((x) => x.identificacao === "File:Douglas Ruas 2023.jpg" && x.motivo === MOTIVOS_DE_RECUSA.IDENTIDADE_NAO_CONFERIDA)).toBe(true);
    expect(chamadas.some((c) => c.includes("pexels"))).toBe(false);
  });
});

describe("Wikidata recusando (429) não vira \"ninguém foi nomeado\"", () => {
  it("a pauta fica sem foto, e não desce para a cena", async () => {
    const fetcher = vi.fn(async (entrada: string | URL) => {
      const url = String(entrada);
      if (url.includes("wikidata.org")) return new Response("calma", { status: 429 });
      if (url.includes("api.pexels.com")) throw new Error("não devia pedir cena");
      return new Response(JSON.stringify({ query: { pages: {} } }));
    }) as unknown as typeof fetch;
    const r = await resolveVisualAsset(pauta(CAIADO), { env: ENV, fetcher, somenteLeitura: true, conferenciaVisual: modelo({}).conferente });
    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.motivo).toBe(MOTIVOS_DE_RECUSA.FOTO_DO_PROTAGONISTA_NAO_VERIFICADA);
    expect(r.fontesConsultadas.some((f) => f.nota.includes("429"))).toBe(true);
  }, 15_000);
});

describe("pauta sem protagonista na manchete continua pela cena", () => {
  it("nenhum ator nomeado na manchete: a escada da cena segue valendo", async () => {
    const { fetcher } = mundo({ itens: [] });
    const { conferente } = modelo({});
    const r = await resolveVisualAsset(
      {
        storyId: "s",
        titulo: "Compradores de imóveis ganham margem de negociação nos EUA",
        categoria: "custo_de_vida",
        classificacao: { atores: [], lugares: [], acontecimento: ["venda de imóveis"], pais: "EUA" },
      },
      { env: ENV, fetcher, somenteLeitura: true, conferenciaVisual: conferente },
    );
    expect(r.status).toBe("SELECTED");
    expect(r.caminho).toBe("cena");
    expect(r.protagonista).toBeNull();
  });
});
