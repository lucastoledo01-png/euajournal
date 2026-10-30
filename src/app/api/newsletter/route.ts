import { NextResponse } from "next/server";
import { createListmonkClient } from "@/lib/server/listmonk";
import { DEFAULT_PROJECT_ID } from "@/lib/server/projects";
import { normalizeSignupEvent } from "@/lib/server/platform-events";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { verifyTurnstileToken } from "@/lib/server/turnstile";
import { hostPublicoDoPedido } from "@/lib/server/mcp/origem";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const turnstile = await verifyTurnstileToken({
    token: typeof body.turnstileToken === "string" ? body.turnstileToken : body["cf-turnstile-response"],
    expectedAction: "newsletter_signup",
    requestHostname: hostPublicoDoPedido(request),
    remoteIp: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  if (!turnstile.ok) {
    /*
     * A recusa fica registrada com o motivo (30/10/2026). O cadastro falhou
     * calado desde o lançamento: zero leads, e nada dizia por quê.
     */
    await getSupabaseAdminClient()
      .from("platform_events")
      .insert({ event_type: "newsletter_signup_recusado", payload: { motivo: turnstile.reason, host: hostPublicoDoPedido(request) } })
      .then(
        () => undefined,
        () => undefined,
      );
    return NextResponse.json({ ok: false, reason: "turnstile_failed", motivo: turnstile.reason }, { status: 403 });
  }

  const payload = normalizeSignupEvent(body);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("newsletter_leads")
    .upsert(
      {
        project_id: DEFAULT_PROJECT_ID,
        email: payload.email,
        source: payload.source,
        status: "active",
      },
      // A migração multi-projeto trocou `unique (email)` por
      // `unique (project_id, email)`. Com o alvo antigo o PostgREST responde
      // 42P10 e nenhum lead é gravado.
      { onConflict: "project_id,email" },
    )
    .select("id")
    .single();

  if (error) {
    console.error("[NEWSLETTER] lead não gravado:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  await supabase.from("platform_events").insert({
    event_type: "newsletter_signup",
    payload,
  });

  const listmonk = await createListmonkClient().upsertSubscriber(payload);

  await supabase.from("listmonk_sync_logs").insert({
    lead_id: data?.id,
    action: "subscriber_upsert",
    status: listmonk.ok ? "synced" : listmonk.skipped ? "skipped" : "failed",
    payload: {
      source: payload.source,
      reason: listmonk.ok ? undefined : listmonk.reason,
      listmonk_id: listmonk.ok ? listmonk.id : undefined,
    },
  });

  /*
   * Recusa do Listmonk nao pode responder "pronto, seu email entrou na lista".
   *
   * Esta linha devolvia `ok: true` em qualquer caso, e a tela olha o STATUS
   * HTTP, nao o corpo. Em 17/09/2026 a lista `homesite` virou privada, o
   * Listmonk passou a recusar o cadastro com HTTP 400, e o efeito seria: o
   * visitante lendo "pronto, seu email entrou na lista", o lead gravado no
   * nosso banco, e a pessoa nunca recebendo edicao nenhuma, porque quem envia
   * e o Listmonk. O unico rastro era `listmonk_sync_logs` com `failed`, que
   * ninguem abre sem motivo.
   *
   * Ninguem chegou a passar por isso: o log de sincronizacao estava vazio
   * quando o defeito foi encontrado. O conserto e para a proxima vez.
   *
   * O lead permanece gravado nos dois casos, entao nada se perde e da para
   * recuperar depois. O que muda e a frase que a pessoa le: "tenta de novo"
   * e verdade, "entrou na lista" nao era.
   *
   * `skipped` continua sendo sucesso: significa integracao desligada de
   * proposito, e nao servidor recusando.
   */
  const naoSincronizou = !listmonk.ok && !("skipped" in listmonk && listmonk.skipped);
  if (naoSincronizou) {
    return NextResponse.json(
      { ok: false, reason: "listmonk_sync_failed", leadSalvo: true },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, listmonk: { synced: listmonk.ok, skipped: "skipped" in listmonk && listmonk.skipped } });
}
