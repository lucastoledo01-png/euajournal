import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/server/projects";
import type { PacoteFactual } from "@/lib/server/editorial/pacote-factual";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import { tarefasEmMemoria } from "../tarefas-store";
import { entregarTarefaDoPost, iniciarPost, type DepsDoPost, type ResultadoDaEscrita } from "./fluxo";
import type { MaterialDoPost } from "./material";

/**
 * O laço do post com o Claude: o mesmo de `gerarPostDaPauta`, sem a OpenAI.
 * O pacote e a copy são os da `social-guard.test.ts`, que passam na guarda.
 */

const PACOTE: PacoteFactual = {
  verified_facts: [
    "O USCIS ampliou o prazo de renovação automática da permissão de trabalho de 180 para 540 dias.",
    "A mudança vale para pedidos protocolados a partir de outubro.",
    "A fila soma 1,2 milhão de pedidos.",
  ],
  people: [],
  organizations: ["USCIS"],
  places: ["Estados Unidos"],
  dates: ["outubro"],
  numbers: ["540 dias", "180 dias", "1,2 milhão de pedidos"],
  gaps: [],
  source_urls: ["https://www.uscis.gov/a"],
  texto_de_origem:
    "O USCIS informou que o prazo de renovação automática da permissão de trabalho passa de 180 para " +
    "540 dias. A mudança vale para pedidos protocolados a partir de outubro. A fila soma 1,2 milhão de pedidos.",
};

const MATERIAL: MaterialDoPost = {
  versao: 1,
  data: "2026-10-28",
  origem: { projectId: "fonte", postId: "post-antigo" },
  pauta: {
    storyId: "s1",
    titulo: "USCIS amplia prazo do EAD",
    url: "https://www.uscis.gov/a",
    fonteNome: "USCIS",
    publicadoEm: "2026-10-27T12:00:00Z",
    resumo: PACOTE.texto_de_origem ?? "",
    categoria: "politica",
    eixo: "politica",
    pais: "EUA",
    atores: ["USCIS"],
    lugares: ["Estados Unidos"],
    acontecimento: ["prorrogação"],
  },
  pacote: PACOTE,
  visual: { imageUrl: "https://exemplo.test/foto.jpg", author: "Fulano", attribution: "Foto: Fulano" },
  candidateId: "c1",
  posicao: 2,
};

const CONFIRMADA = {
  id: "c1",
  storyId: "s1",
  status: "approved",
  verificacao: { status: "confirm", motivo: "ok", divergencias: [], verificadoEm: "2026-10-27T00:00:00Z", canal: "instagram", inputHash: "h" },
} as unknown as CandidataPersistida;

const PROJETO = { id: "p-claude", slug: "teste-claude", settings: { motor: "claude_mcp" } } as unknown as Project;

const COPY_BOA = {
  headline: "USCIS amplia prazo do EAD para 540 dias",
  destaque: "540 dias",
  gancho: "O USCIS ampliou o prazo de renovação automática da permissão de trabalho de 180 para 540 dias.",
  paragrafos: ["A mudança vale para pedidos protocolados a partir de outubro.", "A fila soma 1,2 milhão de pedidos."],
  fato_principal: "",
  contexto: "",
  informacao_util: "",
  ressalva: "",
  cta: "",
  hashtags: [],
};

function deps(): DepsDoPost & { tarefas: ReturnType<typeof tarefasEmMemoria> } {
  return {
    tarefas: tarefasEmMemoria(() => new Date("2026-10-27T20:00:00Z")),
    marca: async () => ({ nome: "eua.journal", nicho: "EUA para brasileiros", extra: "VOZ DO POST", keyword: "NEWS" }),
    comInstrucoes: (_p, fn) => fn(),
    candidata: async () => CONFIRMADA,
    material: async () => ({ ok: true, material: MATERIAL }),
    env: {},
  };
}

const AUDITORIA_LIMPA = { claims: [] };
const AUDITORIA_COM_FUROS = {
  claims: [{ trecho: "a fila vai acabar", tipo: "previsao", sustentada: false, motivo: "o pacote não prevê", pauta: 0 }],
};

describe("o post do Claude", () => {
  it("abre a escrita com o mesmo pedido da esteira, e não abre duas vezes", async () => {
    const d = deps();
    const r = await iniciarPost(PROJETO, { storyId: "s1", data: "2026-10-28" }, d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const instrucao = r.tarefa.instrucao as { system: string; user: string };
    expect(instrucao.system).toContain("VOZ DO POST");
    expect(instrucao.user).toContain("PACOTE FACTUAL, e nada fora dele pode ser afirmado");
    expect(r.tarefa.esquema).toMatchObject({ type: "object" });
    expect((await iniciarPost(PROJETO, { storyId: "s1", data: "2026-10-28" }, d)).ok).toBe(true);
    expect(d.tarefas.todas).toHaveLength(1);
  });

  it("copy fora do esquema volta para a própria tarefa, com o motivo", async () => {
    const d = deps();
    const r = await iniciarPost(PROJETO, { storyId: "s1", data: "2026-10-28" }, d);
    if (!r.ok) throw new Error(r.error);
    const e = await entregarTarefaDoPost(PROJETO, { id: r.tarefa.id, resultado: { gancho: "sem manchete" }, quem: "dono:via-claude:t" }, d);
    expect(e).toMatchObject({ ok: true, desfecho: "reparar" });
    expect((await d.tarefas.porId(r.tarefa.id))?.estado).toBe("reparar");
  });

  it("escrita boa abre a auditoria; auditoria limpa deixa o post pronto para montar", async () => {
    const d = deps();
    const r = await iniciarPost(PROJETO, { storyId: "s1", data: "2026-10-28" }, d);
    if (!r.ok) throw new Error(r.error);
    const escrita = await entregarTarefaDoPost(PROJETO, { id: r.tarefa.id, resultado: COPY_BOA, quem: "dono:via-claude:t" }, d);
    expect(escrita).toMatchObject({ ok: true, desfecho: "auditar" });
    if (!escrita.ok || escrita.desfecho !== "auditar") return;

    const pedido = escrita.tarefa.instrucao as { user: string; orientacao: string };
    expect(pedido.user).toContain("Texto escrito:");
    expect(pedido.orientacao).toMatch(/conversa nova/);

    const fim = await entregarTarefaDoPost(PROJETO, { id: escrita.tarefa.id, resultado: AUDITORIA_LIMPA, quem: "dono:via-claude:t" }, d);
    expect(fim).toMatchObject({ ok: true, desfecho: "pronto", storyId: "s1" });
    const gravada = (await d.tarefas.porId(r.tarefa.id))?.resultado as ResultadoDaEscrita;
    expect(gravada.pronto?.auditoria).toBe(escrita.tarefa.id);
    // O CTA é do código, não do Claude: a mesma regra da esteira.
    expect(gravada.copy.cta).not.toBe("");
  });

  it("afirmação sem lastro volta como reparo, com o pedido de correção da esteira, e a terceira descarta", async () => {
    const d = deps();
    const r = await iniciarPost(PROJETO, { storyId: "s1", data: "2026-10-28" }, d);
    if (!r.ok) throw new Error(r.error);

    for (let rodada = 1; rodada <= 3; rodada += 1) {
      const escrita = await entregarTarefaDoPost(PROJETO, { id: r.tarefa.id, resultado: COPY_BOA, quem: "dono:via-claude:t" }, d);
      if (!escrita.ok || escrita.desfecho !== "auditar") throw new Error(`rodada ${rodada}: ${JSON.stringify(escrita)}`);
      const fim = await entregarTarefaDoPost(PROJETO, { id: escrita.tarefa.id, resultado: AUDITORIA_COM_FUROS, quem: "dono:via-claude:t" }, d);
      if (rodada < 3) {
        expect(fim).toMatchObject({ ok: true, desfecho: "reparar" });
        const user = String((await d.tarefas.porId(r.tarefa.id))?.instrucao.user);
        expect(user).toContain("O texto abaixo foi recusado.");
        expect(user).toContain("a fila vai acabar");
        // O pedido de correção não se empilha: um por vez.
        expect(user.split("O texto abaixo foi recusado.")).toHaveLength(2);
      } else {
        expect(fim).toMatchObject({ ok: true, desfecho: "descartado" });
        expect((await d.tarefas.porId(r.tarefa.id))?.estado).toBe("cancelada");
      }
    }
  });

  it("tarefa de outro projeto ou já entregue não aceita entrega", async () => {
    const d = deps();
    const r = await iniciarPost(PROJETO, { storyId: "s1", data: "2026-10-28" }, d);
    if (!r.ok) throw new Error(r.error);
    const outro = { ...PROJETO, id: "outro" } as Project;
    expect(await entregarTarefaDoPost(outro, { id: r.tarefa.id, resultado: COPY_BOA, quem: "x" }, d)).toMatchObject({ ok: false });
    await entregarTarefaDoPost(PROJETO, { id: r.tarefa.id, resultado: COPY_BOA, quem: "x" }, d);
    expect(await entregarTarefaDoPost(PROJETO, { id: r.tarefa.id, resultado: COPY_BOA, quem: "x" }, d)).toMatchObject({ ok: false });
  });
});
