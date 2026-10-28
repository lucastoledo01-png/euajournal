import { z } from "zod";
import type { Project } from "@/lib/server/projects";
import { cadenciaDoProjeto } from "@/lib/server/cadencia";
import { nomesDoTitulo } from "@/lib/server/editorial/termometro";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import type { CandidatoDeReel } from "@/lib/server/social/reels/candidatos";
import type { Tarefa, TarefasStore } from "../tarefas-store";
import type { ItensDoPlano, PlanoDoDia, PlanosStore } from "./plano-store";

/**
 * O plano do dia (29/10/2026): o Claude propõe quais pautas viram newsletter,
 * matéria, post e Reel, a plataforma confere as regras que não dependem de
 * gosto, e o dono aprova no painel. Só o aprovado é produzido.
 *
 * O calor aqui é léxico, sem vetor (zero OpenAI no motor Claude): quantos
 * veículos diferentes publicaram, nas últimas 24 horas, título com dois nomes
 * próprios em comum com o da pauta. Mais grosso que o cosseno da esteira, e
 * suficiente para o Claude saber o que está todo mundo falando.
 */

export const TIPO_DO_PLANO = "propor_plano" as const;

export const ItensDoPlanoSchema = z.object({
  newsletter: z.array(z.string()).default([]),
  artigos: z.array(z.string()).default([]),
  posts: z.array(z.string()).default([]),
  reels: z.array(z.string()).default([]),
  porque: z.record(z.string(), z.string()).default({}),
  cenas: z
    .record(z.string(), z.object({ consulta: z.string().min(2), objeto: z.string().default("") }))
    .default({})
    .describe("Para cada storyId do plano: a busca em inglês de uma foto de contexto (sem pessoa identificável nem texto) e o objeto em português."),
});

const ESQUEMA = z.toJSONSchema(ItensDoPlanoSchema, { io: "input" }) as Record<string, unknown>;

export type PautaDoPlano = {
  storyId: string;
  titulo: string;
  fonte: string | null;
  publicadoEm: string | null;
  eixo: string | null;
  pais: string | null;
  relevancia: number | null;
  veiculos: number;
  resumo: string;
};

export type MaterialDoPlano = {
  data: string;
  volumes: { newsletter: { minimo: number; maximo: number }; artigos: number; instagram: number };
  pautas: PautaDoPlano[];
  reels: Array<{ id: string; fonte: string; autor: string | null; titulo: string | null; nota: number; link: string | null }>;
  jaUsadas: { newsletter: string[]; artigos: string[]; instagram: string[] };
  reprovacao?: string;
};

/** Pura: quantos veículos diferentes contam o mesmo fato, pelos nomes do título. */
export function veiculosLexicos(titulo: string, doDia: Array<{ titulo: string; dominio: string }>): number {
  const nomes = nomesDoTitulo(titulo);
  if (nomes.size === 0) return 0;
  const dominios = new Set<string>();
  for (const m of doDia) {
    const comuns = [...nomesDoTitulo(m.titulo)].filter((n) => nomes.has(n)).length;
    if (comuns >= Math.min(2, nomes.size) && m.dominio) dominios.add(m.dominio);
  }
  return dominios.size;
}

export function pautaDoPlano(c: CandidataPersistida, doDia: Array<{ titulo: string; dominio: string }>, publicadoEm: string | null): PautaDoPlano {
  return {
    storyId: c.storyId,
    titulo: c.title,
    fonte: c.sourceDomain,
    publicadoEm,
    eixo: c.classificacao?.eixo ?? null,
    pais: c.classificacao?.pais ?? null,
    relevancia: c.classificacao?.relevancia ?? null,
    veiculos: veiculosLexicos(c.title, doDia),
    resumo: (c.summary ?? "").slice(0, 400),
  };
}

export function volumesDoProjeto(projeto: Pick<Project, "settings" | "timezone">): MaterialDoPlano["volumes"] {
  const c = cadenciaDoProjeto(projeto);
  return { newsletter: c.newsletter.volume, artigos: c.portal.volume.maximo, instagram: c.instagram.volume.maximo };
}

/** Pura: as regras que não dependem de gosto. Devolve os motivos de recusa, vazio quando passa. */
export function conferirPlano(itens: ItensDoPlano, material: MaterialDoPlano): string[] {
  const motivos: string[] = [];
  const pool = new Set(material.pautas.map((p) => p.storyId));
  const reels = new Set(material.reels.map((r) => r.id));
  const v = material.volumes;

  if (itens.newsletter.length && (itens.newsletter.length < v.newsletter.minimo || itens.newsletter.length > v.newsletter.maximo)) {
    motivos.push(`a newsletter leva de ${v.newsletter.minimo} a ${v.newsletter.maximo} pautas, o plano tem ${itens.newsletter.length}`);
  }
  if (itens.artigos.length > v.artigos) motivos.push(`o portal leva até ${v.artigos} matérias, o plano tem ${itens.artigos.length}`);
  if (itens.posts.length + itens.reels.length > v.instagram) {
    motivos.push(`o Instagram leva até ${v.instagram} peças por dia (posts e Reels juntos), o plano tem ${itens.posts.length + itens.reels.length}`);
  }

  const canais: Array<[keyof Pick<ItensDoPlano, "newsletter" | "artigos" | "posts">, string[]]> = [
    ["newsletter", material.jaUsadas.newsletter],
    ["artigos", material.jaUsadas.artigos],
    ["posts", material.jaUsadas.instagram],
  ];
  for (const [canal, usadas] of canais) {
    const lista = itens[canal];
    if (new Set(lista).size !== lista.length) motivos.push(`${canal}: a mesma pauta duas vezes`);
    for (const id of lista) {
      if (!pool.has(id)) motivos.push(`${canal}: ${id} não está entre as pautas aprovadas na triagem`);
      else if (usadas.includes(id)) motivos.push(`${canal}: ${id} já saiu neste canal nos últimos 30 dias`);
    }
  }
  for (const id of itens.reels) if (!reels.has(id)) motivos.push(`reels: ${id} não está entre os vídeos sugeridos`);

  const comFoto = new Set([...itens.newsletter, ...itens.artigos, ...itens.posts]);
  for (const id of comFoto) if (!itens.cenas[id]?.consulta) motivos.push(`cenas: falta a busca da foto de contexto de ${id}`);
  for (const id of [...comFoto, ...itens.reels]) if (!itens.porque[id]) motivos.push(`porque: falta a frase de ${id}`);

  if (comFoto.size === 0 && itens.reels.length === 0) motivos.push("o plano está vazio");
  return motivos;
}

const SYSTEM = [
  "Você é o editor-chefe do eua.journal: notícias dos Estados Unidos para brasileiros que sonham em morar, trabalhar ou investir lá.",
  "Monte o plano de produção do dia a partir das pautas que a triagem aprovou e dos vídeos sugeridos para Reel.",
  "Critérios: o que está mais quente (mais veículos contando o mesmo fato), o que mais importa para o leitor, gente conhecida no centro, variedade de editorias, nada de imigração.",
  "Newsletter: as pautas mais fortes do dia, a mais forte primeiro. Matérias do portal: pautas com material para um texto completo e que alguém procuraria no Google. Posts: as mais visuais e quentes. Reels: só vídeo que conte uma notícia, sem humor.",
  "A mesma pauta pode sair em mais de um canal. O Instagram tem um teto só para posts e Reels juntos.",
  "Para cada pauta, dê em `cenas` a busca em inglês de uma foto de contexto (o lugar, o objeto ou o ambiente do assunto, sem pessoa identificável e sem texto), e em `porque` uma frase dizendo por que ela entra.",
].join("\n");

function userDoPlano(m: MaterialDoPlano): string {
  const pautas = m.pautas
    .map((p) => `- ${p.storyId} | ${p.titulo} | ${p.fonte ?? "?"} | ${p.eixo ?? "?"}/${p.pais ?? "?"} | relevância ${p.relevancia ?? "?"} | ${p.veiculos} veículo(s)\n  ${p.resumo}`)
    .join("\n");
  const reels = m.reels.map((r) => `- ${r.id} | ${r.fonte} @${r.autor ?? "?"} | nota ${r.nota} | ${r.titulo ?? ""} | ${r.link ?? ""}`).join("\n");
  return [
    `DATA: ${m.data}`,
    `VOLUMES: newsletter ${m.volumes.newsletter.minimo} a ${m.volumes.newsletter.maximo}; portal até ${m.volumes.artigos}; Instagram até ${m.volumes.instagram} (posts e Reels juntos).`,
    `PAUTAS APROVADAS NA TRIAGEM (${m.pautas.length}):\n${pautas || "(nenhuma)"}`,
    `VÍDEOS SUGERIDOS PARA REEL (${m.reels.length}):\n${reels || "(nenhum)"}`,
    m.reprovacao ? `O DONO REPROVOU O PLANO ANTERIOR. Corrija isto: ${m.reprovacao}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function abrirPlano(projeto: Project, plano: PlanoDoDia, material: MaterialDoPlano, tarefas: TarefasStore): Promise<Tarefa> {
  return tarefas.abrir({
    projectId: projeto.id,
    editionDate: plano.data,
    tipo: TIPO_DO_PLANO,
    chave: `plano-${plano.data}`,
    instrucao: { system: SYSTEM, user: userDoPlano(material), orientacao: "Responda SÓ com o JSON do esquema.", reparos: 0 },
    material: { ...material, planoId: plano.id } as unknown as Record<string, unknown>,
    esquema: ESQUEMA,
  });
}

export type DepsDoPlano = {
  tarefas: TarefasStore;
  planos: PlanosStore;
  /** Põe o plano na fila de aprovação (ramo `plano`). */
  enfileirar: (plano: PlanoDoDia) => Promise<void>;
};

export async function entregarPlano(
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDoPlano,
): Promise<{ ok: true; desfecho: "plano_na_fila"; planoId: string } | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }> {
  const material = tarefa.material as unknown as MaterialDoPlano & { planoId: string };
  const lido = ItensDoPlanoSchema.safeParse(resultado);
  const motivos = lido.success ? conferirPlano(lido.data, material) : [`a resposta não cabe no esquema do plano: ${lido.error.issues[0]?.message ?? ""}`];
  if (!lido.success || motivos.length) {
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  await deps.tarefas.entregar(tarefa.id, resultado, quem);
  const plano = await deps.planos.atualizar(material.planoId, {
    itens: lido.data,
    estado: "aguardando",
    etapa: "aguardando_aprovacao",
    motivo: null,
    tarefaId: tarefa.id,
  });
  await deps.enfileirar(plano);
  return { ok: true, desfecho: "plano_na_fila", planoId: plano.id };
}

/** A reprovação do plano no painel: a mesma tarefa volta ao Claude com o motivo. */
export async function reabrirPlano(plano: PlanoDoDia, motivo: string, deps: Pick<DepsDoPlano, "tarefas" | "planos">): Promise<Tarefa | null> {
  const tarefa = plano.tarefaId ? await deps.tarefas.porId(plano.tarefaId) : null;
  if (!tarefa) return null;
  const material = { ...(tarefa.material as unknown as MaterialDoPlano), reprovacao: motivo };
  await deps.planos.atualizar(plano.id, { estado: "reprovado", etapa: "plano", motivo });
  return deps.tarefas.pedirReparo(tarefa.id, tarefa.resultado, [`[PAINEL] ${motivo}`], "painel", {
    system: SYSTEM,
    user: userDoPlano(material),
    orientacao: "Responda SÓ com o JSON do esquema.",
  });
}

export function reelsDoPlano(lista: CandidatoDeReel[]): MaterialDoPlano["reels"] {
  return lista.map((r) => ({ id: r.id, fonte: r.fonte, autor: r.autor, titulo: r.titulo, nota: r.nota, link: r.permalink }));
}
