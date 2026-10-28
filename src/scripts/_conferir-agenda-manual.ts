import { carregarEnv } from "./artigos-comum";
async function main() {
  carregarEnv();
  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const { lerCargaV2 } = await import("../lib/server/social/instagram/carga-v2");
  const { hashDoPostDaLinha } = await import("../lib/server/aprovacao/hash");
  const { decidirPublicacao } = await import("../lib/server/aprovacao/portao");
  const client = getSupabaseAdminClient();
  const { data: linhas } = await client
    .from("social_posts")
    .select("*")
    .eq("edition_date", "2026-10-27")
    .like("story_id", "manual-%")
    .order("scheduled_at");
  for (const l of linhas ?? []) {
    const carga = lerCargaV2(l as never);
    const { data: ap } = await client.from("aprovacoes").select("*").eq("peca_id", l.id).maybeSingle();
    const hash = hashDoPostDaLinha(l);
    const dec = decidirPublicacao({
      modo: "enforce",
      ramo: "post",
      aprovacao: ap
        ? { ramo: ap.ramo, estado: ap.estado, hashArtefato: ap.hash_artefato, publicarEm: ap.publicar_em }
        : null,
      hashAtual: hash,
    });
    console.log(
      [
        l.story_id,
        `status=${l.status}`,
        `agendado=${l.scheduled_at}`,
        `carga=${carga.ok ? "ok" : "FALHA " + carga.motivo}`,
        `slides=${carga.ok ? carga.carga.artefatos.length : "-"}`,
        `fila=${ap?.estado ?? "sem linha"}`,
        `hash_confere=${ap ? ap.hash_artefato === hash : false}`,
        `portao_no_worker=${dec.libera ? "libera" : dec.motivo}`,
        `decidido_por=${ap?.decidido_por ?? "-"}`,
      ].join(" | "),
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
