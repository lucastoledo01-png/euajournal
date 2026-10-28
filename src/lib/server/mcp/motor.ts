/**
 * Quem faz o trabalho de modelo do projeto (27/10/2026).
 *
 * Até aqui todo projeto tinha um motor só: a esteira chama a OpenAI e decide
 * sozinha. O dono quer perfis de dois tipos na mesma plataforma. Um continua
 * automático, como hoje. No outro, quem pensa é o Claude aplicativo do usuário
 * (Claude Desktop), conectado por MCP: a plataforma serve tarefas com a mesma
 * instrução, o mesmo esquema e as mesmas guardas, e o Claude entrega o
 * resultado. Não é a API da Anthropic, por decisão do dono.
 *
 * A forma no banco, dentro do `settings` que já é jsonb:
 *
 *   settings: { "motor": "claude_mcp" }
 *
 * Ausente vale `openai`, que é o projeto de antes byte a byte. Valor declarado
 * e irreconhecível também vale `openai`: o motor Claude desliga a escrita do
 * cron e muda a fila, então ele só existe quando escrito certo. É o contrato
 * das capacidades (`capacidades.ts`), pelo mesmo motivo: erro de digitação no
 * painel não pode mudar quem publica.
 */

export const MOTORES = ["openai", "claude_mcp"] as const;

export type Motor = (typeof MOTORES)[number];

export const ROTULO_DO_MOTOR: Record<Motor, string> = {
  openai: "OpenAI (automático)",
  claude_mcp: "Claude via MCP",
};

export type ProjetoComMotor = {
  settings?: Record<string, unknown> | null;
};

export function motorDoProjeto(projeto: ProjetoComMotor | null | undefined): Motor {
  const settings = projeto?.settings;
  if (!settings || typeof settings !== "object") return "openai";
  const bruto = (settings as Record<string, unknown>).motor;
  if (typeof bruto !== "string") return "openai";
  return bruto.trim().toLowerCase() === "claude_mcp" ? "claude_mcp" : "openai";
}

export function ehMotorClaude(projeto: ProjetoComMotor | null | undefined): boolean {
  return motorDoProjeto(projeto) === "claude_mcp";
}
