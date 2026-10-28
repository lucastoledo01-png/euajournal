import type { Project } from "../projects";
import type { OpcoesDoPortao } from "../newsroom/pipeline";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { EditionContent } from "../newsroom/schemas";
import type { RankedCandidate } from "../newsroom/ranker";
import type { PautaDoContexto } from "./contrato";
import { pautaAvaliadaDoContexto } from "./contexto-de-producao";

/**
 * A newsletter refeita pelas MESMAS funções da redação (06/10/2026).
 *
 * `runNewsroomPipeline` escreve a edição, audita, repara e decide; o número vira
 * apresentação depois (`formatarNumerosDaEdicao`); `renderEditionToHtml`
 * desenha o e-mail com as fotos e os créditos. Nada aqui escreve texto: o que
 * muda é o fim da voz, com o motivo do editor e a memória de reprovação.
 *
 * O Listmonk não é tocado. Com a fila em `enforce` a campanha só nasce na
 * liberação (`despachar`, em `pecas-supabase.ts`), com o assunto e o HTML que
 * estão na linha naquela hora, e é por isso que a refação só regrava a linha
 * de `news_editions`.
 */

type Linha = Record<string, unknown>;

async function identidade(st: { source_url?: string; title: string }): Promise<string> {
  const { gerarStoryId } = await import("../editorial/history");
  return gerarStoryId({ url: st.source_url || undefined, titulo: st.title });
}

/**
 * As fotos da edição pela identidade de cada história escrita.
 *
 * O contexto guarda a foto pela pauta; a história escrita tem outro título, e
 * o template procura pela identidade da história. As duas se encontram pela
 * URL da fonte, que é a mesma.
 */
async function fotosPelasHistorias(
  historias: Array<{ source_url?: string; title: string }>,
  pautas: PautaDoContexto[] | null,
  imagens: Record<string, string>,
  legendas: Record<string, string>,
): Promise<{ fotos: Map<string, string>; creditos: Map<string, string>; semFoto: string[] }> {
  const fotos = new Map<string, string>();
  const creditos = new Map<string, string>();
  const semFoto: string[] = [];
  for (const st of historias) {
    const id = await identidade(st);
    const daPauta = pautas?.find((p) => p.url && p.url === st.source_url)?.storyId;
    const chave = imagens[id] ? id : daPauta && imagens[daPauta] ? daPauta : null;
    if (!chave) {
      semFoto.push(st.title);
      continue;
    }
    fotos.set(id, imagens[chave]);
    if (legendas[chave]) creditos.set(id, legendas[chave]);
  }
  return { fotos, creditos, semFoto };
}

async function configDoParceiro(projeto: Project) {
  const { configDoVisaMatch } = await import("../newsroom/visamatch-na-edicao");
  const { cadenciaDoProjeto } = await import("../cadencia");
  return { ...configDoVisaMatch(projeto.settings), dias: cadenciaDoProjeto(projeto).newsletter.dias };
}

export async function reescreverNewsletter(
  e: {
    projeto: Project;
    data: string;
    pautas: PautaDoContexto[];
    pacotes: Record<string, PacoteFactual>;
    imagens: Record<string, string>;
    legendas: Record<string, string>;
    instrucao: string;
  },
  env: Record<string, string | undefined> = process.env,
  /** O modelo da redação e das auditorias (29/10/2026): no motor Claude, o Claude. Ver `mcp/newsletter/`. */
  modelo?: OpcoesDoPortao["modelo"],
): Promise<{ ok: true; edicao: Linha; html: string; avisos: string[] } | { ok: false; motivo: string }> {
  const { runNewsroomPipeline } = await import("../newsroom/pipeline");
  const { renderEditionToHtml, agendaDoBriefing } = await import("../newsroom/newsroom-service");
  const { formatarNumerosDaEdicao } = await import("../newsroom/numeros-editoriais");
  const { carregarConfigEditorial } = await import("../editorial/config");
  const { vozesDosRamos } = await import("../ramos/vozes");

  const projeto = e.projeto;
  const config = carregarConfigEditorial(env, projeto as { settings?: Record<string, unknown> | null });
  const vozes = await vozesDosRamos(projeto.id);
  const ranked: RankedCandidate[] = e.pautas.map((p, i) => ({
    group: pautaAvaliadaDoContexto(p).grupo,
    score: 100 - i,
    breakdown: { impact: 0, novelty: 0, utility: 0, credibility: 0 },
    reasoning: "refação da fila de aprovação, na ordem da edição",
  }));
  const pacotes = new Map<string, PacoteFactual>();
  for (const p of e.pautas) if (e.pacotes[p.storyId]) pacotes.set(p.url, e.pacotes[p.storyId]);

  const r = await runNewsroomPipeline(
    ranked,
    env,
    fetch,
    {
      nome: projeto.brand.displayName || projeto.name,
      nicho: projeto.niche,
      extra: [projeto.editorialPromptExtra ?? "", vozes.newsletter, agendaDoBriefing(e.data), e.instrucao]
        .filter(Boolean)
        .join("\n\n"),
      assinatura:
        String(projeto.settings?.final_line ?? "").trim() ||
        `Até amanhã. Equipe ${projeto.brand.displayName || projeto.name}.`,
    },
    { minimo: Math.max(2, config.minimoDePautas), maximo: e.pautas.length },
    pacotes,
    config.maximoDeReparos,
    // Como a redação com os ramos no comando: nota baixa vira aviso, alucinação bloqueia.
    0,
    { notaDeAviso: config.notaMinimaDeQA, ...(modelo ? { modelo } : {}) },
  );
  if (!r.aprovado) {
    return { ok: false, motivo: `a reescrita não passou nas conferências de fato: ${r.bloqueios.join(" | ")}` };
  }

  const edicao: EditionContent = formatarNumerosDaEdicao(r.edition);
  const { fotos, creditos, semFoto } = await fotosPelasHistorias(edicao.stories, e.pautas, e.imagens, e.legendas);
  if (semFoto.length) {
    return { ok: false, motivo: `a edição reescrita ficaria sem foto em ${semFoto.join(", ")}: pauta sem foto não vira conteúdo` };
  }
  const html = renderEditionToHtml(edicao, fotos, false, creditos, e.data, await configDoParceiro(projeto));
  const avisos = [
    ...r.avisos,
    ...r.pautasRemovidas.map((p) => `saiu da edição: ${p.titulo} (${p.motivo})`),
  ];
  return {
    ok: true,
    html,
    avisos,
    edicao: {
      ...edicao,
      qa_passed: r.qaResult.passed,
      qa_score: r.qaResult.score,
      qa_hallucination_risk: r.qaResult.hallucination_risk,
      qa_issues: r.qaResult.issues,
    },
  };
}

export async function renderizarNewsletter(e: {
  projeto: Project;
  data: string;
  edicao: Linha;
  pautas?: PautaDoContexto[];
  imagens: Record<string, string>;
  legendas: Record<string, string>;
}): Promise<string> {
  const { renderEditionToHtml } = await import("../newsroom/newsroom-service");
  const edicao = {
    subject: String(e.edicao.subject ?? ""),
    subject_options: Array.isArray(e.edicao.subject_options) ? e.edicao.subject_options : [],
    preheader: String(e.edicao.preheader ?? ""),
    headline: String(e.edicao.headline ?? ""),
    intro: String(e.edicao.intro ?? ""),
    stories: Array.isArray(e.edicao.stories) ? e.edicao.stories : [],
    quick_bits: Array.isArray(e.edicao.quick_bits) ? e.edicao.quick_bits : [],
    closing: String(e.edicao.closing ?? ""),
    final_line: String(e.edicao.final_line ?? ""),
  } as unknown as EditionContent;
  const { fotos, creditos } = await fotosPelasHistorias(edicao.stories, e.pautas ?? null, e.imagens, e.legendas);
  return renderEditionToHtml(edicao, fotos, false, creditos, e.data, await configDoParceiro(e.projeto));
}
