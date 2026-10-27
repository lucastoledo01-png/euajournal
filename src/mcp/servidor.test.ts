import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { configDoAmbiente } from "./plataforma";
import { criarServidor } from "./servidor";

const CONFIG = { url: "https://plataforma.test", token: "ejmcp_teste" };

async function conectar() {
  const [doCliente, doServidor] = InMemoryTransport.createLinkedPair();
  await criarServidor(CONFIG).connect(doServidor);
  const cliente = new Client({ name: "teste", version: "0" });
  await cliente.connect(doCliente);
  return cliente;
}

function textoDe(r: unknown): string {
  return ((r as { content: Array<{ text: string }> }).content[0]).text;
}

describe("o servidor MCP local", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("não tem ferramenta de aprovar, reprovar nem cancelar: isso é só do painel", async () => {
    const cliente = await conectar();
    const nomes = (await cliente.listTools()).tools.map((t) => t.name);
    expect(nomes).toEqual(expect.arrayContaining(["estado_do_dia", "ver_fila"]));
    for (const nome of nomes) expect(nome).not.toMatch(/aprovar|reprovar|cancelar/);
  });

  it("repassa à plataforma com o token e a data, e devolve a resposta", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, proximoPasso: "Peça a próxima tarefa." })));
    vi.stubGlobal("fetch", fetcher);
    const cliente = await conectar();

    const r = await cliente.callTool({ name: "estado_do_dia", arguments: { data: "2026-10-28" } });
    expect(textoDe(r)).toContain("Peça a próxima tarefa.");

    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://plataforma.test/api/mcp/estado-do-dia?data=2026-10-28");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ejmcp_teste");
  });

  it("recusa da plataforma vira erro legível, não exceção", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "O projeto eua não está com o motor Claude via MCP." }), { status: 403 })),
    );
    const cliente = await conectar();
    const r = await cliente.callTool({ name: "ver_fila", arguments: {} });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/HTTP 403.*motor Claude/);
  });

  it("sem URL ou token no ambiente, diz o que configurar", () => {
    expect(() => configDoAmbiente({})).toThrow(/EUAJOURNAL_URL e EUAJOURNAL_MCP_TOKEN/);
    expect(configDoAmbiente({ EUAJOURNAL_URL: "https://x.test/", EUAJOURNAL_MCP_TOKEN: "t" }).url).toBe("https://x.test");
  });
});
