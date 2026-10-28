import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O plano do dia, gravado (29/10/2026). Uma linha por projeto e data em
 * `planos_do_dia`: a etapa em que o dia está, o plano proposto pelo Claude e o
 * estado da aprovação. É o que deixa o "faça o dia" retomar de onde parou
 * quando a conversa do Claude cai.
 */

export const ETAPAS_DO_DIA = ["triagem", "plano", "aguardando_aprovacao", "preparo", "producao", "pronto"] as const;
export type EtapaDoDia = (typeof ETAPAS_DO_DIA)[number];

export type EstadoDoPlano = "rascunho" | "aguardando" | "aprovado" | "reprovado";

export type ItensDoPlano = {
  newsletter: string[];
  artigos: string[];
  posts: string[];
  reels: string[];
  /** Uma frase por item, para o dono decidir: por que esta pauta, neste canal. */
  porque: Record<string, string>;
  /** O que fotografar quando a pauta não tem pessoa nem órgão: a busca em inglês e o objeto em português. */
  cenas: Record<string, { consulta: string; objeto: string }>;
};

export const PLANO_VAZIO: ItensDoPlano = { newsletter: [], artigos: [], posts: [], reels: [], porque: {}, cenas: {} };

export type PlanoDoDia = {
  id: string;
  projectId: string;
  data: string;
  etapa: EtapaDoDia;
  estado: EstadoDoPlano;
  itens: ItensDoPlano;
  motivo: string | null;
  tarefaId: string | null;
  atualizadoEm: string;
};

export type PlanosStore = {
  /** O plano do dia; cria em `triagem` se não existe. */
  doDia(projectId: string, data: string): Promise<PlanoDoDia>;
  porId(id: string): Promise<PlanoDoDia | null>;
  atualizar(id: string, campos: Partial<Pick<PlanoDoDia, "etapa" | "estado" | "itens" | "motivo" | "tarefaId">>): Promise<PlanoDoDia>;
  /** Os planos aprovados da janela, para não repetir pauta no mesmo canal. */
  aprovadosDesde(projectId: string, desde: string): Promise<PlanoDoDia[]>;
};

type Linha = {
  id: string;
  project_id: string;
  data: string;
  etapa: EtapaDoDia;
  estado: EstadoDoPlano;
  itens: Partial<ItensDoPlano> | null;
  motivo: string | null;
  tarefa_id: string | null;
  atualizado_em: string;
};

function daLinha(l: Linha): PlanoDoDia {
  return {
    id: l.id,
    projectId: l.project_id,
    data: l.data,
    etapa: l.etapa,
    estado: l.estado,
    itens: { ...PLANO_VAZIO, ...(l.itens ?? {}) },
    motivo: l.motivo,
    tarefaId: l.tarefa_id,
    atualizadoEm: l.atualizado_em,
  };
}

export function planosSupabase(client: SupabaseClient): PlanosStore {
  const tabela = () => client.from("planos_do_dia");
  async function um(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<PlanoDoDia | null> {
    const { data, error } = await q;
    if (error) throw new Error(`planos_do_dia: ${error.message}`);
    return data ? daLinha(data as Linha) : null;
  }
  return {
    async doDia(projectId, data) {
      const { error } = await tabela().upsert({ project_id: projectId, data }, { onConflict: "project_id,data", ignoreDuplicates: true });
      if (error) throw new Error(`planos_do_dia: ${error.message}`);
      const plano = await um(tabela().select("*").eq("project_id", projectId).eq("data", data).maybeSingle());
      if (!plano) throw new Error("planos_do_dia: o plano do dia não foi criado");
      return plano;
    },
    porId: (id) => um(tabela().select("*").eq("id", id).maybeSingle()),
    async atualizar(id, campos) {
      const linha: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
      if (campos.etapa) linha.etapa = campos.etapa;
      if (campos.estado) linha.estado = campos.estado;
      if (campos.itens) linha.itens = campos.itens;
      if (campos.motivo !== undefined) linha.motivo = campos.motivo;
      if (campos.tarefaId !== undefined) linha.tarefa_id = campos.tarefaId;
      const plano = await um(tabela().update(linha).eq("id", id).select("*").single());
      if (!plano) throw new Error(`planos_do_dia: o plano ${id} não existe`);
      return plano;
    },
    async aprovadosDesde(projectId, desde) {
      const { data, error } = await tabela().select("*").eq("project_id", projectId).eq("estado", "aprovado").gte("data", desde);
      if (error) throw new Error(`planos_do_dia: ${error.message}`);
      return ((data ?? []) as Linha[]).map(daLinha);
    },
  };
}

export function planosEmMemoria(): PlanosStore & { todos: PlanoDoDia[] } {
  const todos: PlanoDoDia[] = [];
  let seq = 0;
  return {
    todos,
    async doDia(projectId, data) {
      let p = todos.find((x) => x.projectId === projectId && x.data === data);
      if (!p) {
        seq += 1;
        p = { id: `plano-${seq}`, projectId, data, etapa: "triagem", estado: "rascunho", itens: { ...PLANO_VAZIO }, motivo: null, tarefaId: null, atualizadoEm: new Date().toISOString() };
        todos.push(p);
      }
      return p;
    },
    porId: async (id) => todos.find((x) => x.id === id) ?? null,
    async atualizar(id, campos) {
      const p = todos.find((x) => x.id === id);
      if (!p) throw new Error(`plano ${id} não existe`);
      Object.assign(p, campos, { atualizadoEm: new Date().toISOString() });
      return p;
    },
    aprovadosDesde: async (projectId, desde) => todos.filter((p) => p.projectId === projectId && p.estado === "aprovado" && p.data >= desde),
  };
}
