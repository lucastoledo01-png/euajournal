import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { criarServidorMcp, RecusaDaPlataforma, type Backend, type NomeDaFerramenta } from "@/mcp/ferramentas";
import * as servico from "./servico";
import { depsDoReelNoMcp, produzirReel, reelsSugeridos, verReel } from "./reels/servico";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { Resposta } from "./servico";
import type { AcessoDoMcp } from "./tokens";

/**
 * O MCP online (27/10/2026): o caminho do produto.
 *
 * O Claude do usuário, no Mac ou no Windows, conecta a `https://<site>/api/mcp`
 * com o token no cabeçalho `Authorization`, e não instala nada. As ferramentas
 * são as mesmas do servidor local (`@/mcp/ferramentas`); aqui elas chamam a
 * camada de serviço direto, sem ida e volta por HTTP.
 *
 * O transporte é o Streamable HTTP, SEM sessão: cada pedido monta o servidor,
 * responde e acaba. O contêiner web não guarda conversa, então o MCP funciona
 * igual com um processo ou com vários, e um deploy no meio não derruba
 * ninguém. As respostas saem em JSON, e não em fluxo: nenhuma ferramenta
 * manda notificação no meio do caminho.
 */

const CHAMADAS: Record<NomeDaFerramenta, (acesso: AcessoDoMcp, args: Record<string, unknown>) => Promise<Resposta>> = {
  estado_do_dia: (a, args) => servico.estadoDoDia(a, args),
  ver_fila: (a) => servico.verFila(a),
  pautas_disponiveis: (a, args) => servico.pautas(a, args),
  iniciar_post: (a, args) => servico.iniciar(a, args),
  proxima_tarefa: (a, args) => servico.proximaTarefa(a, args),
  entregar_tarefa: (a, args) => servico.entregar(a, args),
  montar_post: (a, args) => servico.montar(a, args),
  agendar_post: (a, args) => servico.agendar(a, args),
  reels_sugeridos: (a, args) => reelsSugeridos(a, args, depsDoReelNoMcp(getSupabaseAdminClient())),
  produzir_reel: (a, args) => produzirReel(a, args, depsDoReelNoMcp(getSupabaseAdminClient())),
  ver_reel: (a, args) => verReel(a, args, depsDoReelNoMcp(getSupabaseAdminClient())),
};

export function backendDireto(acesso: AcessoDoMcp, chamadas = CHAMADAS): Backend {
  return async (nome, args) => {
    const r = await chamadas[nome](acesso, args);
    if (!r.ok) throw new RecusaDaPlataforma(r.status, r.error);
    return r;
  };
}

/** Responde UM pedido MCP do Claude, já com o acesso conferido. */
export async function responderMcp(req: Request, backend: Backend): Promise<Response> {
  const transporte = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const servidor = criarServidorMcp(backend);
  await servidor.connect(transporte);
  try {
    return await transporte.handleRequest(req);
  } finally {
    // Sem sessão, nada sobrevive ao pedido: o servidor fecha junto com a resposta.
    void servidor.close().catch(() => undefined);
  }
}
