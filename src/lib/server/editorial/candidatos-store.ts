import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Classificacao } from "./classificador";
import type { PacoteFactual } from "./pacote-factual";
import type { Verificacao } from "./verificador";
import type { Motivo } from "./config";
// O erro inteiro do banco (code, details, hint, causa), e não só o `message`:
// em 06/10/2026 a falha da camada de candidatas não deixou texto nenhum.
import { textoDoErro } from "../texto-do-erro";

/**
 * A candidata editorial, persistida uma vez e lida por todos os canais.
 *
 * O motivo de existir está medido: a mesma candidata classificada três vezes
 * mudou de relevância em 64% dos casos e de decisão em 24%. Persistir não
 * melhora o sorteio, mas o faz uma vez só. Uma pauta que a newsletter
 * classificou de manhã chega ao Instagram à tarde com a MESMA leitura, e não
 * com outra que o modelo inventou no caminho.
 *
 * O segundo motivo é custo. Sem isto, cada canal reclassifica tudo.
 *
 * O que esta camada NÃO é: fila de publicação nem banco de notícias. Uma linha
 * é uma candidata processada. Quem publicou o quê mora em `editorial_history`,
 * que já tem `channel`, `story_id` e `origin_story_id`.
 */

/**
 * Os dez valores que o banco aceita em `news_candidates.status`.
 *
 * A lista está aqui e no CHECK do banco, e as duas precisam concordar. Gravar
 * um valor fora dela devolve 23514 do Postgres, que chega como falha genérica
 * de escrita no meio de uma rodada. A guarda abaixo transforma isso num erro
 * de programação, que aparece no teste em vez de aparecer em produção.
 */
export const STATUS_DE_CANDIDATA = [
  "collected",
  "classified",
  "approved",
  "selected",
  "rejected",
  "capped",
  "duplicate",
  "filtered",
  "too_old",
  "already_published",
] as const;

export type StatusDeCandidata = (typeof STATUS_DE_CANDIDATA)[number];

/**
 * O estado que pertence à NOTÍCIA, e não a um canal.
 *
 * `selected` e `capped` continuam no CHECK do banco por compatibilidade, e o
 * pipeline novo não escreve nenhum dos dois. O motivo é um caso concreto: uma
 * pauta aprovada que a newsletter cortou por composição fica `capped`, e o
 * Instagram, que tem outra composição e dez vagas, deveria poder publicá-la.
 * Se `capped` for o estado global da candidata, uma decisão de arrumação do
 * e-mail vira veredicto sobre a notícia.
 *
 * O mesmo vale para o outro lado: `selected` na newsletter de manhã não pode
 * significar "gasta" para o feed da tarde, que é justamente o reaproveitamento
 * planejado entre canais.
 *
 * Quem publicou o quê mora onde a decisão foi tomada: `editorial_history` para
 * a newsletter, `social_posts` para o Instagram. Os dois já são por canal.
 */
export const STATUS_INTRINSECO = [
  "collected",
  "classified",
  "approved",
  "rejected",
  "duplicate",
  "filtered",
  "too_old",
  "already_published",
] as const;

export type StatusIntrinseco = (typeof STATUS_INTRINSECO)[number];

const ONDE_MORA_O_ESTADO_DE_CANAL: Record<string, string> = {
  selected: "editorial_history (newsletter) ou social_posts (Instagram)",
  capped: "a composição do canal, que não persiste veredicto sobre a notícia",
};

/**
 * Guarda do pipeline novo: só estado intrínseco.
 *
 * Separada de `garantirStatus` de propósito. Aquela responde "o banco aceita
 * este valor"; esta responde "este valor descreve a notícia, e não o que um
 * canal decidiu com ela".
 */
export function garantirStatusIntrinseco(valor: string): StatusIntrinseco {
  if ((STATUS_INTRINSECO as readonly string[]).includes(valor)) {
    return valor as StatusIntrinseco;
  }

  const onde = ONDE_MORA_O_ESTADO_DE_CANAL[valor];
  if (onde) {
    throw new Error(
      `"${valor}" é decisão de canal, não estado da candidata. Isso mora em ${onde}. ` +
        `Uma pauta cortada da newsletter continua elegível para o Instagram.`,
    );
  }

  return garantirStatus(valor) as StatusIntrinseco;
}

/**
 * A versão da leitura editorial, para a classificação não congelar para sempre.
 *
 * Não sobrescrever classificação persistida resolve o churn e cria outro
 * problema: trocar o prompt, o modelo ou a régua editorial não teria efeito
 * nenhum sobre o que já foi classificado, e o sistema seguiria decidindo com
 * uma leitura que ninguém mais concorda.
 *
 * São três partes, e duas se cuidam sozinhas. O modelo vem do ambiente. O
 * `promptHash` é derivado do próprio texto do prompt, então mexer no prompt
 * invalida a classificação antiga sem depender de alguém lembrar de anunciar
 * a mudança. O número abaixo é o que sobra: mudança de regra ou de schema que
 * não passa pelo texto do prompt.
 */
export const VERSAO_DA_CLASSIFICACAO = 2;

/*
 * 1 -> 2, em 2026-09-06: o classificador passou a ler 2500 caracteres da
 * matéria em vez de 600 (ver `LIMITE_DO_RESUMO`). Não é mudança de prompt, é
 * mudança do que o prompt carrega, então o `promptHash` não a percebe. Sem
 * subir este número, toda classificação já persistida continuaria valendo e a
 * correção não teria efeito nenhum sobre o acervo: exatamente o cenário que o
 * comentário acima descreve.
 */

export type AssinaturaDoClassificador = {
  versao: number;
  modelo: string;
  promptHash: string;
};

export function assinaturaDoClassificador(
  textoDoPrompt: string,
  env: Record<string, string | undefined> = process.env,
): AssinaturaDoClassificador {
  return {
    versao: VERSAO_DA_CLASSIFICACAO,
    modelo: (env.OPENAI_MODEL_TRIAGE || env.OPENAI_MODEL_EDITOR || "desconhecido").trim(),
    promptHash: createHash("sha1").update(textoDoPrompt).digest("hex").slice(0, 12),
  };
}

/**
 * A classificação guardada ainda serve?
 *
 * Serve enquanto foi feita pela mesma leitura editorial. Divergiu qualquer uma
 * das três partes, a candidata volta a ser elegível para reclassificação. Isso
 * NÃO reclassifica nada sozinho: só deixa de reaproveitar.
 */
export function classificacaoAindaVale(
  candidata: Pick<CandidataPersistida, "classificacao" | "assinatura">,
  atual: AssinaturaDoClassificador,
): boolean {
  if (!candidata.classificacao) return false;

  const a = candidata.assinatura;
  if (!a) return false;

  return a.versao === atual.versao && a.modelo === atual.modelo && a.promptHash === atual.promptHash;
}

/**
 * A impressão do que foi verificado.
 *
 * O prazo de 24h é bom cache e péssima garantia sozinho: se o pacote factual
 * foi enriquecido depois, a verificação anterior julgou outro texto, e o
 * relógio não sabe disso. O hash sabe.
 */
export function hashDaVerificacao(entrada: {
  titulo: string;
  fonte: string;
  contexto: string;
  classificacao?: { pais: string; leitura: string; eixo: string; relevancia: number } | null;
  /**
   * Impressão da instrução do verificador. Sem ela, a régua mudava e o veredito
   * dado pela régua anterior continuava sendo reaproveitado até o prazo vencer,
   * que foi o que aconteceu com as recusas da régua de imigração em 29/09. É o
   * mesmo papel do `promptHash` na assinatura do classificador.
   */
  regua?: string;
}): string {
  const c = entrada.classificacao;
  const material = JSON.stringify({
    r: entrada.regua ?? null,
    t: entrada.titulo.trim(),
    f: entrada.fonte.trim(),
    // O texto inteiro, porque enriquecer no fim da matéria também muda o que
    // o verificador leu.
    x: entrada.contexto.trim(),
    c: c ? [c.pais, c.leitura, c.eixo, Math.round(c.relevancia)] : null,
  });

  return createHash("sha1").update(material).digest("hex").slice(0, 16);
}

/**
 * Conceitos que NÃO são status, e onde eles moram.
 *
 * `verified`, `conflict`, `editorial_approved`, `used_newsletter` e
 * `used_social` chegaram a ser pensados como status e não são. Os dois
 * primeiros são resultado da verificação, que é outra dimensão: uma candidata
 * `approved` com verificação em conflito continua aprovada na linha editorial
 * e bloqueada para publicar. Os dois últimos já existem em
 * `editorial_history`, indexados por canal, e duplicá-los aqui criaria duas
 * fontes de verdade sobre o que foi publicado.
 */
export const NAO_SAO_STATUS: Record<string, string> = {
  verified: "metadata_json.verificacao.status = 'confirm'",
  conflict: "metadata_json.verificacao.status = 'conflict'",
  editorial_approved: "status = 'approved'",
  used_newsletter: "editorial_history com channel = 'newsletter'",
  used_social: "editorial_history com channel = 'instagram'",
};

export function garantirStatus(valor: string): StatusDeCandidata {
  if ((STATUS_DE_CANDIDATA as readonly string[]).includes(valor)) {
    return valor as StatusDeCandidata;
  }

  const onde = NAO_SAO_STATUS[valor];
  throw new Error(
    `"${valor}" não é um status de candidata.` +
      (onde ? ` Este conceito mora em ${onde}.` : ` Os aceitos são: ${STATUS_DE_CANDIDATA.join(", ")}.`),
  );
}

export type VerificacaoPersistida = {
  status: "confirm" | "reject" | "conflict";
  motivo: string;
  divergencias: Array<{ campo: string; primaria: string; verificacao: string; material: boolean }>;
  verificadoEm: string;
  /** Que canal pagou pela verificação. O outro reaproveita. */
  canal: string;
  /** Impressão do texto que foi verificado. Ver `hashDaVerificacao`. */
  inputHash: string;
};

export type CandidataPersistida = {
  id: string;
  projectId: string;
  storyId: string;
  url: string;
  canonicalUrl: string | null;
  sourceDomain: string | null;
  sourceKey: string | null;
  title: string;
  summary: string;
  status: StatusDeCandidata;
  classificacao: Classificacao | null;
  classificationStatus: string;
  classifiedAt: string | null;
  eventFingerprint: string | null;
  topicId: string | null;
  editorialScore: number | null;
  decisionReason: string | null;
  sourceResolved: boolean;
  enrichmentStatus: string;
  factualPackage: PacoteFactual | null;
  embedding: number[] | null;
  verificacao: VerificacaoPersistida | null;
  /** Com que leitura editorial esta candidata foi classificada. */
  assinatura: AssinaturaDoClassificador | null;
};

const COLUNAS =
  "id,project_id,story_id,url,canonical_url,source_domain,source_key,title,summary,status," +
  "country,is_immigration,editorial_reading,editorial_axis,event_nature,relevance,actors,places," +
  "organizations,event_terms,event_fingerprint,topic_id,editorial_score,decision_reason," +
  "classification_status,classified_at,enrichment_status,enriched_chars,source_resolved," +
  "factual_package,embedding,embedding_model,metadata_json";

type Linha = Record<string, unknown>;

function daLinha(l: Linha): CandidataPersistida {
  const meta = (l.metadata_json ?? {}) as Record<string, unknown>;
  const classificado = l.classification_status === "done";

  return {
    id: String(l.id),
    projectId: String(l.project_id ?? ""),
    storyId: String(l.story_id ?? ""),
    url: String(l.url ?? ""),
    canonicalUrl: (l.canonical_url as string | null) ?? null,
    sourceDomain: (l.source_domain as string | null) ?? null,
    sourceKey: (l.source_key as string | null) ?? null,
    title: String(l.title ?? ""),
    summary: String(l.summary ?? ""),
    status: (l.status as StatusDeCandidata) ?? "collected",
    classificacao: classificado
      ? ({
          id: String(l.id),
          pais: l.country,
          imigracao: l.is_immigration,
          leitura: l.editorial_reading,
          eixo: l.editorial_axis,
          natureza: l.event_nature,
          relevancia: Number(l.relevance ?? 0),
          atores: (l.actors as string[]) ?? [],
          lugares: (l.places as string[]) ?? [],
          acontecimento: (l.event_terms as string[]) ?? [],
          justificativa: String((meta.justificativa as string) ?? ""),
        } as unknown as Classificacao)
      : null,
    classificationStatus: String(l.classification_status ?? "pending"),
    classifiedAt: (l.classified_at as string | null) ?? null,
    eventFingerprint: (l.event_fingerprint as string | null) ?? null,
    topicId: (l.topic_id as string | null) ?? null,
    editorialScore: l.editorial_score === null || l.editorial_score === undefined ? null : Number(l.editorial_score),
    decisionReason: (l.decision_reason as string | null) ?? null,
    sourceResolved: Boolean(l.source_resolved),
    enrichmentStatus: String(l.enrichment_status ?? "pending"),
    factualPackage: (l.factual_package as PacoteFactual | null) ?? null,
    embedding: (l.embedding as number[] | null) ?? null,
    verificacao: (meta.verificacao as VerificacaoPersistida | null) ?? null,
    assinatura: (meta.assinatura as AssinaturaDoClassificador | null) ?? null,
  };
}

export type CandidataParaGravar = {
  storyId: string;
  url: string;
  canonicalUrl?: string;
  sourceDomain?: string;
  sourceKey?: string;
  title: string;
  summary?: string;
  publishedAt: string;
  status: StatusDeCandidata;
  classificacao?: Classificacao | null;
  eventFingerprint?: string | null;
  topicId?: string | null;
  editorialScore?: number | null;
  decisionReason?: Motivo | string | null;
  sourceResolved?: boolean;
  enrichmentStatus?: string;
  enrichedChars?: number;
  factualPackage?: PacoteFactual | null;
  embedding?: number[] | null;
  embeddingModel?: string | null;
  /** Com que leitura editorial esta classificação foi feita. */
  assinatura?: AssinaturaDoClassificador | null;
  metadata?: Record<string, unknown>;
};

function paraLinha(projectId: string, c: CandidataParaGravar): Linha {
  const cl = c.classificacao;

  return {
    project_id: projectId,
    story_id: c.storyId,
    url: c.url,
    canonical_url: c.canonicalUrl ?? null,
    source_domain: c.sourceDomain ?? null,
    source_key: c.sourceKey ?? null,
    title: c.title.slice(0, 500),
    summary: (c.summary ?? "").slice(0, 4000),
    source_name: c.sourceDomain ?? "desconhecida",
    published_at: c.publishedAt,
    status: garantirStatusIntrinseco(c.status),

    country: cl?.pais ?? null,
    is_immigration: cl?.imigracao ?? null,
    editorial_reading: cl?.leitura ?? null,
    editorial_axis: cl?.eixo ?? null,
    event_nature: cl?.natureza ?? null,
    relevance: cl?.relevancia ?? null,
    actors: cl?.atores ?? [],
    places: cl?.lugares ?? [],
    organizations: [],
    event_terms: cl?.acontecimento ?? [],

    event_fingerprint: c.eventFingerprint ?? null,
    topic_id: c.topicId ?? null,
    editorial_score: c.editorialScore ?? null,
    decision_reason: c.decisionReason ?? null,

    classification_status: cl ? "done" : "pending",
    classified_at: cl ? new Date().toISOString() : null,
    enrichment_status: c.enrichmentStatus ?? "pending",
    enriched_chars: c.enrichedChars ?? 0,
    source_resolved: c.sourceResolved ?? false,

    factual_package: c.factualPackage ?? null,
    embedding: c.embedding ?? null,
    embedding_model: c.embeddingModel ?? null,
    metadata_json: {
      ...(c.metadata ?? {}),
      ...(cl?.justificativa ? { justificativa: cl.justificativa } : {}),
      ...(c.assinatura ? { assinatura: c.assinatura } : {}),
    },
    updated_at: new Date().toISOString(),
  };
}

export type ResultadoDaGravacao = {
  gravadas: number;
  reaproveitadas: number;
  /** URLs que já existiam com classificação e não foram tocadas. */
  jaClassificadas: string[];
  erros: string[];
};

export type CandidatosStore = {
  /** O que já existe, indexado por URL. Base do reuso e da idempotência. */
  buscarPorUrls(projectId: string, urls: string[]): Promise<Map<string, CandidataPersistida>>;
  /** As candidatas recentes do projeto, indexadas por URL. */
  buscarDaJanela(projectId: string, dias: number): Promise<Map<string, CandidataPersistida>>;
  /** O que já existe, indexado por story_id. Base do reuso entre canais. */
  buscarPorStoryIds(projectId: string, storyIds: string[]): Promise<Map<string, CandidataPersistida>>;
  /** Grava só o que ainda não existe. Nunca sobrescreve classificação. */
  gravarNovas(projectId: string, candidatas: CandidataParaGravar[]): Promise<ResultadoDaGravacao>;
  /** Muda o status e o motivo de linhas já gravadas. */
  atualizarStatus(ids: string[], status: StatusDeCandidata, motivo?: string): Promise<void>;
  /** Guarda o resultado da verificação de finalista, para o outro canal reusar. */
  gravarVerificacao(id: string, v: VerificacaoPersistida): Promise<void>;
};

export function criarCandidatosStore(client: SupabaseClient): CandidatosStore {
  return {
    async buscarPorUrls(projectId, urls) {
      const mapa = new Map<string, CandidataPersistida>();
      if (urls.length === 0) return mapa;

      // Lotes porque a URL vai na query string, e ela tem teto.
      for (let i = 0; i < urls.length; i += 50) {
        const lote = urls.slice(i, i + 50);
        const { data, error } = await client
          .from("news_candidates")
          .select(COLUNAS)
          .eq("project_id", projectId)
          .in("url", lote);

        if (error) throw new Error(`Candidatas, leitura por URL falhou: ${textoDoErro(error)}`);
        for (const l of (data ?? []) as unknown as Linha[]) mapa.set(String(l.url), daLinha(l));
      }

      return mapa;
    },

    /*
     * A leitura da janela existe porque a leitura por URL não sobreviveu à
     * produção.
     *
     * `in("url", [...])` monta a lista inteira na query string, e URL de
     * notícia é longa: cinquenta delas passam de dez mil caracteres. No meu
     * ambiente funcionou; no contêiner a chamada morreu com "TypeError: fetch
     * failed" nas duas tentativas, leitura e gravação, e a persistência ficou
     * degradada sem que nada mais quebrasse.
     *
     * Buscar a janela do projeto e casar por URL em memória resolve a causa em
     * vez do sintoma: a query fica curta e constante, não importa quantas
     * candidatas o dia tenha.
     */
    async buscarDaJanela(projectId, dias) {
      const mapa = new Map<string, CandidataPersistida>();
      const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

      const PAGINA = 500;
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await client
          .from("news_candidates")
          .select(COLUNAS)
          .eq("project_id", projectId)
          .gte("published_at", desde)
          .order("published_at", { ascending: false })
          .range(inicio, inicio + PAGINA - 1);

        if (error) throw new Error(`Candidatas, leitura da janela falhou: ${textoDoErro(error)}`);

        const linhas = (data ?? []) as unknown as Linha[];
        for (const l of linhas) mapa.set(String(l.url), daLinha(l));

        if (linhas.length < PAGINA) break;
      }

      return mapa;
    },

    async buscarPorStoryIds(projectId, storyIds) {
      const mapa = new Map<string, CandidataPersistida>();
      if (storyIds.length === 0) return mapa;

      for (let i = 0; i < storyIds.length; i += 50) {
        const lote = storyIds.slice(i, i + 50);
        const { data, error } = await client
          .from("news_candidates")
          .select(COLUNAS)
          .eq("project_id", projectId)
          .in("story_id", lote);

        if (error) throw new Error(`Candidatas, leitura por story_id falhou: ${textoDoErro(error)}`);
        for (const l of (data ?? []) as unknown as Linha[]) mapa.set(String(l.story_id), daLinha(l));
      }

      return mapa;
    },

    async gravarNovas(projectId, candidatas) {
      const resultado: ResultadoDaGravacao = { gravadas: 0, reaproveitadas: 0, jaClassificadas: [], erros: [] };
      if (candidatas.length === 0) return resultado;

      const existentes = await this.buscarDaJanela(projectId, 45);

      /*
       * Classificação persistida não é sobrescrita.
       *
       * Uma segunda execução do modelo sobre a mesma matéria devolve outra
       * relevância em dois terços das vezes. Deixar a última resposta vencer
       * faria a pauta entrar e sair da edição conforme a hora em que o cron
       * rodou, e nenhuma das duas respostas é mais correta que a outra.
       */
      /*
       * A exceção é a linha gravada SEM classificação (13/10/2026). Ela não
       * tem resposta do modelo para preservar: é o registro de que a
       * classificação falhou. A cota da OpenAI acabou no meio da produção,
       * 1.134 candidatas foram gravadas como `REJECT_UNCLASSIFIED`, e como
       * nada regravava a linha, o post lia "rejected" e descartava a pauta
       * que a rodada seguinte classificou e o verificador confirmou. Quando a
       * classificação chega, ela completa a linha; a verificação já gravada
       * fica.
       */
      const paraCompletar: Array<{ anterior: CandidataPersistida; nova: CandidataParaGravar }> = [];
      const novas = candidatas.filter((c) => {
        const anterior = existentes.get(c.url);
        if (!anterior) return true;

        if (anterior.classificationStatus !== "done" && c.classificacao) {
          paraCompletar.push({ anterior, nova: c });
          return false;
        }

        resultado.reaproveitadas += 1;
        if (anterior.classificationStatus === "done") resultado.jaClassificadas.push(c.url);
        return false;
      });

      for (const { anterior, nova } of paraCompletar) {
        const linha = paraLinha(projectId, nova);
        const metadata = {
          ...(linha.metadata_json as Record<string, unknown>),
          ...(anterior.verificacao ? { verificacao: anterior.verificacao } : {}),
        };
        const { error } = await client
          .from("news_candidates")
          .update({ ...linha, metadata_json: metadata, updated_at: new Date().toISOString() })
          .eq("id", anterior.id);

        if (error) resultado.erros.push(`candidata sem classificação, ${nova.url}: ${textoDoErro(error)}`);
        else resultado.gravadas += 1;
      }

      if (novas.length === 0) return resultado;

      for (let i = 0; i < novas.length; i += 100) {
        const lote = novas.slice(i, i + 100);
        const { error } = await client
          .from("news_candidates")
          .upsert(lote.map((c) => paraLinha(projectId, c)), {
            onConflict: "project_id,url",
            // Corrida entre duas execuções não pode virar erro nem
            // sobrescrita: quem chegou primeiro fica.
            ignoreDuplicates: true,
          });

        if (error) resultado.erros.push(`gravação de candidatas, lote ${i / 100 + 1}: ${textoDoErro(error)}`);
        else resultado.gravadas += lote.length;
      }

      return resultado;
    },

    async atualizarStatus(ids, status, motivo) {
      if (ids.length === 0) return;
      const valor = garantirStatus(status);

      const campos: Record<string, unknown> = { status: valor, updated_at: new Date().toISOString() };
      if (motivo !== undefined) campos.decision_reason = motivo;

      const { error } = await client.from("news_candidates").update(campos).in("id", ids);
      if (error) throw new Error(`Candidatas, atualização de status falhou: ${textoDoErro(error)}`);
    },

    async gravarVerificacao(id, v) {
      const { data, error: erroLeitura } = await client
        .from("news_candidates")
        .select("metadata_json")
        .eq("id", id)
        .single();

      if (erroLeitura) throw new Error(`Candidatas, leitura antes da verificação falhou: ${erroLeitura.message}`);

      const meta = ((data as { metadata_json?: Record<string, unknown> } | null)?.metadata_json ?? {}) as Record<string, unknown>;

      const { error } = await client
        .from("news_candidates")
        .update({ metadata_json: { ...meta, verificacao: v }, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw new Error(`Candidatas, gravação da verificação falhou: ${textoDoErro(error)}`);
    },
  };
}

/**
 * A verificação vale para outro canal?
 *
 * Duas condições, e a segunda é a que importa. O prazo é cache: uma pauta
 * verificada há duas semanas pode ter sido superada pelos fatos. O hash é
 * correção: se o pacote factual foi enriquecido depois da verificação, a
 * leitura anterior julgou OUTRO texto, e o relógio não sabe disso. Reaproveitar
 * ali não seria economia, seria publicar com base numa conferência que nunca
 * viu o material publicado.
 */
export function verificacaoAindaVale(
  v: VerificacaoPersistida | null,
  hashAtual: string,
  horas = 24,
): boolean {
  if (!v?.verificadoEm) return false;
  if (!v.inputHash || v.inputHash !== hashAtual) return false;

  const quando = new Date(v.verificadoEm).getTime();
  if (Number.isNaN(quando)) return false;
  return Date.now() - quando <= horas * 60 * 60 * 1000;
}

/**
 * Esta candidata pode ser publicada?
 *
 * `status = approved` diz que ela passou nos critérios duros. Não diz que a
 * conferência de finalista aprovou, e são coisas diferentes: uma candidata em
 * conflito continua aprovada na linha editorial e não pode ir ao ar. Nenhuma
 * função de composição deve olhar só o status, e é para isso que esta existe.
 *
 * Candidata que ainda não chegou ao estágio de verificação devolve `false` com
 * o motivo, e não `true` por omissão: não ter sido conferida não é o mesmo que
 * ter passado.
 */
export function podePublicar(
  candidata: Pick<CandidataPersistida, "status" | "verificacao">,
): { pode: boolean; motivo: string } {
  if (candidata.status !== "approved") {
    return { pode: false, motivo: `status é "${candidata.status}", e só "approved" concorre` };
  }

  const v = candidata.verificacao;
  if (!v) return { pode: false, motivo: "ainda não passou pela verificação de finalista" };

  if (v.status === "confirm") return { pode: true, motivo: "aprovada e verificada" };

  return {
    pode: false,
    motivo: v.status === "conflict"
      ? `EDITORIAL_CLASSIFICATION_CONFLICT: ${v.motivo}`
      : `a verificação recusou: ${v.motivo}`,
  };
}

/** Converte o veredicto do verificador para o formato persistido. */
export function paraPersistir(v: Verificacao, canal: string, inputHash: string): VerificacaoPersistida {
  return {
    status: v.veredicto === "review" ? "conflict" : v.veredicto,
    motivo: v.motivo,
    divergencias: v.divergencias,
    verificadoEm: new Date().toISOString(),
    canal,
    inputHash,
  };
}
