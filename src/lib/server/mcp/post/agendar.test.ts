import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import { tarefasEmMemoria } from "../tarefas-store";
import { agendarPost, montarPost, type DepsDoAgendamento } from "./agendar";
import type { MaterialDaEscrita, ResultadoDaEscrita } from "./fluxo";

const PACOTE = {
  verified_facts: ["O USCIS ampliou o prazo de renovação automática da permissão de trabalho de 180 para 540 dias."],
  people: [],
  organizations: ["USCIS"],
  places: [],
  dates: [],
  numbers: ["540 dias", "180 dias"],
  gaps: [],
  source_urls: ["https://www.uscis.gov/a"],
  texto_de_origem: "O USCIS informou que o prazo de renovação automática da permissão de trabalho passa de 180 para 540 dias.",
};

const MATERIAL: MaterialDaEscrita = {
  versao: 1,
  data: "2026-10-28",
  origem: { projectId: "fonte", postId: "antigo" },
  pauta: {
    storyId: "s1",
    titulo: "USCIS amplia prazo do EAD",
    url: "https://www.uscis.gov/a",
    fonteNome: "USCIS",
    publicadoEm: "2026-10-27T12:00:00Z",
    resumo: PACOTE.texto_de_origem,
    categoria: "politica",
    eixo: "politica",
    pais: "EUA",
    atores: ["USCIS"],
    lugares: [],
    acontecimento: [],
  },
  pacote: PACOTE,
  visual: { imageUrl: "https://exemplo.test/foto.jpg", author: "Fulano de Tal", attribution: "Foto: Fulano de Tal" },
  candidateId: "c1",
  posicao: 2,
  keyword: "",
  hashtags: false,
};

const COPY = {
  headline: "USCIS amplia prazo do EAD para 540 dias",
  destaque: "540 dias",
  gancho: "O USCIS ampliou o prazo de renovação automática da permissão de trabalho de 180 para 540 dias.",
  paragrafos: [],
  fato_principal: "",
  contexto: "",
  informacao_util: "",
  ressalva: "",
  cta: "",
  hashtags: [],
};

const CONFIRMADA = {
  id: "c1",
  status: "approved",
  verificacao: { status: "confirm", motivo: "ok", divergencias: [], verificadoEm: "2026-10-27T00:00:00Z", canal: "instagram", inputHash: "h" },
} as unknown as CandidataPersistida;

function projeto(capacidades: Record<string, string>): Project {
  return {
    id: "p1",
    slug: "teste-claude",
    timezone: "America/Sao_Paulo",
    settings: { motor: "claude_mcp", capacidades },
  } as unknown as Project;
}

async function deps(pronto: boolean): Promise<DepsDoAgendamento> {
  const tarefas = tarefasEmMemoria();
  const t = await tarefas.abrir({
    projectId: "p1", editionDate: "2026-10-28", tipo: "escrever_post", chave: "s1",
    instrucao: {}, material: MATERIAL, esquema: {},
  });
  await tarefas.entregar(t.id, { copy: COPY, reparos: 0 } satisfies ResultadoDaEscrita, "x");
  if (pronto) await tarefas.anotar(t.id, { copy: COPY, reparos: 0, pronto: { auditoria: "a", em: "agora" } } satisfies ResultadoDaEscrita);
  return {
    client: {} as SupabaseClient,
    tarefas,
    candidata: async () => CONFIRMADA,
    env: { VISUAL_RESOLVER_V2: "enforce", SOCIAL_V2_ENFORCE_LIBERADO: "true" },
    renderizar: async () => [{ jpeg: Buffer.from("JPEG") }] as never,
  };
}

describe("montar e agendar o post do Claude", () => {
  it("só monta o post que passou pela auditoria e pela guarda", async () => {
    const r = await montarPost(projeto({}), { storyId: "s1", data: "2026-10-28" }, await deps(false));
    expect(r).toMatchObject({ ok: false });
  });

  it("a prévia traz a peça e a legenda com o crédito curto da foto", async () => {
    const r = await montarPost(projeto({}), { storyId: "s1", data: "2026-10-28" }, await deps(true));
    if (!r.ok) throw new Error(r.error);
    expect(r.png.toString()).toBe("JPEG");
    expect(r.manchete).toBe(COPY.headline);
    expect(r.legenda).toContain("Fulano de Tal");
  });

  it("sem a fila em enforce, nada é agendado", async () => {
    const r = await agendarPost(projeto({ social: "enforce", aprovacao: "dry_run" }), { storyId: "s1", data: "2026-10-28" }, await deps(true));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/fila de aprovação/);
  });

  it("sem o Social V2 em enforce no projeto, nada é agendado", async () => {
    const r = await agendarPost(projeto({ aprovacao: "enforce", social: "dry_run" }), { storyId: "s1", data: "2026-10-28" }, await deps(true));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/Social V2/);
  });
});
