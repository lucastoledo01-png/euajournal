import { z } from "zod";
import type { PacoteFactual } from "@/lib/server/editorial/pacote-factual";
import { validarAncoragem } from "@/lib/server/editorial/pacote-factual";
import { REGRA_DO_DOLAR } from "@/lib/server/editorial/dolar-em-portugues";
import { limparVicios } from "@/lib/server/newsroom/anti-vicios";
import { conferirFormaDaLegenda } from "@/lib/server/social/forma-da-legenda";
import { maximoDeReparos } from "@/lib/server/social/gerador";
import type { CandidatoDeReel, CandidatosDeReel, PreparoDoReel, TextoDoReel } from "@/lib/server/social/reels/candidatos";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * A escrita do Reel pelo Claude (28/10/2026).
 *
 * O Reel não tem pauta nem pacote factual da esteira: o material é o próprio
 * vídeo (título, legenda e autor de quem publicou), a história do termômetro
 * com que ele casou, e a folha de quadros com o corte proposto. A âncora é
 * esse material: número e nome que não estão nele não entram (`validarAncoragem`,
 * a mesma conferência do post).
 *
 * O laço é o do post: entrega, guardas, reparo até o teto de
 * `maximoDeReparos`, e depois descarte. Aceita a escrita, o texto vai para o
 * candidato e o worker renderiza. A reprovação no painel reabre esta tarefa
 * com o motivo (`reabrirEscritaDoReel`).
 */

export const TIPO_DA_ESCRITA_DO_REEL = "escrever_reel" as const;

const CorteSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  largura: z.number().int().min(32),
  altura: z.number().int().min(32),
});

export const TextoDoReelSchema = z.object({
  molde: z.enum(["a", "b"]).describe("a: o vídeo na moldura do template; b: tela cheia com caixas brancas."),
  rotulo: z.string().min(1).max(24).describe("Molde A: a palavra da faixa vermelha, em caixa alta (ex.: TARIFAS)."),
  categoria: z.string().min(1).max(16).describe("Molde B: a editoria da etiqueta (ex.: ECONOMIA)."),
  linhas: z.array(z.string().min(1).max(30)).min(2).max(3).describe("A manchete em 2 ou 3 linhas curtas, em caixa alta no molde A."),
  destaque: z.number().int().min(0).max(2).default(1).describe("Qual linha sai em vermelho no molde A (0, 1 ou 2)."),
  legenda: z.object({
    gancho: z.string().min(1).describe("O lide: ator, verbo, fato e quando, em uma ou duas frases."),
    paragrafos: z.array(z.string().min(1)).max(4).default([]),
  }),
  corte: CorteSchema.nullable().optional().describe("Só se quiser trocar o corte proposto: em pixels do vídeo original."),
});

export type TextoEntregue = z.infer<typeof TextoDoReelSchema>;

export const ESQUEMA_DO_REEL = z.toJSONSchema(TextoDoReelSchema, { io: "input" }) as Record<string, unknown>;

export type MaterialDoReel = {
  candidatoId: string;
  fonte: string;
  autor: string | null;
  permalink: string | null;
  titulo: string;
  legendaDeOrigem: string;
  historia: string | null;
  metricas: Record<string, unknown>;
  folhaUrl: string | null;
  original: PreparoDoReel["original"];
  corteProposto: PreparoDoReel["corte"];
  /** Da reprovação no painel, quando é uma reescrita. */
  reprovacao?: string;
};

export type DepsDaEscritaDoReel = {
  tarefas: TarefasStore;
  candidatos: CandidatosDeReel;
  env?: Record<string, string | undefined>;
};

const SYSTEM = [
  "Você escreve o texto de um Reel do eua.journal, publicação sobre os Estados Unidos para brasileiros.",
  "O vídeo é de outro perfil e vai ser recortado e posto no molde da marca; você escreve o que vai por cima dele e a legenda.",
  "Regras: português do Brasil, registro de jornal, zero emoji, zero hashtag, zero link, zero travessão.",
  "Só afirme o que o material diz: nome, número, data e lugar que não estão no material não entram.",
  "Linhas da manchete: curtas (até 30 caracteres cada), a do meio é a que muda tudo, sem ponto final.",
  "Legenda: o gancho é o lide (quem fez o quê, e quando); depois até 4 parágrafos curtos com o que o material sustenta. Não repita a manchete palavra por palavra.",
  "Molde A quando o vídeo é horizontal ou a cena pede a moldura; molde B quando o vídeo é vertical e forte sozinho.",
  REGRA_DO_DOLAR,
].join("\n");

function userDoReel(m: MaterialDoReel): string {
  return [
    `VÍDEO (${m.fonte}, de ${m.autor ?? "autor desconhecido"}): ${m.permalink ?? ""}`,
    `TÍTULO DE ORIGEM: ${m.titulo}`,
    `LEGENDA DE ORIGEM:\n${m.legendaDeOrigem || "(vazia)"}`,
    m.historia ? `A HISTÓRIA DO DIA COM QUE ELE CASOU (termômetro): ${m.historia}` : "",
    `VÍDEO ORIGINAL: ${m.original.largura}x${m.original.altura}, ${Math.round(m.original.segundos)} s.`,
    `CORTE PROPOSTO (tira logotipo e legenda gravada de quem publicou): molde A ${JSON.stringify(m.corteProposto.a)}, molde B ${JSON.stringify(m.corteProposto.b)}.`,
    m.folhaUrl ? `A folha de quadros com o corte desenhado em amarelo está em ver_reel(${m.candidatoId}).` : "",
    m.reprovacao ? `\nO DONO REPROVOU A VERSÃO ANTERIOR NO PAINEL. Corrija isto: ${m.reprovacao}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function materialDoCandidato(c: CandidatoDeReel, preparo: PreparoDoReel): MaterialDoReel {
  return {
    candidatoId: c.id,
    fonte: c.fonte,
    autor: c.autor,
    permalink: c.permalink,
    titulo: c.titulo ?? "",
    legendaDeOrigem: (c.legenda ?? "").slice(0, 3000),
    historia: typeof c.metricas.historia === "string" ? c.metricas.historia : null,
    metricas: c.metricas,
    folhaUrl: preparo.folhaUrl,
    original: preparo.original,
    corteProposto: preparo.corte,
  };
}

/** O material vira o pacote da ancoragem: o texto de origem é tudo o que o vídeo diz. */
export function pacoteDoMaterial(m: MaterialDoReel): PacoteFactual {
  return {
    verified_facts: [],
    people: m.autor ? [m.autor] : [],
    organizations: ["eua.journal"],
    places: [],
    dates: [],
    numbers: [],
    gaps: [],
    source_urls: m.permalink ? [m.permalink] : [],
    texto_de_origem: [m.titulo, m.legendaDeOrigem, m.historia ?? ""].join("\n"),
  };
}

export async function abrirEscritaDoReel(
  projectId: string,
  data: string,
  material: MaterialDoReel,
  tarefas: TarefasStore,
): Promise<Tarefa> {
  return tarefas.abrir({
    projectId,
    editionDate: data,
    tipo: TIPO_DA_ESCRITA_DO_REEL,
    chave: material.candidatoId,
    instrucao: { system: SYSTEM, user: userDoReel(material), orientacao: "Responda SÓ com o JSON do esquema." },
    material: material as unknown as Record<string, unknown>,
    esquema: ESQUEMA_DO_REEL,
  });
}

/** Pura: as guardas do texto. Devolve o texto pronto ou os motivos do reparo. */
export function conferirTextoDoReel(
  bruto: unknown,
  material: MaterialDoReel,
): { ok: true; texto: Omit<TextoDoReel, "tarefaId"> } | { ok: false; motivos: string[] } {
  const lido = TextoDoReelSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, motivos: [`a resposta não cabe no esquema: ${lido.error.message.slice(0, 500)}`] };
  const t = limparVicios(lido.data);

  const manchete = t.linhas.join(" ").replace(/\s+/g, " ").trim();
  const corpo = [t.legenda.gancho, ...t.legenda.paragrafos].map((p) => p.trim()).filter(Boolean).join("\n\n");
  const motivos: string[] = [];

  if (/[—–]/.test(`${manchete} ${corpo} ${t.rotulo} ${t.categoria}`)) motivos.push("[TRAVESSAO] travessão não entra; use vírgula, dois-pontos ou frase nova");
  if (t.destaque >= t.linhas.length) motivos.push(`[DESTAQUE] a linha ${t.destaque} não existe`);

  const ancoragem = validarAncoragem(`${manchete}\n${corpo}`, pacoteDoMaterial(material));
  for (const c of ancoragem.naoSustentadas.filter((x) => x.severidade === "bloqueio")) {
    motivos.push(`[SEM_LASTRO] "${c.valor}" (${c.onde}) não está no material do vídeo`);
  }
  for (const p of conferirFormaDaLegenda(corpo, manchete)) motivos.push(`[LEGENDA] ${p.detalhe}`);

  if (t.corte) {
    const o = material.original;
    if (t.corte.x + t.corte.largura > o.largura || t.corte.y + t.corte.altura > o.altura) {
      motivos.push(`[CORTE] o corte passa do vídeo (${o.largura}x${o.altura})`);
    }
  }
  if (motivos.length) return { ok: false, motivos };

  return {
    ok: true,
    texto: {
      molde: t.molde,
      rotulo: t.rotulo.toUpperCase(),
      linhas: t.linhas,
      destaque: t.destaque,
      categoria: t.categoria.toUpperCase(),
      manchete,
      legenda: corpo,
      corte: t.corte ?? material.corteProposto[t.molde],
    },
  };
}

export type DesfechoDoReel =
  | { ok: true; desfecho: "pronto"; candidatoId: string; aviso: string }
  | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }
  | { ok: true; desfecho: "descartado"; candidatoId: string; motivos: string[] };

export async function entregarEscritaDoReel(
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDaEscritaDoReel,
): Promise<DesfechoDoReel> {
  const material = tarefa.material as unknown as MaterialDoReel;
  const conferido = conferirTextoDoReel(resultado, material);
  if (conferido.ok) {
    await deps.tarefas.entregar(tarefa.id, resultado, quem);
    await deps.candidatos.salvarTexto(material.candidatoId, { ...conferido.texto, tarefaId: tarefa.id });
    return {
      ok: true,
      desfecho: "pronto",
      candidatoId: material.candidatoId,
      aviso: "Texto aceito. O worker renderiza o Reel em alguns minutos e o põe na fila; acompanhe com ver_reel.",
    };
  }

  /*
   * O teto conta as entregas recusadas DESTA rodada, guardado na instrução: a
   * reprovação no painel zera, e `tentativas` (que conta tudo, desde a primeira
   * versão) descartaria a reescrita na primeira recusa.
   */
  const reparos = Number((tarefa.instrucao as { reparos?: unknown }).reparos ?? 0);
  if (reparos < maximoDeReparos(deps.env ?? process.env)) {
    const pedido = await deps.tarefas.pedirReparo(tarefa.id, resultado, conferido.motivos, quem, {
      ...tarefa.instrucao,
      reparos: reparos + 1,
    });
    return { ok: true, desfecho: "reparar", tarefa: pedido, motivos: conferido.motivos };
  }
  await deps.tarefas.cancelar(tarefa.id, conferido.motivos);
  await deps.candidatos.encerrar(material.candidatoId, "descartada", `texto recusado depois dos reparos: ${conferido.motivos.join("; ")}`);
  return { ok: true, desfecho: "descartado", candidatoId: material.candidatoId, motivos: conferido.motivos };
}

/**
 * A reprovação do Reel no painel volta para o Claude (fase 4): a mesma tarefa
 * reaberta em `reparar`, com o motivo do dono no pedido. A terceira reprovação
 * descarta, pela regra da fila.
 */
export async function reabrirEscritaDoReel(
  candidato: CandidatoDeReel,
  motivo: string,
  deps: Pick<DepsDaEscritaDoReel, "tarefas" | "candidatos">,
): Promise<Tarefa | null> {
  const tarefaId = candidato.texto?.tarefaId;
  const tarefa = tarefaId ? await deps.tarefas.porId(tarefaId) : null;
  if (!tarefa || !candidato.preparo) return null;
  const material: MaterialDoReel = { ...materialDoCandidato(candidato, candidato.preparo), reprovacao: motivo };
  await deps.candidatos.reabrir(candidato.id, `reprovado no painel: ${motivo}`);
  return deps.tarefas.pedirReparo(tarefa.id, tarefa.resultado, [`[PAINEL] ${motivo}`], "painel", {
    system: SYSTEM,
    user: userDoReel(material),
    orientacao: "Responda SÓ com o JSON do esquema.",
    reparos: 0,
  });
}
