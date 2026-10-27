import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chamarPlataforma, configDoAmbiente, ErroDaPlataforma, type ConfigDaPlataforma } from "./plataforma";

/**
 * O servidor MCP do eua.journal, para o Claude Desktop (27/10/2026).
 *
 * O Claude Desktop o inicia como processo local (stdio), com a URL da
 * plataforma e o token do usuário no ambiente. Ver `docs/mcp.md`.
 *
 * O que ele NÃO faz, por decisão do dono: aprovar, reprovar ou cancelar peça.
 * Isso é só do painel. O Claude produz e corrige; quem decide é uma pessoa.
 *
 * Nada pode ir para o stdout além do protocolo: log é `console.error`.
 */

const DATA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Data da edição, AAAA-MM-DD, no fuso do projeto. Sem data, hoje.");

function texto(dados: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(dados, null, 2) }] };
}

function falha(erro: unknown) {
  const mensagem =
    erro instanceof ErroDaPlataforma
      ? `A plataforma recusou (HTTP ${erro.status}): ${erro.message}`
      : erro instanceof Error
        ? erro.message
        : String(erro);
  return { isError: true, content: [{ type: "text" as const, text: mensagem }] };
}

export function criarServidor(config: ConfigDaPlataforma): McpServer {
  const servidor = new McpServer({ name: "euajournal", version: "0.1.0" });

  servidor.registerTool(
    "estado_do_dia",
    {
      title: "Estado do dia",
      description:
        "Mostra o que falta fazer no dia: peças reprovadas pelo dono esperando correção, tarefas abertas e em reparo, " +
        "e se a fila de aprovação está aceitando entregas. Comece sempre por aqui.",
      inputSchema: { data: DATA },
      annotations: { readOnlyHint: true },
    },
    async ({ data }) => {
      try {
        return texto(await chamarPlataforma(config, "estado-do-dia", { consulta: { data } }));
      } catch (erro) {
        return falha(erro);
      }
    },
  );

  servidor.registerTool(
    "ver_fila",
    {
      title: "Ver a fila de aprovação",
      description:
        "Lista as peças na fila de aprovação, com estado, motivo de reprovação e o link do painel. " +
        "Só leitura: aprovar e reprovar é feito pelo dono no painel.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return texto(await chamarPlataforma(config, "fila"));
      } catch (erro) {
        return falha(erro);
      }
    },
  );

  return servidor;
}

async function principal() {
  const config = configDoAmbiente();
  const servidor = criarServidor(config);
  await servidor.connect(new StdioServerTransport());
  console.error(`[euajournal-mcp] conectado a ${config.url}`);
}

if (process.argv[1] && /servidor\.(ts|js)$/.test(process.argv[1])) {
  principal().catch((erro) => {
    console.error("[euajournal-mcp]", erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
}
