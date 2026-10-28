/**
 * O que cada projeto liga, e quem decide.
 *
 * Até aqui, todo interruptor do sistema era variável de ambiente:
 * `SOCIAL_PIPELINE_V2`, `SOCIAL_EVERGREEN_V2`, `EDITORIAL_GUARD`,
 * `VISUAL_RESOLVER_V2`, `NEWSLETTER_AUTO_SEND`, `INSTAGRAM_AUTO_POST`.
 * Variável de ambiente é global ao deploy, então ligar o social no projeto A
 * ligava no projeto B junto. Com um projeto só isso nunca doeu; com dois, é o
 * bloqueio que impede a plataforma de existir.
 *
 * Aqui a capacidade passa a morar no projeto. E mora em `projects.settings`,
 * que já é jsonb e já é lido em produção, então isto NÃO exige migration: a
 * primeira fase da plataforma multi-projeto custa zero mudança de schema.
 *
 * A forma no banco:
 *
 *   settings: { "capacidades": { "social": "enforce", "evergreen": "dry_run" } }
 *
 * ## A regra que torna isto seguro de subir
 *
 * Capacidade NÃO declarada devolve `null`, e quem chama cai na variável de
 * ambiente. Um projeto que não declara nada se comporta exatamente como antes
 * desta mudança, byte a byte. É o que permite subir o alicerce sem alterar o
 * ciclo de amanhã.
 *
 * ## E a regra que a torna segura de usar
 *
 * Valor declarado e irreconhecível vira `off`, nunca `enforce` e nunca
 * fallback. É o mesmo contrato das flags de ambiente, e pelo mesmo motivo: um
 * erro de digitação no painel não pode ligar publicação. Cair no ambiente
 * seria pior ainda, porque o operador veria um valor na tela e outro valendo.
 */

export const CAPACIDADES = [
  /** Coleta automática de notícias das fontes do projeto. */
  "coleta",
  /** Composição e disparo da newsletter. */
  "newsletter",
  /** Posts de social media a partir da notícia do dia. */
  "social",
  /** Conteúdo permanente, que preenche o dia sem notícia. */
  "evergreen",
  /** Resolvedor de imagem com licença verificada. */
  "visual",
  /** Funil de keyword. */
  "keyword",
  /** Landing page do funil. */
  "landing",
  /**
   * Os três ramos independentes: newsletter, artigo do portal e post.
   *
   * Decisão do dono em 05/10/2026: cada canal tem seleção, redação, auditor e
   * fila próprios, e nenhum herda o texto do outro. Não declarado vale `off`,
   * que é o fluxo de antes (a newsletter compõe e o portal regrava o e-mail).
   * Ver `ramos/modo.ts`.
   */
  "ramos",
  /**
   * Perfis de referência do Instagram como SINAL de pauta (RF-16, RF-17).
   *
   * Entrou em 05/10/2026. Não tem variável de ambiente por trás: não declarada
   * é `off`, então subir o código não muda o ciclo de nenhum projeto.
   */
  "perfis_referencia",
  /**
   * O acervo de imagens próprio como primeira fonte (RF-06, decisão de
   * 29/09/2026). Não declarado vale `off`. Ver `visual/acervo/modo.ts`.
   */
  "acervo",
  /**
   * Produção na véspera (05/10/2026, PRD do MVP): segunda a quinta às 17:00,
   * tudo do dia seguinte. Em `enforce` o ciclo das 06:03 deixa de produzir
   * para este projeto. Ausente ou `off`, nada muda. Ver `producao-vespera.ts`.
   */
  "producao_vespera",
  /**
   * Instrução editorial editável no painel (RF-26, 05/10/2026). Em `off` os
   * prompts usam o texto do código, byte a byte; em `enforce` a versão ativa
   * gravada em `instrucoes_editoriais`. Ver `instrucoes.ts`.
   */
  "instrucoes",
  /**
   * Fila de aprovação humana antes da publicação (05/10/2026).
   *
   * Sem fallback de ambiente: ausente vale `off`, que é publicar como antes.
   * Ver `aprovacao/modo.ts`.
   */
  "aprovacao",
  /**
   * A notícia em carrossel, no método do Not Journal (06/10/2026): decide pelo
   * pacote factual, uma foto por slide e o convite para assinar no fim. Sem
   * fallback de ambiente: ausente vale `off`, a peça única de sempre. Ver
   * `social/carrossel/modo.ts`.
   */
  "carrossel_noticia",
  /**
   * O calor da pauta (06/10/2026): quantos veículos, tendência, fama, recência
   * e número forte, somados à nota na seleção do Instagram e na abertura da
   * newsletter. Sem fallback de ambiente: ausente vale `off`, a seleção de
   * sempre. Ver `editorial/calor-do-dia.ts`.
   */
  "calor",
  /**
   * O radar de notícias (28/10/2026): a cada 15 minutos lê só os feeds das
   * fontes e grava as matérias novas como `collected`, sem modelo e sem
   * publicar nada. Existe porque o ciclo diário deixava o termômetro olhando
   * um retrato de até 24 horas. `dry_run` só conta; `enforce` grava. Ausente
   * vale `off`. Ver `newsroom/radar.ts` e `/api/cron/radar`.
   */
  "radar",
  /**
   * O termômetro de pauta (28/10/2026): agrupa as matérias do dia por
   * história, acha o capítulo mais novo e trava o post que conta uma etapa já
   * superada ("viaja" quando a história já está em "chega"). `dry_run` calcula,
   * avisa no log e grava o ranking; `enforce` também segura o post e manda o
   * alerta do assunto que acelera. Ausente vale `off`. Ver `editorial/termometro.ts`.
   */
  "termometro",
  /**
   * A notícia quente no mesmo dia (06/10/2026): um ciclo da tarde, só do
   * Instagram, que coleta de novo e preenche as vagas livres de hoje com a
   * pauta nova e quente. Sem fallback de ambiente: ausente vale `off`. Ver
   * `social/quente-da-tarde.ts` e `/api/cron/quente-da-tarde`.
   */
  "quente_da_tarde",
] as const;

export type Capacidade = (typeof CAPACIDADES)[number];

export type EstadoDaCapacidade = "off" | "dry_run" | "enforce";

/**
 * O mínimo que este módulo precisa saber de um projeto.
 *
 * Estrutural de propósito: importar o tipo `Project` criaria dependência de
 * ciclo com `projects.ts`, e este módulo é lido por resolvedores que vivem
 * abaixo dele.
 */
export type ProjetoComCapacidades = {
  settings?: Record<string, unknown> | null;
};

function normalizar(bruto: unknown): EstadoDaCapacidade | null {
  if (typeof bruto !== "string") return null;
  const t = bruto.trim().toLowerCase();
  if (t === "enforce") return "enforce";
  if (t === "dry_run") return "dry_run";
  if (t === "off") return "off";
  // Declarado e irreconhecível. Ver o comentário do topo: vira `off`.
  return "off";
}

function mapaDeCapacidades(projeto: ProjetoComCapacidades | null | undefined): Record<string, unknown> {
  const settings = projeto?.settings;
  if (!settings || typeof settings !== "object") return {};
  const bruto = (settings as Record<string, unknown>).capacidades;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  return bruto as Record<string, unknown>;
}

/**
 * O estado que o PROJETO declara, ou `null` quando ele não declara nada.
 *
 * `null` é informação, não ausência de resposta: significa "este projeto não
 * opina, pergunte ao ambiente".
 */
export function capacidadeDeclarada(
  projeto: ProjetoComCapacidades | null | undefined,
  capacidade: Capacidade,
): EstadoDaCapacidade | null {
  const mapa = mapaDeCapacidades(projeto);
  if (!(capacidade in mapa)) return null;
  return normalizar(mapa[capacidade]);
}

/** Tudo o que o projeto declara, já normalizado. Para o painel e o diagnóstico. */
export function capacidadesDeclaradas(
  projeto: ProjetoComCapacidades | null | undefined,
): Partial<Record<Capacidade, EstadoDaCapacidade>> {
  const mapa = mapaDeCapacidades(projeto);
  const saida: Partial<Record<Capacidade, EstadoDaCapacidade>> = {};
  for (const c of CAPACIDADES) {
    if (c in mapa) saida[c] = normalizar(mapa[c]) ?? "off";
  }
  return saida;
}

/**
 * A resolução completa: projeto primeiro, ambiente depois.
 *
 * É a única função que os resolvedores de modo precisam chamar. Ela existe
 * para que a ordem de precedência seja escrita UMA vez: seis resolvedores
 * repetindo a mesma condicional é seis lugares para ela divergir.
 */
export function resolverCapacidade(
  capacidade: Capacidade,
  doAmbiente: () => EstadoDaCapacidade,
  projeto?: ProjetoComCapacidades | null,
): EstadoDaCapacidade {
  const declarada = capacidadeDeclarada(projeto, capacidade);
  return declarada ?? doAmbiente();
}
