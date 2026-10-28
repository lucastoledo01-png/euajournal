import { describe, expect, it } from "vitest";
import { criarFilaEmMemoria } from "./fila-memoria";
import type { DepsDaFila, ProjetoDaFila } from "./fila";
import { errosRecentesDaEtapa, errosRepetidos, montarBlocoNaoRepetir } from "./memoria-de-reprovacao";
import { modoDaFila, modoDoRamo, settingsComModoDoRamo, horariosDaNewsletter } from "./modo";
import { executarAcao, visaoDaFila } from "./painel";

const projeto: ProjetoDaFila = { id: "proj-1", timezone: "America/Sao_Paulo", settings: { capacidades: { aprovacao: "enforce" } } };

function deps(): DepsDaFila {
  return {
    store: criarFilaEmMemoria(),
    pecas: {
      ler: async () => null,
      gravarTexto: async () => ({ hashNovo: "" }),
      despachar: async () => ({ ok: true, detalhe: "" }),
      retirar: async () => undefined,
    },
  };
}

describe("o painel recusa o pedido malformado com a frase certa", () => {
  it("ação desconhecida", async () => {
    const r = await executarAcao(projeto, { acao: "publicar" }, "dono", deps());
    expect(r.status).toBe(400);
    expect(String(r.corpo.error)).toMatch(/ação desconhecida/);
  });

  it("reprovar sem etapa", async () => {
    const r = await executarAcao(projeto, { acao: "reprovar", id: "x", motivo: "y" }, "dono", deps());
    expect(r.status).toBe(400);
    expect(String(r.corpo.error)).toMatch(/etapa culpada/);
  });

  it("reprovar responde na hora com a refação agendada, e leva a pauta apontada (06/10/2026)", async () => {
    const d = deps();
    d.ganchos = { newsletter: { selecao: async () => ({ ok: true }) } };
    const a = await d.store.inserir({ projectId: "proj-1", ramo: "newsletter", pecaId: "ed", hashArtefato: "h", publicarEm: null, avisos: [], resumo: {} });
    const r = await executarAcao(projeto, { acao: "reprovar", id: a.id, etapa: "selecao", motivo: "pauta fraca", alvo: "s2" }, "dono", d);
    expect(r.corpo).toMatchObject({ ok: true, desfecho: "refacao_agendada" });
    expect((await d.store.porId(a.id))?.resumo.refacao).toMatchObject({ estado: "na_fila", etapa: "selecao", alvo: "s2", tentativa: 1 });
  });

  it("lote com ramo inventado", async () => {
    const r = await executarAcao(projeto, { acao: "lote", ramo: "reels" }, "dono", deps());
    expect(r.status).toBe(400);
  });

  it("aprovar o que não existe", async () => {
    const r = await executarAcao(projeto, { acao: "aprovar", id: "nao-existe" }, "dono", deps());
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });

  it("a visão vazia vem com os modos e a taxa", async () => {
    const v = await visaoDaFila(projeto, deps());
    expect(v.modo).toBe("enforce");
    expect(v.ramos).toEqual({ newsletter: "manual", artigo: "manual", post: "manual", plano: "manual" });
    expect(v.fila).toEqual([]);
    expect(v.taxa.every((t) => t.taxa === null)).toBe(true);
  });
});

describe("os interruptores", () => {
  it("a fila é off sem declaração, e valor torto vira off", () => {
    expect(modoDaFila({ settings: {} })).toBe("off");
    expect(modoDaFila(null)).toBe("off");
    expect(modoDaFila({ settings: { capacidades: { aprovacao: "ligado" } } })).toBe("off");
    expect(modoDaFila({ settings: { capacidades: { aprovacao: "enforce" } } })).toBe("enforce");
  });

  it("trocar o modo de um ramo não apaga o resto do settings", () => {
    const antes = { capacidades: { evergreen: "off" }, final_line: "Até amanhã.", aprovacao: { post: "manual" } };
    const depois = settingsComModoDoRamo(antes, "newsletter", "automatico");
    expect(depois.capacidades).toEqual({ evergreen: "off" });
    expect(depois.final_line).toBe("Até amanhã.");
    expect(modoDoRamo({ settings: depois }, "newsletter")).toBe("automatico");
    expect(modoDoRamo({ settings: depois }, "post")).toBe("manual");
  });

  it("horário torto cai no padrão do PRD", () => {
    expect(horariosDaNewsletter({ settings: { aprovacao: { newsletter_envio: "6h07" } } })).toEqual({
      aviso: "06:00",
      envio: "06:07",
    });
    expect(horariosDaNewsletter({ settings: { aprovacao: { newsletter_envio: "07:15" } } }).envio).toBe("07:15");
  });
});

describe("a memória de reprovação", () => {
  it("sem nada a dizer, o bloco é vazio: instrução sem conteúdo não entra no prompt", () => {
    expect(montarBlocoNaoRepetir("texto", [])).toBe("");
  });

  it("o bloco cita o motivo e o trecho reprovado", () => {
    const b = montarBlocoNaoRepetir("imagem", [{ motivo: "skyline genérico", textoReprovado: "Post sobre robotáxi" }]);
    expect(b).toMatch(/NÃO REPETIR/);
    expect(b).toMatch(/Imagem/);
    expect(b).toMatch(/skyline genérico/);
    expect(b).toMatch(/robotáxi/);
  });

  it("memória ilegível devolve vazio em vez de derrubar o redator", async () => {
    const quebrado = {
      ...criarFilaEmMemoria(),
      reprovacoesDaEtapa: async () => {
        throw new Error("Gateway Timeout");
      },
    };
    expect(await errosRecentesDaEtapa("proj-1", "post", "texto", 5, quebrado)).toBe("");
  });

  it("agrupa por sentido e não por igualdade de texto", () => {
    const r = errosRepetidos([
      { motivo: "Manchete com sigla em inglês", createdAt: "2026-10-01" },
      { motivo: "sigla em inglês na manchete", createdAt: "2026-10-02" },
      { motivo: "número sem fonte", createdAt: "2026-10-03" },
      { motivo: "a manchete tem sigla em inglês", createdAt: "2026-10-04" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].ocorrencias).toBe(3);
    expect(r[0].regra).toMatch(/^Não repetir: Manchete com sigla em inglês/);
  });

  it("duas vezes não é padrão", () => {
    expect(
      errosRepetidos([
        { motivo: "sigla em inglês", createdAt: "1" },
        { motivo: "sigla em inglês", createdAt: "2" },
      ]),
    ).toHaveLength(0);
  });
});
