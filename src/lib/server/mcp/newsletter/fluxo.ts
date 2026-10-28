import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { pautaAvaliadaDoContexto, pautaDaCandidata, montarContexto } from "@/lib/server/aprovacao/contexto-de-producao";
import type { PautaDoContexto } from "@/lib/server/aprovacao/contrato";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import {
  aceitarClaims,
  montarSystemDeClaims,
  montarUserDeClaims,
  RespostaDeClaimsSchema,
  type ResultadoDeClaims,
} from "@/lib/server/editorial/claims-semanticas";
import type { PacoteFactual } from "@/lib/server/editorial/pacote-factual";
import type { OpcoesDoPortao } from "@/lib/server/newsroom/pipeline";
import { EditionContentSchema, QAResultSchema } from "@/lib/server/newsroom/schemas";
import type { ResultadoVisual } from "@/lib/server/visual/tipos";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * A newsletter pelo Claude (29/10/2026), sem reescrever a redação.
 *
 * A redação da newsletter é um laço: escreve, confere, audita (QA e
 * conclusões), repara, confere de novo, decide. Em vez de partir esse laço em
 * pedaços, ele roda INTEIRO com um modelo que responde do que o Claude já
 * entregou: cada chamada é identificada pelo hash das mensagens, e a primeira
 * que ainda não tem resposta vira tarefa. Quando o Claude entrega, o laço
 * roda de novo desde o começo, repete as respostas guardadas (as mensagens são
 * as mesmas, porque tudo antes delas é o mesmo) e para no pedido seguinte. No
 * fim, a edição sai pelo mesmo caminho da refação (`reescreverNewsletter`),
 * com as mesmas conferências e o mesmo HTML.
 */

export const TIPOS_DA_NEWSLETTER = ["escrever_newsletter", "auditar_newsletter"] as const;

export class PedidoAoClaude extends Error {
  constructor(
    readonly tipo: (typeof TIPOS_DA_NEWSLETTER)[number],
    readonly chave: string,
    readonly etapa: "redacao" | "qa" | "claims",
    readonly system: string,
    readonly user: string,
  ) {
    super(`a newsletter espera o Claude: ${etapa}`);
  }
}

function chaveDe(etapa: string, data: string, system: string, user: string): string {
  return `nl-${data}-${etapa}-${createHash("sha256").update(`${system}\n\u0000\n${user}`).digest("hex").slice(0, 24)}`;
}

const ESQUEMAS = {
  redacao: z.toJSONSchema(EditionContentSchema, { io: "input" }) as Record<string, unknown>,
  qa: z.toJSONSchema(QAResultSchema, { io: "input" }) as Record<string, unknown>,
  claims: z.toJSONSchema(RespostaDeClaimsSchema, { io: "input" }) as Record<string, unknown>,
};

/** O modelo que responde do que o Claude entregou, ou pede o que falta. */
export function modeloDoClaude(data: string, respostas: Map<string, unknown>): NonNullable<OpcoesDoPortao["modelo"]> {
  const zero = { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 };
  return {
    async json<T>(etapa: "redacao" | "qa", mensagens: Array<{ role: "system" | "user"; content: string }>) {
      const system = mensagens.find((m) => m.role === "system")?.content ?? "";
      const user = mensagens.find((m) => m.role === "user")?.content ?? "";
      const chave = chaveDe(etapa, data, system, user);
      if (!respostas.has(chave)) {
        throw new PedidoAoClaude(etapa === "redacao" ? "escrever_newsletter" : "auditar_newsletter", chave, etapa, system, user);
      }
      return { data: respostas.get(chave) as T, usage: zero };
    },
    async claims(auditaveis): Promise<ResultadoDeClaims> {
      const system = montarSystemDeClaims();
      const user = montarUserDeClaims(auditaveis);
      const chave = chaveDe("claims", data, system, user);
      if (!respostas.has(chave)) throw new PedidoAoClaude("auditar_newsletter", chave, "claims", system, user);
      const aceita = aceitarClaims(respostas.get(chave));
      if ("erro" in aceita) return { claims: [], naoSustentadas: [], custoUsd: 0, tokens: 0, erro: aceita.erro };
      return { ...aceita, custoUsd: 0, tokens: 0, erro: null };
    },
  };
}

export type PautaDaNewsletter = { candidata: CandidataPersistida; foto: ResultadoVisual | null };

export type DepsDaNewsletter = {
  tarefas: TarefasStore;
  /** As pautas do plano aprovado, na ordem, com pacote e foto. */
  pautas: (projeto: Project, data: string) => Promise<PautaDaNewsletter[]>;
  reescrever: (
    e: {
      projeto: Project;
      data: string;
      pautas: PautaDoContexto[];
      pacotes: Record<string, PacoteFactual>;
      imagens: Record<string, string>;
      legendas: Record<string, string>;
      instrucao: string;
    },
    modelo: NonNullable<OpcoesDoPortao["modelo"]>,
  ) => Promise<{ ok: true; edicao: Record<string, unknown>; html: string; avisos: string[] } | { ok: false; motivo: string }>;
  gravar: (projeto: Project, data: string, r: { edicao: Record<string, unknown>; html: string; avisos: string[] }, contexto: unknown) => Promise<string>;
};

export type PassoDaNewsletter =
  | { ok: true; desfecho: "tarefa"; tarefa: Tarefa }
  | { ok: true; desfecho: "pronto"; edicaoId: string }
  | { ok: true; desfecho: "descartado"; motivos: string[] };

/** Roda o laço da redação com o que já foi entregue, e devolve o próximo passo. */
export async function avancarNewsletter(projeto: Project, data: string, deps: DepsDaNewsletter): Promise<PassoDaNewsletter> {
  const lista = await deps.pautas(projeto, data);
  const semPacote = lista.filter((p) => !p.candidata.factualPackage).map((p) => p.candidata.storyId);
  if (semPacote.length) return { ok: true, desfecho: "descartado", motivos: [`pautas sem pacote factual: ${semPacote.join(", ")}`] };

  const pautas = lista.map((p) => pautaDaCandidata(p.candidata));
  const pacotes: Record<string, PacoteFactual> = {};
  const imagens: Record<string, string> = {};
  const legendas: Record<string, string> = {};
  for (const p of lista) {
    pacotes[p.candidata.storyId] = p.candidata.factualPackage!;
    const asset = p.foto?.status === "SELECTED" ? p.foto.asset : null;
    if (asset?.imageUrl) {
      imagens[p.candidata.storyId] = asset.imageUrl;
      if (asset.attribution) legendas[p.candidata.storyId] = asset.attribution;
    }
  }

  const feitas = (await deps.tarefas.doDia(projeto.id, data)).filter(
    (t) => (TIPOS_DA_NEWSLETTER as readonly string[]).includes(t.tipo) && t.estado === "entregue",
  );
  const respostas = new Map(feitas.map((t) => [t.chave, t.resultado]));

  try {
    const r = await deps.reescrever({ projeto, data, pautas, pacotes, imagens, legendas, instrucao: "" }, modeloDoClaude(data, respostas));
    if (!r.ok) return { ok: true, desfecho: "descartado", motivos: [r.motivo] };
    const contexto = montarContexto({
      data,
      pautas: lista.map((p) => pautaAvaliadaDoContexto(pautaDaCandidata(p.candidata), p.candidata)),
      pacotes,
      imagens: new Map(Object.entries(imagens)),
      legendas: new Map(Object.entries(legendas)),
    });
    return { ok: true, desfecho: "pronto", edicaoId: await deps.gravar(projeto, data, r, contexto) };
  } catch (erro) {
    if (!(erro instanceof PedidoAoClaude)) throw erro;
    const tarefa = await deps.tarefas.abrir({
      projectId: projeto.id,
      editionDate: data,
      tipo: erro.tipo,
      chave: erro.chave,
      instrucao: {
        system: erro.system,
        user: erro.user,
        orientacao:
          erro.etapa === "redacao"
            ? "Escreva a edição seguindo a instrução ao pé da letra. Responda SÓ com o JSON da edição."
            : "Audite como se não tivesse escrito o texto, só pelo pacote factual. Responda SÓ com o JSON do esquema.",
        etapa: erro.etapa,
      },
      material: { data, etapa: erro.etapa },
      esquema: ESQUEMAS[erro.etapa],
    });
    return { ok: true, desfecho: "tarefa", tarefa };
  }
}

/** Recebe a entrega e avança o laço até o próximo pedido, ou até a edição pronta. */
export async function entregarTarefaDaNewsletter(
  projeto: Project,
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDaNewsletter,
): Promise<PassoDaNewsletter | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }> {
  const etapa = (tarefa.material as { etapa?: string }).etapa;
  const esquema = etapa === "redacao" ? null : etapa === "qa" ? QAResultSchema : RespostaDeClaimsSchema;
  const ok = esquema ? esquema.safeParse(resultado).success : Boolean(resultado && typeof resultado === "object");
  if (!ok) {
    const motivos = ["a resposta não cabe no esquema da tarefa"];
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  await deps.tarefas.entregar(tarefa.id, resultado, quem);
  return avancarNewsletter(projeto, tarefa.editionDate, deps);
}

/** A gravação de verdade: `news_editions` e a fila, como a redação grava. */
export async function gravarNewsletterDoClaude(
  client: SupabaseClient,
  projeto: Project,
  data: string,
  r: { edicao: Record<string, unknown>; html: string; avisos: string[] },
  contexto: unknown,
): Promise<string> {
  const [{ enfileirarDaRedacao, projetoDaFila }, { hashDaNewsletter }, { cadenciaDoProjeto }, { zonedTimeToUtc }] = await Promise.all([
    import("@/lib/server/aprovacao/integracao"),
    import("@/lib/server/aprovacao/hash"),
    import("@/lib/server/cadencia"),
    import("@/lib/server/time"),
  ]);
  const e = r.edicao;
  const { count } = await client.from("news_editions").select("id", { count: "exact", head: true }).eq("project_id", projeto.id);
  const palavras = r.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const { data: linha, error } = await client
    .from("news_editions")
    .upsert(
      {
        project_id: projeto.id,
        edition_date: data,
        edition_number: (count ?? 0) + 1,
        slug: `edicao-${data}`,
        subject: e.subject,
        subject_options: e.subject_options,
        preheader: e.preheader,
        headline: e.headline,
        intro: e.intro,
        stories: e.stories,
        quick_bits: e.quick_bits ?? [],
        closing: e.closing,
        final_line: e.final_line,
        content_html: r.html,
        word_count: palavras,
        qa_passed: e.qa_passed,
        qa_score: e.qa_score,
        qa_hallucination_risk: e.qa_hallucination_risk,
        qa_issues: e.qa_issues,
        // A campanha só nasce na liberação da fila, com a versão aprovada.
        status: "approved",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,edition_date" },
    )
    .select("id")
    .single();
  if (error || !linha) throw new Error(`a edição não foi gravada: ${error?.message ?? "sem linha"}`);
  const id = String((linha as { id: string }).id);

  const p = projetoDaFila(projeto, projeto.id);
  if (p) {
    const horario = cadenciaDoProjeto(projeto).newsletter.horarios[0];
    await enfileirarDaRedacao(p, {
      ramo: "newsletter",
      pecaId: id,
      hash: hashDaNewsletter(String(e.subject ?? ""), r.html),
      publicarEm: horario ? zonedTimeToUtc(data, horario, projeto.timezone).toISOString() : null,
      avisos: r.avisos.map((a) => ({ codigo: "AVISO_DA_REDACAO", detalhe: a })),
      resumo: { titulo: String(e.headline ?? ""), texto: String(e.subject ?? ""), contexto } as never,
    });
  }
  return id;
}
