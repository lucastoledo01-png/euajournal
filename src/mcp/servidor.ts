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

const PAUTA = z.string().min(1).describe("O story_id da pauta, como `pautas_disponiveis` devolve.");

const INSTRUCOES = [
  "Você faz o trabalho de modelo do eua.journal: escreve, audita e corrige os posts, e a plataforma confere com as mesmas guardas da esteira automática.",
  "O ciclo de um post: estado_do_dia, pautas_disponiveis, iniciar_post, depois proxima_tarefa e entregar_tarefa até o post ficar pronto, montar_post para ver a peça, e agendar_post.",
  "Cada tarefa traz a instrução (system e user), o material e o esquema JSON da resposta. Siga a instrução ao pé da letra e entregue SÓ o JSON do esquema.",
  "Quando a entrega volta com motivos, a tarefa está em reparo: peça a próxima tarefa e corrija só o apontado. Não invente para tapar buraco.",
  "Audite numa conversa nova, sem o raciocínio da escrita: julgue só pelo pacote factual que vem na tarefa.",
  "Você não aprova nem publica. Tudo o que agendar espera aprovação manual do dono no painel.",
].join("\n");

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
  const servidor = new McpServer({ name: "euajournal", version: "0.2.0" }, { instructions: INSTRUCOES });

  const ferramenta = (fn: () => Promise<unknown>) => async () => {
    try {
      return texto(await fn());
    } catch (erro) {
      return falha(erro);
    }
  };

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

  servidor.registerTool(
    "pautas_disponiveis",
    {
      title: "Pautas disponíveis",
      description: "Lista as pautas com pacote factual e foto que ainda não viraram post neste projeto.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    ferramenta(() => chamarPlataforma(config, "pautas")),
  );

  servidor.registerTool(
    "iniciar_post",
    {
      title: "Iniciar um post",
      description:
        "Abre a tarefa de escrita do post de uma pauta. Depois, use proxima_tarefa para receber a instrução e entregar_tarefa para entregar.",
      inputSchema: { story_id: PAUTA, data: DATA },
    },
    async ({ story_id, data }) =>
      ferramenta(() => chamarPlataforma(config, "post/iniciar", { metodo: "POST", corpo: { story_id, data } }))(),
  );

  servidor.registerTool(
    "proxima_tarefa",
    {
      title: "Próxima tarefa",
      description:
        "Devolve a próxima tarefa que espera você (reparo antes de nova), com instrução, material, esquema da resposta e, num reparo, os motivos.",
      inputSchema: {
        tipo: z.enum(["escrever_post", "auditar_post"]).optional().describe("Só tarefas deste tipo."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ tipo }) => ferramenta(() => chamarPlataforma(config, "tarefa/proxima", { consulta: { tipo } }))(),
  );

  servidor.registerTool(
    "entregar_tarefa",
    {
      title: "Entregar tarefa",
      description:
        "Entrega o resultado de uma tarefa: o JSON do esquema dela. A plataforma confere e responde o que vem em seguida: auditar, reparar, pronto ou descartado.",
      inputSchema: {
        id: z.string().min(1).describe("O id da tarefa."),
        resultado: z.record(z.string(), z.unknown()).describe("O JSON da resposta, no esquema da tarefa."),
      },
    },
    async ({ id, resultado }) =>
      ferramenta(() => chamarPlataforma(config, "tarefa/entregar", { metodo: "POST", corpo: { id, resultado } }))(),
  );

  servidor.registerTool(
    "montar_post",
    {
      title: "Montar o post",
      description: "Renderiza a peça e a legenda de um post pronto, para você olhar antes de agendar. Não grava nada.",
      inputSchema: { story_id: PAUTA, data: DATA },
      annotations: { readOnlyHint: true },
    },
    async ({ story_id, data }) => {
      try {
        const r = await chamarPlataforma<{ manchete: string; legenda: string; imagem: { mime: string; base64: string } }>(
          config,
          "post/montar",
          { metodo: "POST", corpo: { story_id, data } },
        );
        return {
          content: [
            { type: "image" as const, data: r.imagem.base64, mimeType: r.imagem.mime },
            { type: "text" as const, text: `MANCHETE: ${r.manchete}\n\nLEGENDA:\n${r.legenda}` },
          ],
        };
      } catch (erro) {
        return falha(erro);
      }
    },
  );

  servidor.registerTool(
    "agendar_post",
    {
      title: "Agendar o post",
      description:
        "Congela a arte, grava o post na próxima vaga livre do Instagram e o põe na fila de aprovação. Ele só vai ao ar depois de o dono aprovar no painel.",
      inputSchema: { story_id: PAUTA, data: DATA },
    },
    async ({ story_id, data }) =>
      ferramenta(() => chamarPlataforma(config, "post/agendar", { metodo: "POST", corpo: { story_id, data } }))(),
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
