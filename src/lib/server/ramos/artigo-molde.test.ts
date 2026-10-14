import { describe, expect, it } from "vitest";
import type { PacoteFactual } from "../editorial/pacote-factual";
import {
  aberturaComLink,
  escreverArtigoDaPauta,
  podarArtigo,
  renderizarArtigoHtml,
  TITULO_DO_SIGNIFICADO,
  type Artigo,
  type VeredictoDoArtigo,
} from "./artigo";
import { VOZ_PADRAO_DO_ARTIGO } from "./vozes";

/**
 * O molde de matéria completa (06/10/2026): blocos presentes quando há o que
 * pôr neles, ausentes quando não há, e o que não se sustenta APAGADO inteiro.
 */

const TRAVESSAO = String.fromCharCode(0x2014);

const PACOTE: PacoteFactual = {
  verified_facts: [
    "O prefeito Brandon Johnson propôs uma moratória de 12 meses para novos data centers em Chicago.",
    "Chicago tem 39 data centers ativos, segundo a cidade.",
    "As propostas seguem para a câmara municipal.",
  ],
  people: ["Brandon Johnson"],
  organizations: [],
  places: ["Chicago"],
  dates: [],
  numbers: ["12 meses", "39 data centers"],
  gaps: [],
  source_urls: ["https://www.axios.com/materia"],
  texto_de_origem:
    "Mayor Brandon Johnson is pushing for a 12-month moratorium on new data centers in Chicago. There are 39 active data centers in Chicago, according to the city. Both proposals go to the City Council.",
};

const COMPLETO: Artigo = {
  titulo: "Chicago propõe um ano sem novos data centers na cidade",
  subtitulo: "O prefeito quer 12 meses para estudar o setor.",
  titulo_seo: "Chicago propõe um ano sem novos data centers",
  descricao_seo: "O prefeito Brandon Johnson propôs uma moratória de 12 meses para novos data centers em Chicago, que tem 39 unidades ativas.",
  essencial: ["Moratória de **12 meses** para novos data centers.", "Chicago tem 39 data centers ativos."],
  abertura: [
    "O prefeito Brandon Johnson propôs uma moratória de 12 meses para novos data centers em Chicago, [[segundo a Axios]].",
    "Chicago tem 39 data centers ativos, segundo a cidade.",
  ],
  secoes: [
    { intertitulo: "O que foi proposto?", paragrafos: ["Uma moratória de **12 meses** para novos data centers."] },
    { intertitulo: "O que acontece agora?", paragrafos: ["As propostas seguem para a câmara municipal."] },
  ],
  tabela: { titulo: "Comparação", colunas: ["Item", "Valor"], linhas: [["Moratória", "12 meses"], ["Data centers ativos", "39"]] },
  significado: ["Um efeito que o pacote sustenta."],
  perguntas: [{ pergunta: "Quantos data centers Chicago tem?", resposta: "Chicago tem 39 data centers ativos." }],
  assuntos: ["data centers", "Chicago"],
};

const FONTE = { nome: "Axios", url: "https://www.axios.com/materia" };

function ordem(html: string, marcas: string[]): number[] {
  return marcas.map((m) => html.indexOf(m));
}

describe("molde: blocos presentes, na ordem combinada", () => {
  it("abertura com link no texto, intertítulos-pergunta, tabela, significado, perguntas, fontes e leia também", () => {
    const html = renderizarArtigoHtml(COMPLETO, FONTE, {
      fontes: [{ nome: "Axios Chicago", url: FONTE.url, detalhe: "23 de setembro de 2026" }],
      relacionadas: [{ slug: "outra-materia", titulo: "Outra matéria" }],
      editoria: { nome: "Política", href: "/editoria/governo" },
    });
    // "O que você precisa saber" é da newsletter, não do portal (dono, 14/10/2026):
    // mesmo com tópicos no artigo, a matéria não desenha o bloco.
    expect(html).not.toContain('class="essencial"');
    const marcas = [
      'class="abertura"',
      "<h2>O que foi proposto?</h2>",
      'class="tabela"',
      `<h2>${TITULO_DO_SIGNIFICADO}</h2>`,
      // Ordem do fim desde 06/10/2026: perguntas, fontes e só então "Leia também".
      'class="perguntas"',
      'class="fontes"',
      'class="leia-tambem"',
    ];
    const posicoes = ordem(html, marcas);
    for (const [i, p] of posicoes.entries()) expect(p, marcas[i]).toBeGreaterThanOrEqual(0);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);

    // O link da fonte DENTRO do parágrafo da abertura, e o marcador não vaza.
    expect(html).toMatch(/<section class="abertura"><p>[^<]*<a href="https:\/\/www\.axios\.com\/materia"[^>]*>segundo a Axios<\/a>/);
    expect(html).not.toContain("[[");
    expect(html).toContain('<a href="/artigos/outra-materia">Outra matéria</a>');
    expect(html).toContain('<a href="/editoria/governo">Mais de Política</a>');
    expect(html).toContain("<strong>12 meses</strong>");
    expect(html).not.toContain(TRAVESSAO);
  });

  it("bloco sem conteúdo NÃO aparece: sem tópicos, sem tabela de verdade, sem significado, sem relacionadas", () => {
    const html = renderizarArtigoHtml(
      { ...COMPLETO, essencial: [], tabela: { titulo: "", colunas: ["a", "b"], linhas: [["só uma", "linha"]] }, significado: [], perguntas: [] },
      FONTE,
      { fontes: [{ nome: "Axios", url: FONTE.url }] },
    );
    expect(html).not.toContain('class="essencial"');
    expect(html).not.toContain('class="tabela"');
    expect(html).not.toContain(TITULO_DO_SIGNIFICADO);
    expect(html).not.toContain('class="leia-tambem"');
    expect(html).not.toContain("Perguntas e respostas");
  });

  it("sem marcador, o link vai na primeira menção ao veículo; sem menção, não se inventa frase", () => {
    expect(aberturaComLink(["A Axios publicou o caso."], FONTE)[0]).toContain('<a href="https://www.axios.com/materia" rel="noopener" target="_blank">Axios</a>');
    expect(aberturaComLink(["Texto sem o nome."], FONTE)[0]).toBe("Texto sem o nome.");
  });

  it("a voz editável pede o molde, e o contrato do JSON fica no código", () => {
    expect(VOZ_PADRAO_DO_ARTIGO).toContain("O que você precisa saber");
    expect(VOZ_PADRAO_DO_ARTIGO).toContain("O que acontece agora?");
    expect(VOZ_PADRAO_DO_ARTIGO).not.toContain(TRAVESSAO);
  });
});

function veredictoCom(reprovadas: VeredictoDoArtigo["unidadesReprovadas"], conclusoes: VeredictoDoArtigo["conclusoesSemLastro"] = []) {
  return { unidadesReprovadas: reprovadas, conclusoesSemLastro: conclusoes, ancoragem: { conferidos: 1, naoSustentadas: [] } };
}

describe("poda: o que não se sustenta sai inteiro", () => {
  it("o parágrafo reprovado some, e o resto fica como estava", () => {
    const r = podarArtigo(COMPLETO, veredictoCom([{ id: "abertura.1", campo: "abertura", texto: "x", motivo: "sem lastro" }]));
    expect(r.bloqueios).toEqual([]);
    expect(r.artigo.abertura).toEqual([COMPLETO.abertura![0]]);
    expect(r.artigo.secoes).toEqual(COMPLETO.secoes);
  });

  it("sem o parágrafo que responde, a seção inteira sai: nada fica sob uma pergunta que não responde", () => {
    const artigo: Artigo = {
      ...COMPLETO,
      secoes: [{ intertitulo: "O que acontece agora?", paragrafos: ["Resposta sem lastro.", "Outro assunto qualquer."] }],
    };
    const r = podarArtigo(artigo, veredictoCom([{ id: "secao.0.0", campo: "secao", texto: "x", motivo: "sem lastro" }]));
    expect(r.artigo.secoes).toEqual([]);
  });

  it("conclusão do auditor semântico cai na unidade onde está e a apaga", () => {
    const artigo: Artigo = { ...COMPLETO, significado: ["A moratória vai baratear a conta de luz de todo mundo."] };
    const conclusao = { trecho: "vai baratear a conta de luz", tipo: "consequencia" as const, sustentada: false, motivo: "o pacote não diz", pauta: 0 };
    const r = podarArtigo(artigo, veredictoCom([{ id: "significado.0", campo: "significado", texto: "x", motivo: "consequencia" }], [conclusao]));
    expect(r.artigo.significado).toEqual([]);
    expect(r.bloqueios).toEqual([]);
  });

  it("conclusão que não está em lugar nenhum da matéria BLOQUEIA: não há o que apagar", () => {
    const conclusao = { trecho: "frase que não existe no texto de jeito nenhum aqui", tipo: "impacto" as const, sustentada: false, motivo: "", pauta: 0 };
    const r = podarArtigo(COMPLETO, veredictoCom([], [conclusao]));
    expect(r.bloqueios.join(" ")).toContain("sem lugar na matéria");
  });

  it("título reprovado não se poda: a matéria não sai", () => {
    const r = podarArtigo(COMPLETO, veredictoCom([{ id: "titulo", campo: "titulo", texto: "x", motivo: "nome sem lastro" }]));
    expect(r.bloqueios.join(" ")).toContain("TITLE_UNGROUNDED");
  });

  it("resposta que não está no corpo que sobrou sai junto", () => {
    const artigo: Artigo = {
      ...COMPLETO,
      perguntas: [
        { pergunta: "Quantos data centers Chicago tem?", resposta: "Chicago tem 39 data centers ativos." },
        { pergunta: "Quem financia os data centers?", resposta: "Fundos de pensão de Nova York financiam metade deles." },
      ],
    };
    const r = podarArtigo(artigo, veredictoCom([]));
    expect(r.artigo.perguntas.map((p) => p.pergunta)).toEqual(["Quantos data centers Chicago tem?"]);
    expect(r.removidas.some((x) => x.id === "pergunta.1")).toBe(true);
  });

  it("o bloco de significado que só repete o corpo sai", () => {
    const artigo: Artigo = { ...COMPLETO, significado: ["O prefeito Brandon Johnson propôs uma moratória de 12 meses para novos data centers em Chicago."] };
    const r = podarArtigo(artigo, veredictoCom([]));
    expect(r.artigo.significado).toEqual([]);
    expect(r.removidas.find((x) => x.id === "significado.0")?.motivo).toContain("repete o corpo");
  });

  it("matéria sem nenhum parágrafo depois da poda é bloqueada", () => {
    const artigo: Artigo = { ...COMPLETO, abertura: ["a"], secoes: [] };
    const r = podarArtigo(artigo, veredictoCom([{ id: "abertura.0", campo: "abertura", texto: "a", motivo: "x" }]));
    expect(r.bloqueios.join(" ")).toContain("ARTICLE_EMPTY_AFTER_PRUNE");
  });
});

/** O redator responde sempre `artigo`; o auditor semântico não acha nada. */
function openaiFalso(artigo: Artigo) {
  return (async (_url: string | URL, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    const pedido = corpo.messages.map((m: { content: string }) => m.content).join("\n");
    const resposta = pedido.includes("Pacote factual:") && pedido.includes("Texto escrito:") ? { claims: [] } : artigo;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(resposta) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

describe("redação com poda, de ponta a ponta", () => {
  const PAUTA = { classificacao: { pais: "EUA", eixo: "politica" }, grupo: { primary: { source_name: "Axios" } } };
  const MARCA = { nome: "eua.journal", nicho: "EUA", briefing: "", voz: VOZ_PADRAO_DO_ARTIGO };
  const ENV = { OPENAI_API_KEY: "chave-de-teste", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };

  it("o parágrafo com número inventado é APAGADO, não amaciado, e a matéria sai sem ele", async () => {
    const inventado = "A moratória custaria 450 milhões de dólares à cidade.";
    const artigo: Artigo = { ...COMPLETO, secoes: [...COMPLETO.secoes, { intertitulo: "Quanto custa?", paragrafos: [inventado] }] };
    const r = await escreverArtigoDaPauta(PAUTA, PACOTE, MARCA, { env: ENV, fetcher: openaiFalso(artigo) });
    expect(r.veredicto.aprovado).toBe(true);
    expect(r.tentativas).toBe(2);
    const texto = JSON.stringify(r.artigo);
    expect(texto).not.toContain("450");
    expect(r.artigo?.secoes.map((s) => s.intertitulo)).toEqual(["O que foi proposto?", "O que acontece agora?"]);
    expect(r.veredicto.avisos.some((a) => a.startsWith("APAGADO secao.2.0"))).toBe(true);
  });

  it("o redator propõe assuntos; o que não é entidade nem tema da lista sai, e fica no aviso (06/10/2026)", async () => {
    const artigo: Artigo = { ...COMPLETO, assuntos: ["água", "energia", "governo", "data centers", "Brandon Johnson"] };
    const r = await escreverArtigoDaPauta(PAUTA, PACOTE, MARCA, { env: ENV, fetcher: openaiFalso(artigo) });
    // "política municipal" não foi proposto: entra porque o texto fala do prefeito e da câmara municipal.
    expect(r.artigo?.assuntos).toEqual(["Chicago", "Brandon Johnson", "data centers", "política municipal"]);
    expect(r.veredicto.avisos).toEqual(expect.arrayContaining(['ASSUNTO DESCARTADO "água": genérico', 'ASSUNTO DESCARTADO "energia": genérico']));
  });

  it("matéria curta perde o bloco 'O que você precisa saber', e o motivo fica no aviso (06/10/2026)", async () => {
    const r = await escreverArtigoDaPauta(PAUTA, PACOTE, MARCA, { env: ENV, fetcher: openaiFalso(COMPLETO) });
    expect(r.artigo?.essencial).toEqual([]);
    expect(r.veredicto.avisos.some((a) => a.startsWith("APAGADO essencial.0: corpo com"))).toBe(true);
  });

  it("número inventado no TÍTULO não se poda: a matéria fica bloqueada", async () => {
    const artigo: Artigo = { ...COMPLETO, titulo: "Chicago propõe 450 dias sem novos data centers" };
    const r = await escreverArtigoDaPauta(PAUTA, PACOTE, MARCA, { env: ENV, fetcher: openaiFalso(artigo) });
    expect(r.veredicto.aprovado).toBe(false);
    expect(r.veredicto.bloqueios.join(" ")).toContain("TITLE_UNGROUNDED");
  });
});
