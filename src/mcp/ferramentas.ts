import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * As ferramentas do MCP do eua.journal, independentes do caminho (27/10/2026).
 *
 * O mesmo conjunto chega ao Claude por dois caminhos:
 *
 * - online, em `/api/mcp` (Streamable HTTP), que é o caminho do produto: o
 *   Claude do usuário, no Mac ou no Windows, só precisa da URL e do token;
 * - local, por stdio (`servidor.ts`), para desenvolvimento.
 *
 * Quem muda entre os dois é o `Backend`: online ele chama a camada de serviço
 * direto; local ele chama as rotas por HTTP. A descrição das ferramentas, as
 * instruções e o formato das respostas são um só.
 *
 * O que nenhum dos dois faz, por decisão do dono: aprovar, reprovar ou cancelar
 * peça. Isso é só do painel. O Claude produz e corrige; quem decide é uma pessoa.
 */

export const NOMES_DAS_FERRAMENTAS = [
  "estado_do_dia",
  "ver_fila",
  "pautas_disponiveis",
  "iniciar_post",
  "proxima_tarefa",
  "entregar_tarefa",
  "montar_post",
  "agendar_post",
] as const;

export type NomeDaFerramenta = (typeof NOMES_DAS_FERRAMENTAS)[number];

/** Chama a plataforma e devolve o corpo da resposta. Recusa LANÇA, com a mensagem que o Claude deve ler. */
export type Backend = (nome: NomeDaFerramenta, args: Record<string, unknown>) => Promise<unknown>;

export class RecusaDaPlataforma extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

const DATA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Data da edição, AAAA-MM-DD, no fuso do projeto. Sem data, hoje.");

const PAUTA = z.string().min(1).describe("O story_id da pauta, como `pautas_disponiveis` devolve.");

export const INSTRUCOES_DO_MCP = [
  "Você faz o trabalho de modelo do eua.journal: escreve, audita e corrige os posts, e a plataforma confere com as mesmas guardas da esteira automática.",
  "O ciclo de um post: estado_do_dia, pautas_disponiveis, iniciar_post, depois proxima_tarefa e entregar_tarefa até o post ficar pronto, montar_post para ver a peça, e agendar_post.",
  "Cada tarefa traz a instrução (system e user), o material e o esquema JSON da resposta. Siga a instrução ao pé da letra e entregue SÓ o JSON do esquema.",
  "Quando a entrega volta com motivos, a tarefa está em reparo: peça a próxima tarefa e corrija só o apontado. Não invente para tapar buraco.",
  "Na auditoria, julgue só pelo pacote factual que vem na tarefa, como se não tivesse escrito o texto; se puder, audite numa conversa separada.",
  "Você não aprova nem publica. Tudo o que agendar espera aprovação manual do dono no painel.",
].join("\n");

function texto(dados: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(dados, null, 2) }] };
}

function falha(erro: unknown) {
  const mensagem =
    erro instanceof RecusaDaPlataforma
      ? `A plataforma recusou (HTTP ${erro.status}): ${erro.message}`
      : erro instanceof Error
        ? erro.message
        : String(erro);
  return { isError: true, content: [{ type: "text" as const, text: mensagem }] };
}

export function criarServidorMcp(backend: Backend, versao = "0.3.0"): McpServer {
  const servidor = new McpServer({ name: "euajournal", version: versao }, { instructions: INSTRUCOES_DO_MCP });

  const chamar = async (nome: NomeDaFerramenta, args: Record<string, unknown>) => {
    try {
      return texto(await backend(nome, args));
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
    ({ data }) => chamar("estado_do_dia", { data }),
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
    () => chamar("ver_fila", {}),
  );

  servidor.registerTool(
    "pautas_disponiveis",
    {
      title: "Pautas disponíveis",
      description: "Lista as pautas com pacote factual e foto que ainda não viraram post neste projeto.",
      inputSchema: {
        dias: z.number().int().min(1).max(60).optional().describe("Quantos dias para trás procurar. Padrão 30."),
      },
      annotations: { readOnlyHint: true },
    },
    ({ dias }) => chamar("pautas_disponiveis", { dias }),
  );

  servidor.registerTool(
    "iniciar_post",
    {
      title: "Iniciar um post",
      description:
        "Abre a tarefa de escrita do post de uma pauta. Depois, use proxima_tarefa para receber a instrução e entregar_tarefa para entregar.",
      inputSchema: { story_id: PAUTA, data: DATA },
    },
    ({ story_id, data }) => chamar("iniciar_post", { story_id, data }),
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
    ({ tipo }) => chamar("proxima_tarefa", { tipo }),
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
    ({ id, resultado }) => chamar("entregar_tarefa", { id, resultado }),
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
        const r = (await backend("montar_post", { story_id, data })) as {
          manchete: string;
          legenda: string;
          imagem: { mime: string; base64: string };
        };
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
    ({ story_id, data }) => chamar("agendar_post", { story_id, data }),
  );

  return servidor;
}
