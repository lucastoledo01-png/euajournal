import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  autorizar,
  metadadosDoRecurso,
  metadadosDoServidor,
  negar,
  pkceConfere,
  redirecionamentoAceito,
  registrarCliente,
  token,
  type Acessos,
  type ClienteOAuth,
  type CodigoOAuth,
  type LojaOAuth,
  type RenovacaoOAuth,
} from "./oauth";

function lojaEmMemoria(): LojaOAuth {
  const clientes = new Map<string, ClienteOAuth>();
  const codigos = new Map<string, CodigoOAuth>();
  const renovacoes = new Map<string, RenovacaoOAuth>();
  return {
    async gravarCliente(c) { clientes.set(c.clientId, c); },
    async cliente(id) { return clientes.get(id) ?? null; },
    async gravarCodigo(h, c) { codigos.set(h, c); },
    async consumirCodigo(h, agora) {
      const c = codigos.get(h);
      if (!c || c.usadoEm) return null;
      c.usadoEm = agora;
      return c;
    },
    async gravarRenovacao(h, r) { renovacoes.set(h, r); },
    async renovacao(h) { return renovacoes.get(h) ?? null; },
    async revogarRenovacao(h, agora) { const r = renovacoes.get(h); if (r) r.revogadoEm = agora; },
  };
}

function acessosEmMemoria(): Acessos & { revogados: Set<string>; emitidos: Array<{ id: string; projectId: string; rotulo: string }> } {
  const revogados = new Set<string>();
  const emitidos: Array<{ id: string; projectId: string; rotulo: string }> = [];
  return {
    revogados,
    emitidos,
    async criar(projectId, rotulo) {
      const id = `t${emitidos.length + 1}`;
      emitidos.push({ id, projectId, rotulo });
      return { id, token: `ejmcp_${id}` };
    },
    async ativo(id) { return !revogados.has(id); },
    async revogar(_p, id) { revogados.add(id); },
  };
}

const RETORNO = "https://claude.ai/api/mcp/auth_callback";

function pkce() {
  const verificador = randomBytes(32).toString("base64url");
  return { verificador, desafio: createHash("sha256").update(verificador).digest("base64url") };
}

async function preparar() {
  const loja = lojaEmMemoria();
  const acessos = acessosEmMemoria();
  const reg = await registrarCliente(loja, { client_name: "Claude", redirect_uris: [RETORNO] });
  if (!reg.ok) throw new Error("registro falhou");
  const { verificador, desafio } = pkce();
  const pedido = {
    clientId: reg.cliente.client_id,
    redirectUri: RETORNO,
    codeChallenge: desafio,
    codeChallengeMethod: "S256",
    state: "xyz",
    responseType: "code",
  };
  return { loja, acessos, clientId: reg.cliente.client_id, verificador, pedido };
}

async function autorizarECodigo(p: Awaited<ReturnType<typeof preparar>>) {
  const a = await autorizar(p.loja, { ...p.pedido, projectId: "p1", rotulo: "claude" });
  if (!a.ok) throw new Error(a.erro.error_description);
  const url = new URL(a.redirecionar);
  expect(url.searchParams.get("state")).toBe("xyz");
  return url.searchParams.get("code") ?? "";
}

describe("o login do Claude no MCP (OAuth)", () => {
  it("os metadados apontam o Claude para o login e para o MCP", () => {
    expect(metadadosDoServidor("https://x.test")).toMatchObject({
      authorization_endpoint: "https://x.test/oauth/autorizar",
      token_endpoint: "https://x.test/api/oauth/token",
      registration_endpoint: "https://x.test/api/oauth/registrar",
      code_challenge_methods_supported: ["S256"],
    });
    expect(metadadosDoRecurso("https://x.test")).toMatchObject({ resource: "https://x.test/api/mcp", authorization_servers: ["https://x.test"] });
  });

  it("só aceita retorno https, ou http no próprio computador", () => {
    expect(redirecionamentoAceito(RETORNO)).toBe(true);
    expect(redirecionamentoAceito("http://localhost:33418/callback")).toBe(true);
    expect(redirecionamentoAceito("http://127.0.0.1:5000/cb")).toBe(true);
    expect(redirecionamentoAceito("http://evil.test/cb")).toBe(false);
    expect(redirecionamentoAceito("javascript:alert(1)")).toBe(false);
  });

  it("o caminho inteiro: registro, autorizar, código por chaves com PKCE", async () => {
    const p = await preparar();
    const code = await autorizarECodigo(p);
    const r = await token(p.loja, p.acessos, {
      grant_type: "authorization_code", code, redirect_uri: RETORNO, client_id: p.clientId, code_verifier: p.verificador,
    });
    if (!r.ok) throw new Error(r.erro.error_description);
    expect(r.chaves.access_token).toMatch(/^ejmcp_/);
    expect(r.chaves.refresh_token).toBeTruthy();
    expect(r.chaves).not.toHaveProperty("expires_in");
    expect(p.acessos.emitidos[0]).toMatchObject({ projectId: "p1", rotulo: "claude" });
  });

  it("código usado duas vezes, PKCE errado ou retorno trocado não viram chave", async () => {
    const p = await preparar();
    const code = await autorizarECodigo(p);
    const base = { grant_type: "authorization_code", code, redirect_uri: RETORNO, client_id: p.clientId };
    expect(await token(p.loja, p.acessos, { ...base, code_verifier: pkce().verificador })).toMatchObject({ ok: false });
    // O código já foi consumido pela tentativa errada: não serve mais nem com o verificador certo.
    expect(await token(p.loja, p.acessos, { ...base, code_verifier: p.verificador })).toMatchObject({ ok: false });

    const outro = await autorizarECodigo(p);
    expect(await token(p.loja, p.acessos, { ...base, code: outro, redirect_uri: "https://claude.ai/outro", code_verifier: p.verificador })).toMatchObject({ ok: false });
  });

  it("renovação troca as chaves e para quando o acesso é revogado no painel", async () => {
    const p = await preparar();
    const code = await autorizarECodigo(p);
    const r1 = await token(p.loja, p.acessos, {
      grant_type: "authorization_code", code, redirect_uri: RETORNO, client_id: p.clientId, code_verifier: p.verificador,
    });
    if (!r1.ok) throw new Error("token");
    const r2 = await token(p.loja, p.acessos, { grant_type: "refresh_token", refresh_token: r1.chaves.refresh_token, client_id: p.clientId });
    if (!r2.ok) throw new Error(r2.erro.error_description);
    expect(r2.chaves.access_token).not.toBe(r1.chaves.access_token);
    expect(p.acessos.revogados.has("t1")).toBe(true);
    // A renovação antiga não serve de novo.
    expect(await token(p.loja, p.acessos, { grant_type: "refresh_token", refresh_token: r1.chaves.refresh_token, client_id: p.clientId })).toMatchObject({ ok: false });

    p.acessos.revogados.add("t2");
    expect(await token(p.loja, p.acessos, { grant_type: "refresh_token", refresh_token: r2.chaves.refresh_token, client_id: p.clientId })).toMatchObject({
      ok: false,
      erro: { error: "invalid_grant" },
    });
  });

  it("cliente desconhecido ou retorno não cadastrado não chegam à tela de autorizar", async () => {
    const p = await preparar();
    expect(await autorizar(p.loja, { ...p.pedido, clientId: "x", projectId: "p1", rotulo: "c" })).toMatchObject({ ok: false });
    expect(await autorizar(p.loja, { ...p.pedido, redirectUri: "https://evil.test/cb", projectId: "p1", rotulo: "c" })).toMatchObject({ ok: false });
    expect(await autorizar(p.loja, { ...p.pedido, codeChallengeMethod: "plain", projectId: "p1", rotulo: "c" })).toMatchObject({ ok: false });
    expect(negar(p.pedido)).toBe(`${RETORNO}?error=access_denied&state=xyz`);
  });

  it("PKCE confere só com o verificador certo", () => {
    const { verificador, desafio } = pkce();
    expect(pkceConfere(verificador, desafio)).toBe(true);
    expect(pkceConfere(pkce().verificador, desafio)).toBe(false);
    expect(pkceConfere("curto", desafio)).toBe(false);
  });
});
