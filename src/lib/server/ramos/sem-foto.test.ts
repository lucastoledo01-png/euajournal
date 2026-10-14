import { describe, expect, it, vi } from "vitest";
import type { PautaAvaliada } from "../editorial/guarda";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { carregarConfigEditorial } from "../editorial/config";
import type { ResultadoVisual } from "../visual/tipos";
import { escolherBandeira, ehImagemDaBandeira } from "../visual/bandeira";
import type { Artigo, ResultadoDoArtigo } from "./artigo";
import { rodarRamoDoPortal } from "./ramo-do-portal";
import { preSelecaoParaPacote, recomporNewsletterDaGuarda, selecionarParaNewsletter, selecionarParaPortal } from "./selecao";
import {
  EVENTO_SEM_FOTO,
  MOTIVO_SEM_FOTO,
  criarFotosDoDia,
  gravarQuedasSemFoto,
  montarPayloadDasQuedas,
  selecionarComFoto,
  separarPautasSemFoto,
  temFotoDaPauta,
} from "./sem-foto";
import { recusasDoDiagnostico } from "../painel-logs";

/**
 * Pauta sem foto não vira conteúdo (decisão do dono, 05/10/2026).
 *
 * Cada canal tem aqui um caso que produz o NÃO de verdade: a pauta sem foto
 * fica fora, e a próxima elegível entra no lugar dela. Um teste que só mostra
 * a pauta com foto passando não distingue régua de régua desligada.
 */

let n = 0;
function pauta(titulo: string, nota: number, vetor: number[]): PautaAvaliada {
  n += 1;
  return {
    grupo: {
      primary: {
        id: `c${n}`,
        url: `https://fonte${n}.com/materia-${n}`,
        title: titulo,
        source_name: "Fonte",
        priority: 1,
        published_at: "2026-10-05T09:00:00Z",
        description: "",
        content: "",
        category: "geral",
        score: 0,
        dedupe_key: `k${n}`,
        window_hours: 72,
      },
      secondary_sources: [],
      secondary_urls: [],
    },
    storyId: `s${n}`,
    classificacao: {
      id: `c${n}`,
      pais: "EUA",
      imigracao: false,
      leitura: "oportunidade",
      eixo: "economia",
      natureza: "official_action",
      relevancia: 7,
      atores: [`ator${n}`],
      lugares: [],
      acontecimento: [],
      justificativa: "",
    },
    enriquecimento: { texto: "texto da matéria" } as never,
    motivoDaAprovacao: "APPROVED_US_OPPORTUNITY" as never,
    veredito: { repetida: false } as never,
    pontuacao: { total: nota, partes: {}, explicacao: "" } as never,
    vetor,
  } as unknown as PautaAvaliada;
}

const PACOTE: PacoteFactual = {
  verified_facts: ["O Federal Reserve cortou a taxa de juros em 6 de outubro de 2026."],
  people: [],
  organizations: ["Federal Reserve"],
  places: ["Estados Unidos"],
  dates: ["6 de outubro de 2026"],
  numbers: [],
  gaps: [],
  source_urls: ["https://fonte.com/fed"],
  texto_de_origem: "O Federal Reserve cortou a taxa de juros em 6 de outubro de 2026.",
};
const comPacote = (...ps: PautaAvaliada[]) => new Map(ps.map((p) => [p.grupo.primary.url, PACOTE]));
const CONFIG = carregarConfigEditorial({});

function foto(storyId: string, url = `https://upload.wikimedia.org/wikipedia/commons/a/ab/${storyId}.jpg`): ResultadoVisual {
  return {
    storyId,
    entidade: null,
    asset: { imageUrl: url, source: "wikimedia_commons", metadata: {} } as never,
    assetSecundario: null,
    status: "SELECTED",
    motivo: null,
    fontesConsultadas: [],
    recusados: [],
    legenda: "",
  } as ResultadoVisual;
}

function soBandeira(storyId: string): ResultadoVisual {
  return {
    ...foto(storyId),
    asset: escolherBandeira({ eixo: "economia" }),
    status: "NO_VALID_IMAGE",
    motivo: "VISUAL_CHECK_FAILED",
  } as ResultadoVisual;
}

/** Memória do dia com uma resposta fixa por pauta, contando as perguntas. */
function fotosFixas(semFoto: Set<string>) {
  const perguntas: string[] = [];
  const fotos = criarFotosDoDia<PautaAvaliada>(
    (p) => p.storyId,
    async (p) => {
      perguntas.push(p.storyId);
      return semFoto.has(p.storyId) ? soBandeira(p.storyId) : foto(p.storyId);
    },
  );
  return { fotos, perguntas };
}

// Vetores ortogonais: fatos distintos, nenhum agrupamento por acontecimento.
const V = (i: number) => [0, 1, 2, 3, 4, 5].map((j) => (j === i ? 1 : 0));

describe("a régua: o que é foto da pauta", () => {
  it("SELECTED com URL é foto; a bandeira de último recurso, nunca", () => {
    expect(temFotoDaPauta(foto("a"))).toBe(true);
    expect(temFotoDaPauta(soBandeira("a"))).toBe(false);
    expect(temFotoDaPauta({ ...foto("a"), status: "NO_VALID_IMAGE", asset: null })).toBe(false);
    expect(temFotoDaPauta(null)).toBe(false);
  });

  it("a bandeira com status SELECTED (se um dia alguém mudar o status) continua não sendo foto", () => {
    expect(temFotoDaPauta({ ...soBandeira("a"), status: "SELECTED" })).toBe(false);
  });

  it("a bandeira é reconhecida pela URL, original ou miniatura, e foto comum do Commons não", () => {
    const b = escolherBandeira({});
    expect(ehImagemDaBandeira(b.imageUrl)).toBe(true);
    const nome = b.imageUrl.split("/").pop()!;
    const miniatura = `https://upload.wikimedia.org/wikipedia/commons/thumb/x/xy/${nome}/1280px-${nome}?w=600&amp;h=1`;
    expect(ehImagemDaBandeira(miniatura)).toBe(true);
    expect(ehImagemDaBandeira("https://upload.wikimedia.org/wikipedia/commons/a/ab/Capitol.jpg")).toBe(false);
    expect(ehImagemDaBandeira(null)).toBe(false);
  });
});

describe("selecionarComFoto: a vaga vai para a próxima", () => {
  it("a sem foto sai, a seleção é refeita, e cada foto é resolvida uma vez só", async () => {
    const a = pauta("a", 90, V(0));
    const b = pauta("b sem foto", 80, V(1));
    const c = pauta("c", 70, V(2));
    const d = pauta("d", 60, V(3));
    const { fotos, perguntas } = fotosFixas(new Set([b.storyId]));

    const r = await selecionarComFoto({
      selecionar: (excluir) => [a, b, c, d].filter((p) => !excluir.has(p.storyId)).slice(0, 2),
      escolhidas: (l) => l,
      chave: (p) => p.storyId,
      titulo: (p) => p.grupo.primary.title,
      fotos,
    });

    expect(r.selecao.map((p) => p.grupo.primary.title)).toEqual(["a", "c"]);
    expect(r.semFoto).toEqual([
      { storyId: b.storyId, titulo: "b sem foto", motivo: `${MOTIVO_SEM_FOTO}: só a bandeira de último recurso (VISUAL_CHECK_FAILED)` },
    ]);
    // a e b na primeira rodada, c na segunda; a não é perguntada de novo.
    expect(perguntas).toEqual([a.storyId, b.storyId, c.storyId]);
  });

  it("falha técnica na resolução é sem foto, com o erro no motivo", async () => {
    const a = pauta("a", 90, V(0));
    const fotos = criarFotosDoDia<PautaAvaliada>(
      (p) => p.storyId,
      async () => {
        throw new Error("Commons fora do ar");
      },
    );
    const r = await selecionarComFoto({
      selecionar: (excluir) => [a].filter((p) => !excluir.has(p.storyId)),
      escolhidas: (l) => l,
      chave: (p) => p.storyId,
      titulo: (p) => p.grupo.primary.title,
      fotos,
    });
    expect(r.selecao).toEqual([]);
    expect(r.semFoto[0].motivo).toBe(`${MOTIVO_SEM_FOTO}: a resolução de imagem falhou (Commons fora do ar)`);
  });
});

describe("newsletter: a sem foto cai antes da redação e a próxima entra", () => {
  it("pelo ramo: quatro com foto saem, mesmo com a melhor nota sem foto", async () => {
    const ps = [pauta("melhor, sem foto", 99, V(0)), pauta("a", 90, V(1)), pauta("b", 80, V(2)), pauta("c", 70, V(3)), pauta("d", 60, V(4))];
    const { fotos } = fotosFixas(new Set([ps[0].storyId]));

    const sem = selecionarParaNewsletter(ps, comPacote(...ps), CONFIG);
    expect(sem.escolhidas[0].grupo.primary.title).toBe("melhor, sem foto");

    const r = await selecionarComFoto({
      selecionar: (excluir) => selecionarParaNewsletter(ps, comPacote(...ps), CONFIG, excluir),
      escolhidas: (s) => s.escolhidas,
      chave: (p) => p.storyId,
      titulo: (p) => p.grupo.primary.title,
      fotos,
    });
    expect(r.selecao.escolhidas.map((p) => p.grupo.primary.title)).toEqual(["a", "b", "c", "d"]);
    expect(r.selecao.escolhidas).toHaveLength(sem.escolhidas.length);
    expect(r.selecao.viavel).toBe(true);
  });

  it("sem pautas com foto suficientes, a edição não é viável: vale o dia sem edição", async () => {
    const ps = [pauta("a", 90, V(0)), pauta("b sem foto", 80, V(1)), pauta("c sem foto", 70, V(2))];
    const { fotos } = fotosFixas(new Set([ps[1].storyId, ps[2].storyId]));
    const r = await selecionarComFoto({
      selecionar: (excluir) => selecionarParaNewsletter(ps, comPacote(...ps), CONFIG, excluir),
      escolhidas: (s) => s.escolhidas,
      chave: (p) => p.storyId,
      titulo: (p) => p.grupo.primary.title,
      fotos,
    });
    expect(r.selecao.escolhidas.map((p) => p.grupo.primary.title)).toEqual(["a"]);
    expect(r.selecao.viavel).toBe(false);
    expect(r.semFoto).toHaveLength(2);
  });

  it("pela guarda: sem proibidas a seleção original fica intacta; com elas, a composição é refeita", () => {
    const ps = [pauta("a", 90, V(0)), pauta("b", 80, V(1)), pauta("c", 70, V(2))];
    const originais = [ps[0], ps[1]];
    expect(recomporNewsletterDaGuarda(ps, originais, CONFIG, new Set()).escolhidas).toBe(originais);
    const r = recomporNewsletterDaGuarda(ps, originais, CONFIG, new Set([ps[0].storyId]));
    expect(r.escolhidas.map((p) => p.grupo.primary.title)).toEqual(["b", "c"]);
    expect(r.viavel).toBe(true);
  });

  it("a pré-seleção do pacote factual também pula a sem foto, para o pacote ir para quem vai sair", () => {
    const ps = [pauta("sem foto", 99, V(0)), pauta("a", 90, V(1))];
    const pre = preSelecaoParaPacote(ps, CONFIG, [], 2, new Set([ps[0].storyId]));
    expect(pre.map((p) => p.grupo.primary.title)).toEqual(["a"]);
  });
});

describe("portal: a sem foto não é escrita, e a próxima vira matéria", () => {
  const ARTIGO: Artigo = {
    titulo: "Federal Reserve corta os juros nos Estados Unidos",
    subtitulo: "",
    titulo_seo: "Federal Reserve corta os juros nos Estados Unidos",
    descricao_seo: "O Federal Reserve cortou a taxa de juros em 6 de outubro de 2026.",
    secoes: [{ intertitulo: "", paragrafos: ["O Federal Reserve cortou a taxa de juros em 6 de outubro de 2026."] }],
    perguntas: [],
  };
  const escrito = (): ResultadoDoArtigo =>
    ({
      artigo: ARTIGO,
      tentativas: 1,
      erro: null,
      veredicto: { aprovado: true, bloqueios: [], avisos: [], ancoragem: { conferidos: 1, naoSustentadas: [] }, conclusoesSemLastro: [] },
    }) as unknown as ResultadoDoArtigo;

  it("três vagas, a melhor sem foto: desde 14/10/2026 ela sai no portal com capa tipográfica (capa nula)", async () => {
    const ps = [pauta("sem foto", 99, V(0)), pauta("a", 90, V(1)), pauta("b", 80, V(2)), pauta("c", 70, V(3))];
    const { fotos } = fotosFixas(new Set([ps[0].storyId]));
    const escritas: string[] = [];

    const r = await rodarRamoDoPortal({
      pool: ps,
      pacotes: comPacote(...ps),
      historico: [],
      config: CONFIG,
      marca: { nome: "eua.journal", nicho: "EUA", briefing: "", voz: "" },
      data: "2026-10-06",
      timezone: "America/Sao_Paulo",
      horarios: ["06:07", "12:00", "18:00"],
      fotos,
      escrever: vi.fn(async (p: PautaAvaliada) => {
        escritas.push(p.grupo.primary.title);
        return escrito();
      }),
    });

    // A sem foto é a melhor nota e entra: no portal ela não cai mais (dono, 14/10/2026).
    expect(escritas).toEqual(["sem foto", "a", "b"]);
    expect(r.pecas).toHaveLength(3);
    expect(r.semFoto).toEqual([]);
    expect(r.linhasDeLog.join("\n")).not.toContain(MOTIVO_SEM_FOTO);
    // Sem foto, sem capa: a página e os cartões desenham a peça tipográfica.
    expect(r.pecas[0].conteudo.capa).toBeNull();
    expect(r.pecas[1].conteudo.capa).toBe(`https://upload.wikimedia.org/wikipedia/commons/a/ab/${ps[1].storyId}.jpg`);
  });
});

describe("a rede depois da resolução (newsletter já escrita)", () => {
  it("URL vazia e bandeira saem; foto fica", () => {
    const bandeira = escolherBandeira({}).imageUrl;
    const fotos = new Map([
      ["a", "https://x/a.jpg"],
      ["b", bandeira],
    ]);
    const r = separarPautasSemFoto(["a", "b", "c"], (k) => fotos.get(k));
    expect(r).toEqual({ ficam: [0], saem: [1, 2] });
  });
});

describe("o registro da queda, visível no painel", () => {
  const quedas = [{ storyId: "s1", titulo: "Aluguel sobe em Miami", motivo: `${MOTIVO_SEM_FOTO}: VISUAL_CHECK_FAILED` }];

  it("grava em platform_events no formato que o painel de logs já lê e agrupa", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const client = {
      from: (tabela: string) => ({
        insert: async (linha: Record<string, unknown>) => {
          inserts.push({ tabela, ...linha });
          return { error: null };
        },
      }),
    };
    const erro = await gravarQuedasSemFoto(client as never, "proj", "newsletter", quedas, { data: "2026-10-06", dryRun: false });
    expect(erro).toBeNull();
    expect(inserts[0]).toMatchObject({ tabela: "platform_events", event_type: EVENTO_SEM_FOTO, project_id: "proj" });

    const recusas = recusasDoDiagnostico(montarPayloadDasQuedas("newsletter", quedas, { data: "2026-10-06", dryRun: false }));
    expect(recusas).toEqual([
      { etapa: "sem_foto_newsletter", motivo: `${MOTIVO_SEM_FOTO}: VISUAL_CHECK_FAILED`, titulo: "Aluguel sobe em Miami", codigo: MOTIVO_SEM_FOTO },
    ]);
  });

  it("sem queda, nada é gravado", async () => {
    const from = vi.fn();
    expect(await gravarQuedasSemFoto({ from } as never, "proj", "artigo", [], { data: "d", dryRun: false })).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
