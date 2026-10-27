import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProjectById, type Project } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { motorDoProjeto } from "./motor";

/**
 * O token de quem conecta o Claude Desktop à plataforma (27/10/2026).
 *
 * O painel só conhece uma senha e cookies de sessão, que servem ao navegador.
 * O servidor MCP local roda fora dele, então ganha um token próprio: um por
 * usuário e por projeto, revogável, e guardado no banco só como resumo
 * SHA-256. O token inteiro aparece uma vez, no script que o cria.
 *
 * A busca é pelo resumo, por igualdade. Comparação em tempo constante não
 * acrescenta nada aqui: o token tem 256 bits aleatórios, e quem não o tem não
 * consegue montar um resumo que case.
 *
 * Duas regras de `api-auth.ts` valem aqui também: nega por padrão, e falha de
 * leitura do banco NÃO é "token inválido". A primeira responde 503, a segunda
 * 401, porque pedem reações opostas: uma é tentar de novo, a outra é trocar o
 * token. É a lição do `if (error || !data)`.
 */

export const PREFIXO_DO_TOKEN = "ejmcp_";

export function gerarTokenDoMcp(): string {
  return PREFIXO_DO_TOKEN + randomBytes(32).toString("base64url");
}

export function resumoDoToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export type LinhaDoToken = {
  id: string;
  projectId: string;
  rotulo: string;
  revogadoEm: string | null;
};

export type TokensDoMcp = {
  /** `null` é "não existe". Falha de leitura LANÇA. */
  porResumo(resumo: string): Promise<LinhaDoToken | null>;
  marcarUso(id: string): Promise<void>;
};

export function tokensDoMcpSupabase(): TokensDoMcp {
  return {
    async porResumo(resumo) {
      const { data, error } = await getSupabaseAdminClient()
        .from("tokens_do_mcp")
        .select("id, project_id, rotulo, revogado_em")
        .eq("token_hash", resumo)
        .maybeSingle();
      if (error) throw new Error(`tokens_do_mcp, leitura falhou: ${error.message}`);
      if (!data) return null;
      const linha = data as { id: string; project_id: string; rotulo: string; revogado_em: string | null };
      return { id: linha.id, projectId: linha.project_id, rotulo: linha.rotulo, revogadoEm: linha.revogado_em };
    },
    async marcarUso(id) {
      // Só informação para o painel. Falhar aqui não pode negar o acesso.
      await getSupabaseAdminClient()
        .from("tokens_do_mcp")
        .update({ usado_em: new Date().toISOString() })
        .eq("id", id);
    },
  };
}

export type AcessoDoMcp = {
  projeto: Project;
  rotulo: string;
  /** A etiqueta que vai em `decidido_por`, `entregue_por` e nos logs. */
  quem: string;
};

export type DepsDoAcesso = {
  tokens: TokensDoMcp;
  projetoPorId: (id: string) => Promise<Project | null>;
};

function depsPadrao(): DepsDoAcesso {
  return { tokens: tokensDoMcpSupabase(), projetoPorId: getProjectById };
}

function recusa(status: number, error: string) {
  return { ok: false as const, resposta: NextResponse.json({ ok: false, error }, { status }) };
}

/**
 * Libera quem apresenta um token ativo de um projeto com motor Claude.
 *
 * O motor é conferido a cada chamada, e não só na criação do token: trocar o
 * projeto de volta para `openai` no painel corta o MCP na hora, sem precisar
 * caçar e revogar token.
 */
export async function requireTokenDoMcp(
  req: NextRequest,
  deps: DepsDoAcesso = depsPadrao(),
): Promise<{ ok: true; acesso: AcessoDoMcp } | { ok: false; resposta: NextResponse }> {
  const cabecalho = req.headers.get("authorization");
  if (!cabecalho?.startsWith("Bearer ")) return recusa(401, "Não autorizado");
  const token = cabecalho.slice("Bearer ".length).trim();
  if (!token.startsWith(PREFIXO_DO_TOKEN)) return recusa(401, "Não autorizado");

  let linha: LinhaDoToken | null;
  let projeto: Project | null;
  try {
    linha = await deps.tokens.porResumo(resumoDoToken(token));
    if (!linha || linha.revogadoEm) return recusa(401, "Não autorizado");
    projeto = await deps.projetoPorId(linha.projectId);
  } catch (erro) {
    console.error("[MCP] Leitura do token ou do projeto falhou:", erro);
    return recusa(503, "A plataforma não conseguiu conferir o token agora. Tente de novo.");
  }

  if (!projeto) return recusa(401, "Não autorizado");
  if (motorDoProjeto(projeto) !== "claude_mcp") {
    return recusa(403, `O projeto ${projeto.slug} não está com o motor Claude via MCP.`);
  }

  await deps.tokens.marcarUso(linha.id).catch(() => undefined);
  return { ok: true, acesso: { projeto, rotulo: linha.rotulo, quem: `dono:via-claude:${linha.rotulo}` } };
}

export type TokenDoPainel = {
  id: string;
  rotulo: string;
  criadoEm: string;
  usadoEm: string | null;
  revogadoEm: string | null;
};

/** Os tokens do projeto, para a tela "Conectar ao Claude". Nunca o resumo, nunca o token. */
export async function listarTokens(projectId: string): Promise<TokenDoPainel[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("tokens_do_mcp")
    .select("id, rotulo, criado_em, usado_em, revogado_em")
    .eq("project_id", projectId)
    .order("criado_em", { ascending: false });
  if (error) throw new Error(`tokens_do_mcp, leitura falhou: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; rotulo: string; criado_em: string; usado_em: string | null; revogado_em: string | null }>).map((l) => ({
    id: l.id,
    rotulo: l.rotulo,
    criadoEm: l.criado_em,
    usadoEm: l.usado_em,
    revogadoEm: l.revogado_em,
  }));
}

/** Cria o token e devolve o token inteiro, que não volta a aparecer. */
export async function criarToken(projectId: string, rotulo: string): Promise<{ id: string; token: string }> {
  const token = gerarTokenDoMcp();
  const { data, error } = await getSupabaseAdminClient()
    .from("tokens_do_mcp")
    .insert({ project_id: projectId, rotulo, token_hash: resumoDoToken(token) })
    .select("id")
    .single();
  if (error) throw new Error(`tokens_do_mcp, gravação falhou: ${error.message}`);
  return { id: (data as { id: string }).id, token };
}

/** Revoga sem apagar: a autoria das tarefas entregues continua legível. */
export async function revogarToken(projectId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .from("tokens_do_mcp")
    .update({ revogado_em: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("id", id)
    .is("revogado_em", null);
  if (error) throw new Error(`tokens_do_mcp, gravação falhou: ${error.message}`);
}

/** O rótulo que assina as entregas: minúsculas, números e hífen. */
export function rotuloValido(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const r = bruto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return r.length >= 2 && r.length <= 40 ? r : null;
}
