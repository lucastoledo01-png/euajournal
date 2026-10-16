import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chaveDeIdempotencia,
  criarSocialPostsStore,
  resolverOrigem,
} from "./social-posts-store";
import type { PostParaGravar } from "./social-posts-store";
import type { RegistroHistorico } from "../editorial/history";
import { idNaBiblioteca } from "../visual/biblioteca";

/**
 * Onde um post do social vira linha, e as duas coisas que ele não pode fazer:
 * duplicar acontecimento e mentir sobre a própria origem.
 */

const PROJ = "proj-1";
const DIA = "2026-09-06";

function historico(over: Partial<RegistroHistorico> = {}): RegistroHistorico {
  return {
    projectId: PROJ,
    storyId: "s1",
    canal: "newsletter",
    titulo: "USCIS amplia prazo",
    urlCanonica: "uscis.gov/a",
    publicadoEm: "2026-09-06T09:00:00Z",
    ...over,
  } as RegistroHistorico;
}

function paraGravar(over: Record<string, unknown> = {}): PostParaGravar {
  const storyId = (over.storyId as string) ?? "s1";
  return {
    projectId: PROJ,
    editionDate: DIA,
    candidateId: "cand-1",
    topicId: "org:uscis",
    eventFingerprint: (over.eventFingerprint as string) ?? "uscis+prazo",
    origem: (over.origem as PostParaGravar["origem"]) ?? {
      originChannel: "social",
      originStoryId: null,
      motivo: "",
    },
    vaga: { posicao: 1, slot: `${DIA}-01`, quandoIso: "2026-09-06T11:00:00Z", horaLocal: "08:00" },
    visual: null,
    post: {
      /*
       * `classificacao` entra aqui porque a linha gravada carrega o eixo, que
       * é a sobrancelha da capa de texto. O tipo sempre teve o campo; o
       * dublê é que estava incompleto, e o teste passava por sorte.
       */
      pauta: { storyId, pontuacao: { total: 70 }, classificacao: { eixo: "imigracao" } },
      copy: { headline: "USCIS amplia prazo do EAD", hashtags: [] },
      veredicto: {
        passed: true, issues: [], repairableIssues: [], fatalIssues: [],
        attempts: 0, finalDecision: "publicar",
        legendaFinal: "Legenda do post.", hashtagsFinais: ["#USCIS"],
      },
      reparosAplicados: [],
    },
    /* O artefato congelado é obrigatório: sem ele não existe o que publicar. */
    formato: "static",
    artefatos: [
      {
        index: 1,
        url: "https://storage.exemplo/imigra-us/2026-09-06/social-v2.png",
        path: "imigra-us/2026-09-06/social-v2-2026-09-06-s1/social-v2.png",
        filename: "social-v2.png",
        mime: "image/png",
        sha256: "a".repeat(64),
        bytes: 172_647,
        largura: 2160,
        altura: 2880,
        otimizado: false,
      },
    ],
    ...over,
  } as unknown as PostParaGravar;
}

/** Supabase de mentira que guarda as linhas em memória. */
function bancoFalso(existentes: Array<Record<string, unknown>> = []) {
  const gravadas: Record<string, unknown>[] = [];

  const client = {
    from() {
      const c: Record<string, unknown> = {
        select() { return c; },
        eq() { return c; },
        then(resolve: (v: unknown) => void) {
          return Promise.resolve({ data: existentes, error: null }).then(resolve);
        },
        upsert(linhas: Record<string, unknown>[]) {
          gravadas.push(...linhas);
          return {
            select: () => Promise.resolve({
              data: linhas.map((_, i) => ({ id: `novo-${i}` })),
              error: null,
            }),
          };
        },
      };
      return c;
    },
  } as unknown as SupabaseClient;

  return { client, gravadas };
}

describe("origem do post", () => {
  it("newsletter-origin: a pauta saiu no e-mail", () => {
    const r = resolverOrigem("s1", [historico({ storyId: "s1", canal: "newsletter" })]);
    expect(r.originChannel).toBe("newsletter");
    expect(r.originStoryId).toBe("s1");
  });

  it("social-only: aprovada, verificada, e não entrou no e-mail", () => {
    const r = resolverOrigem("s2", [historico({ storyId: "s1", canal: "newsletter" })]);
    expect(r.originChannel).toBe("social");
    expect(r.originStoryId).toBeNull();
  });

  it("classificação compartilhada NÃO vira newsletter-origin", () => {
    // Desde que o newsroom grava em news_candidates, toda pauta do dia foi
    // classificada pelo processo que serve o e-mail. Isso não é publicação.
    const semHistorico: RegistroHistorico[] = [];
    const r = resolverOrigem("s1", semHistorico);

    expect(r.originChannel).toBe("social");
    expect(r.motivo).toMatch(/não entrou na composição/);
  });

  it("post do próprio Instagram no histórico também não é newsletter-origin", () => {
    const r = resolverOrigem("s1", [historico({ storyId: "s1", canal: "instagram" })]);
    expect(r.originChannel).toBe("social");
  });
});

describe("persistência", () => {
  it("o crédito curto é a última linha, e nenhum outro crédito sobrevive (regra do dono, 06/10/2026)", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);
    await store.gravar([
      {
        ...paraGravar(),
        legendaFinal: "Legenda do post.\n\nFoto: Fulano / Wikimedia Commons / CC BY-SA 4.0\n\nSiga @eua.journal",
        creditoDaLegenda: "Foto: Fulano (CC BY-SA 4.0)",
      },
    ]);
    // Só o nome desde 06/10/2026, à noite: a sigla sai até da linha que chega pronta.
    expect(gravadas[0].caption).toBe("Legenda do post.\n\nSiga @eua.journal\nFoto: Fulano");
  });

  it("grava usando as colunas que já existem", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([paraGravar()]);

    expect(r.gravados).toBe(1);
    const linha = gravadas[0];
    expect(linha.title).toBe("USCIS amplia prazo do EAD");
    // O store fecha a legenda antes de gravar (06/10/2026): o Siga é a última linha.
    expect(linha.caption).toBe("Legenda do post.\n\nSiga @eua.journal");
    expect(linha.story_id).toBe("s1");
    expect(linha.candidate_id).toBe("cand-1");
    expect(linha.topic_id).toBe("org:uscis");
    expect(linha.event_fingerprint).toBe("uscis+prazo");
    expect(linha.editorial_score).toBe(70);
    expect(linha.social_guard_status).toBe("passed");
    expect(linha.generation_version).toBe("social-v2");
    expect(linha.scheduled_slot).toBe("2026-09-06-01");
  });

  it("o artefato congelado fica na linha, com hash e tamanho", async () => {
    const { client, gravadas } = bancoFalso();
    await criarSocialPostsStore(client).gravar([paraGravar()]);

    const artefato = (
      (gravadas[0].content_json as Record<string, unknown>).arte as Record<string, unknown>
    ).artefato as Record<string, unknown>;

    expect(artefato.sha256).toBe("a".repeat(64));
    expect(artefato.bytes).toBe(172_647);
    expect(artefato.mime).toBe("image/png");

    // E nas colunas onde o painel e o caminho legado já procuram.
    const manifesto = gravadas[0].slides_manifest as Array<Record<string, unknown>>;
    expect(manifesto[0].sha256).toBe("a".repeat(64));
    expect(gravadas[0].asset_paths).toEqual([artefato.url]);
  });

  it("o resultado inteiro da guarda cabe em social_guard_reasons", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);
    await store.gravar([paraGravar()]);

    const razoes = gravadas[0].social_guard_reasons as Record<string, unknown>;
    expect(razoes.finalDecision).toBe("publicar");
    expect(razoes).toHaveProperty("issues");
    expect(razoes).toHaveProperty("attempts");
  });

  it("sem imagem válida, o motivo fica registrado", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);
    await store.gravar([paraGravar({ visual: { motivo: "AMBIGUOUS_ENTITY", asset: null } })]);

    const visual = (gravadas[0].content_json as { visual: Record<string, unknown> }).visual;
    expect(visual.motivo).toBe("AMBIGUOUS_ENTITY");
  });
});

describe("o worker antigo enxerga a linha do V2", () => {
  /*
   * `findDuePosts` (scheduler.ts) seleciona por três coisas e só por elas:
   * `platform = instagram`, `status = scheduled` e `scheduled_at <= agora`.
   * Ele não conhece `dry_run` nem `generation_version`.
   *
   * Esta cópia do critério existe para o teste falhar se a linha do V2 parar
   * de casar com ele, em qualquer direção. Não é um detalhe de implementação
   * escondido num teste: é a fronteira entre gravar e publicar.
   */
  const vencido = (linha: Record<string, unknown>): boolean =>
    linha.platform === "instagram" &&
    linha.status === "scheduled" &&
    String(linha.scheduled_at ?? "") <= "2026-09-07T00:00:00.000Z";

  it("em enforce a linha é elegível, e é por isso que enforce tem trava", async () => {
    /*
     * O V2 grava `status = scheduled`, então o worker pega. Isso é o desenho:
     * quem publica continua sendo o worker, que é onde mora o Chromium.
     *
     * E é a razão de `enforce` estar travado atrás de duas condições. O worker
     * de hoje, ao pegar esta linha, chama `generateCarouselForPost` e
     * REGENERA a copy pelo caminho antigo, jogando fora a que passou pelo
     * Social Guard. Enquanto ele não souber respeitar `generation_version =
     * social-v2`, ligar enforce publica o pipeline velho com dados do novo.
     */
    const { client, gravadas } = bancoFalso();
    await criarSocialPostsStore(client).gravar([paraGravar()]);

    expect(gravadas[0].status).toBe("scheduled");
    expect(gravadas[0].dry_run).toBe(false);
    expect(gravadas[0].generation_version).toBe("social-v2");
    expect(vencido(gravadas[0])).toBe(true);
  });

  it("uma linha que o V2 não gravou não é inventada pelo critério", () => {
    // Sanidade do critério copiado: ele tem que recusar o que não casa.
    expect(vencido({ platform: "instagram", status: "generated", scheduled_at: "2026-09-06T12:00:00.000Z" })).toBe(false);
    expect(vencido({ platform: "facebook", status: "scheduled", scheduled_at: "2026-09-06T12:00:00.000Z" })).toBe(false);
    expect(vencido({ platform: "instagram", status: "scheduled", scheduled_at: "2026-09-30T12:00:00.000Z" })).toBe(false);
  });
});

describe("idempotência", () => {
  it("a mesma pauta não vira duas linhas no mesmo dia", async () => {
    const { client, gravadas } = bancoFalso([
      { id: "velho", story_id: "s1", event_fingerprint: "uscis+prazo", idempotency_key: chaveDeIdempotencia(DIA, "s1") },
    ]);
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([paraGravar()]);

    expect(r.gravados).toBe(0);
    expect(gravadas).toHaveLength(0);
    expect(r.bloqueadosPorIdempotencia[0].motivo).toMatch(/já tem post neste dia/);
  });

  it("o mesmo acontecimento por outro artigo é bloqueado", async () => {
    // story_id diferente, fingerprint igual: duas fontes cobrindo a mesma
    // decisão. Para quem rola o feed é o mesmo post duas vezes.
    const { client } = bancoFalso([
      { id: "velho", story_id: "s1", event_fingerprint: "uscis+prazo", idempotency_key: "outra" },
    ]);
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([paraGravar({ storyId: "s2" })]);

    expect(r.gravados).toBe(0);
    expect(r.bloqueadosPorIdempotencia[0].motivo).toMatch(/DUPLICATE_EVENT/);
  });

  it("dois posts do mesmo evento no MESMO lote também são cortados", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([
      paraGravar({ storyId: "s1" }),
      paraGravar({ storyId: "s2", eventFingerprint: "uscis+prazo" }),
    ]);

    expect(r.gravados).toBe(1);
    expect(gravadas).toHaveLength(1);
    expect(r.bloqueadosPorIdempotencia).toHaveLength(1);
  });

  it("pautas de acontecimentos diferentes passam as duas", async () => {
    const { client } = bancoFalso();
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([
      paraGravar({ storyId: "s1", eventFingerprint: "uscis+prazo" }),
      paraGravar({ storyId: "s2", eventFingerprint: "dhs+regra" }),
    ]);

    expect(r.gravados).toBe(2);
  });

  it("newsletter para Instagram NÃO é bloqueado pela idempotência", async () => {
    // O histórico da newsletter não vive em social_posts, então a pauta
    // reaproveitada entra normalmente. Este é o fluxo desejado.
    const { client } = bancoFalso([]);
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([
      paraGravar({
        origem: { originChannel: "newsletter", originStoryId: "s1", motivo: "reaproveitamento" },
      }),
    ]);

    expect(r.gravados).toBe(1);
  });
});

describe("registro de direito de imagem", () => {
  /** Um asset de domínio público: a licença NÃO exige crédito na peça. */
  const dominioPublico = {
    id: "va-1",
    source: "wikimedia_commons",
    sourceAssetId: "File:Truman_Building.jpg",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Truman_Building.jpg",
    author: "U.S. Department of State",
    license: "PD-USGov",
    licenseUrl: "https://commons.wikimedia.org/wiki/Template:PD-USGov",
    attribution: "",
    rightsStatement: "pd-usgov",
    rightsStatus: "verified",
    rightsCheckedAt: "2026-09-06T00:00:00Z",
    imageUrl: "https://upload.wikimedia.org/foto.jpg",
    imageContextType: "entity_reference",
  };

  async function gravarCom(visual: unknown) {
    const { client, gravadas } = bancoFalso();
    await criarSocialPostsStore(client).gravar([paraGravar({ visual })]);
    return (gravadas[0].content_json as { visual: Record<string, unknown> }).visual;
  }

  it("licença que dispensa crédito não imprime, e ainda assim fica registrada", async () => {
    const v = await gravarCom({ asset: dominioPublico, motivo: null, entidade: null, fontesConsultadas: [] });

    // Nada foi para a arte...
    expect(v.attribution).toBe("");
    expect(v.atribuicaoImpressa).toBe(false);

    // ...e mesmo assim o registro é completo. Quem responde a uma contestação
    // seis meses depois olha esta linha, não a imagem.
    expect(v.author).toBe("U.S. Department of State");
    expect(v.license).toBe("PD-USGov");
    expect(v.licenseUrl).toContain("PD-USGov");
    expect(v.sourcePageUrl).toContain("commons.wikimedia.org");
    expect(v.rightsStatus).toBe("verified");
  });

  it("licença que exige crédito: a arte não imprime nada, e a atribuição fica registrada (06/10/2026)", async () => {
    const v = await gravarCom({
      asset: { ...dominioPublico, license: "CC BY-SA", attribution: "Foto: Fulano / Wikimedia Commons, CC BY-SA 3.0" },
      motivo: null,
      entidade: null,
      fontesConsultadas: [],
    });

    // Regra do dono: nenhuma tira de crédito na arte do Instagram, para licença nenhuma.
    expect(v.atribuicaoImpressa).toBe(false);
    expect(v.attribution).toContain("CC BY-SA");
  });

  /*
   * 15/10/2026: quatro das cinco fotos do dia vieram do acervo, com o id da
   * tabela do acervo em `visual_asset_id`, que é chave estrangeira para
   * `visual_assets`. O insert foi recusado e o dia saiu sem post.
   */
  it("a foto do acervo não vai para visual_asset_id, e a foto fica registrada no content_json", async () => {
    const { client, gravadas } = bancoFalso();
    const doAcervo = {
      ...dominioPublico,
      id: "3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f",
      source: "acervo_proprio",
      sourceAssetId: "pessoas-br-lula-retrato-01.jpg",
    };
    await criarSocialPostsStore(client).gravar([
      paraGravar({ visual: { asset: doAcervo, motivo: null, entidade: null, fontesConsultadas: [] } }),
    ]);

    expect(gravadas[0].visual_asset_id).toBeNull();
    const v = (gravadas[0].content_json as { visual: Record<string, unknown> }).visual;
    expect(v.source).toBe("acervo_proprio");
  });

  it("a foto registrada na biblioteca continua indo para visual_asset_id", async () => {
    const { client, gravadas } = bancoFalso();
    const daBiblioteca = { ...dominioPublico, id: "9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e" };
    await criarSocialPostsStore(client).gravar([
      paraGravar({ visual: { asset: daBiblioteca, motivo: null, entidade: null, fontesConsultadas: [] } }),
    ]);

    expect(gravadas[0].visual_asset_id).toBe("9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e");
  });

  it("id de origem que não é uuid não vai para a chave estrangeira", () => {
    expect(idNaBiblioteca({ id: "va-1", source: "wikimedia_commons" })).toBeNull();
    expect(idNaBiblioteca({ id: "nyse-bandeira-gigante", source: "wikimedia_commons" })).toBeNull();
    expect(idNaBiblioteca(null)).toBeNull();
  });

  it("sem foto, o registro conta a decisão e o porquê dela", async () => {
    const v = await gravarCom({
      asset: null,
      motivo: "NO_VALID_IMAGE",
      entidade: { nome: "ordem judicial", tipo: "conceptual", confianca: 30 },
      fontesConsultadas: [{ fonte: "banco_conceitual", encontrados: 0, nota: "sem chave configurada" }],
    });

    expect(v.capa).toBe("texto");
    expect(v.motivo).toBe("NO_VALID_IMAGE");
    expect(v.entidadeVisual).toBe("ordem judicial");
    expect(v.fontesConsultadas).toHaveLength(1);
  });
});

describe("o canal instagram do histórico editorial (06/10/2026)", () => {
  /** Banco que separa as escritas por tabela e devolve a chave, como o PostgREST. */
  function bancoPorTabela(falharHistorico = false) {
    const escritas: Record<string, Record<string, unknown>[]> = {};
    const client = {
      from(tabela: string) {
        const c: Record<string, unknown> = {
          select() { return c; },
          eq() { return c; },
          then(resolve: (v: unknown) => void) {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
          upsert(linhas: Record<string, unknown>[]) {
            (escritas[tabela] ??= []).push(...linhas);
            return {
              select: () =>
                Promise.resolve(
                  tabela === "editorial_history" && falharHistorico
                    ? { data: null, error: { message: "Gateway Timeout" } }
                    : {
                        data: linhas.map((l, i) => ({ id: `${tabela}-${i}`, idempotency_key: l.idempotency_key })),
                        error: null,
                      },
                ),
            };
          },
        };
        return c;
      },
    } as unknown as SupabaseClient;
    return { client, escritas };
  }

  function comPauta(storyId: string, url: string) {
    const p = paraGravar({ storyId, eventFingerprint: `fp-${storyId}` });
    (p.post.pauta as unknown as Record<string, unknown>).grupo = {
      primary: { title: "Claims for unemployment benefits drop to 197,000", url, description: "" },
    };
    (p.post.pauta as unknown as Record<string, unknown>).classificacao = {
      eixo: "economia", pais: "EUA", atores: ["Labor Department"], lugares: [], acontecimento: ["queda"],
    };
    return p;
  }

  it("todo post agendado vira linha instagram no histórico, apontando para a linha do post", async () => {
    const { client, escritas } = bancoPorTabela();
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([
      comPauta("u_0a3ec9b5e6e7681e7f3b", "https://www.pbs.org/newshour/economy/claims-197000"),
    ]);

    expect(r.gravados).toBe(1);
    const [h] = escritas.editorial_history ?? [];
    expect(h).toMatchObject({
      channel: "instagram",
      story_id: "u_0a3ec9b5e6e7681e7f3b",
      instagram_post_id: "social_posts-0",
      canonical_url: "pbs.org/newshour/economy/claims-197000",
      published_at: "2026-09-06T11:00:00Z",
      image_url: null,
    });
  });

  it("falha ao gravar o histórico não desfaz o post", async () => {
    const { client, escritas } = bancoPorTabela(true);
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([comPauta("s9", "https://exemplo.com/s9")]);

    expect(r.gravados).toBe(1);
    expect(r.erros).toEqual([]);
    expect(escritas.social_posts).toHaveLength(1);
    expect(escritas.editorial_history).toHaveLength(1);
  });
});
