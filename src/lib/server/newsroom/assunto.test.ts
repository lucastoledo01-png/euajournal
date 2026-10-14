import { describe, expect, it } from "vitest";
import {
  FORMAS_DO_ASSUNTO,
  aplicarFormaDoAssunto,
  escolherAssunto,
  formaDaVez,
  formasDasEdicoes,
  inferirFormaDoAssunto,
  normalizarAssunto,
  ordemDasFormas,
  problemasDoAssunto,
  separarFormasDasOpcoes,
  type FormaDoAssunto,
} from "./assunto";
import { INSTRUCAO_PADRAO_ASSUNTO, montarSystemEditorial, pedidoDoRodizio } from "./pipeline";
import { EditionContentSchema } from "./schemas";

describe("normalizarAssunto", () => {
  it("põe em caixa baixa inteira, nome próprio e sigla inclusive", () => {
    // O caso real de produção que motivou a conferência.
    expect(normalizarAssunto("O Alasca entrou na conta")).toBe("o alasca entrou na conta");
    expect(normalizarAssunto("O dia que o STF rachou")).toBe("o dia que o stf rachou");
  });

  it("mantém R$ e US$ como símbolo, porque r$ não é caixa baixa de nada", () => {
    expect(normalizarAssunto("O advogado que apostou R$ 5 bi no Tigrinho")).toBe(
      "o advogado que apostou R$ 5 bi no tigrinho",
    );
    expect(normalizarAssunto("A lista dos US$ 30 bilhões")).toBe("a lista dos US$ 30 bilhões");
  });

  it("tira o ponto final e as reticências, e mantém a interrogação", () => {
    expect(normalizarAssunto("a nike saiu do top-100.")).toBe("a nike saiu do top-100");
    expect(normalizarAssunto("a reviravolta eleitoral...")).toBe("a reviravolta eleitoral");
    expect(normalizarAssunto("Quem vai sofrer impeachment?")).toBe("quem vai sofrer impeachment?");
  });

  it("troca travessão por vírgula", () => {
    expect(normalizarAssunto("lula \u2014 trump na onu")).toBe("lula, trump na onu");
  });
});

describe("problemasDoAssunto", () => {
  it("aceita os cinco formatos do The News", () => {
    for (const s of [
      "quem vai sofrer impeachment?",
      "nikolas & vorcaro",
      "lula, trump e delcy na onu",
      "o advogado que apostou R$ 5 bi no tigrinho",
      "a balada com 20 homens e 120 mulheres",
      "o dia que o stf rachou",
    ]) {
      expect(problemasDoAssunto(s), s).toEqual([]);
    }
  });

  it("aponta tamanho, caixa, ponto, travessão e dois-pontos", () => {
    expect(problemasDoAssunto("O Alasca entrou na conta")).toContain("MAIUSCULA");
    expect(problemasDoAssunto("a conta.")).toContain("PONTO_FINAL");
    expect(problemasDoAssunto("lula \u2014 trump")).toContain("TRAVESSAO");
    expect(problemasDoAssunto("juros: o fed cortou")).toContain("DOIS_PONTOS");
    expect(problemasDoAssunto("juros")).toContain("POUCAS_PALAVRAS");
    expect(problemasDoAssunto("o banco central americano corta os juros pela terceira vez seguida hoje")).toEqual(
      expect.arrayContaining(["PALAVRAS_DEMAIS", "CARACTERES_DEMAIS"]),
    );
  });
});

describe("escolherAssunto", () => {
  it("conserta a forma sem trocar de opção quando o tamanho cabe", () => {
    const r = escolherAssunto("O Alasca entrou na conta.", ["o alasca entrou na conta", "a conta do alasca"]);
    expect(r.subject).toBe("o alasca entrou na conta");
    expect(r.trocado).toBe(false);
    expect(r.subject_options).toEqual(["o alasca entrou na conta", "a conta do alasca"]);
  });

  it("troca para a primeira opção que cabe quando a escolhida estoura", () => {
    const r = escolherAssunto("o depósito para garantir a fiança de imigração passa a render juros", [
      "o depósito que rende 3% ao ano",
      "quanto rende a fiança?",
    ]);
    expect(r.subject).toBe("o depósito que rende 3% ao ano");
    expect(r.trocado).toBe(true);
    expect(r.problemas).toEqual([]);
  });

  it("sem nenhuma que caiba, fica a mais curta e o problema é registrado, sem cortar", () => {
    const r = escolherAssunto("o banco central americano corta os juros pela terceira vez seguida", [
      "o banco central americano corta os juros de novo hoje",
    ]);
    expect(r.subject).toBe("o banco central americano corta os juros de novo hoje");
    expect(r.problemas.length).toBeGreaterThan(0);
    expect(r.problemas).not.toContain("MAIUSCULA");
  });
});

describe("aplicarFormaDoAssunto", () => {
  it("devolve a edição com o assunto na forma e diz o que mudou", () => {
    const r = aplicarFormaDoAssunto({ subject: "A Nike saiu do top-100.", subject_options: ["a nike saiu do top-100"] });
    expect(r.edicao.subject).toBe("a nike saiu do top-100");
    expect(r.mudou).toBe(true);
    expect(r.antes).toBe("A Nike saiu do top-100.");
  });
});

describe("o contrato do assunto", () => {
  it("o schema aceita o assunto curto do método, que antes derrubava a edição", () => {
    const campo = EditionContentSchema.shape.subject;
    expect(campo.safeParse("nikolas & vorcaro").success).toBe(true);
    expect(campo.safeParse("lula & trump").success).toBe(true);
  });

  it("a instrução ensina as cinco formas e a regra de verdade, sem travessão", () => {
    expect(INSTRUCAO_PADRAO_ASSUNTO).toContain("UMA história");
    expect(INSTRUCAO_PADRAO_ASSUNTO).toContain("pergunta direta");
    expect(INSTRUCAO_PADRAO_ASSUNTO).toContain("Pergunta só quando a edição RESPONDE");
    expect(INSTRUCAO_PADRAO_ASSUNTO).not.toMatch(/\u2014/);
  });
});


describe("o rodízio das cinco formas (06/10/2026)", () => {
  it("sem histórico começa pela pergunta, na ordem do método", () => {
    expect(ordemDasFormas([])).toEqual([...FORMAS_DO_ASSUNTO]);
    expect(formaDaVez([null, null])).toBe("pergunta");
  });

  it("com tudo dando certo, as cinco passam antes de alguma voltar", () => {
    const historico: FormaDoAssunto[] = [];
    const sequencia: FormaDoAssunto[] = [];
    for (let dia = 0; dia < 10; dia += 1) {
      const vez = formaDaVez(historico);
      sequencia.push(vez);
      historico.unshift(vez);
    }
    expect(sequencia.slice(0, 5)).toEqual(["pergunta", "nomes", "personagem", "cena", "momento"]);
    expect(sequencia.slice(5)).toEqual(sequencia.slice(0, 5));
  });

  it("nunca pede a forma da edição anterior, e a deixa por último", () => {
    for (const ultima of FORMAS_DO_ASSUNTO) {
      const ordem = ordemDasFormas([ultima]);
      expect(ordem[0]).not.toBe(ultima);
      expect(ordem[ordem.length - 1]).toBe(ultima);
      expect(new Set(ordem).size).toBe(5);
    }
  });

  it("a forma que ficou para trás volta a ser a vez quando sai da janela", () => {
    // A vez era "nomes" e o dia caiu para "personagem": "nomes" não se perde.
    const historico: FormaDoAssunto[] = ["personagem", "pergunta"];
    expect(formaDaVez(historico)).toBe("cena");
    historico.unshift("cena");
    expect(formaDaVez(historico)).toBe("momento");
    historico.unshift("momento");
    expect(formaDaVez(historico)).toBe("nomes");
  });

  it("é determinístico: o mesmo histórico dá a mesma ordem", () => {
    const h: FormaDoAssunto[] = ["cena", "nomes", "pergunta"];
    expect(ordemDasFormas(h)).toEqual(ordemDasFormas([...h]));
  });

  it("edição sem forma conhecida não conta", () => {
    expect(formaDaVez([null, "nomes", null])).toBe(formaDaVez(["nomes"]));
  });
});

describe("a escolha pelo rodízio", () => {
  const opcoes = [
    "quem vai pagar a conta do diesel?",
    "trump & o diesel vermelho",
    "o galão que chegou a US$ 6,32",
    "o fazendeiro que paga menos imposto",
    "o dia que o diesel virou palanque",
  ];
  const formas = ["pergunta", "nomes", "cena", "personagem", "momento"];

  it("escolhe a primeira opção válida da forma da vez, e grava a forma", () => {
    const r = escolherAssunto(opcoes[0], opcoes, { formas, recentes: ["pergunta"] });
    expect(r.formaDaVez).toBe("nomes");
    expect(r.forma).toBe("nomes");
    expect(r.subject).toBe("trump & o diesel vermelho");
  });

  it("sem opção válida da forma da vez, cai para a seguinte na ordem", () => {
    const longa = "trump, vance, rubio, hegseth e bessent discutem o diesel vermelho";
    const r = escolherAssunto(opcoes[0], [opcoes[0], longa, ...opcoes.slice(2)], { formas, recentes: ["pergunta"] });
    expect(r.formaDaVez).toBe("nomes");
    expect(r.forma).toBe("personagem");
    expect(r.subject).toBe("o fazendeiro que paga menos imposto");
  });

  it("nunca repete a forma de ontem enquanto houver outra válida", () => {
    const r = escolherAssunto(opcoes[0], [opcoes[0], opcoes[4]], {
      formas: ["pergunta", "momento"],
      recentes: ["pergunta"],
    });
    expect(r.forma).toBe("momento");
  });

  it("opções sem marca seguem a escolha de antes", () => {
    const r = escolherAssunto(opcoes[0], opcoes, { recentes: ["pergunta"] });
    expect(r.subject).toBe(opcoes[0]);
  });

  it("aplicarFormaDoAssunto grava a forma só quando o rodízio foi pedido", () => {
    const edicao = { subject: opcoes[0], subject_options: opcoes, subject_option_forms: formas };
    expect(aplicarFormaDoAssunto(edicao, ["nomes"]).edicao.subject_form).toBe("personagem");
    expect("subject_form" in aplicarFormaDoAssunto(edicao).edicao).toBe(false);
  });
});

describe("as opções marcadas da redação", () => {
  it("viram textos, e as formas vão para a lista paralela", () => {
    const r = separarFormasDasOpcoes({
      subject: "x",
      subject_options: [
        { forma: "pergunta", texto: "quem paga?" },
        { forma: "Nomes", texto: "lula & trump" },
        "texto solto",
        { forma: "inventada", texto: "outra" },
        { forma: "cena", texto: "" },
      ],
    }) as Record<string, unknown>;
    expect(r.subject_options).toEqual(["quem paga?", "lula & trump", "texto solto", "outra"]);
    expect(r.subject_option_forms).toEqual(["pergunta", "nomes", null, null]);
    const valida = EditionContentSchema.shape.subject_option_forms.safeParse(r.subject_option_forms);
    expect(valida.success).toBe(true);
  });
});

describe("a forma das edições gravadas", () => {
  it("a gravada vale; sem ela, a inferência pelo formato, ou nada", () => {
    expect(
      formasDasEdicoes([
        { subject: "qualquer coisa", subject_form: "momento" },
        { subject: "diesel vermelho para todo mundo?" },
        { subject: "nikolas & vorcaro", subject_form: null },
        { subject: "o advogado que apostou R$ 5 bi no tigrinho" },
        { subject: "o dia que o stf rachou" },
        { subject: "a lista dos US$ 30 bilhões" },
        { subject: "o alasca entrou na conta" },
      ]),
    ).toEqual(["momento", "pergunta", "nomes", "personagem", "momento", "cena", null]);
    expect(inferirFormaDoAssunto("")).toBeNull();
  });
});

describe("o pedido do rodízio no prompt", () => {
  it("diz a forma da vez e pede duas opções nela; sem histórico pedido, nada", () => {
    const pedido = pedidoDoRodizio(["pergunta"]);
    expect(pedido).toContain('A forma da vez é "nomes"');
    expect(pedido).toContain("DUAS opções");
    expect(pedido).not.toMatch(/\u2014/);
    expect(pedidoDoRodizio(undefined)).toBe("");
  });

  it("o contrato de saída pede as opções marcadas com a forma", () => {
    const system = montarSystemEditorial({ nome: "x", nicho: "y", extra: "", assinatura: "z" });
    expect(system).toContain('"forma": "pergunta | nomes | personagem | cena | momento"');
  });
});

describe("vírgula decimal no assunto (14/10/2026)", () => {
  it("o número fica inteiro: \"3,6%\" não vira \"3, 6%\"", () => {
    expect(normalizarAssunto("A Social Security e os 3,6%")).toBe("a social security e os 3,6%");
    expect(normalizarAssunto("US$ 2,9 bilhões para submarinos")).toBe("US$ 2,9 bilhões para submarinos");
  });

  it("a vírgula entre palavras continua ganhando o espaço", () => {
    expect(normalizarAssunto("lula,trump e o dólar")).toBe("lula, trump e o dólar");
    expect(normalizarAssunto("o Fed — e os juros")).toBe("o fed, e os juros");
  });

});
