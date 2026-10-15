import { describe, expect, it } from "vitest";
import { runNewsroomPipeline } from "./pipeline";
import type { RankedCandidate } from "./ranker";
import type { PacoteFactual } from "../editorial/pacote-factual";

/**
 * O defeito mais caro que este sistema teve, e o que ele custou.
 *
 * Entre 04/09 e 16/09 de 2026 a redação rodou 13 manhãs e publicou 5. As de
 * 13, 14 e 15 de setembro morreram inteiras, e no dia 16 três execuções
 * morreram antes de a quarta passar. O motivo estava sempre na mesma linha: o
 * portão reprovava a EDIÇÃO quando UMA conclusão de UMA matéria não se
 * sustentava no pacote factual.
 *
 * Isso seria defensável se o juiz fosse determinístico. Ele não é: quem decide
 * é um modelo, e o mesmo texto reprovava numa chamada e passava na seguinte.
 * Na prática, cada manhã era um sorteio com quatro bilhetes.
 *
 * A troca é de escopo, não de rigor. A matéria sem lastro continua não sendo
 * publicada; ela é que sai, e não a edição. E existe piso: abaixo do mínimo de
 * pautas a edição não sai, porque aí o problema é do dia, não da matéria.
 */

const PACOTE = (url: string): PacoteFactual => ({
  verified_facts: ["O órgão publicou um aviso em 15 de setembro de 2026."],
  people: [],
  organizations: ["USCIS"],
  places: ["Estados Unidos"],
  dates: ["15 de setembro de 2026"],
  numbers: [],
  gaps: [],
  source_urls: [url],
  texto_de_origem: "O órgão publicou um aviso em 15 de setembro de 2026.",
});

function candidata(i: number): RankedCandidate {
  const url = `https://exemplo.org/materia-${i}`;
  return {
    score: 100 - i,
    reasons: [],
    group: {
      primary: {
        title: NOMES[i],
        url,
        source_name: "Fonte",
        source_id: "fonte",
        published_at: "2026-09-16T10:00:00.000Z",
        description: "O órgão publicou um aviso.",
        dedupe_key: `k-${i}`,
        image_url: `https://exemplo.org/foto-${i}.jpg`,
      },
      duplicates: [],
    },
  } as unknown as RankedCandidate;
}

/** Sem número no título: o conferidor de ancoragem cobra todo número do texto. */
const NOMES = ["Matéria alfa", "Matéria beta", "Matéria gama"];

function historia(i: number) {
  return {
    rank: i + 1,
    category: "Economia",
    title: NOMES[i],
    summary: "O órgão publicou um aviso em 15 de setembro de 2026.",
    context: "O aviso saiu em 15 de setembro de 2026.",
    why_it_matters: "Quem acompanha o assunto precisa saber do aviso.",
    practical_impact: "O aviso vale desde 15 de setembro de 2026.",
    source_name: "Fonte",
    source_url: `https://exemplo.org/materia-${i}`,
    secondary_urls: [],
  };
}

function edicaoDeTres() {
  return {
    subject_options: ["Uma opção de assunto", "Outra opção de assunto", "Terceira opção aqui"],
    subject: "O aviso que saiu nesta terça-feira",
    preheader: "O que mudou, em três matérias curtas e diretas",
    headline: "O aviso da semana",
    intro:
      "Bom dia. Hoje a edição tem três assuntos, e todos eles saíram de aviso publicado por órgão oficial nesta semana.",
    stories: [historia(0), historia(1), historia(2)],
    quick_bits: [],
    closing: "Compartilhe com quem acompanha o assunto.",
    final_line: "Até amanhã.",
  };
}

/**
 * Um OpenAI falso. Ele responde três coisas diferentes, e escolhe pelo texto
 * do pedido, que é como o pipeline as distingue de verdade.
 */
function openaiFalso(claims: Array<Record<string, unknown>>) {
  const chamadas: string[] = [];

  const fetcher = (async (_entrada: string | URL, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    const pedido = corpo.messages.map((m: { content: string }) => m.content).join("\n");

    let resposta: unknown;
    if (pedido.includes("O QUE É ALUCINAÇÃO AQUI")) {
      chamadas.push("qa");
      resposta = {
        passed: true,
        hallucination_risk: false,
        tone_check_passed: true,
        grammar_passed: true,
        story_count_valid: true,
        issues: [],
        score: 92,
      };
    } else if (pedido.includes("Pacote factual:") && pedido.includes("Texto escrito:")) {
      chamadas.push("claims");
      resposta = { claims };
    } else {
      chamadas.push("edicao");
      resposta = edicaoDeTres();
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(resposta) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  return { fetcher, chamadas };
}

const ENV = { OPENAI_API_KEY: "chave-de-teste", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };

function pacotes() {
  return new Map([0, 1, 2].map((i) => [`https://exemplo.org/materia-${i}`, PACOTE(`https://exemplo.org/materia-${i}`)]));
}

describe("uma pauta sem lastro não derruba a edição", () => {
  it("tira a matéria e publica o resto", async () => {
    const { fetcher } = openaiFalso([
      { trecho: "O aviso vale desde 15 de setembro", tipo: "consequencia", sustentada: true, motivo: "", pauta: 0 },
      { trecho: "uma previsão qualquer", tipo: "previsao", sustentada: false, motivo: "o pacote não prevê nada", pauta: 1 },
      { trecho: "O aviso saiu", tipo: "causalidade", sustentada: true, motivo: "", pauta: 2 },
    ]);

    const r = await runNewsroomPipeline(
      [candidata(0), candidata(1), candidata(2)],
      ENV,
      fetcher,
      undefined,
      { minimo: 2, maximo: 4 },
      pacotes(),
      // Sem tentativa de reparo: o que se mede aqui é o desfecho, não o conserto.
      0,
    );

    expect(r.aprovado).toBe(true);
    expect(r.bloqueios).toEqual([]);
    expect(r.edition.stories).toHaveLength(2);
    expect(r.edition.stories.map((s) => s.title)).toEqual(["Matéria alfa", "Matéria gama"]);

    // A matéria retirada fica registrada, com o motivo.
    expect(r.pautasRemovidas).toHaveLength(1);
    expect(r.pautasRemovidas[0].titulo).toBe("Matéria beta");
    expect(r.pautasRemovidas[0].motivo).toContain("não prevê");
  });

  /**
   * As duas listas são cortadas juntas.
   *
   * `selectedCandidates[i]` é de onde sai a imagem do feed de cada matéria, com
   * o MESMO índice. Cortar só as pautas faria cada matéria herdar a foto da
   * seguinte, e ninguém notaria olhando o texto.
   */
  it("corta a candidata junto com a pauta, e a foto continua sendo a da matéria", async () => {
    const { fetcher } = openaiFalso([
      { trecho: "x", tipo: "previsao", sustentada: false, motivo: "sem lastro", pauta: 1 },
    ]);

    const r = await runNewsroomPipeline(
      [candidata(0), candidata(1), candidata(2)],
      ENV,
      fetcher,
      undefined,
      { minimo: 2, maximo: 4 },
      pacotes(),
      0,
    );

    expect(r.selectedCandidates).toHaveLength(2);
    expect(r.selectedCandidates.map((c) => c.url)).toEqual([
      "https://exemplo.org/materia-0",
      "https://exemplo.org/materia-2",
    ]);
  });

  it("abaixo do mínimo, a edição não sai: aí o problema é do dia", async () => {
    const { fetcher } = openaiFalso([
      { trecho: "a", tipo: "previsao", sustentada: false, motivo: "sem lastro", pauta: 0 },
      { trecho: "b", tipo: "previsao", sustentada: false, motivo: "sem lastro", pauta: 1 },
    ]);

    const r = await runNewsroomPipeline(
      [candidata(0), candidata(1), candidata(2)],
      ENV,
      fetcher,
      undefined,
      // Com mínimo 2 e duas pautas reprovadas de três, sobraria uma.
      { minimo: 2, maximo: 4 },
      pacotes(),
      0,
    );

    expect(r.aprovado).toBe(false);
    expect(r.edition.stories).toHaveLength(3);
    expect(r.pautasRemovidas).toEqual([]);
    expect(r.bloqueios.join(" ")).toContain("UNGROUNDED_EDITORIAL_CLAIM");
  });

  it("edição sem problema nenhum passa sem remover nada", async () => {
    const { fetcher } = openaiFalso([
      { trecho: "ok", tipo: "consequencia", sustentada: true, motivo: "", pauta: 0 },
    ]);

    const r = await runNewsroomPipeline(
      [candidata(0), candidata(1), candidata(2)],
      ENV,
      fetcher,
      undefined,
      { minimo: 2, maximo: 4 },
      pacotes(),
      0,
    );

    expect(r.aprovado).toBe(true);
    expect(r.edition.stories).toHaveLength(3);
    expect(r.pautasRemovidas).toEqual([]);
  });

  /*
   * A frase sem lastro na MOLDURA (abertura, giro rápido, fechamento) também
   * não derruba a edição: a moldura é trocada pela versão neutra. Foi o caso do
   * primeiro ensaio da produção na véspera, em 05/10/2026.
   */
  it("frase sem lastro na abertura troca a moldura e mantém as matérias", async () => {
    const { fetcher } = openaiFalso([
      { trecho: "uma previsão na abertura", tipo: "previsao", sustentada: false, motivo: "o pacote não prevê nada", pauta: -1 },
    ]);

    const r = await runNewsroomPipeline(
      [candidata(0), candidata(1), candidata(2)],
      ENV,
      fetcher,
      undefined,
      { minimo: 2, maximo: 4 },
      pacotes(),
      0,
    );

    expect(r.aprovado).toBe(true);
    expect(r.edition.stories).toHaveLength(3);
    expect(r.pautasRemovidas).toEqual([]);
    expect(r.edition.intro).toMatch(/^Bom dia!/);
    expect(r.edition.intro).not.toContain("Matéria alfa");
    expect(r.avisos.join(" ")).toContain("MOLDURA_NEUTRA");
    expect(r.avisos.join(" ")).toContain("não prevê");
  });
});
