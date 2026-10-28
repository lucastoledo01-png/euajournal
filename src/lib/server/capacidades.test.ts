import { describe, expect, it } from "vitest";
import {
  CAPACIDADES,
  capacidadeDeclarada,
  capacidadesDeclaradas,
  resolverCapacidade,
} from "./capacidades";
import { modoDoPipelineSocial } from "./social/modo";
import { modoDoEvergreen } from "./social/evergreen/modo";
import { modoDaGuarda } from "./editorial/modo";
import { modoDoResolvedorVisual } from "./visual/modo";

/**
 * A capacidade sai do ambiente e entra no projeto.
 *
 * Variável de ambiente é global ao deploy: ligar o social no projeto A ligava
 * no projeto B junto. Com um projeto só isso nunca doeu; com dois, é o
 * bloqueio que impede a plataforma de existir.
 *
 * A mudança é ADITIVA de propósito, e estes testes existem para provar isso:
 * projeto que não declara nada se comporta exatamente como antes. Foi o que
 * permitiu subir o alicerce sem mexer no ciclo que já roda em produção.
 */

const semDeclaracao = { settings: {} };
const comSocialEnforce = { settings: { capacidades: { social: "enforce" } } };

describe("o projeto declara, o ambiente é o padrão", () => {
  it("sem declaração, devolve null e quem chama cai no ambiente", () => {
    expect(capacidadeDeclarada(semDeclaracao, "social")).toBeNull();
    expect(capacidadeDeclarada(null, "social")).toBeNull();
    expect(capacidadeDeclarada(undefined, "social")).toBeNull();
    expect(capacidadeDeclarada({ settings: null }, "social")).toBeNull();
  });

  it("null é informação: significa `pergunte ao ambiente`, não `desligado`", () => {
    const doAmbiente = () => "enforce" as const;
    expect(resolverCapacidade("social", doAmbiente, semDeclaracao)).toBe("enforce");
    expect(resolverCapacidade("social", doAmbiente, null)).toBe("enforce");
  });

  it("o que o projeto declara vence o ambiente", () => {
    const doAmbiente = () => "off" as const;
    expect(resolverCapacidade("social", doAmbiente, comSocialEnforce)).toBe("enforce");
  });

  it("declarar off vence um ambiente em enforce", () => {
    // A direção que protege: o projeto consegue se desligar sozinho, mesmo com
    // o deploy inteiro ligado.
    const doAmbiente = () => "enforce" as const;
    const projeto = { settings: { capacidades: { social: "off" } } };
    expect(resolverCapacidade("social", doAmbiente, projeto)).toBe("off");
  });

  it("valor irreconhecível vira off, nunca enforce e nunca fallback", () => {
    /*
     * Um erro de digitação no painel não pode ligar publicação. E cair no
     * ambiente seria pior: o operador veria um valor na tela e outro valendo.
     */
    const doAmbiente = () => "enforce" as const;
    const projeto = { settings: { capacidades: { social: "ENFORCE!" } } };
    expect(resolverCapacidade("social", doAmbiente, projeto)).toBe("off");
  });

  it("aceita caixa e espaço, porque vem de formulário", () => {
    const doAmbiente = () => "off" as const;
    expect(resolverCapacidade("social", doAmbiente, { settings: { capacidades: { social: " Enforce " } } })).toBe(
      "enforce",
    );
  });

  it("settings malformado não derruba nada", () => {
    for (const settings of [{ capacidades: "sim" }, { capacidades: [] }, { capacidades: null }]) {
      expect(capacidadeDeclarada({ settings }, "social")).toBeNull();
    }
  });

  it("capacidadesDeclaradas devolve só o que o projeto declarou", () => {
    const projeto = { settings: { capacidades: { social: "enforce", evergreen: "dry_run", inventada: "x" } } };
    expect(capacidadesDeclaradas(projeto)).toEqual({ social: "enforce", evergreen: "dry_run" });
    expect(capacidadesDeclaradas(semDeclaracao)).toEqual({});
  });
});

describe("os quatro resolvedores de modo respeitam o projeto", () => {
  const casos = [
    { nome: "social", fn: modoDoPipelineSocial, env: { SOCIAL_PIPELINE_V2: "off" }, capacidade: "social" },
    { nome: "evergreen", fn: modoDoEvergreen, env: { SOCIAL_EVERGREEN_V2: "off" }, capacidade: "evergreen" },
    { nome: "guarda editorial", fn: modoDaGuarda, env: { EDITORIAL_GUARD: "off" }, capacidade: "coleta" },
    { nome: "resolvedor visual", fn: modoDoResolvedorVisual, env: { VISUAL_RESOLVER_V2: "off" }, capacidade: "visual" },
  ] as const;

  for (const caso of casos) {
    it(`${caso.nome}: sem projeto, lê o ambiente como sempre leu`, () => {
      expect(caso.fn(caso.env)).toBe("off");
      expect(caso.fn({ ...caso.env, [Object.keys(caso.env)[0]]: "enforce" })).toBe("enforce");
    });

    it(`${caso.nome}: projeto sem declaração não muda nada`, () => {
      expect(caso.fn(caso.env, semDeclaracao)).toBe("off");
    });

    it(`${caso.nome}: projeto declarando vence o ambiente`, () => {
      const projeto = { settings: { capacidades: { [caso.capacidade]: "enforce" } } };
      expect(caso.fn(caso.env, projeto)).toBe("enforce");
    });
  }

  it("a guarda editorial mantém o default dry_run quando ninguém diz nada", () => {
    // Contrato antigo, e ele não pode mudar de carona: sem EDITORIAL_GUARD o
    // modo é `dry_run`, não `off`.
    expect(modoDaGuarda({})).toBe("dry_run");
    expect(modoDaGuarda({}, semDeclaracao)).toBe("dry_run");
  });
});

describe("o cardápio de capacidades", () => {
  it("cobre as cinco que o painel vai oferecer, e o funil", () => {
    expect([...CAPACIDADES]).toEqual([
      "coleta",
      "newsletter",
      "social",
      "evergreen",
      "visual",
      "keyword",
      "landing",
      "ramos",
      "perfis_referencia",
      "acervo",
      "producao_vespera",
      "instrucoes",
      "aprovacao",
      "carrossel_noticia",
      "calor",
      "radar",
      "termometro",
      "quente_da_tarde",
      "reels",
    ]);
  });
});
