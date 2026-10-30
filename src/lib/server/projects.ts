import { getSupabaseAdminClient } from "./supabase-admin";
import { LeituraFalhou, comRetentativa } from "./leitura";
import type { NewsSourceConfig, NewsSourceType } from "./newsroom/news-sources";

/**
 * Projetos da plataforma.
 *
 * Cada projeto é uma marca operando num segmento: tem suas fontes de conteúdo,
 * sua identidade visual, sua conta de publicação e seu horário de disparo. O
 * conteúdo é isolado por `project_id` em todas as tabelas.
 */

/** Projeto semente, criado na migração com o conteúdo que já existia. */
export const DEFAULT_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_PROJECT_SLUG = "euajournal";

/** Slugs antigos que ainda abrem o projeto: o link guardado de antes da troca de nome (29/10/2026). */
const SLUGS_ANTIGOS: Record<string, string> = { desbuguei: "euajournal" };

export type Project = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "paused" | "archived";
  niche: string;
  contentLanguage: string;
  timezone: string;
  siteUrl: string | null;
  brand: {
    displayName: string;
    tagline: string;
    primaryColor: string;
    logoUrl: string | null;
    socialLinks: Record<string, string>;
  };
  newsletterFromName: string;
  publishHourLocal: number;
  publishMinuteLocal: number;
  editorialPromptExtra: string;
  settings: Record<string, unknown>;
};

export type ProjectCredentialProvider = "instagram" | "listmonk" | "openai" | "chatbotx";

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  status: Project["status"];
  niche: string;
  content_language: string;
  timezone: string;
  site_url: string | null;
  brand_display_name: string;
  brand_tagline: string;
  brand_primary_color: string;
  brand_logo_url: string | null;
  brand_social_links: Record<string, string> | null;
  newsletter_from_name: string;
  publish_hour_local: number;
  publish_minute_local: number;
  editorial_prompt_extra: string;
  settings: Record<string, unknown> | null;
};

const PROJECT_COLUMNS =
  "id, slug, name, status, niche, content_language, timezone, site_url, " +
  "brand_display_name, brand_tagline, brand_primary_color, brand_logo_url, " +
  "brand_social_links, newsletter_from_name, publish_hour_local, " +
  "publish_minute_local, editorial_prompt_extra, settings";

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    niche: row.niche,
    contentLanguage: row.content_language,
    timezone: row.timezone,
    siteUrl: row.site_url,
    brand: {
      displayName: row.brand_display_name,
      tagline: row.brand_tagline,
      primaryColor: row.brand_primary_color,
      logoUrl: row.brand_logo_url,
      socialLinks: row.brand_social_links ?? {},
    },
    newsletterFromName: row.newsletter_from_name,
    publishHourLocal: row.publish_hour_local,
    publishMinuteLocal: row.publish_minute_local,
    editorialPromptExtra: row.editorial_prompt_extra,
    settings: row.settings ?? {},
  };
}

/**
 * Leitura do banco que falhou NÃO é projeto ausente.
 *
 * Em 13/09/2026 o ciclo do dia morreu sete segundos depois de começar, com
 * "Projeto 00000000-...-000000000001 não encontrado". O projeto existia e
 * estava ativo. O que aconteceu foi um erro de leitura do Supabase, que a noite
 * inteira vinha dando `Gateway Timeout` intermitente, colapsado num `null` por
 * um `if (error || !data)`.
 *
 * Os dois casos pedem reações opostas: projeto ausente é configuração errada e
 * ninguém deve tentar de novo; leitura falhou é infraestrutura e tentar de novo
 * resolve. Chamar o segundo de primeiro custou um dia inteiro de publicação e
 * mandou procurar o defeito no lugar errado.
 */
export class LeituraDoProjetoFalhou extends LeituraFalhou {}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new LeituraDoProjetoFalhou(`Projeto ${projectId}, leitura falhou: ${error.message}`);
  if (!data) return null;
  return toProject(data as unknown as ProjectRow);
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("slug", SLUGS_ANTIGOS[slug] ?? slug)
    .maybeSingle();

  if (error) throw new LeituraDoProjetoFalhou(`Projeto ${slug}, leitura falhou: ${error.message}`);
  if (!data) return null;
  return toProject(data as unknown as ProjectRow);
}

export async function listProjects(onlyActive = false): Promise<Project[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("projects").select(PROJECT_COLUMNS).order("name");
  if (onlyActive) query = query.eq("status", "active");

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as ProjectRow[]).map(toProject);
}

/**
 * Carrega o projeto e falha se ele não existir ou estiver parado. Rodar um
 * pipeline sobre um projeto inexistente gravaria conteúdo órfão.
 */
export async function requireActiveProject(projectId: string): Promise<Project> {
  /*
   * Uma segunda tentativa, e só para falha de leitura.
   *
   * Esta é a PRIMEIRA coisa que o ciclo diário faz, e um soluço de rede aqui
   * custa o dia inteiro: nem newsletter, nem artigo, nem post. Duas tentativas
   * com uma pausa curta cobrem o timeout intermitente sem esconder indisponibi-
   * lidade real, porque a segunda falha sobe como erro de leitura, com o motivo.
   *
   * Projeto ausente NÃO é tentado de novo: a resposta seria a mesma, e insistir
   * só atrasaria o alerta de uma configuração errada.
   */
  const project = await comRetentativa(`projeto ${projectId}`, () => getProjectById(projectId));

  if (!project) {
    throw new Error(`Projeto ${projectId} não encontrado.`);
  }
  if (project.status !== "active") {
    throw new Error(`Projeto ${project.slug} está com status "${project.status}" e não publica.`);
  }

  return project;
}

/** Fontes de conteúdo configuradas para o projeto, no formato do coletor. */
export async function getProjectNewsSources(projectId: string): Promise<NewsSourceConfig[]> {
  /*
   * A segunda leitura do ciclo, e a que derrubou 14/09.
   *
   * Falha de leitura é relida; "nenhuma fonte habilitada" não, porque é
   * configuração e a resposta seria a mesma. Foi exatamente essa distinção que
   * faltava aqui.
   */
  const data = await comRetentativa(`fontes do projeto ${projectId}`, async () => {
    const supabase = getSupabaseAdminClient();
    const r = await supabase
      .from("project_news_sources")
      .select("source_key, name, company_name, type, url, enabled, priority, category, region, keywords")
      .eq("project_id", projectId)
      .eq("enabled", true)
      .order("priority");

    if (r.error) throw new LeituraFalhou(`Falha ao carregar fontes do projeto: ${r.error.message}`);
    return r.data;
  });

  if (!data || data.length === 0) {
    throw new Error(
      `Projeto ${projectId} não tem nenhuma fonte de conteúdo habilitada. Configure em project_news_sources.`,
    );
  }

  return data.map((row) => ({
    id: row.source_key as string,
    name: row.name as string,
    companyName: (row.company_name as string | null) ?? undefined,
    type: row.type as NewsSourceType,
    url: row.url as string,
    enabled: row.enabled as boolean,
    priority: row.priority as 1 | 2,
    category: row.category as NewsSourceConfig["category"],
    region: row.region as NewsSourceConfig["region"],
    keywords: (row.keywords as string[] | null) ?? [],
  }));
}

/**
 * Credenciais do projeto para um provedor. Devolve `null` quando não há
 * registro — quem chama decide se isso é erro.
 */
export async function getProjectCredentials(
  projectId: string,
  provider: ProjectCredentialProvider,
): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("project_credentials")
    .select("config, expires_at")
    .eq("project_id", projectId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) return null;

  if (data.expires_at && new Date(data.expires_at as string).getTime() <= Date.now()) {
    console.warn(`[PROJECT] Credencial ${provider} do projeto ${projectId} está vencida.`);
  }

  return (data.config as Record<string, unknown>) ?? null;
}

/**
 * Grava/atualiza a credencial de um provedor. Usado pelo cron de renovação do
 * token da Meta pra persistir o token novo e a data de expiração.
 */
export async function upsertProjectCredentials(
  projectId: string,
  provider: ProjectCredentialProvider,
  config: Record<string, unknown>,
  expiresAt?: string | null,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("project_credentials").upsert(
    {
      project_id: projectId,
      provider,
      config,
      expires_at: expiresAt ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,provider" },
  );

  if (error) {
    throw new Error(`Falha ao gravar credencial ${provider}: ${error.message}`);
  }
}

/**
 * Data corrente no fuso do projeto, no formato AAAA-MM-DD.
 *
 * O pipeline usava `new Date().toISOString()`, que é UTC: qualquer execução
 * depois das 21h no Brasil era gravada com a data do dia seguinte.
 */
export function projectToday(project: Pick<Project, "timezone">, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: project.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
