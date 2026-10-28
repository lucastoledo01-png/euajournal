import type { SupabaseClient } from "@supabase/supabase-js";
import type { Corte } from "./corte";
import type { FonteDoReel } from "./gravar";

/**
 * Os candidatos a Reel e o caminho de cada um (28/10/2026):
 *
 *   nova ─► escolhida ─► (worker prepara: baixa, mede o corte, abre a tarefa)
 *                │
 *                └► escolhida com texto ─► renderizando ─► pronta (linha na fila)
 *
 * A fila do worker é lida pelo estado mais os campos: `escolhida` sem preparo
 * é preparo a fazer; `escolhida` com texto é render a fazer. A reivindicação é
 * condicional (`estado = escolhida`), então dois giros nunca pegam o mesmo.
 * `descartada` e `falhou` são o fim, com o motivo.
 */

export type EstadoDoCandidato = "nova" | "escolhida" | "renderizando" | "pronta" | "descartada" | "falhou";

export type PreparoDoReel = {
  /** O vídeo de origem já cortado no tempo, no bucket `reels`. */
  videoUrl: string;
  videoPath: string;
  folhaUrl: string | null;
  original: { largura: number; altura: number; segundos: number };
  corte: { a: Corte | null; b: Corte | null };
  tarefaId: string | null;
  /** A folha do Reel pronto, depois do render: é o que o Claude vê em `ver_reel`. */
  folhaFinalUrl?: string | null;
};

export type TextoDoReel = {
  molde: "a" | "b";
  rotulo: string;
  linhas: string[];
  destaque: number;
  categoria: string;
  manchete: string;
  legenda: string;
  corte: Corte | null;
  tarefaId: string;
};

export type CandidatoDeReel = {
  id: string;
  projectId: string;
  fonte: FonteDoReel;
  origemId: string;
  permalink: string | null;
  urlVideo: string | null;
  autor: string | null;
  titulo: string | null;
  legenda: string | null;
  publicadoEm: string | null;
  metricas: Record<string, unknown>;
  nota: number;
  estado: EstadoDoCandidato;
  motivo: string | null;
  preparo: PreparoDoReel | null;
  texto: TextoDoReel | null;
  socialPostId: string | null;
  criadaEm: string;
  atualizadaEm: string;
};

export type CandidatosDeReel = {
  porId(id: string): Promise<CandidatoDeReel | null>;
  sugeridos(projectId: string, limite: number): Promise<CandidatoDeReel[]>;
  /** Marca `escolhida` só se estava `nova`; devolve se conseguiu. */
  escolher(id: string): Promise<boolean>;
  /** O que falhou volta a `escolhida`, com o preparo e o texto que já tinha: o worker tenta de novo. */
  tentarDeNovo(id: string): Promise<boolean>;
  filaDePreparo(limite: number): Promise<CandidatoDeReel[]>;
  filaDeRender(limite: number): Promise<CandidatoDeReel[]>;
  /** `escolhida` para `renderizando`, só se ninguém pegou antes. */
  reivindicar(id: string): Promise<boolean>;
  /** Volta para `escolhida` com o preparo feito. */
  preparado(id: string, preparo: PreparoDoReel): Promise<void>;
  salvarTexto(id: string, texto: TextoDoReel | null): Promise<void>;
  pronta(id: string, socialPostId: string, preparo: PreparoDoReel): Promise<void>;
  /** Volta o candidato pronto a `escolhida` sem texto: a reprovação do Reel pede outro. */
  reabrir(id: string, motivo: string): Promise<void>;
  encerrar(id: string, estado: "descartada" | "falhou", motivo: string): Promise<void>;
  /** Devolve a `escolhida` o que ficou em `renderizando` além do prazo (processo que morreu). */
  recuperarPresos(minutos: number): Promise<number>;
};

type Linha = {
  id: string;
  project_id: string;
  fonte: FonteDoReel;
  origem_id: string;
  permalink: string | null;
  url_video: string | null;
  autor: string | null;
  titulo: string | null;
  legenda: string | null;
  publicado_em: string | null;
  metricas: Record<string, unknown> | null;
  nota: number | string;
  estado: EstadoDoCandidato;
  motivo: string | null;
  preparo: PreparoDoReel | null;
  texto: TextoDoReel | null;
  social_post_id: string | null;
  criada_em: string;
  atualizada_em: string;
};

function daLinha(l: Linha): CandidatoDeReel {
  return {
    id: l.id,
    projectId: l.project_id,
    fonte: l.fonte,
    origemId: l.origem_id,
    permalink: l.permalink,
    urlVideo: l.url_video,
    autor: l.autor,
    titulo: l.titulo,
    legenda: l.legenda,
    publicadoEm: l.publicado_em,
    metricas: l.metricas ?? {},
    nota: Number(l.nota),
    estado: l.estado,
    motivo: l.motivo,
    preparo: l.preparo,
    texto: l.texto,
    socialPostId: l.social_post_id,
    criadaEm: l.criada_em,
    atualizadaEm: l.atualizada_em,
  };
}

export function candidatosSupabase(client: SupabaseClient): CandidatosDeReel {
  const tabela = () => client.from("reels_candidatos");
  const agora = () => new Date().toISOString();

  async function lista(consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<CandidatoDeReel[]> {
    const { data, error } = await consulta;
    if (error) throw new Error(`reels_candidatos, leitura falhou: ${error.message}`);
    return ((data ?? []) as Linha[]).map(daLinha);
  }

  async function mudar(id: string, campos: Record<string, unknown>, deEstado?: EstadoDoCandidato): Promise<boolean> {
    let q = tabela().update({ ...campos, atualizada_em: agora() }).eq("id", id);
    if (deEstado) q = q.eq("estado", deEstado);
    const { data, error } = await q.select("id");
    if (error) throw new Error(`reels_candidatos, gravação falhou: ${error.message}`);
    return (data ?? []).length > 0;
  }

  return {
    async porId(id) {
      const { data, error } = await tabela().select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`reels_candidatos, leitura falhou: ${error.message}`);
      return data ? daLinha(data as Linha) : null;
    },
    sugeridos: (projectId, limite) =>
      lista(tabela().select("*").eq("project_id", projectId).eq("estado", "nova").order("nota", { ascending: false }).limit(limite)),
    escolher: (id) => mudar(id, { estado: "escolhida", motivo: null }, "nova"),
    tentarDeNovo: (id) => mudar(id, { estado: "escolhida", motivo: null }, "falhou"),
    filaDePreparo: (limite) =>
      lista(tabela().select("*").eq("estado", "escolhida").is("preparo", null).order("atualizada_em").limit(limite)),
    filaDeRender: (limite) =>
      lista(tabela().select("*").eq("estado", "escolhida").not("texto", "is", null).order("atualizada_em").limit(limite)),
    reivindicar: (id) => mudar(id, { estado: "renderizando" }, "escolhida"),
    async preparado(id, preparo) {
      await mudar(id, { estado: "escolhida", preparo, motivo: null });
    },
    async salvarTexto(id, texto) {
      await mudar(id, { texto });
    },
    async pronta(id, socialPostId, preparo) {
      await mudar(id, { estado: "pronta", social_post_id: socialPostId, preparo, motivo: null });
    },
    async reabrir(id, motivo) {
      await mudar(id, { estado: "escolhida", texto: null, motivo });
    },
    async encerrar(id, estado, motivo) {
      await mudar(id, { estado, motivo: motivo.slice(0, 2000) });
    },
    async recuperarPresos(minutos) {
      const limite = new Date(Date.now() - minutos * 60_000).toISOString();
      const { data, error } = await tabela()
        .update({ estado: "escolhida", atualizada_em: agora() })
        .eq("estado", "renderizando")
        .lt("atualizada_em", limite)
        .select("id");
      if (error) throw new Error(`reels_candidatos, recuperação falhou: ${error.message}`);
      return (data ?? []).length;
    },
  };
}

/** Para os testes: a mesma regra de estados, sem banco. */
export function candidatosEmMemoria(iniciais: CandidatoDeReel[] = []): CandidatosDeReel & { todos: CandidatoDeReel[] } {
  const todos = [...iniciais];
  const achar = (id: string) => todos.find((c) => c.id === id) ?? null;
  const mudar = (id: string, campos: Partial<CandidatoDeReel>, de?: EstadoDoCandidato) => {
    const c = achar(id);
    if (!c || (de && c.estado !== de)) return false;
    Object.assign(c, campos, { atualizadaEm: new Date().toISOString() });
    return true;
  };
  return {
    todos,
    porId: async (id) => achar(id),
    sugeridos: async (projectId, limite) =>
      todos.filter((c) => c.projectId === projectId && c.estado === "nova").sort((a, b) => b.nota - a.nota).slice(0, limite),
    escolher: async (id) => mudar(id, { estado: "escolhida", motivo: null }, "nova"),
    tentarDeNovo: async (id) => mudar(id, { estado: "escolhida", motivo: null }, "falhou"),
    filaDePreparo: async (limite) => todos.filter((c) => c.estado === "escolhida" && !c.preparo).slice(0, limite),
    filaDeRender: async (limite) => todos.filter((c) => c.estado === "escolhida" && c.texto).slice(0, limite),
    reivindicar: async (id) => mudar(id, { estado: "renderizando" }, "escolhida"),
    preparado: async (id, preparo) => void mudar(id, { estado: "escolhida", preparo, motivo: null }),
    salvarTexto: async (id, texto) => void mudar(id, { texto }),
    pronta: async (id, socialPostId, preparo) => void mudar(id, { estado: "pronta", socialPostId, preparo, motivo: null }),
    reabrir: async (id, motivo) => void mudar(id, { estado: "escolhida", texto: null, motivo }),
    encerrar: async (id, estado, motivo) => void mudar(id, { estado, motivo }),
    recuperarPresos: async () => 0,
  };
}
