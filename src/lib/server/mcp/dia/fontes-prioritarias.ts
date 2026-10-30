import type { Project } from "@/lib/server/projects";

/**
 * As fontes que o dono quer na frente (29/10/2026): "Not Journal como
 * prioridade, no que tiver a ver com os EUA". Uma lista de domínios em
 * `settings.fontes_prioritarias`, à parte da `priority` 1/2 de
 * `project_news_sources`, que já vale para quase toda fonte ativa e por isso
 * não destaca nenhuma.
 *
 * Prioridade não fura a linha: a matéria da fonte prioritária entra na
 * triagem antes do corte, mas passa pela mesma classificação, e o que não é
 * dos EUA continua recusado. No plano, ela chega marcada, para o Claude
 * preferi-la quando o valor empata.
 */

function dominioLimpo(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

export function fontesPrioritarias(projeto: Pick<Project, "settings">): string[] {
  const bruto = (projeto.settings as Record<string, unknown> | null | undefined)?.fontes_prioritarias;
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((d): d is string => typeof d === "string" && d.trim().length > 0).map(dominioLimpo);
}

/** O domínio é de uma fonte prioritária, subdomínio incluso. */
export function ehPrioritaria(dominio: string | null | undefined, lista: string[]): boolean {
  if (!dominio || lista.length === 0) return false;
  const d = dominioLimpo(dominio);
  return lista.some((p) => d === p || d.endsWith(`.${p}`));
}
