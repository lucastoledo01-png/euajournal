import { describe, expect, it, vi } from "vitest";
import { pautaDeTeste } from "./calor.fixture";
import {
  andamentoDaHistoria,
  bonusDoCalor,
  contarVeiculos,
  numeroForte,
  pontuarCalor,
  tendenciasQueCasam,
  termoCasa,
  normalizarTexto,
  PESO_DO_CALOR,
} from "./calor";
import {
  aquecerPauta,
  calcularCalorDoDia,
  famaNoWikidata,
  tituloCasaComNome,
  liderPeloCalor,
  modoDoCalor,
  type FontesDoCalor,
} from "./calor-do-dia";

/**
 * O calor da pauta (06/10/2026). O dono achou a seleção "muito fria": ela
 * mede o quanto o fato muda a vida do leitor e nada mede se alguém está
 * falando dele. Estes testes fixam os cinco sinais, a soma com a nota e o
 * interruptor.
 */

const AGORA = Date.parse("2026-10-06T12:00:00Z");

describe("os sinais do calor", () => {
  it("número forte: percentual, dinheiro com escala, recorde e contagem grande, mas não ano", () => {
    expect(numeroForte("Real sobe mais de 4% e dólar cai abaixo de R$ 5")).toBe("4%");
    expect(numeroForte("Paramount fecha compra de US$ 110 bi da Warner")).toMatch(/^US\$ 110 bi/);
    expect(numeroForte("China fecha mais de 670 bancos em um ano")).toBe("670");
    expect(numeroForte("Bolsa bate recorde")).toBe("recorde");
    expect(numeroForte("O que muda em 2026 para quem investe")).toBeNull();
    expect(numeroForte("Três estados mudam regra")).toBeNull();
  });

  it("termo em alta casa por palavra inteira e exige todas as palavras", () => {
    const texto = normalizarTexto("Flávio Bolsonaro lidera pesquisa e dólar cai");
    expect(termoCasa("Flávio Bolsonaro", texto)).toBe(true);
    expect(termoCasa("Jair Bolsonaro", texto)).toBe(false);
    // Substring não conta: a lição de "ice" dentro de "justice".
    expect(termoCasa("ice", normalizarTexto("Justice Department"))).toBe(false);
    expect(termoCasa("2026 Brazilian general election", normalizarTexto("general motors sobe"))).toBe(false);
  });

  it("tendências diferentes da mesma fonte contam uma vez por termo", () => {
    const casou = tendenciasQueCasam("Trump reúne CEOs de IA na Casa Branca", [
      { termo: "Trump", fonte: "google_trends_us" },
      { termo: "trump", fonte: "google_trends_us" },
      { termo: "Donald Trump", fonte: "wikipedia_pt" },
    ]);
    expect(casou.map((c) => c.fonte)).toEqual(["google_trends_us"]);
  });

  it("veículos contam DOMÍNIO, ignoram agregador e o que passou de 24h", () => {
    const v = [1, 0, 0];
    const vizinhas = [
      { dominio: "cnbc.com", vetor: [0.99, 0.1, 0], publicadoEm: "2026-10-06T09:00:00Z" },
      { dominio: "cnbc.com", vetor: [0.98, 0.1, 0], publicadoEm: "2026-10-06T09:30:00Z" },
      { dominio: "axios.com", vetor: [0.95, 0.2, 0], publicadoEm: "2026-10-06T08:00:00Z" },
      { dominio: "news.google.com", vetor: [1, 0, 0], publicadoEm: "2026-10-06T08:00:00Z" },
      { dominio: "velho.com", vetor: [1, 0, 0], publicadoEm: "2026-10-04T08:00:00Z" },
      { dominio: "outro-fato.com", vetor: [0, 1, 0], publicadoEm: "2026-10-06T08:00:00Z" },
    ];
    expect(contarVeiculos(v, ["nyt.com"], vizinhas, 0.7, AGORA)).toBe(3);
    // Sem vetor, só a própria pauta e o que a deduplicação já juntou.
    expect(contarVeiculos(null, ["nyt.com", "wsj.com"], vizinhas, 0.7, AGORA)).toBe(2);
  });

  it("a soma: pauta quente de fama alta e cinco veículos chega a 100, pauta fria fica no zero", () => {
    const quente = pontuarCalor({
      veiculos: 6,
      tendencias: [
        { termo: "Trump", fonte: "google_trends_us" },
        { termo: "Donald Trump", fonte: "wikipedia_pt" },
      ],
      fama: { nome: "Donald Trump", sitelinks: 250 },
      horas: 2,
      numeroForte: "670",
      veiculos3h: 5,
    });
    expect(quente.total).toBe(100);
    expect(bonusDoCalor(quente)).toBe(Math.round(100 * PESO_DO_CALOR));

    const fria = pontuarCalor({ veiculos: 1, tendencias: [], fama: null, horas: 70, numeroForte: null });
    expect(fria.total).toBe(0);
    expect(bonusDoCalor(fria)).toBe(0);
  });
});

describe("o capítulo da história (28/10/2026)", () => {
  const v = (x: number[]) => x;
  const AGORA2 = Date.parse("2026-10-28T12:00:00Z");
  const h = (horasAtras: number) => new Date(AGORA2 - horasAtras * 3600 * 1000).toISOString();

  it("matéria parecida e mais nova, mas não igual, supera a pauta: 'viaja' vira 'chega'", () => {
    const pauta = v([1, 0, 0]);
    const proxima = v([0.8, 0.6, 0]); // cosseno 0.8: mesmo assunto, outro fato
    const andamento = andamentoDaHistoria(
      pauta,
      h(6),
      ["cnn.com"],
      [{ dominio: "g1.globo.com", vetor: proxima, publicadoEm: h(1) }],
      0.65,
      AGORA2,
    );
    expect(andamento.superada).toBe(true);
    expect(andamento.veiculos3h).toBe(1);
  });

  it("quase igual é o mesmo fato republicado, e não supera", () => {
    const andamento = andamentoDaHistoria(
      v([1, 0, 0]),
      h(6),
      ["cnn.com"],
      [{ dominio: "g1.globo.com", vetor: v([0.97, 0.2, 0]), publicadoEm: h(1) }],
      0.65,
      AGORA2,
    );
    expect(andamento.superada).toBe(false);
  });

  it("a etapa superada vale a metade, e a velocidade soma", () => {
    const base = { veiculos: 3, tendencias: [], fama: null, horas: 3, numeroForte: null };
    const viva = pontuarCalor({ ...base, veiculos3h: 4 });
    const velha = pontuarCalor({ ...base, veiculos3h: 4, superada: true });
    expect(viva.partes.velocidade).toBe(15);
    expect(velha.total).toBe(Math.round(viva.total * 0.5));
    expect(velha.explicacao).toContain("etapa superada");
  });
});

describe("o calor na ordem", () => {
  it("o bônus soma à nota numa CÓPIA, e a pauta sem calor volta a mesma", () => {
    const p = pautaDeTeste({ titulo: "X", nota: 60 });
    const c = pontuarCalor({ veiculos: 5, tendencias: [], fama: null, horas: 1, numeroForte: null });
    const quente = aquecerPauta(p, c);
    expect(quente.pontuacao.total).toBe(60 + bonusDoCalor(c));
    expect(p.pontuacao.total).toBe(60);
    expect(aquecerPauta(p, undefined)).toBe(p);
  });

  it("a abertura da newsletter é a mais quente; empate fica com a de cima", () => {
    const a = pautaDeTeste({ titulo: "Fria", nota: 80, storyId: "a" });
    const b = pautaDeTeste({ titulo: "Quente", nota: 60, storyId: "b" });
    const calor = new Map([
      ["a", pontuarCalor({ veiculos: 1, tendencias: [], fama: null, horas: 30, numeroForte: null })],
      ["b", pontuarCalor({ veiculos: 4, tendencias: [], fama: { nome: "Musk", sitelinks: 200 }, horas: 3, numeroForte: null })],
    ]);
    const r = liderPeloCalor([a, b], calor);
    expect(r.mudou).toBe(true);
    expect(r.pautas.map((p) => p.storyId)).toEqual(["b", "a"]);
    expect(liderPeloCalor([a, b], new Map()).mudou).toBe(false);
  });
});

function fontesFalsas(over: Partial<FontesDoCalor> = {}): FontesDoCalor {
  return {
    termosEmAlta: async () => [{ termo: "Elon Musk", fonte: "google_trends_us" }],
    publicadasNoDia: async () => [
      { titulo: "Musk volta ao governo", dominio: "cnbc.com", publicadoEm: "2026-10-06T08:00:00Z" },
      { titulo: "Musk volta ao governo (2)", dominio: "axios.com", publicadoEm: "2026-10-06T08:00:00Z" },
    ],
    // Todo título que fala de Musk aponta para o mesmo lado; o resto, para outro.
    vetores: async (textos) => textos.map((t) => (/musk/i.test(t) ? [1, 0] : [0, 1])),
    fama: async (nome) => (/musk/i.test(nome) ? { nome: "Elon Musk", sitelinks: 180 } : null),
    ...over,
  };
}

describe("o calor do dia", () => {
  it("junta os cinco sinais por pauta", async () => {
    const musk = pautaDeTeste({ titulo: "Elon Musk volta ao governo Trump para ajudar o Pentágono", nota: 50, atores: ["Elon Musk"] });
    const fria = pautaDeTeste({ titulo: "Companhia aérea muda regra de status", nota: 70, publicadoEm: "2026-10-04T10:00:00Z" });
    const r = await calcularCalorDoDia([musk, fria], { fontes: fontesFalsas(), agoraMs: AGORA });
    const cm = r.porStory.get(musk.storyId)!;
    expect(cm.sinais.veiculos).toBe(3);
    expect(cm.sinais.tendencias).toHaveLength(1);
    expect(cm.sinais.fama?.sitelinks).toBe(180);
    expect(r.porStory.get(fria.storyId)!.total).toBe(0);
  });

  it("fonte que falha vira aviso e o sinal dela vale zero, sem derrubar o cálculo", async () => {
    const p = pautaDeTeste({ titulo: "Elon Musk anuncia", nota: 50, atores: ["Elon Musk"] });
    const r = await calcularCalorDoDia([p], {
      agoraMs: AGORA,
      fontes: fontesFalsas({
        termosEmAlta: async () => {
          throw new Error("Trends fora");
        },
        vetores: async () => {
          throw new Error("sem chave");
        },
        fama: async () => {
          throw new Error("wikidata 503");
        },
      }),
    });
    expect(r.avisos.join(" ")).toMatch(/Trends fora/);
    expect(r.avisos.join(" ")).toMatch(/sem chave/);
    expect(r.porStory.get(p.storyId)!.sinais.veiculos).toBe(1);
    expect(r.porStory.get(p.storyId)!.sinais.fama).toBeNull();
  });
});

describe("a capacidade", () => {
  it("ausente é off, sem olhar ambiente; valor desconhecido também é off", () => {
    expect(modoDoCalor(null)).toBe("off");
    expect(modoDoCalor({ settings: {} })).toBe("off");
    expect(modoDoCalor({ settings: { capacidades: { calor: "dry_run" } } })).toBe("dry_run");
    expect(modoDoCalor({ settings: { capacidades: { calor: "enforce" } } })).toBe("enforce");
    expect(modoDoCalor({ settings: { capacidades: { calor: "ligado" } } })).toBe("off");
  });
});

describe("a fama no Wikidata", () => {
  function fetcherFalso(titulo: string, qid: string, links: string[], instancia = "Q5") {
    return vi.fn(async (url: URL | string) => {
      const u = String(url);
      if (u.includes("wikipedia.org")) {
        return new Response(JSON.stringify({ query: { pages: { "1": { title: titulo, pageprops: { wikibase_item: qid } } } } }));
      }
      if (u.includes("wbgetclaims")) {
        const prop = new URL(u).searchParams.get("property")!;
        const valor = prop === "P31" ? [{ mainsnak: { datavalue: { value: { id: instancia } } } }] : [];
        return new Response(JSON.stringify({ claims: { [prop]: valor } }));
      }
      return new Response(JSON.stringify({ entities: { [qid]: { sitelinks: Object.fromEntries(links.map((l) => [l, {}])) } } }));
    }) as unknown as typeof fetch;
  }

  it("o nome solto chega à pessoa pela busca da Wikipédia, e só as Wikipédias contam", async () => {
    const f = fetcherFalso("Donald Trump", "Q22686", ["enwiki", "ptwiki", "commonswiki", "enwikiquote", "specieswiki"]);
    expect(await famaNoWikidata("Trump", f, "teste")).toEqual({ nome: "Donald Trump", sitelinks: 2 });
  });

  it("artigo que não tem palavra do nome no título é recusado", async () => {
    const f = fetcherFalso("Gato", "Q146", ["enwiki", "ptwiki"]);
    expect(await famaNoWikidata("Neko Health", f, "teste")).toBeNull();
    expect(tituloCasaComNome("Sistema de Reserva Federal dos Estados Unidos", "Fed")).toBe(true);
    expect(tituloCasaComNome("Nassim Nicholas Taleb", "Pesquisadores da Wharton")).toBe(false);
  });

  it("lugar e conceito não têm fama, por mais línguas que tenham", async () => {
    // Estado americano: instância de estado (Q35657), sem sede nem setor.
    const f = fetcherFalso("Virgínia Ocidental", "Q1371", ["enwiki", "ptwiki", "eswiki"], "Q35657");
    expect(await famaNoWikidata("Virgínia Ocidental", f, "teste")).toBeNull();
  });
});
