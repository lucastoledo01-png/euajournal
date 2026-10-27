import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { Project } from "@/lib/server/projects";
import {
  gerarTokenDoMcp,
  requireTokenDoMcp,
  resumoDoToken,
  type DepsDoAcesso,
  type LinhaDoToken,
} from "./tokens";

const PROJETO_CLAUDE = { id: "p1", slug: "teste", settings: { motor: "claude_mcp" } } as unknown as Project;
const PROJETO_OPENAI = { id: "p2", slug: "eua", settings: {} } as unknown as Project;

function pedido(cabecalho?: string) {
  return new NextRequest("https://exemplo.test/api/mcp/estado-do-dia", {
    headers: cabecalho ? { authorization: cabecalho } : {},
  });
}

function deps(linhas: Record<string, LinhaDoToken>, projetos: Record<string, Project>, falhar = false): DepsDoAcesso {
  return {
    tokens: {
      async porResumo(resumo) {
        if (falhar) throw new Error("Gateway Timeout");
        return linhas[resumo] ?? null;
      },
      async marcarUso() {},
    },
    async projetoPorId(id) {
      return projetos[id] ?? null;
    },
  };
}

describe("o token do MCP", () => {
  const token = gerarTokenDoMcp();
  const linha: LinhaDoToken = { id: "t1", projectId: "p1", rotulo: "lucas", revogadoEm: null };
  const banco = { [resumoDoToken(token)]: linha };

  it("libera o token ativo de um projeto com motor Claude, e diz quem é", async () => {
    const r = await requireTokenDoMcp(pedido(`Bearer ${token}`), deps(banco, { p1: PROJETO_CLAUDE }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.acesso.projeto.slug).toBe("teste");
      expect(r.acesso.quem).toBe("dono:via-claude:lucas");
    }
  });

  it("nega sem cabeçalho, com token desconhecido e com token revogado", async () => {
    const d = deps(banco, { p1: PROJETO_CLAUDE });
    expect((await requireTokenDoMcp(pedido(), d)).ok).toBe(false);
    expect((await requireTokenDoMcp(pedido(`Bearer ${gerarTokenDoMcp()}`), d)).ok).toBe(false);
    expect((await requireTokenDoMcp(pedido("Bearer qualquer-coisa"), d)).ok).toBe(false);

    const revogado = { [resumoDoToken(token)]: { ...linha, revogadoEm: "2026-10-27T00:00:00Z" } };
    const r = await requireTokenDoMcp(pedido(`Bearer ${token}`), deps(revogado, { p1: PROJETO_CLAUDE }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.resposta.status).toBe(401);
  });

  it("projeto de volta ao motor openai corta o MCP na hora", async () => {
    const r = await requireTokenDoMcp(pedido(`Bearer ${token}`), deps(banco, { p1: PROJETO_OPENAI }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.resposta.status).toBe(403);
  });

  it("banco fora do ar é 503, não 'token inválido'", async () => {
    const r = await requireTokenDoMcp(pedido(`Bearer ${token}`), deps(banco, { p1: PROJETO_CLAUDE }, true));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.resposta.status).toBe(503);
  });

  it("o banco guarda só o resumo, e o resumo não é o token", () => {
    expect(resumoDoToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(resumoDoToken(token)).not.toContain(token);
    expect(gerarTokenDoMcp()).not.toBe(gerarTokenDoMcp());
  });
});
