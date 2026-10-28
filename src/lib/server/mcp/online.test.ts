import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Project } from "@/lib/server/projects";
import { backendDireto, responderMcp } from "./online";
import type { Resposta } from "./servico";
import type { AcessoDoMcp } from "./tokens";

/**
 * O MCP online com um cliente MCP de verdade: o mesmo protocolo que o Claude
 * Code usa, passando por `responderMcp` como passaria pela rota, sem banco.
 */

const ACESSO: AcessoDoMcp = {
  projeto: { id: "p1", slug: "teste-claude", name: "Teste" } as unknown as Project,
  rotulo: "lucas-mac",
  quem: "dono:via-claude:lucas-mac",
};

function chamadasFalsas(registro: Array<{ nome: string; args: Record<string, unknown> }>) {
  const ok = (nome: string, extra: Record<string, unknown> = {}) =>
    async (_a: AcessoDoMcp, args: Record<string, unknown>): Promise<Resposta> => {
      registro.push({ nome, args });
      return { ok: true, ...extra };
    };
  return {
    estado_do_dia: ok("estado_do_dia", { proximoPasso: "Peça a próxima tarefa." }),
    ver_fila: ok("ver_fila", { pecas: [] }),
    pautas_disponiveis: ok("pautas_disponiveis", { pautas: [] }),
    iniciar_post: async (): Promise<Resposta> => ({ ok: false, error: "a pauta x não está entre os posts", status: 422 }),
    proxima_tarefa: ok("proxima_tarefa", { tarefa: null }),
    entregar_tarefa: ok("entregar_tarefa", { desfecho: "auditar" }),
    montar_post: ok("montar_post", { manchete: "M", legenda: "L", imagem: { mime: "image/jpeg", base64: "AAAA" } }),
    agendar_post: ok("agendar_post", { quando: "2026-10-28T11:00:00Z" }),
    reels_sugeridos: ok("reels_sugeridos", { reels: [] }),
    produzir_reel: ok("produzir_reel", { candidato_id: "c1" }),
    ver_reel: ok("ver_reel", { estado: "nova", imagem: { mime: "image/jpeg", base64: "AAAA" } }),
    fazer_o_dia: ok("fazer_o_dia", { passo: "tarefa", imagens: [{ mime: "image/jpeg", base64: "BBBB" }], tarefa: { id: "t1" } }),
    aguardar: ok("aguardar", { passo: "aguardar" }),
  };
}

async function conectar(registro: Array<{ nome: string; args: Record<string, unknown> }>) {
  const backend = backendDireto(ACESSO, chamadasFalsas(registro));
  const transporte = new StreamableHTTPClientTransport(new URL("https://plataforma.test/api/mcp"), {
    fetch: (url, init) => responderMcp(new Request(url, init), backend),
  });
  const cliente = new Client({ name: "teste", version: "0" });
  await cliente.connect(transporte);
  return cliente;
}

function texto(r: unknown): string {
  return (r as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? "").join("\n");
}

describe("o MCP online", () => {
  it("lista as ferramentas, sem nenhuma de aprovar, reprovar ou cancelar", async () => {
    const cliente = await conectar([]);
    const nomes = (await cliente.listTools()).tools.map((t) => t.name);
    expect(nomes).toEqual(expect.arrayContaining(["estado_do_dia", "entregar_tarefa", "agendar_post"]));
    for (const n of nomes) expect(n).not.toMatch(/aprovar|reprovar|cancelar/);
  });

  it("chama o serviço com os argumentos da ferramenta, e cada pedido vive sozinho", async () => {
    const registro: Array<{ nome: string; args: Record<string, unknown> }> = [];
    const cliente = await conectar(registro);
    const r = await cliente.callTool({ name: "estado_do_dia", arguments: { data: "2026-10-28" } });
    expect(texto(r)).toContain("Peça a próxima tarefa.");
    await cliente.callTool({ name: "entregar_tarefa", arguments: { id: "t1", resultado: { headline: "x" } } });
    expect(registro).toEqual([
      { nome: "estado_do_dia", args: { data: "2026-10-28" } },
      { nome: "entregar_tarefa", args: { id: "t1", resultado: { headline: "x" } } },
    ]);
  });

  it("recusa do serviço chega ao Claude como erro legível", async () => {
    const cliente = await conectar([]);
    const r = await cliente.callTool({ name: "iniciar_post", arguments: { story_id: "x" } });
    expect(r.isError).toBe(true);
    expect(texto(r)).toMatch(/HTTP 422.*não está entre os posts/);
  });

  it("montar_post devolve a peça como imagem", async () => {
    const cliente = await conectar([]);
    const r = (await cliente.callTool({ name: "montar_post", arguments: { story_id: "s1" } })) as {
      content: Array<{ type: string; data?: string }>;
    };
    expect(r.content[0]).toMatchObject({ type: "image", data: "AAAA" });
  });

  it("ver_reel devolve a folha de quadros como imagem e o resto como texto", async () => {
    const cliente = await conectar([]);
    const r = (await cliente.callTool({ name: "ver_reel", arguments: { candidato_id: "c1" } })) as {
      content: Array<{ type: string; data?: string; text?: string }>;
    };
    expect(r.content[0]).toMatchObject({ type: "image", data: "AAAA" });
    expect(r.content[1].text).toContain('"estado": "nova"');
    expect(r.content[1].text).not.toContain("base64");
  });

  it("fazer_o_dia manda as fotos como imagem, fora do JSON", async () => {
    const cliente = await conectar([]);
    const r = (await cliente.callTool({ name: "fazer_o_dia", arguments: {} })) as {
      content: Array<{ type: string; data?: string; text?: string }>;
    };
    expect(r.content[0]).toMatchObject({ type: "image", data: "BBBB" });
    expect(r.content[1].text).toContain('"passo": "tarefa"');
    expect(r.content[1].text).not.toContain("BBBB");
  });
});
