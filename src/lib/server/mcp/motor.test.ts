import { describe, expect, it } from "vitest";
import { modoDoRamo } from "../aprovacao/modo";
import { ehMotorClaude, motorDoProjeto } from "./motor";

describe("no motor Claude a aprovação é sempre manual", () => {
  it("o automático declarado é ignorado no motor Claude, e vale no motor openai", () => {
    const automatico = { post: "automatico", artigo: "automatico", newsletter: "automatico" };
    const claude = { settings: { motor: "claude_mcp", aprovacao: automatico } };
    const openai = { settings: { aprovacao: automatico } };
    for (const ramo of ["post", "artigo", "newsletter"] as const) {
      expect(modoDoRamo(claude, ramo)).toBe("manual");
      expect(modoDoRamo(openai, ramo)).toBe("automatico");
    }
  });
});

describe("o motor do projeto", () => {
  it("sem declaração, é o de antes: openai", () => {
    expect(motorDoProjeto({ settings: {} })).toBe("openai");
    expect(motorDoProjeto({ settings: null })).toBe("openai");
    expect(motorDoProjeto(null)).toBe("openai");
    expect(motorDoProjeto(undefined)).toBe("openai");
  });

  it("claude_mcp só quando escrito certo", () => {
    expect(motorDoProjeto({ settings: { motor: "claude_mcp" } })).toBe("claude_mcp");
    expect(motorDoProjeto({ settings: { motor: " Claude_MCP " } })).toBe("claude_mcp");
    expect(ehMotorClaude({ settings: { motor: "claude_mcp" } })).toBe(true);
  });

  it("valor torto nunca troca quem publica", () => {
    expect(motorDoProjeto({ settings: { motor: "claude" } })).toBe("openai");
    expect(motorDoProjeto({ settings: { motor: "anthropic" } })).toBe("openai");
    expect(motorDoProjeto({ settings: { motor: true } })).toBe("openai");
    expect(motorDoProjeto({ settings: { motor: { nome: "claude_mcp" } } })).toBe("openai");
    expect(ehMotorClaude({ settings: { motor: "claude" } })).toBe(false);
  });
});
