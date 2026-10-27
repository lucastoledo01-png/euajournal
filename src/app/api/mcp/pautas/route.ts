import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { projetoDaFonte } from "@/lib/server/mcp/post/deps";
import { pautasDisponiveis } from "@/lib/server/mcp/post/material";
import { erroDaRota } from "@/lib/server/mcp/rota";
import { requireTokenDoMcp } from "@/lib/server/mcp/tokens";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * `pautas_disponiveis`: as pautas que já têm pacote factual e foto, para o
 * Claude escrever o post. No passo 2 do plano elas vêm dos posts que a esteira
 * produziu nos últimos três dias (`settings.mcp.pautas_de`), só lidas.
 */
export async function GET(req: NextRequest) {
  const auth = await requireTokenDoMcp(req);
  if (!auth.ok) return auth.resposta;
  const { projeto } = auth.acesso;

  try {
    const fonte = await projetoDaFonte(projeto);
    if (!fonte) return NextResponse.json({ ok: false, error: "o projeto de pautas declarado não existe" }, { status: 404 });
    const desdeIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const pautas = await pautasDisponiveis(getSupabaseAdminClient(), {
      projectIdDaFonte: fonte.id,
      projectIdDoClaude: projeto.id,
      desdeIso,
    });
    return NextResponse.json({ ok: true, fonte: fonte.slug, pautas });
  } catch (erro) {
    return erroDaRota("pautas", erro);
  }
}
