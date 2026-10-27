import {
  resolverCapacidade,
  type EstadoDaCapacidade,
  type ProjetoComCapacidades,
} from "../capacidades";
import { ehMotorClaude } from "../mcp/motor";
import type { Ramo } from "./contrato";

/**
 * Os interruptores da fila, todos no projeto.
 *
 * O mestre é `settings.capacidades.aprovacao`, no mesmo mapa e com o mesmo
 * contrato das outras capacidades: `off`, `dry_run` ou `enforce`. Ausente vale
 * `off`, e `off` é exatamente o comportamento anterior a 05/10/2026: ninguém
 * consulta a fila, ninguém espera aprovação, o worker publica o que encontrar
 * `scheduled`. É o que permite subir este código sem mudar o dia seguinte.
 *
 * Não há variável de ambiente para isto, de propósito: a fila é decisão de
 * produto por projeto, e uma flag global ligaria a espera para todos juntos.
 *
 * Em `dry_run` a fila é registrada e a decisão é CALCULADA e escrita no log,
 * mas não segura nada: serve para ver, com o dia de verdade, o que teria sido
 * barrado antes de barrar.
 */
export function modoDaFila(projeto: ProjetoComCapacidades | null | undefined): EstadoDaCapacidade {
  return resolverCapacidade("aprovacao", () => "off", projeto);
}

export type ModoDoRamo = "manual" | "automatico";

function configDaAprovacao(projeto: ProjetoComCapacidades | null | undefined): Record<string, unknown> {
  const bruto = projeto?.settings && typeof projeto.settings === "object"
    ? (projeto.settings as Record<string, unknown>).aprovacao
    : null;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  return bruto as Record<string, unknown>;
}

/**
 * Manual ou automático, por ramo (RF-25). Ausente ou irreconhecível é manual.
 *
 * O erro de digitação cai no lado que ESPERA, e não no que publica: é a mesma
 * regra das capacidades, onde valor torto vira `off` e nunca `enforce`.
 *
 * No motor Claude via MCP (27/10/2026) é sempre manual, por decisão do dono:
 * o que o Claude Desktop entrega só vai ao ar depois de alguém aprovar no
 * painel, nem a peça sem aviso sai sozinha. Ver `mcp/motor.ts`.
 */
export function modoDoRamo(projeto: ProjetoComCapacidades | null | undefined, ramo: Ramo): ModoDoRamo {
  if (ehMotorClaude(projeto)) return "manual";
  const valor = configDaAprovacao(projeto)[ramo];
  return valor === "automatico" ? "automatico" : "manual";
}

export type HorariosDaNewsletter = {
  /** Hora local do aviso no Telegram se a newsletter ainda não foi aprovada. */
  aviso: string;
  /** Hora local do disparo quando a newsletter já está aprovada. */
  envio: string;
};

/** Do PRD: aviso às 06:00, disparo às 06:07. */
export const HORARIOS_PADRAO: HorariosDaNewsletter = { aviso: "06:00", envio: "06:07" };

function horaValida(valor: unknown): valor is string {
  return typeof valor === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

export function horariosDaNewsletter(projeto: ProjetoComCapacidades | null | undefined): HorariosDaNewsletter {
  const c = configDaAprovacao(projeto);
  return {
    aviso: horaValida(c.newsletter_aviso) ? c.newsletter_aviso : HORARIOS_PADRAO.aviso,
    envio: horaValida(c.newsletter_envio) ? c.newsletter_envio : HORARIOS_PADRAO.envio,
  };
}

/**
 * O novo `settings` com o modo de UM ramo trocado, e o resto intacto.
 *
 * `settings` é jsonb com outras chaves em uso em produção; gravar o objeto
 * inteiro a partir do que o painel mandou apagaria as outras no primeiro clique.
 * É a mesma forma das rotas de capacidades e de moldes.
 */
export function settingsComModoDoRamo(
  settings: Record<string, unknown> | null | undefined,
  ramo: Ramo,
  modo: ModoDoRamo,
): Record<string, unknown> {
  const base = { ...(settings ?? {}) };
  const atual = base.aprovacao && typeof base.aprovacao === "object" && !Array.isArray(base.aprovacao)
    ? (base.aprovacao as Record<string, unknown>)
    : {};
  base.aprovacao = { ...atual, [ramo]: modo };
  return base;
}
