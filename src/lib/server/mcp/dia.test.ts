import { describe, expect, it } from "vitest";
import type { Aprovacao } from "@/lib/server/aprovacao/contrato";
import { pecasDaFila, resumoDoDia } from "./dia";
import { tarefasEmMemoria } from "./tarefas-store";

function aprovacao(estado: Aprovacao["estado"], extra: Partial<Aprovacao> = {}): Aprovacao {
  return {
    id: `a-${estado}`,
    projectId: "p1",
    ramo: "post",
    pecaId: "x",
    hashArtefato: "h",
    publicarEm: null,
    estado,
    automatica: false,
    decididoPor: null,
    decididoEm: null,
    motivo: null,
    etapaCulpada: null,
    refazimentos: 0,
    avisos: [],
    resumo: { titulo: "Manchete" },
    avisadoEm: null,
    liberadoEm: null,
    createdAt: "2026-10-27T00:00:00Z",
    updatedAt: "2026-10-27T00:00:00Z",
    ...extra,
  };
}

describe("o resumo do dia", () => {
  it("sem a fila em enforce, avisa que nada será agendado", () => {
    const r = resumoDoDia({ data: "2026-10-28", modoDaFila: "dry_run", fila: [], tarefas: [] });
    expect(r.fila.aceitaEntregas).toBe(false);
    expect(r.proximoPasso).toMatch(/não está em enforce/);
  });

  it("correção do dono vem antes de tarefa nova", async () => {
    const store = tarefasEmMemoria();
    await store.abrir({ projectId: "p1", editionDate: "2026-10-28", tipo: "escrever_post", chave: "s1", instrucao: {}, material: {}, esquema: {} });
    const r = resumoDoDia({
      data: "2026-10-28",
      modoDaFila: "enforce",
      fila: [aprovacao("refazendo"), aprovacao("aguardando")],
      tarefas: store.todas,
    });
    expect(r.fila).toMatchObject({ aceitaEntregas: true, aguardando: 1, refazendo: 1 });
    expect(r.tarefas.escrever_post).toEqual({ aberta: 1 });
    expect(r.proximoPasso).toMatch(/reprovada/);
  });

  it("a peça da fila leva o motivo do dono e o caminho do painel", () => {
    const [p] = pecasDaFila([aprovacao("refazendo", { motivo: "logo de terceiro", etapaCulpada: "imagem" })], "teste");
    expect(p).toMatchObject({ motivo: "logo de terceiro", etapaReprovada: "imagem", titulo: "Manchete" });
    expect(p.painel).toMatch(/\/admin\/teste\/aprovacao$/);
  });
});

describe("a fila de tarefas", () => {
  it("não abre a mesma tarefa duas vezes, e serve o reparo antes da nova", async () => {
    const store = tarefasEmMemoria();
    const base = { projectId: "p1", editionDate: "2026-10-28", instrucao: {}, material: {}, esquema: {} };
    const a = await store.abrir({ ...base, tipo: "escrever_post", chave: "s1" });
    const deNovo = await store.abrir({ ...base, tipo: "escrever_post", chave: "s1" });
    expect(deNovo.id).toBe(a.id);

    const b = await store.abrir({ ...base, tipo: "escrever_post", chave: "s2" });
    await store.pedirReparo(b.id, { headline: "x" }, ["manchete curta"], "dono:via-claude:lucas");
    expect((await store.proxima("p1"))?.id).toBe(b.id);

    await store.entregar(b.id, { headline: "y" }, "dono:via-claude:lucas");
    expect((await store.proxima("p1"))?.id).toBe(a.id);
    expect((await store.proxima("p1", "auditar_post"))).toBeNull();
  });
});
