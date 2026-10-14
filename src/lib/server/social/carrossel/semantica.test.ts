import { describe, expect, it, vi } from "vitest";
import { auditarCarrossel, auditarEstatico } from "./semantica";
import { montarSystemDeClaims } from "../../editorial/claims-semanticas";
import { papeisPara } from "./estrutura";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import type { ClaimSemantica, ResultadoDeClaims } from "../../editorial/claims-semanticas";
import { montarSystemDoCarrossel, type SlideDeTexto } from "./copy";

/**
 * A claim que não tem número, data nem nome próprio.
 *
 * "Essa categoria permite trabalhar para qualquer empresa nos EUA" é uma
 * afirmação enorme e passava com zero claims conferidas, porque a conferência
 * determinística não tem o que conferir nela. Quem confere é o auditor
 * semântico que a newsletter já usa, e o que estes testes travam é o CAMINHO: o
 * que é enviado, o que volta, e o que o sistema faz com a resposta.
 *
 * O julgamento em si é de modelo, e não se testa com asserção. Ele é exercitado
 * no preview de verdade, contra as fontes de verdade.
 */

const PACOTE: PacoteFactual = {
  verified_facts: [
    "O ajuste de status permite pedir o green card sem sair dos Estados Unidos.",
    "A USCIS pode pedir evidencia adicional antes de decidir.",
  ],
  people: [],
  organizations: ["USCIS"],
  places: ["Estados Unidos"],
  dates: [],
  numbers: [],
  gaps: ["A pagina nao informa prazo de analise."],
  source_urls: ["https://www.uscis.gov/x"],
  texto_de_origem: "O ajuste de status permite pedir o green card sem sair dos Estados Unidos.",
} as PacoteFactual;

function slide(over: Partial<SlideDeTexto> = {}): SlideDeTexto {
  return {
    papel: "o que é",
    titulo: "Ajuste de status",
    corpo: "É o pedido de green card feito por quem já está nos Estados Unidos.",
    bullets: [],
    lado_a: "",
    lado_b: "",
    ...over,
  } as SlideDeTexto;
}

/** Auditor de mentira: registra o que recebeu e devolve o que o teste pedir. */
function auditorFalso(claims: ClaimSemantica[], erro: string | null = null) {
  const recebidos: Array<{ indice: number; titulo: string; texto: string }> = [];
  const opcoesRecebidas: Array<Record<string, unknown> | undefined> = [];

  const auditor = vi.fn(
    async (
      pautas: Array<{ indice: number; titulo: string; texto: string; pacote: PacoteFactual }>,
      _env?: unknown,
      _fetcher?: unknown,
      opcoes?: Record<string, unknown>,
    ): Promise<ResultadoDeClaims> => {
      for (const p of pautas) recebidos.push({ indice: p.indice, titulo: p.titulo, texto: p.texto });
      opcoesRecebidas.push(opcoes);
      return {
        claims,
        naoSustentadas: claims.filter((c) => !c.sustentada),
        custoUsd: 0.001,
        tokens: 100,
        erro,
      };
    },
  );

  return { auditor: auditor as never, recebidos, opcoesRecebidas, chamadas: auditor };
}

const PAPEIS = papeisPara("explainer", 6, true);
const DO_MODELO = PAPEIS.filter((p) => !p.escritoEmCodigo);

describe("uma chamada para o post, rastreável por slide", () => {
  it("todos os slides do modelo vão numa chamada só", () => {
    /*
     * O pedido abre isso explicitamente: não precisa de uma chamada de IA por
     * frase, desde que o resultado seja rastreável por slide. É o que
     * `auditarClaims` já faz para a newsletter, com o índice fazendo a
     * rastreabilidade.
     */
    const { auditor, recebidos, chamadas } = auditorFalso([]);
    const slides = DO_MODELO.map((p) => slide({ papel: p.papel }));

    return auditarCarrossel({ headline: "H", slides, papeis: PAPEIS, pacote: PACOTE }, { auditor }).then(() => {
      expect(chamadas).toHaveBeenCalledTimes(1);
      expect(recebidos).toHaveLength(slides.length);
      expect(recebidos.map((r) => r.indice)).toEqual(slides.map((_, i) => i));
    });
  });

  it("o título de cada item nomeia a posição na peça e o papel", async () => {
    const { auditor, recebidos } = auditorFalso([]);
    const slides = DO_MODELO.map((p) => slide({ papel: p.papel }));

    await auditarCarrossel({ headline: "H", slides, papeis: PAPEIS, pacote: PACOTE }, { auditor });

    // A capa é o papel 1, então o primeiro slide do modelo é a posição 2.
    expect(recebidos[0].titulo).toBe(`slide 2 (${DO_MODELO[0].papel})`);
  });

  it("o texto enviado é todo o texto do slide, inclusive bullets e colunas", async () => {
    const { auditor, recebidos } = auditorFalso([]);
    const s = slide({ corpo: "Corpo.", bullets: ["Bullet um", "Bullet dois"], lado_a: "", lado_b: "" });

    await auditarCarrossel({ headline: "H", slides: [s], papeis: PAPEIS, pacote: PACOTE }, { auditor });

    expect(recebidos[0].texto).toContain("Corpo.");
    expect(recebidos[0].texto).toContain("Bullet um");
    expect(recebidos[0].texto).toContain("Bullet dois");
  });

  it("a auditoria de escopo é pedida", async () => {
    const { auditor, opcoesRecebidas } = auditorFalso([]);
    await auditarCarrossel(
      { headline: "H", slides: [slide()], papeis: PAPEIS, pacote: PACOTE },
      { auditor },
    );
    expect(opcoesRecebidas[0]).toEqual({ comEscopo: true });
  });

  it("slide vazio não é enviado, e post sem slide não gasta chamada", async () => {
    const { auditor, chamadas } = auditorFalso([]);
    const r = await auditarCarrossel(
      { headline: "H", slides: [], papeis: PAPEIS, pacote: PACOTE },
      { auditor },
    );
    expect(chamadas).not.toHaveBeenCalled();
    expect(r.problemas).toEqual([]);
  });
});

describe("claim não sustentada vira problema com o número do slide", () => {
  it("a claim qualitativa reprovada aponta o slide certo", async () => {
    const { auditor } = auditorFalso([
      {
        trecho: "permite trabalhar para qualquer empresa nos EUA",
        tipo: "impacto",
        sustentada: false,
        motivo: "o pacote não diz nada sobre trabalhar para qualquer empresa",
        pauta: 1,
      },
    ]);

    const slides = DO_MODELO.map((p) => slide({ papel: p.papel }));
    const r = await auditarCarrossel(
      { headline: "H", slides, papeis: PAPEIS, pacote: PACOTE },
      { auditor },
    );

    expect(r.naoSustentadas).toHaveLength(1);
    // Índice 1 no array do modelo é o papel 2 do modelo, posição 3 na peça.
    expect(r.naoSustentadas[0].posicao).toBe(3);
    expect(r.naoSustentadas[0].papel).toBe(DO_MODELO[1].papel);

    expect(r.problemas).toHaveLength(1);
    expect(r.problemas[0].motivo).toBe("SOCIAL_REJECT_CLAIM_UNSUPPORTED");
    expect(r.problemas[0].reparavel).toBe(true);
    expect(r.problemas[0].detalhe).toContain("slide 3");
    expect(r.problemas[0].detalhe).toContain("qualquer empresa");
  });

  it("claim de escopo reprovada entra pelo mesmo caminho", async () => {
    const { auditor } = auditorFalso([
      {
        trecho: "garante a residência permanente",
        tipo: "escopo",
        sustentada: false,
        motivo: 'a fonte diz "pode", e o texto diz "garante"',
        pauta: 0,
      },
    ]);

    const r = await auditarCarrossel(
      { headline: "H", slides: [slide()], papeis: PAPEIS, pacote: PACOTE },
      { auditor },
    );

    expect(r.problemas[0].detalhe).toContain("[escopo]");
    expect(r.problemas[0].reparavel).toBe(true);
  });

  it("o slide opcional é marcado como removível, o obrigatório não", async () => {
    const obrigatorio = DO_MODELO.findIndex((p) => p.obrigatorio);
    const opcional = DO_MODELO.findIndex((p) => !p.obrigatorio);
    expect(obrigatorio).toBeGreaterThanOrEqual(0);
    expect(opcional).toBeGreaterThanOrEqual(0);

    const { auditor } = auditorFalso([
      { trecho: "a", tipo: "impacto", sustentada: false, motivo: "", pauta: obrigatorio },
      { trecho: "b", tipo: "impacto", sustentada: false, motivo: "", pauta: opcional },
    ]);

    const slides = DO_MODELO.map((p) => slide({ papel: p.papel }));
    const r = await auditarCarrossel(
      { headline: "H", slides, papeis: PAPEIS, pacote: PACOTE },
      { auditor },
    );

    expect(r.naoSustentadas.find((c) => c.papel === DO_MODELO[obrigatorio].papel)?.removivel).toBe(false);
    expect(r.naoSustentadas.find((c) => c.papel === DO_MODELO[opcional].papel)?.removivel).toBe(true);
  });

  it("claim sustentada não vira problema", async () => {
    const { auditor } = auditorFalso([
      { trecho: "sem sair dos Estados Unidos", tipo: "impacto", sustentada: true, motivo: "", pauta: 0 },
    ]);

    const r = await auditarCarrossel(
      { headline: "H", slides: [slide()], papeis: PAPEIS, pacote: PACOTE },
      { auditor },
    );

    expect(r.claims).toHaveLength(1);
    expect(r.naoSustentadas).toEqual([]);
    expect(r.problemas).toEqual([]);
  });
});

describe("auditoria que não rodou NÃO é aprovação", () => {
  it("erro do auditor vira problema FATAL", async () => {
    /*
     * Vazio não é o mesmo que aprovado. Sem isso, uma falha de rede publicaria
     * um carrossel cuja verificação semântica nunca aconteceu, e o post
     * pareceria verificado.
     */
    const { auditor } = auditorFalso([], "timeout ao chamar o modelo");

    const r = await auditarCarrossel(
      { headline: "H", slides: [slide()], papeis: PAPEIS, pacote: PACOTE },
      { auditor },
    );

    expect(r.problemas).toHaveLength(1);
    expect(r.problemas[0].motivo).toBe("SOCIAL_REJECT_CLAIM_NOT_AUDITED");
    expect(r.problemas[0].reparavel).toBe(false);
  });

  it("erro não é confundido com ausência de claim", async () => {
    const { auditor } = auditorFalso([], "formato inválido");
    const r = await auditarCarrossel(
      { headline: "H", slides: [slide()], papeis: PAPEIS, pacote: PACOTE },
      { auditor },
    );
    expect(r.erro).toBe("formato inválido");
    expect(r.problemas[0].reparavel).toBe(false);
  });
});

describe("a peça única passa pelo mesmo auditor", () => {
  it("a legenda inteira vai como um item", async () => {
    const { auditor, recebidos, chamadas } = auditorFalso([]);
    await auditarEstatico(
      { titulo: "Ajuste de status", texto: "A legenda inteira do post.", pacote: PACOTE },
      { auditor },
    );

    expect(chamadas).toHaveBeenCalledTimes(1);
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0].texto).toBe("A legenda inteira do post.");
  });

  it("claim reprovada na peça única é reparável", async () => {
    const { auditor } = auditorFalso([
      { trecho: "vale para todos", tipo: "escopo", sustentada: false, motivo: "", pauta: 0 },
    ]);
    const r = await auditarEstatico({ titulo: "T", texto: "Vale para todos.", pacote: PACOTE }, { auditor });

    expect(r.problemas[0].motivo).toBe("SOCIAL_REJECT_CLAIM_UNSUPPORTED");
    expect(r.problemas[0].reparavel).toBe(true);
    expect(r.problemas[0].detalhe).toContain("a legenda afirma");
  });

  it("legenda vazia não gasta chamada", async () => {
    const { auditor, chamadas } = auditorFalso([]);
    const r = await auditarEstatico({ titulo: "T", texto: "   ", pacote: PACOTE }, { auditor });
    expect(chamadas).not.toHaveBeenCalled();
    expect(r.problemas).toEqual([]);
  });
});

describe("o prompt do escopo só existe para quem pede", () => {
  it("com escopo, as cinco trocas proibidas estão no prompt", () => {
    const p = montarSystemDeClaims({ comEscopo: true });
    expect(p).toContain('"escopo"');
    expect(p).toContain("possibilidade por certeza");
    expect(p).toContain("parte por todo");
    expect(p).toContain("um caso por uma regra");
    expect(p).toContain("evidência por exigência");
    expect(p).toContain("permissão por direito");
  });

  it("sem escopo, o prompt da newsletter continua o mesmo", () => {
    /*
     * A newsletter está publicando. Mudar o prompt dela de carona numa mudança
     * do conteúdo permanente é como uma regressão editorial aparece sem
     * ninguém saber de onde veio.
     */
    const p = montarSystemDeClaims();
    expect(p).not.toContain('"escopo"');
    expect(p).not.toContain("possibilidade por certeza");
  });
});

describe("o prompt da copy previne, além de o auditor detectar", () => {
  const MARCA = { nome: "imigra.us", nicho: "imigração", extra: "", keyword: "VISA" };
  const prompt = () => montarSystemDoCarrossel(MARCA, "comparison", PAPEIS);

  it("as cinco trocas proibidas estão no prompt de quem escreve", () => {
    /*
     * Detectar depois é o segundo melhor resultado. O melhor é o modelo não
     * cometer, e para isso a instrução tem que estar onde ele escreve, não só
     * onde alguém confere.
     */
    const p = prompt();
    expect(p).toContain("possibilidade por certeza");
    expect(p).toContain("parte por todo");
    expect(p).toContain("um caso por uma regra");
    expect(p).toContain("evidência por exigência");
    expect(p).toContain("permissão por direito");
    expect(p).toContain("Escopo correto vale mais que manchete bonita");
  });

  it("o exemplo de linguagem para pessoa comum está no prompt, com o par certo", () => {
    const p = prompt();
    // O leitor vem da fonte única (14/10/2026), e não de uma frase própria do carrossel.
    expect(p).toContain("pensa em morar nos EUA e acompanha o país para tomar decisões de dinheiro e de carreira");
    expect(p).not.toContain("sonha");
    // O par trocou de assunto em 05/10/2026 (saiu o RFE, entrou o yield); o ensinamento é o mesmo.
    expect(p).toContain("O yield da Treasury de 10 anos avançou com o guidance hawkish do Fomc.");
    expect(p).toContain("o comitê do Fed, o Fomc");
    /* E a ressalva que impede a explicação de virar acréscimo. */
    expect(p).toContain("Explicar não autoriza acrescentar");
  });
});
