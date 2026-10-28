import type { SupabaseClient } from "@supabase/supabase-js";
import { comReel } from "../mcp/reels/refacao";
import { sendAlert } from "../alerts";
import type { EstadoDaCapacidade, ProjetoComCapacidades } from "../capacidades";
import type { AvisoDaPeca } from "./contrato";
import { criarFilaStore, type FilaStore } from "./fila-store";
import { enfileirar, type DepsDaFila, type PecaParaFila, type ProjetoDaFila } from "./fila";
import { getSupabaseAdminClient } from "../supabase-admin";
import { hashDaPeca, hashDoPostDaLinha } from "./hash";
import { modoDaFila } from "./modo";
import { criarAdaptadorSupabase } from "./pecas-supabase";
import {
  decidirPublicacao,
  ehMensagemDoPortao,
  mensagemDoPortao,
  statusDeEntradaDoPost,
  type DecisaoDoPortao,
} from "./portao";
import type { GanchosDeRefazer } from "./refazer";
import { criarGanchosDeProducao, mundoDeProducao } from "./ganchos-de-producao";
import { avisosDoPost, resumoDoPostDaLinha } from "./resumo-do-post";

export { avisosDoPost };

/**
 * Onde a fila encosta no resto do sistema: o store do social, o worker e a
 * redação. Cada ponto de contato é uma função curta daqui, para que os
 * arquivos grandes (`worker-service.ts`, `newsroom-service.ts`) ganhem uma ou
 * duas linhas e nenhuma regra.
 */

/**
 * Os ganchos de refação ligados em produção (RF-22).
 *
 * Vazio em 05/10/2026, e honesto sobre isso: as funções de cada etapa existem
 * (`gerarPostDaPauta`, o resolvedor visual, `congelarArtefato`), mas todas
 * pedem a pauta avaliada inteira, e ela não está gravada na linha do post. Uma
 * refação que remonta a pauta por fora seria um segundo gerador. Quem ligar
 * uma etapa registra o gancho aqui; até lá a peça reprovada fica em
 * `refazendo`, com o motivo visível no painel.
 *
 * Preenchido na integração do mesmo dia: texto e imagem do artigo (a pauta e o
 * pacote passaram a ser gravados na linha da fila) e imagem e arte do post
 * (lidas da própria linha de `social_posts`). O que continua sem gancho, e o
 * porquê de cada um, está em `ganchos-de-producao.ts`.
 */
// O Reel na frente do post (28/10/2026): reprovado, ele volta para o Claude no MCP.
export const GANCHOS_DE_PRODUCAO: GanchosDeRefazer = comReel(criarGanchosDeProducao(mundoDeProducao()), getSupabaseAdminClient);

/**
 * O projeto como a fila precisa dele, a partir do que o chamador tem na mão.
 *
 * O ciclo social recebe só `ProjetoComCapacidades` (as `settings`). O fuso só
 * importa para o aviso da newsletter, e o padrão é o do projeto semente.
 */
export function projetoDaFila(
  projeto: (ProjetoComCapacidades & { timezone?: unknown; id?: unknown }) | null | undefined,
  projectId: string,
): ProjetoDaFila | null {
  if (!projeto) return null;
  return {
    id: typeof projeto.id === "string" && projeto.id ? projeto.id : projectId,
    timezone: typeof projeto.timezone === "string" && projeto.timezone ? projeto.timezone : "America/Sao_Paulo",
    settings: (projeto.settings as Record<string, unknown> | null | undefined) ?? null,
  };
}

export function depsDaFila(
  client: SupabaseClient,
  projeto: ProjetoDaFila,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; store?: FilaStore } = {},
): DepsDaFila {
  return {
    store: opcoes.store ?? criarFilaStore(client),
    pecas: criarAdaptadorSupabase(client, projeto, opcoes),
    ganchos: GANCHOS_DE_PRODUCAO,
    alertar: (nivel, titulo, detalhe) => sendAlert(nivel, titulo, detalhe, opcoes.env ?? process.env),
  };
}

// ---------------------------------------------------------------------------
// Avisos de QA
// ---------------------------------------------------------------------------

/** Os avisos da edição, lidos do QA da redação. */
export function avisosDaEdicao(qa: { passed: boolean; hallucination_risk: boolean; score?: number; issues: string[] }): AvisoDaPeca[] {
  const avisos: AvisoDaPeca[] = [];
  if (qa.hallucination_risk) avisos.push({ codigo: "RISCO_DE_ALUCINACAO", detalhe: "o QA marcou risco de fato inventado" });
  if (!qa.passed) avisos.push({ codigo: "QA_REPROVOU", detalhe: `QA ${qa.score ?? "?"}/100` });
  for (const i of qa.issues ?? []) avisos.push({ codigo: "QA_APONTAMENTO", detalhe: i });
  return avisos;
}

// ---------------------------------------------------------------------------
// O store do social
// ---------------------------------------------------------------------------

export type OpcoesDaFilaNoStore = {
  /** O status com que o post novo entra. Ver `statusDeEntradaDoPost`. */
  statusDeEntrada?: "scheduled" | "draft";
  /** Chamado depois do insert, com as linhas gravadas e seus ids. */
  aoGravar?: (gravadas: Array<{ id: string; linha: Record<string, unknown> }>) => Promise<void>;
};

/**
 * O que o store do social precisa para respeitar a fila.
 *
 * Fila desligada devolve objeto vazio, e o store grava `scheduled` sem chamar
 * nada: o caminho de produção de hoje, sem uma escrita a mais.
 */
export function opcoesDaFilaParaOStore(
  projeto: (ProjetoDaFila & { slug?: string }) | null | undefined,
  client: SupabaseClient,
): OpcoesDaFilaNoStore {
  if (!projeto) return {};
  const modo = modoDaFila(projeto);
  if (modo === "off") return {};

  return {
    statusDeEntrada: statusDeEntradaDoPost(modo),
    aoGravar: async (gravadas) => {
      const deps = depsDaFila(client, projeto);
      for (const { id, linha } of gravadas) {
        try {
          await enfileirar(
            projeto,
            {
              ramo: "post",
              pecaId: id,
              hash: hashDoPostDaLinha(linha),
              publicarEm: typeof linha.scheduled_at === "string" ? linha.scheduled_at : null,
              avisos: avisosDoPost(linha),
              resumo: resumoDoPostDaLinha(linha),
            },
            deps,
          );
        } catch (erro) {
          /*
           * Falhar ao enfileirar não pode passar calado: em `enforce` o post
           * nasceu `draft` e, sem linha na fila, ninguém o veria nunca.
           */
          const motivo = erro instanceof Error ? erro.message : String(erro);
          console.error(`[FILA] post ${id} gravado e não enfileirado: ${motivo}`);
          await sendAlert("warning", "Post gravado fora da fila de aprovação", `Post ${id}: ${motivo}`);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// O worker do Instagram
// ---------------------------------------------------------------------------

/**
 * A pergunta do worker ao portão, para UM post.
 *
 * Em `off` nem lê o banco: o worker de hoje continua sem uma consulta a mais.
 * Sem aprovação que confira, LANÇA com a mensagem do portão, e o `catch` do
 * worker reconhece o prefixo para segurar o post em vez de marcá-lo `failed`.
 *
 * Falha ao LER a fila em `enforce` segura o post também: não saber se está
 * aprovado não é aprovação. Em `dry_run` só registra.
 */
export async function conferirPostNoWorker(
  client: SupabaseClient,
  projeto: ProjetoDaFila,
  linha: { id: string; caption?: unknown; slides_manifest?: unknown; content_json?: unknown },
  hashAtual?: string,
): Promise<DecisaoDoPortao> {
  const modo: EstadoDaCapacidade = modoDaFila(projeto);
  const hash = hashAtual ?? hashDoPostDaLinha(linha);
  if (modo === "off") return decidirPublicacao({ modo, ramo: "post", aprovacao: null, hashAtual: hash });

  let aprovacao = null;
  try {
    aprovacao = await criarFilaStore(client).porPeca(projeto.id, "post", linha.id);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    if (modo === "enforce") {
      throw new Error(mensagemDoPortao({ motivo: "APROVACAO_AUSENTE", detalhe: `não consegui ler a fila: ${motivo}` }));
    }
    console.warn(`[FILA] ensaio: não consegui ler a fila do post ${linha.id}: ${motivo}`);
    return decidirPublicacao({ modo, ramo: "post", aprovacao: null, hashAtual: hash });
  }

  const decisao = decidirPublicacao({ modo, ramo: "post", aprovacao, hashAtual: hash });
  if (modo === "dry_run" && !decisao.liberariaEmEnforce) {
    console.log(`[FILA] ensaio: o post ${linha.id} seria SEGURADO em enforce (${decisao.motivo}: ${decisao.detalhe})`);
  }
  if (!decisao.libera) throw new Error(mensagemDoPortao(decisao));
  return decisao;
}

/** O hash da versão que o worker conferiu byte a byte, para a segunda pergunta ao portão. */
export function hashDosArtefatosConferidos(legenda: string, sha256s: string[]): string {
  return hashDaPeca({ ramo: "post", conteudo: { legenda, artefatos: sha256s } });
}

export { ehMensagemDoPortao };

/**
 * Tira o post do caminho do worker sem marcá-lo como falha (cenário 2 do PRD).
 *
 * Volta para `draft`, com o motivo do portão em `error_message`. Sem isso o
 * post seguiria `scheduled`, o worker o pegaria a cada giro, e com cinco posts
 * esperando aprovação no topo da fila os aprovados de trás nunca seriam
 * alcançados (`findDuePosts` pega os cinco mais antigos).
 *
 * Só mexe em linha sem container criado: com container, a reconciliação do
 * worker é que sabe o que fazer, e rebaixar ali esconderia um post que talvez
 * já esteja no ar.
 */
export async function segurarPostNaFila(
  client: SupabaseClient,
  socialPostId: string,
  mensagem: string,
): Promise<{ gravado: boolean; erro: string | null }> {
  const { error } = await client
    .from("social_posts")
    .update({ status: "draft", error_message: mensagem.slice(0, 1000), updated_at: new Date().toISOString() })
    .eq("id", socialPostId)
    .in("status", ["scheduled", "generated"])
    .is("provider_creation_id", null);
  if (error) {
    console.error(`[FILA] não consegui segurar o post ${socialPostId}: ${error.message}`);
    return { gravado: false, erro: error.message };
  }
  return { gravado: true, erro: null };
}

// ---------------------------------------------------------------------------
// A redação: newsletter e artigo
// ---------------------------------------------------------------------------

/**
 * Enfileira uma peça da redação, sem nunca derrubar a redação.
 *
 * A edição já está gravada quando isto roda. Se a fila falhar, a peça fica
 * fora dela, e em `enforce` isso quer dizer que ela não sai sozinha: o alerta é
 * o que impede o dia de virar silêncio, que é a lição de agosto e de setembro.
 */
export async function enfileirarDaRedacao(projeto: ProjetoDaFila, peca: PecaParaFila): Promise<void> {
  if (modoDaFila(projeto) === "off") return;
  try {
    await enfileirar(projeto, peca, depsDaFila(getSupabaseAdminClient(), projeto));
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[FILA] ${peca.ramo} ${peca.pecaId} não enfileirado: ${motivo}`);
    await sendAlert("warning", `${peca.ramo} fora da fila de aprovação`, `${peca.pecaId}: ${motivo}`);
  }
}
