import { describe, expect, it } from "vitest";
import { coletarMetricasDoInstagram, lerMetricasDoPost, lerSeguidoresDaConta, TABELA_DAS_METRICAS_DO_POST, TABELA_DOS_SEGUIDORES } from "./metricas";

/** Supabase de mentira: devolve os posts dados e guarda cada upsert. */
function bancoFalso(posts: Array<{ id: string; provider_post_id: string }>, erroNoUpsert?: string) {
  const upserts: Array<{ tabela: string; linhas: Array<Record<string, unknown>>; opcoes: unknown }> = [];
  const filtros: string[] = [];
  const client = {
    from(tabela: string) {
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filtros.push(`${c}=${String(v)}`), q),
        not: (c: string) => (filtros.push(`${c} not null`), q),
        gte: (c: string) => {
          filtros.push(`${c}>=`);
          return Promise.resolve({ data: posts, error: null });
        },
        upsert: (linhas: Array<Record<string, unknown>>, opcoes: unknown) => {
          upserts.push({ tabela, linhas, opcoes });
          return Promise.resolve({ error: erroNoUpsert ? { message: erroNoUpsert } : null });
        },
      };
      return q;
    },
  };
  return { client: client as never, upserts, filtros };
}

const AGORA = () => new Date("2026-10-14T23:30:00Z");

describe("métricas do Instagram", () => {
  it("grava alcance e salvamentos de cada post publicado e os seguidores do dia", async () => {
    const { client, upserts, filtros } = bancoFalso([
      { id: "p1", provider_post_id: "m1" },
      { id: "p2", provider_post_id: "m2" },
    ]);
    const r = await coletarMetricasDoInstagram({
      client,
      projectId: "proj",
      env: {},
      agora: AGORA,
      lerInsights: async (m) => ({ reach: m === "m1" ? 100 : 50, saved: m === "m1" ? 7 : 1, shares: 2, comments: 3, likes: 9 }),
      lerSeguidores: async () => 1234,
    });

    expect(r).toEqual({ dia: "2026-10-14", posts: 2, gravados: 2, seguidores: 1234, falhas: [] });
    expect(filtros).toContain("status=published");
    const posts = upserts.find((u) => u.tabela === TABELA_DAS_METRICAS_DO_POST)!;
    expect(posts.opcoes).toEqual({ onConflict: "social_post_id,dia" });
    expect(posts.linhas[0]).toMatchObject({ social_post_id: "p1", media_id: "m1", dia: "2026-10-14", alcance: 100, salvamentos: 7 });
    const seg = upserts.find((u) => u.tabela === TABELA_DOS_SEGUIDORES)!;
    expect(seg.linhas[0]).toMatchObject({ project_id: "proj", dia: "2026-10-14", seguidores: 1234 });
  });

  it("o dia é o de São Paulo, não o do servidor em UTC", async () => {
    const { client } = bancoFalso([]);
    const r = await coletarMetricasDoInstagram({
      client, projectId: "proj", env: {},
      // 01:00 UTC de 15/10 ainda é 14/10 em São Paulo.
      agora: () => new Date("2026-10-15T01:00:00Z"),
      lerInsights: async () => ({ reach: 0, saved: 0, shares: 0, comments: 0, likes: 0 }),
      lerSeguidores: async () => 10,
    });
    expect(r.dia).toBe("2026-10-14");
  });

  it("falha num post não derruba os outros, e vira linha de falha", async () => {
    const { client } = bancoFalso([
      { id: "p1", provider_post_id: "m1" },
      { id: "p2", provider_post_id: "quebra" },
    ]);
    const r = await coletarMetricasDoInstagram({
      client, projectId: "proj", env: {}, agora: AGORA,
      lerInsights: async (m) => {
        if (m === "quebra") throw new Error("Meta fora");
        return { reach: 1, saved: 1, shares: 0, comments: 0, likes: 0 };
      },
      lerSeguidores: async () => null,
    });
    expect(r.gravados).toBe(1);
    expect(r.falhas).toEqual(["p2: Meta fora", "seguidores da conta não lidos"]);
  });

  it("tabela ausente (antes do SQL) vira falha legível, não exceção", async () => {
    const { client } = bancoFalso([{ id: "p1", provider_post_id: "m1" }], 'relation "instagram_metricas_post" does not exist');
    const r = await coletarMetricasDoInstagram({
      client, projectId: "proj", env: {}, agora: AGORA,
      lerInsights: async () => ({ reach: 1, saved: 1, shares: 0, comments: 0, likes: 0 }),
      lerSeguidores: async () => 5,
    });
    expect(r.gravados).toBe(0);
    expect(r.falhas[0]).toContain("métricas dos posts não gravadas");
  });

  it("com a chave de métricas fala com graph.instagram.com; falha da Meta é erro, nunca zero", async () => {
    const chamadas: string[] = [];
    const ok = (async (url: string) => {
      chamadas.push(url.split("?")[0]);
      return new Response(JSON.stringify({ data: [{ name: "reach", values: [{ value: 40 }] }, { name: "saved", values: [{ value: 3 }] }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const m = await lerMetricasDoPost("m1", { INSTAGRAM_INSIGHTS_TOKEN: "IGAA-teste" }, ok);
    expect(m).toEqual({ reach: 40, saved: 3, shares: 0, comments: 0, likes: 0 });
    expect(chamadas[0]).toBe("https://graph.instagram.com/v22.0/m1/insights");

    const negado = (async () => new Response(JSON.stringify({ error: { message: "missing permissions" } }), { status: 400 })) as unknown as typeof fetch;
    await expect(lerMetricasDoPost("m1", { INSTAGRAM_INSIGHTS_TOKEN: "IGAA-teste" }, negado)).rejects.toThrow("Meta 400: missing permissions");
  });

  it("seguidores pela chave do Instagram usam /me", async () => {
    let alvo = "";
    const f = (async (url: string) => {
      alvo = url.split("?")[0];
      return new Response(JSON.stringify({ followers_count: 9 }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await lerSeguidoresDaConta({ INSTAGRAM_INSIGHTS_TOKEN: "IGAA-teste" }, f)).toBe(9);
    expect(alvo).toBe("https://graph.instagram.com/v22.0/me");
  });
});
