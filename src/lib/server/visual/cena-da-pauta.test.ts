import { describe, expect, it } from "vitest";
import { cenaDaPauta, consultaProibida, tagValida } from "./cena-da-pauta";

/**
 * "Compradores de imóvel ganham margem não tem entidade fotografável, isso
 * está errado, porque existe um objeto que contextualiza com o conteúdo."
 *
 * A frase é do dono, em 18/09/2026, e ela nomeia o defeito melhor do que eu
 * tinha nomeado. Tinha casas. Tinha imóveis. A lista de 16 temas é que não
 * sabia, porque o radical dela era "imovel" e a manchete dizia "imóveis".
 *
 * As duas proibições também são dele, com essas palavras: "nunca pessoa
 * identificável nem texto na imagem".
 */

const ENV = { OPENAI_API_KEY: "chave-de-teste" };

const PAUTA = {
  titulo: "Compradores de imóveis ganham margem de negociação com vendas no menor nível em quase três anos nos EUA",
  resumo: "Quem continua procurando imóvel encontra mais espaço para negociar.",
  categoria: "custo_de_vida",
};

function respondendo(conteudo: unknown): typeof fetch {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(conteudo) } }], usage: {} }),
    text: async () => "",
  })) as unknown as typeof fetch;
}

describe("a cena sai do conteúdo da pauta", () => {
  it("uma pauta de imóveis pede casas, e não skyline", async () => {
    const cena = await cenaDaPauta(PAUTA, {
      env: ENV,
      fetcher: respondendo({
        objeto: "rua residencial americana com casas",
        consulta: "american suburban residential street houses",
      }),
    });

    expect(cena.falhou).toBe(false);
    expect(cena.consulta).toBe("american suburban residential street houses");
    expect(cena.objeto).toContain("casas");
  });

  /**
   * O pedido não pode brigar com a regra de texto.
   *
   * Medido em 18/09/2026: a cena pediu "casas à venda" e as TRÊS candidatas do
   * Pexels vinham com "FOR SALE" legível, recusadas pela conferência visual.
   * Quem perde é a pauta, que cai na bandeira com o pedido tecnicamente certo.
   * O estado fica na manchete; a busca pede o lugar.
   */
  it("recusa pedido que só se fotografa com placa", async () => {
    const cena = await cenaDaPauta(PAUTA, {
      env: ENV,
      fetcher: respondendo({
        objeto: "casas à venda",
        consulta: "suburban houses for sale street",
      }),
    });

    expect(cena.falhou).toBe(true);
    expect(cena.motivo).toContain("for sale");
  });

  it("manda manchete, resumo e editoria para o modelo", async () => {
    let corpo: Record<string, unknown> = {};
    const fetcher = (async (_u: string, init: { body: string }) => {
      corpo = JSON.parse(init.body) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ objeto: "x", consulta: "suburban houses street" }) } }],
          usage: {},
        }),
        text: async () => "",
      };
    }) as unknown as typeof fetch;

    await cenaDaPauta(PAUTA, { env: ENV, fetcher });

    const texto = JSON.stringify(corpo.messages);
    expect(texto).toContain("Compradores de imóveis");
    expect(texto).toContain("custo_de_vida");
  });
});

describe("as duas proibições do dono", () => {
  /**
   * Pessoa anônima ilustrando "compradores de imóveis" é escolher alguém para
   * representar um grupo. No caso de "brasileiros nos EUA" seria inferir
   * nacionalidade por aparência, e o caminho não é acertar melhor: é não fazer.
   */
  it("recusa consulta que pede retrato, multidão ou criança", () => {
    for (const q of ["crowd waiting in line", "portrait of a worker", "children playing park"]) {
      expect(consultaProibida(q), q).not.toBeNull();
    }
  });

  /** Decisão do dono de 14/10/2026: o grupo afetado pela notícia pode aparecer. */
  it("deixa passar o grupo afetado, anônimo", () => {
    for (const q of ["senior couple american flag", "construction workers on site", "retired people porch united states"]) {
      expect(consultaProibida(q), q).toBeNull();
    }
  });

  /** A peça já leva a manchete escrita por cima. Duas camadas de texto brigam. */
  it("recusa consulta que pede texto na imagem", () => {
    for (const q of ["for sale sign yard", "protest banner street", "newspaper headline desk"]) {
      expect(consultaProibida(q), q).not.toBeNull();
    }
  });

  /**
   * Falso positivo custa caro por construção: um acerto do filtro não
   * reformula a pergunta, ele declara falha e joga a pauta no tema fixo. Por
   * isso "man", "woman", "face" e "text" ficaram DE FORA da lista, mesmo
   * parecendo óbvios: "man made lake" é cena de lugar. Quem pega esses casos é
   * a conferência visual, que abre a imagem.
   */
  it("não barra cena de lugar por colisão de palavra", () => {
    for (const q of [
      "man made lake aerial",
      "american suburban residential street houses",
      "city hall building facade",
    ]) {
      expect(consultaProibida(q), q).toBeNull();
    }
  });

  it("pega plural e derivada, porque a régua casa palavra inteira", () => {
    for (const q of [
      "portraits on a wall",
      "crowds of new york street",
      "newspapers on a desk",
    ]) {
      expect(consultaProibida(q), q).not.toBeNull();
    }
  });

  it("deixa passar cena de objeto e lugar", () => {
    for (const q of [
      "suburban houses street neighborhood",
      "airport control tower exterior",
      "autonomous vehicle city street sensors",
      "courthouse columns facade architecture",
    ]) {
      expect(consultaProibida(q), q).toBeNull();
    }
  });

  it("a proibição roda sobre a resposta do modelo, não só sobre a instrução", async () => {
    const cena = await cenaDaPauta(PAUTA, {
      env: ENV,
      fetcher: respondendo({ objeto: "retrato de um corretor", consulta: "portrait real estate agent office" }),
    });

    expect(cena.falhou).toBe(true);
    expect(cena.motivo).toContain("portrait");
  });
});

describe("falhar cai no tema fixo, nunca no vazio", () => {
  it("sem credencial, falha declarada", async () => {
    const cena = await cenaDaPauta(PAUTA, { env: {} });
    expect(cena.falhou).toBe(true);
    expect(cena.consulta).toBe("");
  });

  it("chamada que quebra vira falha declarada", async () => {
    const cena = await cenaDaPauta(PAUTA, {
      env: ENV,
      fetcher: (async () => {
        throw new Error("timeout");
      }) as unknown as typeof fetch,
    });
    expect(cena.falhou).toBe(true);
    expect(cena.motivo).toContain("timeout");
  });

  /** Uma palavra não é busca: devolver isso gastaria a consulta do banco à toa. */
  it("consulta curta demais é recusada", async () => {
    const cena = await cenaDaPauta(PAUTA, {
      env: ENV,
      fetcher: respondendo({ objeto: "casa", consulta: "house" }),
    });
    expect(cena.falhou).toBe(true);
  });

  it("pauta sem título nem tenta", async () => {
    const cena = await cenaDaPauta({ titulo: "   " }, { env: ENV, fetcher: respondendo({}) });
    expect(cena.falhou).toBe(true);
  });
});

/**
 * Achados da revisão adversarial desta mudança, antes de publicar.
 *
 * Os dois custam dinheiro em silêncio, que é o tipo de defeito que só aparece
 * na fatura: o `dry-run-imagens` roda sobre até 40 pautas reais para medir SEM
 * custo, e o relatório de custo do dia somava classificação, pacote factual e
 * edição, e nada do ramo visual.
 */
describe("o que a revisão adversarial pegou", () => {
  it("devolve o custo da chamada, para o relatório poder somar", async () => {
    const fetcher = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ objeto: "rua", consulta: "american residential street houses" }) } }],
        usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
      }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const cena = await cenaDaPauta(PAUTA, { env: ENV, fetcher });
    expect(cena.falhou).toBe(false);
    expect(cena.custoUsd).toBeGreaterThan(0);
  });

  it("falha sem chamada custa zero", async () => {
    const cena = await cenaDaPauta(PAUTA, { env: {} });
    expect(cena.custoUsd).toBe(0);
  });

  /** Desde 14/10/2026 gente anônima do grupo afetado passa; quem a julga é a conferência visual. */
  it("não barra mais gente anônima pela palavra", () => {
    for (const q of ["businessmen shaking hands", "men walking downtown", "women in an office"]) {
      expect(consultaProibida(q), q).toBeNull();
    }
  });
});

/**
 * A tag do acervo próprio (decisão de 29/09/2026): o mesmo modelo que lê a
 * matéria escolhe a cena de um cardápio fechado. E só quando pedido, para o
 * prompt de produção não mudar enquanto o acervo estiver desligado.
 */
describe("a tag do acervo", () => {
  function capturando(conteudo: unknown) {
    const corpos: string[] = [];
    const fetcher = (async (_url: string, init?: RequestInit) => {
      corpos.push(String(init?.body ?? ""));
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(conteudo) } }], usage: {} }),
        text: async () => "",
      };
    }) as unknown as typeof fetch;
    return { fetcher, corpos };
  }

  it("sem pedido, o prompt não traz o cardápio e a resposta não traz tag", async () => {
    const { fetcher, corpos } = capturando({
      objeto: "rua",
      consulta: "american residential street",
      tag: "moradia/rua_residencial",
    });
    const cena = await cenaDaPauta(PAUTA, { env: ENV, fetcher });
    expect(corpos[0]).not.toContain("TAG DO ACERVO");
    expect(cena).not.toHaveProperty("tag");
  });

  it("com pedido, devolve a tag do cardápio", async () => {
    const { fetcher, corpos } = capturando({
      objeto: "rua",
      consulta: "american residential street",
      tag: "moradia/rua_residencial",
    });
    const cena = await cenaDaPauta(PAUTA, { env: ENV, fetcher, comTag: true });
    expect(corpos[0]).toContain("TAG DO ACERVO");
    expect(cena.tag).toBe("moradia/rua_residencial");
  });

  it("tag inventada fora do cardápio vira null, e não uma busca por algo que não existe", async () => {
    const { fetcher } = capturando({
      objeto: "rua",
      consulta: "american residential street",
      tag: "moradia/mansao_de_luxo",
    });
    const cena = await cenaDaPauta(PAUTA, { env: ENV, fetcher, comTag: true });
    expect(cena.tag).toBeNull();
  });

  it("'nenhuma' é resposta válida", () => {
    expect(tagValida("nenhuma")).toBeNull();
    expect(tagValida(" Moradia/Rua_Residencial ")).toBe("moradia/rua_residencial");
  });

  it("a tag sobrevive à consulta recusada: o acervo é nosso, o filtro é para banco de terceiro", async () => {
    const { fetcher } = capturando({ objeto: "casa", consulta: "house for sale sign", tag: "moradia/casa_suburbio" });
    const cena = await cenaDaPauta(PAUTA, { env: ENV, fetcher, comTag: true });
    expect(cena.falhou).toBe(true);
    expect(cena.tag).toBe("moradia/casa_suburbio");
  });
});
