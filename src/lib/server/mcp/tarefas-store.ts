import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O trabalho de modelo que espera o Claude (27/10/2026).
 *
 * No motor `openai` a esteira chama o modelo e segue. No motor `claude_mcp`
 * ela não pode esperar: quem pensa é o Claude Desktop do usuário, que aparece
 * quando aparece. Então cada chamada de modelo vira uma TAREFA gravada, com a
 * instrução exata que a produção mandaria, o material e o esquema da resposta.
 * O Claude pega, faz e entrega; a plataforma valida com as mesmas guardas e
 * grava onde a produção grava.
 *
 * A instrução vai gravada, e não remontada na entrega, porque ela depende do
 * relógio (o prompt da copy leva o calendário da semana) e da versão editável
 * vigente: a entrega é julgada contra o que foi pedido.
 */

export const TIPOS_DE_TAREFA = [
  "classificar",
  "classificar_corpo",
  "julgar_repeticao",
  "verificar_finalistas",
  "extrair_pacote",
  "escolher_foto",
  "escrever_post",
  "auditar_post",
  "revisar_arte",
  // O texto do Reel (28/10/2026): `mcp/reels/tarefa.ts`.
  "escrever_reel",
] as const;

export type TipoDeTarefa = (typeof TIPOS_DE_TAREFA)[number];

export const ESTADOS_DA_TAREFA = ["aberta", "entregue", "reparar", "cancelada"] as const;

export type EstadoDaTarefa = (typeof ESTADOS_DA_TAREFA)[number];

export type Tarefa = {
  id: string;
  projectId: string;
  editionDate: string;
  tipo: TipoDeTarefa;
  chave: string;
  estado: EstadoDaTarefa;
  instrucao: Record<string, unknown>;
  material: Record<string, unknown>;
  esquema: Record<string, unknown>;
  resultado: unknown;
  motivos: string[];
  tentativas: number;
  criadaEm: string;
  entregueEm: string | null;
  entreguePor: string | null;
};

export type NovaTarefa = Pick<Tarefa, "projectId" | "editionDate" | "tipo" | "chave" | "instrucao" | "material" | "esquema">;

export type TarefasStore = {
  /** Abre a tarefa; se a mesma chave já existe no dia, devolve a que existe sem tocar nela. */
  abrir(nova: NovaTarefa): Promise<Tarefa>;
  porId(id: string): Promise<Tarefa | null>;
  /** A mais antiga que espera o Claude: `reparar` antes de `aberta`, porque é trabalho começado. */
  proxima(projectId: string, tipo?: TipoDeTarefa): Promise<Tarefa | null>;
  doDia(projectId: string, editionDate: string): Promise<Tarefa[]>;
  entregar(id: string, resultado: unknown, quem: string): Promise<Tarefa>;
  /**
   * Devolve a tarefa ao Claude com os motivos. A instrução nova, quando vem,
   * substitui a gravada: o reparo da copy é o mesmo pedido com a lista do que
   * corrigir no fim, como o reparo da esteira.
   */
  pedirReparo(id: string, resultado: unknown, motivos: string[], quem: string, instrucao?: Record<string, unknown>): Promise<Tarefa>;
  /** Acrescenta ao resultado de uma tarefa entregue o que a plataforma concluiu depois (a guarda passou). */
  anotar(id: string, resultado: unknown): Promise<Tarefa>;
  /** Encerra sem publicar, com o motivo: pauta que nenhuma reescrita resolve. */
  cancelar(id: string, motivos: string[]): Promise<Tarefa>;
};

export function ehTipoDeTarefa(valor: unknown): valor is TipoDeTarefa {
  return typeof valor === "string" && (TIPOS_DE_TAREFA as readonly string[]).includes(valor);
}

function ordemDeEspera(a: Tarefa, b: Tarefa): number {
  const peso = (t: Tarefa) => (t.estado === "reparar" ? 0 : 1);
  return peso(a) - peso(b) || a.criadaEm.localeCompare(b.criadaEm);
}

/** Para os testes e para o ensaio: a mesma regra, sem banco. */
export function tarefasEmMemoria(agora: () => Date = () => new Date()): TarefasStore & { todas: Tarefa[] } {
  const todas: Tarefa[] = [];
  let seq = 0;
  const achar = (id: string) => {
    const t = todas.find((x) => x.id === id);
    if (!t) throw new Error(`tarefa ${id} não existe`);
    return t;
  };
  return {
    todas,
    async abrir(nova) {
      const existente = todas.find(
        (t) => t.projectId === nova.projectId && t.editionDate === nova.editionDate && t.tipo === nova.tipo && t.chave === nova.chave,
      );
      if (existente) return existente;
      seq += 1;
      const t: Tarefa = {
        ...nova,
        id: `tarefa-${seq}`,
        estado: "aberta",
        resultado: null,
        motivos: [],
        tentativas: 0,
        criadaEm: new Date(agora().getTime() + seq).toISOString(),
        entregueEm: null,
        entreguePor: null,
      };
      todas.push(t);
      return t;
    },
    async porId(id) {
      return todas.find((t) => t.id === id) ?? null;
    },
    async proxima(projectId, tipo) {
      return (
        todas
          .filter((t) => t.projectId === projectId && (t.estado === "aberta" || t.estado === "reparar") && (!tipo || t.tipo === tipo))
          .sort(ordemDeEspera)[0] ?? null
      );
    },
    async doDia(projectId, editionDate) {
      return todas.filter((t) => t.projectId === projectId && t.editionDate === editionDate);
    },
    async entregar(id, resultado, quem) {
      const t = achar(id);
      Object.assign(t, { estado: "entregue", resultado, motivos: [], tentativas: t.tentativas + 1, entregueEm: agora().toISOString(), entreguePor: quem });
      return t;
    },
    async pedirReparo(id, resultado, motivos, quem, instrucao) {
      const t = achar(id);
      Object.assign(t, { estado: "reparar", resultado, motivos, tentativas: t.tentativas + 1, entreguePor: quem });
      if (instrucao) t.instrucao = instrucao;
      return t;
    },
    async anotar(id, resultado) {
      const t = achar(id);
      t.resultado = resultado;
      return t;
    },
    async cancelar(id, motivos) {
      const t = achar(id);
      Object.assign(t, { estado: "cancelada", motivos });
      return t;
    },
  };
}

type LinhaDaTarefa = {
  id: string;
  project_id: string;
  edition_date: string;
  tipo: TipoDeTarefa;
  chave: string;
  estado: EstadoDaTarefa;
  instrucao: Record<string, unknown> | null;
  material: Record<string, unknown> | null;
  esquema: Record<string, unknown> | null;
  resultado: unknown;
  motivos: string[] | null;
  tentativas: number;
  criada_em: string;
  entregue_em: string | null;
  entregue_por: string | null;
};

const COLUNAS =
  "id, project_id, edition_date, tipo, chave, estado, instrucao, material, esquema, resultado, motivos, tentativas, criada_em, entregue_em, entregue_por";

function daLinha(l: LinhaDaTarefa): Tarefa {
  return {
    id: l.id,
    projectId: l.project_id,
    editionDate: l.edition_date,
    tipo: l.tipo,
    chave: l.chave,
    estado: l.estado,
    instrucao: l.instrucao ?? {},
    material: l.material ?? {},
    esquema: l.esquema ?? {},
    resultado: l.resultado,
    motivos: Array.isArray(l.motivos) ? l.motivos : [],
    tentativas: l.tentativas,
    criadaEm: l.criada_em,
    entregueEm: l.entregue_em,
    entreguePor: l.entregue_por,
  };
}

export function tarefasSupabase(client: SupabaseClient): TarefasStore {
  const tabela = () => client.from("tarefas_do_claude");

  async function porId(id: string): Promise<Tarefa | null> {
    const { data, error } = await tabela().select(COLUNAS).eq("id", id).maybeSingle();
    if (error) throw new Error(`tarefas_do_claude, leitura falhou: ${error.message}`);
    return data ? daLinha(data as LinhaDaTarefa) : null;
  }

  async function atualizar(id: string, campos: Record<string, unknown>): Promise<Tarefa> {
    const { data, error } = await tabela().update(campos).eq("id", id).select(COLUNAS).single();
    if (error) throw new Error(`tarefas_do_claude, gravação falhou: ${error.message}`);
    return daLinha(data as LinhaDaTarefa);
  }

  return {
    async abrir(nova) {
      const { error } = await tabela().upsert(
        {
          project_id: nova.projectId,
          edition_date: nova.editionDate,
          tipo: nova.tipo,
          chave: nova.chave,
          instrucao: nova.instrucao,
          material: nova.material,
          esquema: nova.esquema,
        },
        { onConflict: "project_id,edition_date,tipo,chave", ignoreDuplicates: true },
      );
      if (error) throw new Error(`tarefas_do_claude, gravação falhou: ${error.message}`);
      const { data, error: erroDeLeitura } = await tabela()
        .select(COLUNAS)
        .eq("project_id", nova.projectId)
        .eq("edition_date", nova.editionDate)
        .eq("tipo", nova.tipo)
        .eq("chave", nova.chave)
        .single();
      if (erroDeLeitura) throw new Error(`tarefas_do_claude, leitura falhou: ${erroDeLeitura.message}`);
      return daLinha(data as LinhaDaTarefa);
    },
    porId,
    async proxima(projectId, tipo) {
      let consulta = tabela().select(COLUNAS).eq("project_id", projectId).in("estado", ["aberta", "reparar"]);
      if (tipo) consulta = consulta.eq("tipo", tipo);
      const { data, error } = await consulta.order("criada_em", { ascending: true }).limit(200);
      if (error) throw new Error(`tarefas_do_claude, leitura falhou: ${error.message}`);
      return ((data ?? []) as LinhaDaTarefa[]).map(daLinha).sort(ordemDeEspera)[0] ?? null;
    },
    async doDia(projectId, editionDate) {
      const { data, error } = await tabela()
        .select(COLUNAS)
        .eq("project_id", projectId)
        .eq("edition_date", editionDate)
        .order("criada_em", { ascending: true });
      if (error) throw new Error(`tarefas_do_claude, leitura falhou: ${error.message}`);
      return ((data ?? []) as LinhaDaTarefa[]).map(daLinha);
    },
    async entregar(id, resultado, quem) {
      const atual = await porId(id);
      if (!atual) throw new Error(`tarefa ${id} não existe`);
      return atualizar(id, {
        estado: "entregue",
        resultado,
        motivos: [],
        tentativas: atual.tentativas + 1,
        entregue_em: new Date().toISOString(),
        entregue_por: quem,
      });
    },
    async pedirReparo(id, resultado, motivos, quem, instrucao) {
      const atual = await porId(id);
      if (!atual) throw new Error(`tarefa ${id} não existe`);
      return atualizar(id, {
        estado: "reparar",
        resultado,
        motivos,
        tentativas: atual.tentativas + 1,
        entregue_por: quem,
        ...(instrucao ? { instrucao } : {}),
      });
    },
    async anotar(id, resultado) {
      return atualizar(id, { resultado });
    },
    async cancelar(id, motivos) {
      return atualizar(id, { estado: "cancelada", motivos });
    },
  };
}
