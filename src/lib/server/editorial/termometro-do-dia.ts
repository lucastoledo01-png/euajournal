import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverCapacidade, type EstadoDaCapacidade, type ProjetoComCapacidades } from "../capacidades";
import type { FontesDoCalor } from "./calor-do-dia";
import type { TermoEmAlta } from "./calor";
import type { PautaAvaliada } from "./guarda";
import {
  agruparMaterias,
  contradizEstadoAtual,
  estadosDasPautas,
  rankingDoTermometro,
  type EstadoAtual,
  type Grupo,
  type LinhaDoTermometro,
  type Materia,
} from "./termometro";

/**
 * O termômetro aplicado ao dia: de onde vêm as matérias, e o que cada modo
 * faz (28/10/2026). As fontes são as do calor (`fontesPadraoDoCalor`), com o
 * mesmo cache de processo: o ciclo que já calculou o calor não paga os vetores
 * de novo.
 *
 *   `off`      nada roda
 *   `dry_run`  calcula, escreve no log e grava o ranking; não segura nada
 *   `enforce`  também entrega o estado atual de cada pauta à guarda do post,
 *              que segura o post de etapa superada, e manda o alerta
 */

export const EVENTO_DO_TERMOMETRO = "termometro";
export const EVENTO_DO_ALERTA = "termometro_alerta";

export function modoDoTermometro(projeto?: ProjetoComCapacidades | null): EstadoDaCapacidade {
  return resolverCapacidade("termometro", () => "off", projeto);
}

export type TermometroDoDia = {
  grupos: Grupo[];
  ranking: LinhaDoTermometro[];
  estados: Map<string, EstadoAtual>;
  termos: TermoEmAlta[];
  linhas: string[];
  avisos: string[];
};

export async function termometroDoDia(
  pool: PautaAvaliada[],
  fontes: Pick<FontesDoCalor, "termosEmAlta" | "publicadasNoDia" | "vetores">,
  agoraMs = Date.now(),
): Promise<TermometroDoDia> {
  const avisos: string[] = [];
  const [termos, publicadas] = await Promise.all([
    fontes.termosEmAlta().catch((e: unknown) => (avisos.push(`tendências: ${(e as Error).message}`), [] as TermoEmAlta[])),
    fontes.publicadasNoDia(),
  ]);
  const materias: Materia[] = publicadas.filter((p) => p.titulo.trim());
  const titulosDoPool = pool.map((p) => p.grupo.primary.title);
  const vetores = await fontes.vetores([...materias.map((m) => m.titulo), ...titulosDoPool]);
  const grupos = agruparMaterias(materias, vetores.slice(0, materias.length));
  const ranking = rankingDoTermometro(grupos, { termos, agoraMs });
  const estados = estadosDasPautas(
    pool.map((p, i) => ({ storyId: p.storyId, vetor: vetores[materias.length + i] ?? null })),
    grupos,
  );
  const historias = new Set(grupos.map((g) => g.historia)).size;
  const linhas = [
    `[TERMOMETRO] ${materias.length} matéria(s) em 24h, ${grupos.length} grupo(s), ${historias} história(s), ` +
      `${ranking.filter((l) => l.alerta).length} alerta(s)`,
    ...avisos.map((a) => `[TERMOMETRO] aviso: ${a}`),
  ];
  return { grupos, ranking, estados, termos, linhas, avisos };
}

/** As pautas do pool cuja PRÓPRIA manchete de origem já está atrás do estado atual. */
export function pautasAtrasadas(pool: PautaAvaliada[], estados: Map<string, EstadoAtual>) {
  return pool
    .map((p) => ({ p, motivo: contradizEstadoAtual(p.grupo.primary.title, estados.get(p.storyId)) }))
    .filter((x): x is { p: PautaAvaliada; motivo: string } => Boolean(x.motivo))
    .map(({ p, motivo }) => ({ storyId: p.storyId, titulo: p.grupo.primary.title, motivo }));
}

/** O que vai para o banco: o topo do ranking, curto e sem vetor. */
export function registroDoTermometro(t: TermometroDoDia, maximo = 15) {
  return t.ranking.slice(0, maximo).map((l) => ({
    calor: l.calor.total,
    etapa: l.etapaAtual,
    veiculos3h: l.veiculos3h,
    veiculosAntes3h: l.veiculosAntes3h,
    titulo: l.tituloMaisNovo.slice(0, 160),
    dominio: l.dominioMaisNovo,
    superadoPor: l.superadoPor?.slice(0, 160) ?? null,
    brasilEua: l.brasilEua,
    alerta: l.alerta,
  }));
}

/** A chave de um alerta: a mesma história não alerta duas vezes no mesmo dia. */
export function chaveDoAlerta(l: LinhaDoTermometro, dia: string): string {
  const base = l.tituloMaisNovo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60);
  return `${dia}:${base}`;
}

export function textoDoAlerta(l: LinhaDoTermometro): string {
  return [
    `🔥 Assunto acelerando: "${l.tituloMaisNovo}" (${l.dominioMaisNovo})`,
    `${l.veiculos3h} veículo(s) nas últimas 3h, ${l.veiculosAntes3h} nas 3h anteriores. Calor ${l.calor.total}.`,
    l.etapaAtual ? `Etapa atual: ${l.etapaAtual}.` : "",
    l.brasilEua ? "Em alta no Brasil, com os EUA no centro." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Grava o ranking e, em `enforce`, manda os alertas novos. O alerta já
 * mandado hoje (mesma chave) não volta. Falha de gravação ou de envio vira
 * aviso: o termômetro nunca derruba quem o chamou.
 */
export async function registrarERevisarAlertas(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  t: TermometroDoDia,
  modo: EstadoDaCapacidade,
  entrada: { dia: string; enviar: (texto: string) => Promise<boolean> },
): Promise<{ gravado: boolean; alertasEnviados: number; avisos: string[] }> {
  const avisos: string[] = [];
  const ranking = registroDoTermometro(t);
  const { error } = await client.from("platform_events").insert({
    event_type: EVENTO_DO_TERMOMETRO,
    project_id: projectId,
    payload: { modo, dia: entrada.dia, ranking, avisos: t.avisos },
  });
  if (error) avisos.push(`ranking não gravado: ${error.message}`);
  if (modo !== "enforce") return { gravado: !error, alertasEnviados: 0, avisos };

  const desde = `${entrada.dia}T00:00:00Z`;
  const { data: jaMandados, error: erroDeLeitura } = await (client as SupabaseClient)
    .from("platform_events")
    .select("payload")
    .eq("event_type", EVENTO_DO_ALERTA)
    .eq("project_id", projectId)
    .gte("created_at", desde);
  if (erroDeLeitura) {
    avisos.push(`alertas de hoje ilegíveis, nenhum enviado: ${erroDeLeitura.message}`);
    return { gravado: !error, alertasEnviados: 0, avisos };
  }
  const mandadas = new Set(((jaMandados ?? []) as Array<{ payload?: { chave?: string } }>).map((l) => l.payload?.chave));

  let enviados = 0;
  for (const l of t.ranking.filter((x) => x.alerta)) {
    const chave = chaveDoAlerta(l, entrada.dia);
    if (mandadas.has(chave)) continue;
    const ok = await entrada.enviar(textoDoAlerta(l)).catch(() => false);
    await client.from("platform_events").insert({
      event_type: EVENTO_DO_ALERTA,
      project_id: projectId,
      payload: { chave, enviado: ok, titulo: l.tituloMaisNovo, calor: l.calor.total },
    });
    if (ok) enviados += 1;
  }
  return { gravado: !error, alertasEnviados: enviados, avisos };
}
