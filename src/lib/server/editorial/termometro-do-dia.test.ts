import { describe, expect, it, vi } from "vitest";
import { avaliarPostSocial, MOTIVOS_DO_SOCIAL_GUARD } from "../social/social-guard";
import type { CopyDoPost } from "../social/copy";
import type { PacoteFactual } from "./pacote-factual";
import type { PautaAvaliada } from "./guarda";
import type { EstadoAtual } from "./termometro";
import { chaveDoAlerta, pautasAtrasadas, registrarERevisarAlertas, termometroDoDia } from "./termometro-do-dia";

const AGORA = Date.parse("2026-10-28T15:00:00Z");
const h = (horas: number) => new Date(AGORA - horas * 3600 * 1000).toISOString();

const PACOTE: PacoteFactual = {
  verified_facts: ["Flávio Bolsonaro viajou para os Estados Unidos na terça-feira."],
  people: ["Flávio Bolsonaro"],
  organizations: [],
  places: ["Estados Unidos"],
  dates: ["terça-feira"],
  numbers: [],
  gaps: [],
  source_urls: ["https://g1.globo.com/a"],
  texto_de_origem: "Flávio Bolsonaro viajou para os Estados Unidos na terça-feira.",
};

function pauta(titulo: string): PautaAvaliada {
  return {
    storyId: "s1",
    grupo: {
      primary: { id: "c1", url: "https://g1.globo.com/a", title: titulo, source_name: "G1", priority: 1, published_at: h(20), description: "", content: "", category: "politica", score: 0, dedupe_key: "k", window_hours: 24 },
      secondary_sources: [],
      secondary_urls: [],
    },
    classificacao: { pais: "Brasil", leitura: "neutra", eixo: "politica", atores: ["Flávio Bolsonaro"], lugares: [], acontecimento: [] },
    enriquecimento: { texto: PACOTE.texto_de_origem, enrichmentSources: ["https://g1.globo.com/a"] },
    pontuacao: { total: 60, partes: {}, explicacao: "" },
    veredito: { repetida: false },
    vetor: null,
  } as unknown as PautaAvaliada;
}

const ESTADO: EstadoAtual = {
  linha: 'Etapa atual: chega. Mais novo: "Flávio Bolsonaro chega aos EUA" (poder360.com.br)',
  titulo: "Flávio Bolsonaro chega aos EUA",
  etapa: { familia: "viagem", ordem: 2, rotulo: "chega" },
  em: h(0.5),
  dominio: "poder360.com.br",
};

const CONFIRMADA = {
  status: "approved" as const,
  verificacao: { status: "confirm" as const, motivo: "ok", divergencias: [], verificadoEm: h(1), canal: "instagram", inputHash: "h" },
};

function copy(headline: string): CopyDoPost {
  return {
    headline,
    destaque: "",
    gancho: "Flávio Bolsonaro viajou para os Estados Unidos na terça-feira.",
    paragrafos: [],
    fato_principal: "",
    contexto: "",
    informacao_util: "",
    ressalva: "",
    cta: "",
    hashtags: [],
  } as CopyDoPost;
}

describe("a trava do termômetro na guarda do post", () => {
  const contexto = (estadoAtual: EstadoAtual | null) =>
    ({ pauta: pauta("Flávio Bolsonaro viaja rumo aos EUA"), pacote: PACOTE, candidata: CONFIRMADA, keyword: "", estadoAtual }) as never;

  it("segura o post que conta a etapa que a história já passou, e não manda reescrever", () => {
    const r = avaliarPostSocial(copy("Flávio Bolsonaro viaja rumo aos Estados Unidos na terça-feira"), contexto(ESTADO));
    const travado = r.fatalIssues.find((p) => p.motivo === MOTIVOS_DO_SOCIAL_GUARD.ETAPA_SUPERADA);
    expect(travado?.detalhe).toMatch(/já está em "chega"/);
    expect(r.passed).toBe(false);
    expect(r.finalDecision).toBe("descartar");
  });

  it("sem estado atual, ou com a etapa certa, a guarda é a de antes", () => {
    const semEstado = avaliarPostSocial(copy("Flávio Bolsonaro viaja rumo aos Estados Unidos na terça-feira"), contexto(null));
    expect(semEstado.issues.some((p) => p.motivo === MOTIVOS_DO_SOCIAL_GUARD.ETAPA_SUPERADA)).toBe(false);
    const naEtapa = avaliarPostSocial(copy("Flávio Bolsonaro chega aos Estados Unidos na terça-feira"), contexto(ESTADO));
    expect(naEtapa.issues.some((p) => p.motivo === MOTIVOS_DO_SOCIAL_GUARD.ETAPA_SUPERADA)).toBe(false);
  });

  it("o ensaio aponta a pauta cuja manchete de origem ficou para trás", () => {
    const atrasadas = pautasAtrasadas([pauta("Flávio Bolsonaro viaja rumo aos EUA")], new Map([["s1", ESTADO]]));
    expect(atrasadas).toHaveLength(1);
    expect(atrasadas[0].motivo).toMatch(/viaja/);
  });
});

describe("o termômetro do dia e os alertas", () => {
  const fontes = {
    termosEmAlta: async () => [],
    publicadasNoDia: async () => [
      { titulo: "Trump anuncia tarifa de 50% sobre o aço", dominio: "g1.globo.com", publicadoEm: h(1) },
      { titulo: "Trump anuncia tarifa de 50% sobre o aço brasileiro", dominio: "folha.uol.com.br", publicadoEm: h(1.5) },
      { titulo: "Trump anuncia tarifa de 50% sobre aço", dominio: "uol.com.br", publicadoEm: h(2) },
    ],
    vetores: async (textos: string[]) => textos.map((t) => (t.includes("Trump") ? [1, 0] : [0, 1])),
  };

  it("monta o ranking e marca o alerta do assunto que acelera no nicho", async () => {
    const t = await termometroDoDia([], fontes, AGORA);
    expect(t.grupos).toHaveLength(1);
    expect(t.ranking[0].alerta).toBe(true);
    expect(t.linhas[0]).toMatch(/1 alerta/);
  });

  function clienteDeMentira(jaMandada?: string) {
    const inseridos: Array<Record<string, unknown>> = [];
    const consulta = {
      select: () => consulta,
      eq: () => consulta,
      gte: async () => ({ data: jaMandada ? [{ payload: { chave: jaMandada } }] : [], error: null }),
    };
    return {
      inseridos,
      from: () => ({
        insert: async (linha: Record<string, unknown>) => (inseridos.push(linha), { error: null }),
        ...consulta,
      }),
    };
  }

  it("dry_run grava o ranking e não manda alerta; enforce manda uma vez por dia", async () => {
    const t = await termometroDoDia([], fontes, AGORA);
    const enviar = vi.fn(async () => true);

    const ensaio = clienteDeMentira();
    expect((await registrarERevisarAlertas(ensaio as never, "p1", t, "dry_run", { dia: "2026-10-28", enviar })).alertasEnviados).toBe(0);
    expect(ensaio.inseridos[0]).toMatchObject({ event_type: "termometro" });
    expect(enviar).not.toHaveBeenCalled();

    const valendo = clienteDeMentira();
    expect((await registrarERevisarAlertas(valendo as never, "p1", t, "enforce", { dia: "2026-10-28", enviar })).alertasEnviados).toBe(1);
    expect(enviar.mock.calls[0][0]).toMatch(/Assunto acelerando/);

    const repetido = clienteDeMentira(chaveDoAlerta(t.ranking[0], "2026-10-28"));
    expect((await registrarERevisarAlertas(repetido as never, "p1", t, "enforce", { dia: "2026-10-28", enviar })).alertasEnviados).toBe(0);
  });
});
