import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { criarServidorMcp, RecusaDaPlataforma, type Backend, type NomeDaFerramenta } from "./ferramentas";
import { chamarPlataforma, configDoAmbiente, ErroDaPlataforma, type ConfigDaPlataforma } from "./plataforma";

/**
 * O servidor MCP local (stdio), para desenvolvimento (27/10/2026).
 *
 * O caminho do produto é o MCP online, em `/api/mcp`. Este existe para testar
 * com a plataforma rodando na máquina: ele chama as rotas `/api/mcp/<ferramenta>`
 * por HTTP, com a URL e o token do ambiente. Ver `docs/mcp.md`.
 *
 * Nada pode ir para o stdout além do protocolo: log é `console.error`.
 */

const ROTAS: Record<NomeDaFerramenta, { caminho: string; metodo: "GET" | "POST" }> = {
  estado_do_dia: { caminho: "estado-do-dia", metodo: "GET" },
  ver_fila: { caminho: "fila", metodo: "GET" },
  pautas_disponiveis: { caminho: "pautas", metodo: "GET" },
  iniciar_post: { caminho: "post/iniciar", metodo: "POST" },
  proxima_tarefa: { caminho: "tarefa/proxima", metodo: "GET" },
  entregar_tarefa: { caminho: "tarefa/entregar", metodo: "POST" },
  montar_post: { caminho: "post/montar", metodo: "POST" },
  agendar_post: { caminho: "post/agendar", metodo: "POST" },
};

export function backendPorHttp(config: ConfigDaPlataforma, fetcher: typeof fetch = fetch): Backend {
  return async (nome, args) => {
    const rota = ROTAS[nome];
    try {
      return await chamarPlataforma(
        config,
        rota.caminho,
        rota.metodo === "GET"
          ? {
              consulta: Object.fromEntries(
                Object.entries(args).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]),
              ),
            }
          : { metodo: "POST", corpo: args },
        fetcher,
      );
    } catch (erro) {
      if (erro instanceof ErroDaPlataforma) throw new RecusaDaPlataforma(erro.status, erro.message);
      throw erro;
    }
  };
}

export function criarServidor(config: ConfigDaPlataforma) {
  return criarServidorMcp(backendPorHttp(config));
}

async function principal() {
  const config = configDoAmbiente();
  await criarServidor(config).connect(new StdioServerTransport());
  console.error(`[euajournal-mcp] conectado a ${config.url}`);
}

if (process.argv[1] && /servidor\.(ts|js)$/.test(process.argv[1])) {
  principal().catch((erro) => {
    console.error("[euajournal-mcp]", erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
}
