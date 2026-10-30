import { NextResponse } from "next/server";
import { createListmonkClient } from "@/lib/server/listmonk";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { verifyTurnstileToken } from "@/lib/server/turnstile";
import { hostPublicoDoPedido } from "@/lib/server/mcp/origem";
import { getAdminSessionSecret } from "@/lib/server/env";
import { loadLandingCampaign, recordFunnelEvent } from "@/lib/server/prompt-system/landing";
import { materialCookie, signMaterialAccess } from "@/lib/server/prompt-system/material-gate";
import { validateKeyword } from "@/lib/prompt-system/keyword";

export const TURNSTILE_ACTION = "ultraprompt_lead";

/**
 * Captura da etapa 11 e liberação da entrega.
 *
 * A ordem importa: o lead é gravado **antes** de qualquer integração externa.
 * Listmonk fora do ar não pode custar o cadastro de alguém que já preencheu o
 * formulário — o lead está no banco e a sincronização é retentável.
 */
export async function POST(request: Request, { params }: { params: Promise<{ keyword: string }> }) {
  const { keyword: keywordCrua } = await params;
  const validation = validateKeyword(keywordCrua);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }
  const keyword = validation.keyword;

  const body = await request.json().catch(() => ({}));
  const turnstile = await verifyTurnstileToken({
    token: typeof body.turnstileToken === "string" ? body.turnstileToken : undefined,
    expectedAction: TURNSTILE_ACTION,
    requestHostname: hostPublicoDoPedido(request),
    remoteIp:
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
  });

  if (!turnstile.ok) {
    return NextResponse.json({ ok: false, error: "Verificação anti-spam falhou." }, { status: 403 });
  }

  const nome = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const whatsapp = String(body.whatsapp ?? "").trim();

  // `name` é NOT NULL no banco e o e-mail é a chave do lead — recusar aqui dá
  // uma mensagem útil, em vez de um 500 vindo do Postgres.
  if (!nome) {
    return NextResponse.json({ ok: false, error: "Informe seu nome." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Informe um e-mail válido." }, { status: 400 });
  }

  const campanha = await loadLandingCampaign(keyword);
  if (!campanha) {
    return NextResponse.json({ ok: false, error: "Campanha não encontrada." }, { status: 404 });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("prompt_leads").upsert(
    {
      project_id: DEFAULT_PROJECT_ID,
      campaign_id: campanha.id,
      name: nome,
      email,
      whatsapp: whatsapp || null,
      attribution: {
        keyword,
        campaign_id: campanha.id,
        source: String(body.source ?? "landing").slice(0, 60),
        referrer: request.headers.get("referer") ?? null,
        captured_at: new Date().toISOString(),
      },
    },
    // Reenviar o formulário não pode inflar a conversão: a unicidade
    // (campaign_id, email) transforma o segundo envio em atualização.
    { onConflict: "campaign_id,email" },
  );

  if (error) {
    console.error("[ULTRAPROMPTS] Falha ao gravar lead:", error.message);
    return NextResponse.json({ ok: false, error: "Não consegui salvar seu cadastro." }, { status: 500 });
  }

  await recordFunnelEvent(campanha.id, "lead", { email_dominio: email.split("@")[1] ?? "" });

  // O cookie é emitido junto da resposta: quem se cadastrou entra no material
  // sem uma segunda ida ao servidor.
  let cookie: string | null = null;
  try {
    cookie = materialCookie(keyword, signMaterialAccess(getAdminSessionSecret(), keyword));
  } catch (err) {
    // Sem o segredo assinado não há portão — mas o lead já está gravado, e
    // perder o cadastro seria pior que pedir para tentar de novo.
    console.error("[ULTRAPROMPTS] Sem segredo para assinar o acesso:", err);
  }

  // Listmonk por último e sem bloquear o resultado.
  const listmonk = await createListmonkClient().upsertSubscriber({ email, source: `ultraprompts-${keyword}` });
  if (listmonk.ok) {
    await supabase.from("prompt_leads").update({ listmonk_synced: true }).eq("campaign_id", campanha.id).eq("email", email);
  }

  const resposta = NextResponse.json({ ok: true, materialUrl: `/ultraprompts/${keyword}/material` });
  if (cookie) resposta.headers.set("Set-Cookie", cookie);
  return resposta;
}
