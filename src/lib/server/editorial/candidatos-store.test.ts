import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assinaturaDoClassificador,
  classificacaoAindaVale,
  criarCandidatosStore,
  garantirStatus,
  garantirStatusIntrinseco,
  hashDaVerificacao,
  paraPersistir,
  podePublicar,
  STATUS_DE_CANDIDATA,
  STATUS_INTRINSECO,
  verificacaoAindaVale,
} from "./candidatos-store";
import type { CandidataParaGravar, VerificacaoPersistida } from "./candidatos-store";
import type { Classificacao } from "./classificador";
import type { Verificacao } from "./verificador";

/**
 * A candidata que se classifica uma vez e se lê em todos os canais.
 *
 * A medição que motivou isto: a mesma candidata, classificada três vezes,
 * mudou de relevância em 64% dos casos e de decisão em 24%. Persistir não
 * melhora o sorteio; faz ele acontecer uma vez só.
 */

const PROJ = "proj-1";

function classificacao(p: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "c1", pais: "EUA", imigracao: true, leitura: "oportunidade", eixo: "imigracao",
    natureza: "official_action", relevancia: 7, atores: ["USCIS"], lugares: [], acontecimento: [],
    justificativa: "", ...p,
  } as Classificacao;
}

function candidata(p: Partial<CandidataParaGravar> = {}): CandidataParaGravar {
  return {
    storyId: "s1",
    url: "https://www.uscis.gov/a",
    title: "USCIS publica guia",
    publishedAt: "2026-09-06T12:00:00Z",
    status: "classified",
    classificacao: classificacao(),
    ...p,
  };
}

/** Supabase de mentira que registra as operações. */
function bancoFalso(linhasExistentes: Array<Record<string, unknown>> = []) {
  const ops: Array<{ op: string; detalhe: unknown }> = [];

  const client = {
    from() {
      const q: Record<string, unknown> = {};
      const construtor = {
        select() { return construtor; },
        eq() { return construtor; },
        gte() { return construtor; },
        order() { return construtor; },
        range(inicio: number) {
          ops.push({ op: "select.range", detalhe: inicio });
          // Uma página só: as fixtures são pequenas.
          return Promise.resolve({ data: inicio === 0 ? linhasExistentes : [], error: null });
        },
        in(_col: string, valores: string[]) {
          ops.push({ op: "select.in", detalhe: valores });
          const filtradas = linhasExistentes.filter(
            (l) => valores.includes(String(l.url)) || valores.includes(String(l.story_id)),
          );
          return Promise.resolve({ data: filtradas, error: null });
        },
        upsert(linhas: unknown[], opcoes: unknown) {
          ops.push({ op: "upsert", detalhe: { n: (linhas as unknown[]).length, opcoes } });
          return Promise.resolve({ error: null });
        },
        update(campos: unknown) {
          ops.push({ op: "update", detalhe: campos });
          return {
            in: () => Promise.resolve({ error: null }),
            eq: () => Promise.resolve({ error: null }),
          };
        },
        single() { return Promise.resolve({ data: { metadata_json: { antigo: true } }, error: null }); },
      };
      void q;
      return construtor;
    },
  } as unknown as SupabaseClient;

  return { client, ops };
}

describe("vocabulário de status", () => {
  it("aceita exatamente os dez do CHECK do banco", () => {
    expect(STATUS_DE_CANDIDATA).toHaveLength(10);
    for (const s of STATUS_DE_CANDIDATA) expect(garantirStatus(s)).toBe(s);
  });

  it("recusa os conceitos que NÃO são status, e diz onde eles moram", () => {
    expect(() => garantirStatus("verified")).toThrow(/metadata_json\.verificacao/);
    expect(() => garantirStatus("conflict")).toThrow(/metadata_json\.verificacao/);
    expect(() => garantirStatus("editorial_approved")).toThrow(/status = 'approved'/);
    expect(() => garantirStatus("used_newsletter")).toThrow(/editorial_history/);
    expect(() => garantirStatus("used_social")).toThrow(/editorial_history/);
  });

  it("recusa qualquer outro valor listando os aceitos", () => {
    expect(() => garantirStatus("inventado")).toThrow(/collected, classified/);
  });

  it("a guarda roda antes de a linha chegar ao banco", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);

    await expect(
      store.gravarNovas(PROJ, [candidata({ status: "verified" as never })]),
    ).rejects.toThrow(/não é um status/);

    expect(ops.filter((o) => o.op === "upsert")).toHaveLength(0);
  });

  it("atualizarStatus também é guardado", async () => {
    const { client } = bancoFalso();
    const store = criarCandidatosStore(client);
    await expect(store.atualizarStatus(["a"], "conflict" as never)).rejects.toThrow(/não é um status/);
  });
});

describe("idempotência da gravação", () => {
  it("candidata nova é gravada", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [candidata()]);

    expect(r.gravadas).toBe(1);
    expect(r.reaproveitadas).toBe(0);
    const up = ops.find((o) => o.op === "upsert")!.detalhe as { opcoes: { onConflict: string; ignoreDuplicates: boolean } };
    expect(up.opcoes.onConflict).toBe("project_id,url");
    expect(up.opcoes.ignoreDuplicates).toBe(true);
  });

  it("candidata que já existe NÃO é regravada", async () => {
    const { client, ops } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://www.uscis.gov/a", story_id: "s1",
        classification_status: "done", relevance: 9, status: "approved", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [candidata()]);

    expect(r.gravadas).toBe(0);
    expect(r.reaproveitadas).toBe(1);
    expect(r.jaClassificadas).toEqual(["https://www.uscis.gov/a"]);
    // O ponto: nenhuma escrita. A relevância 9 já persistida sobrevive à
    // leitura 7 que o modelo acabou de devolver.
    expect(ops.filter((o) => o.op === "upsert")).toHaveLength(0);
  });

  it("mistura de novas e existentes grava só as novas", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1",
        classification_status: "done", status: "approved", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [
      candidata({ url: "https://a.com/1" }),
      candidata({ url: "https://b.com/2", storyId: "s2" }),
    ]);

    expect(r.gravadas).toBe(1);
    expect(r.reaproveitadas).toBe(1);
  });

  it("candidata gravada SEM classificação é completada quando a classificação chega", async () => {
    // 13/10/2026: a cota da OpenAI acabou no meio da produção e 1.134
    // candidatas foram gravadas como REJECT_UNCLASSIFIED, sem classificação.
    // As rodadas seguintes classificaram e aprovaram, e nada regravava a
    // linha: o post lia "rejected" e descartava a pauta que o verificador
    // tinha confirmado.
    const verificacao = { canal: "instagram", status: "confirm", motivo: "ok", verificadoEm: "2026-10-14T02:19:00Z" };
    const { client, ops } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://www.uscis.gov/a", story_id: "s1",
        classification_status: "pending", status: "rejected", decision_reason: "REJECT_UNCLASSIFIED",
        metadata_json: { verificacao } },
    ]);
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [candidata({ status: "approved", decisionReason: "APPROVED_US_OPPORTUNITY" })]);

    expect(r.gravadas).toBe(1);
    expect(r.reaproveitadas).toBe(0);
    expect(ops.filter((o) => o.op === "upsert")).toHaveLength(0);
    const up = ops.find((o) => o.op === "update")!.detalhe as Record<string, unknown>;
    expect(up.status).toBe("approved");
    expect(up.decision_reason).toBe("APPROVED_US_OPPORTUNITY");
    expect(up.classification_status).toBe("done");
    expect((up.metadata_json as Record<string, unknown>).verificacao).toEqual(verificacao);
  });

  it("candidata sem classificação continua intocada quando a nova também vem sem", async () => {
    const { client, ops } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://www.uscis.gov/a", story_id: "s1",
        classification_status: "pending", status: "rejected", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [candidata({ status: "rejected", classificacao: undefined })]);

    expect(r.gravadas).toBe(0);
    expect(r.reaproveitadas).toBe(1);
    expect(ops.filter((o) => o.op === "update" || o.op === "upsert")).toHaveLength(0);
  });

  it("lista vazia não fala com o banco", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);
    const r = await store.gravarNovas(PROJ, []);
    expect(r.gravadas).toBe(0);
    expect(ops).toHaveLength(0);
  });
});

describe("leitura para reuso", () => {
  it("devolve a classificação persistida montada", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1", title: "T",
        classification_status: "done", country: "EUA", is_immigration: true,
        editorial_reading: "oportunidade", editorial_axis: "processo", relevance: 8,
        actors: ["USCIS"], places: [], event_terms: [], status: "approved", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const mapa = await store.buscarPorUrls(PROJ, ["https://a.com/1"]);
    const c = mapa.get("https://a.com/1")!;

    expect(c.classificacao?.pais).toBe("EUA");
    expect(c.classificacao?.relevancia).toBe(8);
    expect(c.classificacao?.eixo).toBe("processo");
  });

  it("candidata sem classificação devolve null, não um objeto vazio", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1",
        classification_status: "pending", status: "collected", metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const c = (await store.buscarPorUrls(PROJ, ["https://a.com/1"])).get("https://a.com/1")!;
    expect(c.classificacao).toBeNull();
  });

  it("busca por story_id serve ao reuso entre canais", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1",
        classification_status: "done", status: "approved",
        metadata_json: { verificacao: { status: "confirm", motivo: "ok", divergencias: [], verificadoEm: "2026-09-06T10:00:00Z", canal: "newsletter" } } },
    ]);
    const store = criarCandidatosStore(client);

    const c = (await store.buscarPorStoryIds(PROJ, ["s1"])).get("s1")!;
    expect(c.verificacao?.status).toBe("confirm");
    expect(c.verificacao?.canal).toBe("newsletter");
  });
});

describe("verificação persistida", () => {
  it("preserva o metadata que já estava lá", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);

    await store.gravarVerificacao("x", {
      status: "confirm", motivo: "ok", divergencias: [], verificadoEm: "2026-09-06T10:00:00Z",
      canal: "newsletter", inputHash: "abc123",
    });

    const upd = ops.find((o) => o.op === "update")!.detalhe as { metadata_json: Record<string, unknown> };
    expect(upd.metadata_json.antigo).toBe(true);
    expect((upd.metadata_json.verificacao as VerificacaoPersistida).status).toBe("confirm");
  });

  it("review do verificador vira conflict no banco", () => {
    const v: Verificacao = {
      storyId: "s1", veredicto: "review", camposConfirmados: [],
      divergencias: [{ campo: "pais", primaria: "EUA", verificacao: "Brasil", material: true }],
      motivo: "EDITORIAL_CLASSIFICATION_CONFLICT: pais", leitura: null, origem: "verificacao",
    };

    expect(paraPersistir(v, "newsletter", "h1").status).toBe("conflict");
    expect(paraPersistir({ ...v, veredicto: "confirm" }, "social", "h1").status).toBe("confirm");
    expect(paraPersistir({ ...v, veredicto: "reject" }, "social", "h1").status).toBe("reject");
    expect(paraPersistir(v, "newsletter", "h1").inputHash).toBe("h1");
  });

  it("verificação válida: mesmo hash e dentro da janela, reutiliza", () => {
    const base = { status: "confirm" as const, motivo: "", divergencias: [], canal: "newsletter", inputHash: "h1" };
    expect(verificacaoAindaVale({ ...base, verificadoEm: new Date().toISOString() }, "h1")).toBe(true);
  });

  it("verificação velha não é reaproveitada, mesmo com o hash igual", () => {
    const antiga = new Date(Date.now() - 48 * 3600_000).toISOString();
    const base = { status: "confirm" as const, motivo: "", divergencias: [], canal: "newsletter", inputHash: "h1" };
    expect(verificacaoAindaVale({ ...base, verificadoEm: antiga }, "h1")).toBe(false);
    expect(verificacaoAindaVale(null, "h1")).toBe(false);
  });

  it("pacote factual mudou: hash diferente invalida mesmo dentro das 24h", () => {
    // O caso concreto: a verificação leu a descrição do feed, e o
    // enriquecimento depois trouxe a matéria inteira. O relógio não sabe
    // disso; o hash sabe.
    const base = {
      status: "confirm" as const, motivo: "", divergencias: [], canal: "newsletter",
      inputHash: "hash-do-texto-curto", verificadoEm: new Date().toISOString(),
    };
    expect(verificacaoAindaVale(base, "hash-do-texto-longo")).toBe(false);
  });

  it("verificação sem hash gravado não é reaproveitada", () => {
    const semHash = {
      status: "confirm" as const, motivo: "", divergencias: [], canal: "newsletter",
      inputHash: "", verificadoEm: new Date().toISOString(),
    };
    expect(verificacaoAindaVale(semHash, "qualquer")).toBe(false);
  });
});

describe("hash do que foi verificado", () => {
  const entrada = {
    titulo: "USCIS publica guia",
    fonte: "USCIS",
    contexto: "A agência publicou orientação sobre interesse nacional.",
    classificacao: { pais: "EUA", leitura: "oportunidade", eixo: "imigracao", relevancia: 7 },
  };

  it("mesma entrada, mesmo hash", () => {
    expect(hashDaVerificacao(entrada)).toBe(hashDaVerificacao({ ...entrada }));
  });

  it("contexto enriquecido muda o hash", () => {
    const enriquecido = { ...entrada, contexto: entrada.contexto + " E detalhou o prazo de 90 dias." };
    expect(hashDaVerificacao(enriquecido)).not.toBe(hashDaVerificacao(entrada));
  });

  it("classificação material diferente muda o hash", () => {
    const outro = { ...entrada, classificacao: { ...entrada.classificacao, leitura: "desfavoravel" } };
    expect(hashDaVerificacao(outro)).not.toBe(hashDaVerificacao(entrada));
  });

  it("relevância 7,2 e 7 são o mesmo hash: ruído decimal não invalida", () => {
    const a = { ...entrada, classificacao: { ...entrada.classificacao, relevancia: 7.2 } };
    expect(hashDaVerificacao(a)).toBe(hashDaVerificacao(entrada));
  });
});

describe("versão da classificação", () => {
  const PROMPT = "Você classifica notícias...";
  const ENV = { OPENAI_MODEL_TRIAGE: "modelo-a" };

  it("mesma leitura editorial reaproveita", () => {
    const atual = assinaturaDoClassificador(PROMPT, ENV);
    const candidata = { classificacao: classificacao(), assinatura: atual };
    expect(classificacaoAindaVale(candidata, atual)).toBe(true);
  });

  it("prompt alterado invalida sozinho, sem ninguém lembrar de anunciar", () => {
    const antiga = assinaturaDoClassificador(PROMPT, ENV);
    const nova = assinaturaDoClassificador(PROMPT + "\n\nNova regra editorial.", ENV);

    expect(nova.promptHash).not.toBe(antiga.promptHash);
    expect(classificacaoAindaVale({ classificacao: classificacao(), assinatura: antiga }, nova)).toBe(false);
  });

  it("troca de modelo invalida", () => {
    const antiga = assinaturaDoClassificador(PROMPT, ENV);
    const nova = assinaturaDoClassificador(PROMPT, { OPENAI_MODEL_TRIAGE: "modelo-b" });
    expect(classificacaoAindaVale({ classificacao: classificacao(), assinatura: antiga }, nova)).toBe(false);
  });

  it("candidata antiga sem assinatura não é reaproveitada", () => {
    const atual = assinaturaDoClassificador(PROMPT, ENV);
    expect(classificacaoAindaVale({ classificacao: classificacao(), assinatura: null }, atual)).toBe(false);
  });

  it("sem classificação não há o que reaproveitar", () => {
    const atual = assinaturaDoClassificador(PROMPT, ENV);
    expect(classificacaoAindaVale({ classificacao: null, assinatura: atual }, atual)).toBe(false);
  });
});

describe("estado do canal não é estado da notícia", () => {
  it("selected e capped são recusados pelo pipeline novo", () => {
    expect(() => garantirStatusIntrinseco("selected")).toThrow(/decisão de canal/);
    expect(() => garantirStatusIntrinseco("capped")).toThrow(/decisão de canal/);
    // A mensagem diz o essencial: a pauta cortada do e-mail segue elegível.
    expect(() => garantirStatusIntrinseco("capped")).toThrow(/elegível para o Instagram/);
  });

  it("mas o banco continua aceitando os dois, por compatibilidade", () => {
    expect(garantirStatus("selected")).toBe("selected");
    expect(garantirStatus("capped")).toBe("capped");
    expect(STATUS_DE_CANDIDATA).toHaveLength(10);
    expect(STATUS_INTRINSECO).toHaveLength(8);
  });

  it("os oito intrínsecos passam", () => {
    for (const s of STATUS_INTRINSECO) expect(garantirStatusIntrinseco(s)).toBe(s);
  });

  it("candidata cortada da newsletter continua approved e elegível para o social", async () => {
    // A newsletter cortou por composição. Nada foi escrito na candidata: o
    // corte vive na composição do canal, não no estado da notícia.
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1",
        classification_status: "done", status: "approved",
        metadata_json: { verificacao: { status: "confirm", motivo: "ok", divergencias: [], verificadoEm: new Date().toISOString(), canal: "newsletter", inputHash: "h1" } } },
    ]);
    const store = criarCandidatosStore(client);
    const c = (await store.buscarPorStoryIds(PROJ, ["s1"])).get("s1")!;

    expect(c.status).toBe("approved");
    expect(podePublicar(c).pode).toBe(true);
  });

  it("selecionada na newsletter também não bloqueia o Instagram", async () => {
    const { client } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://a.com/1", story_id: "s1",
        classification_status: "done", status: "approved",
        metadata_json: { verificacao: { status: "confirm", motivo: "ok", divergencias: [], verificadoEm: new Date().toISOString(), canal: "newsletter", inputHash: "h1" } } },
    ]);
    const store = criarCandidatosStore(client);
    const c = (await store.buscarPorStoryIds(PROJ, ["s1"])).get("s1")!;

    // O reaproveitamento planejado entre canais é o objetivo, não o defeito.
    expect(podePublicar(c).pode).toBe(true);
  });
});

describe("autorização para publicar", () => {
  const verificada = (status: "confirm" | "reject" | "conflict") => ({
    status: "approved" as const,
    verificacao: { status, motivo: "m", divergencias: [], verificadoEm: new Date().toISOString(), canal: "newsletter", inputHash: "h" },
  });

  it("approved sozinho NÃO autoriza", () => {
    const r = podePublicar({ status: "approved", verificacao: null });
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/ainda não passou pela verificação/);
  });

  it("conflito não publica, e o motivo nomeia o código", () => {
    const r = podePublicar(verificada("conflict"));
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("EDITORIAL_CLASSIFICATION_CONFLICT");
  });

  it("recusa da verificação não publica", () => {
    expect(podePublicar(verificada("reject")).pode).toBe(false);
  });

  it("só confirm publica", () => {
    expect(podePublicar(verificada("confirm")).pode).toBe(true);
  });

  it("rejeitada nunca publica, mesmo com verificação confirmada", () => {
    const r = podePublicar({ ...verificada("confirm"), status: "rejected" as never });
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/status é "rejected"/);
  });
});

describe("persistência cobre a candidata rejeitada", () => {
  it("rejeitada é gravada, para a próxima execução não reclassificar", async () => {
    const { client, ops } = bancoFalso();
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [
      candidata({ status: "rejected", decisionReason: "REJECT_US_NEGATIVE" }),
    ]);

    expect(r.gravadas).toBe(1);
    const up = ops.find((o) => o.op === "upsert")!.detalhe as { n: number };
    expect(up.n).toBe(1);
  });

  it("na execução seguinte ela é reaproveitada e não reclassifica", async () => {
    const { client, ops } = bancoFalso([
      { id: "x", project_id: PROJ, url: "https://www.uscis.gov/a", story_id: "s1",
        classification_status: "done", status: "rejected", decision_reason: "REJECT_US_NEGATIVE",
        metadata_json: {} },
    ]);
    const store = criarCandidatosStore(client);

    const r = await store.gravarNovas(PROJ, [candidata({ status: "rejected" })]);

    expect(r.reaproveitadas).toBe(1);
    expect(r.jaClassificadas).toEqual(["https://www.uscis.gov/a"]);
    expect(ops.filter((o) => o.op === "upsert")).toHaveLength(0);
  });
});
