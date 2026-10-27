/**
 * O projeto como o painel o enxerga.
 *
 * É a forma exata que `/api/admin/projetos` devolve, e mora aqui porque três
 * telas precisam dela: a home, que desenha os cards, a área do projeto, que
 * resolve o slug da URL, e o bloco de capacidades.
 */

export const ESTADOS_DE_CAPACIDADE = ["off", "dry_run", "enforce"] as const;
export type EstadoDeCapacidade = (typeof ESTADOS_DE_CAPACIDADE)[number];

export type ProjetoDoPainel = {
  id: string;
  slug: string;
  nome: string;
  status: string;
  nicho: string;
  timezone: string;
  siteUrl: string | null;
  marca: { nome: string; cor: string; logoUrl: string | null };
  /** Só o que o projeto declara. Ausente quer dizer "herda do servidor". */
  capacidades: Partial<Record<string, EstadoDeCapacidade>>;
  /** Só o que o projeto declara. Molde ausente está ligado. */
  moldes: Partial<Record<string, boolean>>;
  /** Quem faz o trabalho de modelo. Ver `lib/server/mcp/motor.ts`. */
  motor: MotorDoProjeto;
};

/** Espelho de `MOTORES` em `lib/server/mcp/motor.ts`, para o cliente não importar código de servidor. */
export type MotorDoProjeto = "openai" | "claude_mcp";

export const ROTULO_DO_MOTOR: Record<MotorDoProjeto, string> = {
  openai: "Motor: OpenAI (automático)",
  claude_mcp: "Motor: Claude via MCP",
};

export type RespostaDeProjetos = {
  ok: boolean;
  error?: string;
  capacidades?: string[];
  moldesDoFeed?: string[];
  projetos?: ProjetoDoPainel[];
};

export const ROTULO_DA_CAPACIDADE: Record<string, string> = {
  coleta: "Coleta de notícias",
  newsletter: "Newsletter",
  social: "Posts no Instagram",
  evergreen: "Conteúdo permanente",
  visual: "Imagem com licença",
  keyword: "Funil de keyword",
  landing: "Landing page",
  perfis_referencia: "Perfis de referência",
  ramos: "Três canais independentes",
  acervo: "Acervo de imagens próprio",
  producao_vespera: "Produção na véspera (17:00)",
  instrucoes: "Instruções editadas no painel",
  aprovacao: "Fila de aprovação",
};

export const ROTULO_DO_ESTADO: Record<EstadoDeCapacidade, string> = {
  off: "Desligado",
  dry_run: "Ensaio",
  enforce: "No ar",
};
