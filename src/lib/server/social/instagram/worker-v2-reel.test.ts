import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O worker publicando um Reel pelo social-v2.
 *
 * Mesmo harness de `worker-v2-ramo.test.ts`: a Meta é um `fetcher` de mentira e
 * a publicação segura roda de verdade. O que se afirma aqui é que o vídeo
 * aprovado vai à Meta como Reel (e nunca como imagem), que o arquivo é
 * conferido por hash antes de qualquer container, e que o Reel não passa por
 * gerador nem renderizador.
 *
 * (cabeçalho herdado do arquivo irmão, que cobre as duas gerações de imagem)
 *
 * O que estes testes exercitam é o CAMINHO, não pedaços dele: a leitura da
 * linha, a bifurcação, o preparo e a cauda irreversível inteira. A Meta é
 * substituída no `fetcher`, e a publicação segura roda de verdade — mocká-la
 * seria testar o mock justamente na parte que não se pode errar.
 *
 * O gerador antigo e o renderizador antigo são espionados. Para o post V2, a
 * asserção não é "produziu a coisa certa": é que eles não foram chamados
 * NENHUMA vez. Post pronto que passa pelo gerador deixa de ser o post que foi
 * aprovado.
 */

const tabelas: Record<string, { row?: unknown; rows?: unknown[] }> = {};
const updates: Array<Record<string, unknown>> = [];
/**
 * Faz falhar UMA gravação específica, escolhida pelo nome de um campo.
 *
 * Derrubar todo UPDATE não serviria: a marca de posse também é um UPDATE, e ela
 * lança, então o fluxo morreria antes de chegar à publicação — o que é o
 * comportamento correto para banco fora do ar, e não é o cenário aqui. O que se
 * quer isolar é a gravação do registro de revisão falhando depois de a Meta já
 * ter sido chamada.
 */
const falharUpdate: { campo: string | null; mensagem: string } = { campo: null, mensagem: "conexão perdida" };

/**
 * Quando ligado, a reivindicação atômica da vaga não afeta nenhuma linha, que é
 * o que o Postgres devolve para quem chegou em segundo lugar.
 */
const perderDisputa = { ligado: false };

function construirQuery(tabela: string) {
  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
    lte: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: tabelas[tabela]?.row ?? null, error: null }),
    single: async () => ({ data: tabelas[tabela]?.row ?? null, error: null }),
    update: (valores: Record<string, unknown>) => {
      if (tabela === "social_posts") updates.push(valores);

      if (tabela === "social_posts" && falharUpdate.campo && falharUpdate.campo in valores) {
        return { ...query, eq: async () => ({ data: null, error: { message: falharUpdate.mensagem } }) };
      }

      /*
       * A reivindicação da vaga: `update(...).eq(id).eq(status).select("id")`.
       *
       * O que decide a disputa é quantas linhas o UPDATE afetou, então o dublê
       * precisa devolver a lista — vazia para quem perdeu, com uma linha para
       * quem ganhou. Devolver o `query` genérico faria toda reivindicação
       * parecer perdida.
       */
      const reivindicacao = {
        ...query,
        eq: () => reivindicacao,
        select: async () => ({
          data: perderDisputa.ligado ? [] : [{ id: "post-v2" }],
          error: null,
        }),
      };
      return reivindicacao;
    },
    upsert: () => query,
    insert: () => query,
  };
  return query;
}

vi.mock("../../supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => construirQuery(t) }),
}));

/** O gerador antigo de copy. Para o V2, a contagem tem que ficar em zero. */
const gerouCopyLegado = vi.fn();
vi.mock("./pipeline", () => ({
  generateInstagramCarouselPipeline: (...args: unknown[]) => {
    gerouCopyLegado(...args);
    return Promise.resolve({
      carousel: {
        title: "TÍTULO REGENERADO PELO LEGADO",
        format: "noticia",
        slides: [{ index: 1, type: "cover", title: "capa legada" }],
        caption: { full_caption: "LEGENDA REGENERADA PELO LEGADO", hashtags: ["#legado"] },
      },
      usage: { promptTokens: 1, completionTokens: 1, estimatedCostUsd: 0 },
      contexto: { assunto: "x", orgao: "y" },
    });
  },
  generateTutorialCarouselPipeline: () => {
    throw new Error("tutorial não é o caso destes testes");
  },
}));

/** O renderizador antigo, que passa por banco de fotos. */
const renderizouLegado = vi.fn();
vi.mock("./opendesign-renderer", () => ({
  renderOpenDesignSlides: (...args: unknown[]) => {
    renderizouLegado(...args);
    return Promise.resolve([{ index: 1, filename: "legado.png", pngBuffer: Buffer.from("legado"), type: "cover", htmlContent: "" }]);
  },
  uploadOpenDesignSlideToStorage: async () => "https://storage.exemplo/legado.png",
}));

/**
 * O artefato aprovado, como ele vive no Storage.
 *
 * O ramo V2 não renderiza mais nada: a peça foi congelada quando o post foi
 * aprovado, e aqui o trabalho é conferir que o arquivo continua sendo aquele.
 * `arquivoNoStorage` é o que o `fetcher` devolve, e trocá-lo é como se simula
 * um arquivo adulterado.
 */
const BYTES_APROVADOS = Buffer.from("MP4-do-reel-aprovado");
const SHA_APROVADO = crypto.createHash("sha256").update(BYTES_APROVADOS).digest("hex");
const arquivoNoStorage = { bytes: BYTES_APROVADOS, status: 200 };

/**
 * O token que vale mora em `project_credentials` e é trocado pelo cron. A env é
 * semente, e em regime ela está vencida.
 */
const TOKEN_EFETIVO = "token-renovado-pelo-cron";
vi.mock("./meta-token", () => ({ resolveInstagramToken: async () => TOKEN_EFETIVO }));
vi.mock("../../prompt-system/funil-permanente", () => ({
  garantirFunilPermanente: async () => ({ ligado: true, keyword: "VISA", automationId: "a1", criadaAgora: false }),
}));
vi.mock("../../prompt-system/pos-publicacao", () => ({ concluirCampanhaPublicada: async () => ({ automacaoCriada: false }) }));
const alertas: Array<{ nivel: string; titulo: string; corpo: string }> = [];
vi.mock("../../alerts", () => ({
  sendAlert: async (nivel: string, titulo: string, corpo: string) => {
    alertas.push({ nivel, titulo, corpo });
    return true;
  },
  formatError: (e: unknown) => String(e),
}));
vi.mock("./edition-loader", () => ({ loadEdition: async () => ({ stories: [{ title: "t", summary: "s" }] }) }));
/*
 * A auditoria de legenda do caminho legado passa direto.
 *
 * Ela é do legado e tem teste próprio; aqui ela só atrapalharia, porque o
 * carrossel de mentira não tem os campos que ela inspeciona. O que estes
 * testes afirmam sobre o legado é que ele PASSOU pelo gerador antigo, não como
 * a legenda dele é auditada.
 */
vi.mock("../legenda", () => ({
  garantirLegendaSocial: (carousel: unknown) => ({ carousel, problemas: [], reparos: [] }),
}));

const { processScheduledPost } = await import("./worker-service");

const PROJETO = {
  id: "projeto-1",
  slug: "imigra-us",
  name: "imigra.us",
  status: "active",
  niche: "imigração",
  content_language: "pt-BR",
  timezone: "America/Sao_Paulo",
  site_url: null,
  brand_display_name: "imigra.us",
  brand_tagline: "",
  brand_primary_color: "#ff4a1c",
  brand_logo_url: null,
  brand_social_links: {},
  newsletter_from_name: "imigra.us",
  publish_hour_local: 6,
  publish_minute_local: 3,
  editorial_prompt_extra: "",
  settings: { instagram_keyword: "VISA" },
};

const HEADLINE = "Trump não deve apoiar Flávio como líder do Brasil";
const LEGENDA = "Segundo a Reuters, o governo Trump não pretende apoiar a alegação.\n\n#trump #flaviobolsonaro\n\nSiga @eua.journal";

function linhaReel(over: Record<string, unknown> = {}, conteudo: Record<string, unknown> = {}, artefato: Record<string, unknown> = {}) {
  return {
    id: "post-v2",
    project_id: "projeto-1",
    edition_date: "2026-10-31",
    status: "scheduled",
    generation_version: "social-v2",
    dry_run: false,
    title: HEADLINE,
    caption: LEGENDA,
    story_id: "s-1",
    event_fingerprint: null,
    visual_asset_id: null,
    origin_channel: "social",
    social_guard_status: "passed",
    provider_post_id: null,
    provider_creation_id: null,
    publish_attempted_at: null,
    content_json: {
      format: "noticia",
      formato: "reel",
      hashtags: ["#USCIS", "#Imigracao"],
      arte: {
        versao: "v2",
        artefato: {
          url: "https://storage.exemplo/reels/reel-1.mp4",
          path: "reels-manuais/reel-1.mp4",
          filename: "reel-1.mp4",
          mime: "video/mp4",
          sha256: SHA_APROVADO,
          bytes: BYTES_APROVADOS.byteLength,
          ...artefato,
        },
      },
      ...conteudo,
    },
    ...over,
  };
}

/** A Meta, de mentira. Registra o que recebeu para as asserções de imutabilidade. */
function metaFalsa() {
  const chamadas: Array<{ url: string; corpo: Record<string, string> }> = [];

  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);

    // O Storage, que é de onde o worker baixa o artefato aprovado.
    if (u.startsWith("https://storage.exemplo/")) {
      baixouArtefato.push(u);
      return new Response(arquivoNoStorage.bytes, { status: arquivoNoStorage.status });
    }

    // O cliente da Meta manda form-urlencoded, não JSON. A legenda chega aqui
    // percorrendo a mesma codificação que ela percorre em produção, o que é
    // exatamente o que o teste de imutabilidade precisa exercitar.
    const corpo = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    chamadas.push({ url: u, corpo });

    /*
     * A Meta de mentira CONFERE o token, e é isso que a torna útil.
     *
     * Aceitar qualquer token faria o teste passar com a semente vencida, que é
     * exatamente o defeito que se quer pegar: a reconciliação consultava o
     * container com o token da env em vez do resolvido.
     */
    const tokenUsado =
      new URL(u).searchParams.get("access_token") ?? corpo.access_token ?? "";
    if (tokenUsado && tokenUsado !== TOKEN_EFETIVO) {
      return Response.json(
        { error: { message: "Error validating access token: Session has expired.", code: 190 } },
        { status: 400 },
      );
    }

    if (u.includes("/media_publish")) return Response.json({ id: "media-999" });
    if (u.includes("/media?fields=id,caption")) return Response.json({ data: [] });
    if (u.includes("fields=status_code")) return Response.json({ status_code: "FINISHED" });
    if (u.includes("/media")) return Response.json({ id: "container-1" });
    return Response.json({});
  }) as unknown as typeof fetch;

  return { fetcher, chamadas };
}

/** Quais URLs do Storage o worker baixou. */
const baixouArtefato: string[] = [];

const ENV = {
  INSTAGRAM_ACCOUNT_ID: "conta-1",
  // Semente vencida, que é o estado normal depois da primeira troca do cron.
  INSTAGRAM_ACCESS_TOKEN: "semente-vencida",
  INSTAGRAM_AUTO_POST: "true",
  NEWSLETTER_FINAL_LINE: "",
};

beforeEach(() => {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  updates.length = 0;
  gerouCopyLegado.mockClear();
  renderizouLegado.mockClear();
  alertas.length = 0;
  falharUpdate.campo = null;
  perderDisputa.ligado = false;
  baixouArtefato.length = 0;
  arquivoNoStorage.bytes = BYTES_APROVADOS;
  arquivoNoStorage.status = 200;
  tabelas.projects = { row: PROJETO };
});


const VIDEO = "https://storage.exemplo/reels/reel-1.mp4";

describe("Reel pelo social-v2", () => {
  it("publica o vídeo aprovado como Reel, e nunca como imagem", async () => {
    tabelas.social_posts = { row: linhaReel() };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(true);
    expect(r.status).toBe("published");

    const criacao = chamadas.find((c) => c.url.endsWith("/conta-1/media") && c.corpo.media_type);
    expect(criacao).toBeDefined();
    expect(criacao!.corpo.media_type).toBe("REELS");
    expect(criacao!.corpo.video_url).toBe(VIDEO);
    expect(criacao!.corpo.share_to_feed).toBe("true");
    expect(criacao!.corpo.image_url).toBeUndefined();
    expect(criacao!.corpo.caption).toBe(LEGENDA);
    expect(chamadas.some((c) => c.url.includes("/media_publish"))).toBe(true);
  });

  it("confere o hash do vídeo antes de criar qualquer container", async () => {
    tabelas.social_posts = { row: linhaReel() };
    const { fetcher, chamadas } = metaFalsa();
    arquivoNoStorage.bytes = Buffer.from("MP4-TROCADO-DEPOIS-DA-APROVACAO");

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/SOCIAL_ARTIFACT_HASH_MISMATCH/);
    expect(chamadas).toHaveLength(0);
  });

  it("não passa por gerador nem por renderizador", async () => {
    tabelas.social_posts = { row: linhaReel() };
    const { fetcher } = metaFalsa();

    await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(gerouCopyLegado).not.toHaveBeenCalled();
    expect(renderizouLegado).not.toHaveBeenCalled();
  });

  it("dispensa o registro visual da arte estática", async () => {
    tabelas.social_posts = { row: linhaReel({}, { visual: undefined }) };
    const { fetcher } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.status).toBe("published");
  });

  it("recusa Reel cujo arquivo não é video/mp4, e a Meta não é chamada", async () => {
    tabelas.social_posts = { row: linhaReel({}, {}, { mime: "image/png" }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/SOCIAL_V2_PAYLOAD_INCOMPLETE/);
    expect(r.error).toMatch(/video\/mp4/);
    expect(chamadas).toHaveLength(0);
  });

  it("recusa Reel sem o mime escrito, em vez de assumir imagem", async () => {
    tabelas.social_posts = { row: linhaReel({}, {}, { mime: "" }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/SOCIAL_V2_PAYLOAD_INCOMPLETE/);
    expect(chamadas).toHaveLength(0);
  });

  it("formato desconhecido continua bloqueando (o fechamento não afrouxou)", async () => {
    tabelas.social_posts = { row: linhaReel({}, { formato: "reels" }) };
    const { fetcher, chamadas } = metaFalsa();

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/formato desconhecido/);
    expect(chamadas).toHaveLength(0);
  });

  it("espera o vídeo ser processado: IN_PROGRESS não publica, FINISHED publica", async () => {
    tabelas.social_posts = { row: linhaReel() };
    const { fetcher: base, chamadas } = metaFalsa();
    let consultas = 0;
    const fetcher = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("fields=status_code")) {
        consultas++;
        return Response.json({ status_code: consultas < 2 ? "IN_PROGRESS" : "FINISHED" });
      }
      return base(url, init);
    }) as unknown as typeof fetch;

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.status).toBe("published");
    expect(consultas).toBe(2);
    const idxPublicar = chamadas.findIndex((c) => c.url.includes("/media_publish"));
    expect(idxPublicar).toBeGreaterThan(-1);
  }, 20_000);

  it("a Meta recusando o vídeo vai para revisão, sem publicar", async () => {
    tabelas.social_posts = { row: linhaReel() };
    const { fetcher: base, chamadas } = metaFalsa();
    const fetcher = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("fields=status_code")) {
        return Response.json({ status_code: "ERROR", status: "Formato de vídeo não suportado" });
      }
      return base(url, init);
    }) as unknown as typeof fetch;

    const r = await processScheduledPost("post-v2", {}, ENV, fetcher);

    expect(r.ok).toBe(false);
    expect(r.status).toBe("needs_review");
    expect(chamadas.some((c) => c.url.includes("/media_publish"))).toBe(false);
  });
});
