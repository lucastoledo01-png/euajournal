import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * O login do Claude no MCP, por OAuth (27/10/2026).
 *
 * É o que deixa o usuário conectar o Claude Desktop sem colar token: em
 * Conectores ele cola `https://<site>/api/mcp`, o Claude descobre onde é o
 * login (`.well-known`), se cadastra sozinho, abre a tela "Autorizar" do
 * painel, recebe um código e o troca por chaves (PKCE, sem segredo de
 * cliente). O Claude Code faz o mesmo caminho.
 *
 * A chave de acesso É um token de `tokens_do_mcp`: o mesmo que o comando do
 * painel gera, com o mesmo `requireTokenDoMcp`, a mesma lista em "Conectar ao
 * Claude" e o mesmo "Revogar". Ela não expira, por decisão do dono: o usuário
 * não refaz login nunca, só quando o acesso é revogado. A chave de renovação
 * existe para o cliente que a pede, e para no instante em que o acesso é
 * revogado.
 */

export const ESCOPO = "euajournal";
const MINUTOS_DO_CODIGO = 10;

export function resumo(segredo: string): string {
  return createHash("sha256").update(segredo, "utf8").digest("hex");
}

function aleatorio(): string {
  return randomBytes(32).toString("base64url");
}

/** PKCE S256 (RFC 7636): o desafio é o SHA-256 do verificador, em base64url. */
export function pkceConfere(verificador: string, desafio: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verificador)) return false;
  return createHash("sha256").update(verificador, "ascii").digest("base64url") === desafio;
}

export function metadadosDoServidor(origem: string) {
  return {
    issuer: origem,
    authorization_endpoint: `${origem}/oauth/autorizar`,
    token_endpoint: `${origem}/api/oauth/token`,
    registration_endpoint: `${origem}/api/oauth/registrar`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [ESCOPO],
  };
}

export function metadadosDoRecurso(origem: string) {
  return {
    resource: `${origem}/api/mcp`,
    authorization_servers: [origem],
    bearer_methods_supported: ["header"],
    scopes_supported: [ESCOPO],
    resource_name: "eua.journal",
  };
}

/** Só HTTPS, ou o próprio computador (o Claude Code recebe o retorno em localhost). */
export function redirecionamentoAceito(uri: unknown): uri is string {
  if (typeof uri !== "string") return false;
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export type ClienteOAuth = { clientId: string; nome: string; redirectUris: string[] };
export type CodigoOAuth = {
  clientId: string;
  projectId: string;
  redirectUri: string;
  codeChallenge: string;
  rotulo: string;
  expiraEm: string;
  usadoEm: string | null;
};
export type RenovacaoOAuth = { clientId: string; projectId: string; tokenId: string; revogadoEm: string | null };

export type LojaOAuth = {
  gravarCliente(c: ClienteOAuth): Promise<void>;
  cliente(clientId: string): Promise<ClienteOAuth | null>;
  gravarCodigo(hash: string, c: CodigoOAuth): Promise<void>;
  /** Marca o código como usado e devolve o que ele era. Já usado ou inexistente: `null`. */
  consumirCodigo(hash: string, agoraIso: string): Promise<CodigoOAuth | null>;
  gravarRenovacao(hash: string, r: RenovacaoOAuth): Promise<void>;
  renovacao(hash: string): Promise<RenovacaoOAuth | null>;
  revogarRenovacao(hash: string, agoraIso: string): Promise<void>;
};

export type Acessos = {
  criar(projectId: string, rotulo: string): Promise<{ id: string; token: string }>;
  ativo(tokenId: string): Promise<boolean>;
  revogar(projectId: string, tokenId: string): Promise<void>;
};

export type ErroOAuth = { error: string; error_description: string };

function erro(error: string, error_description: string): { ok: false; erro: ErroOAuth } {
  return { ok: false, erro: { error, error_description } };
}

/** Registro dinâmico (RFC 7591), cliente público: sem segredo, PKCE obrigatório. */
export async function registrarCliente(loja: LojaOAuth, corpo: Record<string, unknown>) {
  const uris = Array.isArray(corpo.redirect_uris) ? corpo.redirect_uris : [];
  if (uris.length === 0 || !uris.every(redirecionamentoAceito)) {
    return erro("invalid_redirect_uri", "redirect_uris precisa de endereços https, ou http em localhost");
  }
  const cliente: ClienteOAuth = {
    clientId: `ejc_${aleatorio()}`,
    nome: typeof corpo.client_name === "string" ? corpo.client_name.slice(0, 80) : "",
    redirectUris: uris as string[],
  };
  await loja.gravarCliente(cliente);
  return {
    ok: true as const,
    cliente: {
      client_id: cliente.clientId,
      client_name: cliente.nome,
      redirect_uris: cliente.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

export type PedidoDeAutorizacao = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  responseType: string;
};

/** Confere o pedido ANTES do login, para a tela não autorizar um cliente ou retorno estranho. */
export async function conferirPedido(loja: LojaOAuth, p: PedidoDeAutorizacao) {
  const cliente = await loja.cliente(p.clientId);
  if (!cliente) return erro("invalid_client", "cliente desconhecido: cadastre o conector de novo");
  if (!cliente.redirectUris.includes(p.redirectUri)) return erro("invalid_request", "endereço de retorno não cadastrado");
  if (p.responseType !== "code") return erro("unsupported_response_type", "só response_type=code");
  if (p.codeChallengeMethod !== "S256" || !p.codeChallenge) return erro("invalid_request", "PKCE S256 obrigatório");
  return { ok: true as const, cliente };
}

/** "Autorizar": grava o código de uso único e devolve para onde o navegador volta. */
export async function autorizar(
  loja: LojaOAuth,
  p: PedidoDeAutorizacao & { projectId: string; rotulo: string },
  agora: Date = new Date(),
) {
  const conferido = await conferirPedido(loja, p);
  if (!conferido.ok) return conferido;
  const codigo = aleatorio();
  await loja.gravarCodigo(resumo(codigo), {
    clientId: p.clientId,
    projectId: p.projectId,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    rotulo: p.rotulo,
    expiraEm: new Date(agora.getTime() + MINUTOS_DO_CODIGO * 60_000).toISOString(),
    usadoEm: null,
  });
  const volta = new URL(p.redirectUri);
  volta.searchParams.set("code", codigo);
  if (p.state) volta.searchParams.set("state", p.state);
  return { ok: true as const, redirecionar: volta.toString() };
}

export function negar(p: Pick<PedidoDeAutorizacao, "redirectUri" | "state">): string {
  const volta = new URL(p.redirectUri);
  volta.searchParams.set("error", "access_denied");
  if (p.state) volta.searchParams.set("state", p.state);
  return volta.toString();
}

async function emitir(loja: LojaOAuth, acessos: Acessos, clientId: string, projectId: string, rotulo: string) {
  const acesso = await acessos.criar(projectId, rotulo);
  const renovacao = aleatorio();
  await loja.gravarRenovacao(resumo(renovacao), { clientId, projectId, tokenId: acesso.id, revogadoEm: null });
  // Sem `expires_in`: a chave de acesso não expira, e só deixa de valer revogada no painel.
  return { access_token: acesso.token, token_type: "Bearer", refresh_token: renovacao, scope: ESCOPO };
}

/** O endpoint de token: troca o código (com PKCE) ou renova. */
export async function token(loja: LojaOAuth, acessos: Acessos, corpo: Record<string, string>, agora: Date = new Date()) {
  const clientId = corpo.client_id ?? "";
  if (corpo.grant_type === "authorization_code") {
    const codigo = await loja.consumirCodigo(resumo(corpo.code ?? ""), agora.toISOString());
    if (!codigo) return erro("invalid_grant", "código inválido ou já usado");
    if (Date.parse(codigo.expiraEm) < agora.getTime()) return erro("invalid_grant", "código expirado: autorize de novo");
    if (codigo.clientId !== clientId) return erro("invalid_grant", "o código é de outro cliente");
    if (codigo.redirectUri !== corpo.redirect_uri) return erro("invalid_grant", "endereço de retorno diferente do autorizado");
    if (!pkceConfere(corpo.code_verifier ?? "", codigo.codeChallenge)) return erro("invalid_grant", "PKCE não confere");
    return { ok: true as const, chaves: await emitir(loja, acessos, clientId, codigo.projectId, codigo.rotulo) };
  }

  if (corpo.grant_type === "refresh_token") {
    const hash = resumo(corpo.refresh_token ?? "");
    const r = await loja.renovacao(hash);
    if (!r || r.revogadoEm || r.clientId !== clientId) return erro("invalid_grant", "renovação inválida");
    // Revogado no painel: a renovação morre junto, e o usuário precisa autorizar de novo.
    if (!(await acessos.ativo(r.tokenId))) return erro("invalid_grant", "o acesso foi revogado no painel");
    await loja.revogarRenovacao(hash, agora.toISOString());
    await acessos.revogar(r.projectId, r.tokenId);
    return { ok: true as const, chaves: await emitir(loja, acessos, clientId, r.projectId, `renovado-${r.tokenId.slice(0, 8)}`) };
  }

  return erro("unsupported_grant_type", "só authorization_code e refresh_token");
}

export function lojaOAuthSupabase(): LojaOAuth {
  const db = () => getSupabaseAdminClient();
  const falhou = (o: string, e: { message: string }) => new Error(`${o}: ${e.message}`);
  return {
    async gravarCliente(c) {
      const { error } = await db().from("oauth_clientes").insert({ client_id: c.clientId, nome: c.nome, redirect_uris: c.redirectUris });
      if (error) throw falhou("oauth_clientes, gravação falhou", error);
    },
    async cliente(clientId) {
      const { data, error } = await db().from("oauth_clientes").select("client_id, nome, redirect_uris").eq("client_id", clientId).maybeSingle();
      if (error) throw falhou("oauth_clientes, leitura falhou", error);
      if (!data) return null;
      const l = data as { client_id: string; nome: string; redirect_uris: string[] };
      return { clientId: l.client_id, nome: l.nome, redirectUris: l.redirect_uris ?? [] };
    },
    async gravarCodigo(hash, c) {
      const { error } = await db().from("oauth_codigos").insert({
        codigo_hash: hash,
        client_id: c.clientId,
        project_id: c.projectId,
        redirect_uri: c.redirectUri,
        code_challenge: c.codeChallenge,
        rotulo: c.rotulo,
        expira_em: c.expiraEm,
      });
      if (error) throw falhou("oauth_codigos, gravação falhou", error);
    },
    async consumirCodigo(hash, agoraIso) {
      // Condicional: dois pedidos com o mesmo código, só um leva.
      const { data, error } = await db()
        .from("oauth_codigos")
        .update({ usado_em: agoraIso })
        .eq("codigo_hash", hash)
        .is("usado_em", null)
        .select("client_id, project_id, redirect_uri, code_challenge, rotulo, expira_em, usado_em")
        .maybeSingle();
      if (error) throw falhou("oauth_codigos, gravação falhou", error);
      if (!data) return null;
      const l = data as Record<string, string>;
      return {
        clientId: l.client_id,
        projectId: l.project_id,
        redirectUri: l.redirect_uri,
        codeChallenge: l.code_challenge,
        rotulo: l.rotulo,
        expiraEm: l.expira_em,
        usadoEm: l.usado_em,
      };
    },
    async gravarRenovacao(hash, r) {
      const { error } = await db().from("oauth_renovacoes").insert({
        renovacao_hash: hash,
        client_id: r.clientId,
        project_id: r.projectId,
        token_id: r.tokenId,
      });
      if (error) throw falhou("oauth_renovacoes, gravação falhou", error);
    },
    async renovacao(hash) {
      const { data, error } = await db()
        .from("oauth_renovacoes")
        .select("client_id, project_id, token_id, revogado_em")
        .eq("renovacao_hash", hash)
        .maybeSingle();
      if (error) throw falhou("oauth_renovacoes, leitura falhou", error);
      if (!data) return null;
      const l = data as { client_id: string; project_id: string; token_id: string; revogado_em: string | null };
      return { clientId: l.client_id, projectId: l.project_id, tokenId: l.token_id, revogadoEm: l.revogado_em };
    },
    async revogarRenovacao(hash, agoraIso) {
      const { error } = await db().from("oauth_renovacoes").update({ revogado_em: agoraIso }).eq("renovacao_hash", hash);
      if (error) throw falhou("oauth_renovacoes, gravação falhou", error);
    },
  };
}
