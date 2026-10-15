import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepararEvergreen } from "./ciclo";
import { CATALOGO_EVERGREEN } from "./catalogo";
import { identidadeDoItem } from "./tipos";
import { pautaDoEvergreen } from "./adaptador";
import { ehFonteCanonica } from "./grounding";
import { hashtagsDaPauta } from "../legenda";
import type { TopicoEvergreen, UsoAnterior } from "./tipos";
import type { PacoteFactual } from "../../editorial/pacote-factual";

/**
 * O evergreen como segunda fonte do MESMO Social V2.
 *
 * A regra desta fase é que nada do News V2 muda. O que estes testes protegem é
 * a fronteira: notícia primeiro, evergreen só nas vagas que sobram, e nenhuma
 * bifurcação no worker.
 */

const HOJE = Date.parse("2026-09-09T12:00:00Z");
const diasAtras = (n: number) => new Date(HOJE - n * 24 * 60 * 60 * 1000).toISOString();

/**
 * Um pacote que COBRE o tópico que o recebeu.
 *
 * Ele era fixo, com um fato sobre EB-2 NIW usado para qualquer item. Com a régua
 * de cobertura, isso passou a descartar tudo, e com razão: um pacote que não
 * fala do assunto do tópico não deve virar post. Estes testes são sobre seleção,
 * cooldown e diversidade, então o pacote precisa representar a fonte que
 * FUNCIONOU, e para isso ele cita o assunto do próprio item.
 */
function pacote(topico?: TopicoEvergreen): PacoteFactual {
  const assunto = topico?.nome ?? "EB-2 NIW";
  return {
    verified_facts: [
      `${assunto} tem requisitos descritos no manual de políticas da USCIS.`,
      `A análise de ${assunto} considera a documentação enviada com o pedido.`,
    ],
    people: [],
    organizations: ["USCIS"],
    places: ["Estados Unidos"],
    dates: [],
    numbers: [],
    gaps: ["A página não informa prazo de análise."],
    source_urls: ["https://www.uscis.gov/x"],
    texto_de_origem: `Texto da página oficial do USCIS sobre ${assunto}.`,
  } as PacoteFactual;
}

/** Lastro de mentira: nenhum teste desta suíte fala com a rede. */
function montarLastroFake(quaisFalham: string[] = []) {
  return (async (itens: Array<{ topico: TopicoEvergreen; angulo: { id: string } }>) => ({
    lastros: itens.map((item) => {
      const id = identidadeDoItem(item as never);
      const falha = quaisFalham.includes(id);
      return {
        item: item as never,
        storyId: id,
        pacote: falha ? null : pacote(item.topico),
        fontes: [{ url: item.topico.fontesCanonicas[0], ok: !falha, caracteres: falha ? 0 : 5000 }],
        ...(falha ? { motivo: "a página oficial não respondeu" } : {}),
      };
    }),
    custoUsd: 0.01,
    tokens: 100,
  })) as never;
}

const base = {
  projectId: "proj-1",
  maximoPorDia: 10,
  historico: [] as UsoAnterior[],
  agoraMs: HOJE,
  montarLastroDosItens: montarLastroFake(),
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------- A
describe("A. evergreen off", () => {
  it("não executa nada e não devolve pauta nenhuma", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 2, modoForcado: "off" });

    expect(r.diagnostico.mode).toBe("off");
    expect(r.diagnostico.executed).toBe(false);
    expect(r.extras).toHaveLength(0);
    expect(r.diagnostico.custoUsd).toBe(0);
  });

  it("a flag ausente cai em off, nunca em enforce", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 2, env: {} });
    expect(r.diagnostico.mode).toBe("off");
  });

  it("valor irreconhecível também cai em off", async () => {
    const r = await prepararEvergreen({
      ...base,
      noticiasNoDia: 2,
      env: { SOCIAL_EVERGREEN_V2: "ligado" },
    });
    expect(r.diagnostico.mode).toBe("off");
  });
});

// ---------------------------------------------------------------- B
describe("B. dry_run", () => {
  it("calcula tudo e não grava nada: quem grava é o ciclo, e só em enforce", async () => {
    /*
     * `prepararEvergreen` nunca grava, em nenhum modo: ele devolve pautas. A
     * gravação é do `rodarCicloSocial`, que já se recusa fora de enforce e não
     * recebe store nesse caso. O que se afirma aqui é que o preparo produz
     * material publicável sem tocar em persistência.
     */
    const r = await prepararEvergreen({
      ...base,
      noticiasNoDia: 2,
      modoForcado: "dry_run",
    });

    expect(r.diagnostico.executed).toBe(true);
    expect(r.extras.length).toBeGreaterThan(0);
    expect(r.candidatas.size).toBe(r.extras.length);
  });
});

// ---------------------------------------------------------------- vagas
describe("prioridade da notícia", () => {
  it("dez notícias não deixam vaga, e o evergreen não gasta nada", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 10, modoForcado: "dry_run" });

    expect(r.diagnostico.vagas).toBe(0);
    expect(r.extras).toHaveLength(0);
    // Nem o seletor rodou: não há vaga para disputar.
    expect(r.diagnostico.selecionados).toBe(0);
    expect(r.diagnostico.custoUsd).toBe(0);
  });

  it("três notícias deixam sete vagas e o evergreen completa até dez", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 3, modoForcado: "dry_run" });

    expect(r.diagnostico.vagas).toBe(7);
    expect(r.extras.length).toBeLessThanOrEqual(7);
    expect(3 + r.extras.length).toBeLessThanOrEqual(10);
  });

  it("zero notícia: o evergreen sustenta o dia", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 0, modoForcado: "dry_run" });

    expect(r.diagnostico.vagas).toBe(10);
    expect(r.extras.length).toBeGreaterThan(0);
  });

  it("notícia acima do teto não gera vaga negativa", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 14, modoForcado: "dry_run" });
    expect(r.diagnostico.vagas).toBe(0);
  });
});

// ---------------------------------------------------------------- cooldown
describe("anti-repetição", () => {
  it("tópico e ângulo publicados há 10 dias não voltam", async () => {
    const catalogo = [CATALOGO_EVERGREEN[0]];
    const item = identidadeDoItem({ topico: catalogo[0], angulo: catalogo[0].angulos[0] });

    const r = await prepararEvergreen({
      ...base,
      noticiasNoDia: 0,
      modoForcado: "dry_run",
      catalogo,
      historico: [{ storyId: item, topicId: `evg:${catalogo[0].id}`, quandoIso: diasAtras(10) }],
    });

    expect(r.extras.map((p) => p.storyId)).not.toContain(item);
    expect(r.diagnostico.cortadosPorMotivo.COOLDOWN_DO_PAR ?? 0).toBeGreaterThan(0);
  });

  it("o mesmo tópico por outro ângulo também espera a janela", async () => {
    // É o caso do "EB-2 NIW três vezes" com títulos diferentes.
    const catalogo = [CATALOGO_EVERGREEN[0]];
    const primeiro = identidadeDoItem({ topico: catalogo[0], angulo: catalogo[0].angulos[0] });

    const r = await prepararEvergreen({
      ...base,
      noticiasNoDia: 0,
      modoForcado: "dry_run",
      catalogo,
      historico: [{ storyId: primeiro, topicId: `evg:${catalogo[0].id}`, quandoIso: diasAtras(3) }],
    });

    expect(r.extras).toHaveLength(0);
    expect(r.diagnostico.cortadosPorMotivo.TOPICO_NA_JANELA ?? 0).toBeGreaterThan(0);
  });

  it("nenhum tópico volta em 30 dias, nem por outro ângulo (06/10/2026)", async () => {
    const catalogo = [CATALOGO_EVERGREEN[0]];
    const primeiro = identidadeDoItem({ topico: catalogo[0], angulo: catalogo[0].angulos[0] });
    const historico = (dias: number) => [
      { storyId: primeiro, topicId: `evg:${catalogo[0].id}`, quandoIso: diasAtras(dias) },
    ];

    const aos29 = await prepararEvergreen({
      ...base, noticiasNoDia: 0, modoForcado: "dry_run", catalogo, historico: historico(29),
    });
    expect(aos29.extras).toHaveLength(0);

    const aos31 = await prepararEvergreen({
      ...base, noticiasNoDia: 0, modoForcado: "dry_run", catalogo, historico: historico(31),
    });
    expect(aos31.extras).toHaveLength(1);
    expect(aos31.extras[0].storyId).not.toBe(primeiro);
  });

  it("o dia leva no máximo dois permanentes, de editorias diferentes", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 0, modoForcado: "dry_run" });
    expect(r.extras.length).toBe(2);
    const eixos = r.extras.map((p) => p.classificacao.eixo);
    expect(new Set(eixos).size).toBe(eixos.length);
  });
});

// ---------------------------------------------------------------- diversidade
describe("diversidade", () => {
  it("um programa não domina o feed do dia", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 0, modoForcado: "dry_run" });

    const porPrograma: Record<string, number> = {};
    for (const p of r.extras) {
      for (const ator of p.classificacao.atores) porPrograma[ator] = (porPrograma[ator] ?? 0) + 1;
    }
    for (const [programa, quantos] of Object.entries(porPrograma)) {
      expect(quantos, programa).toBeLessThanOrEqual(2);
    }
  });

  it("o assunto da notícia de hoje é cedido pelo evergreen", async () => {
    /*
     * Pelo entrypoint do ciclo, e não pelo seletor: o que se confere é que a
     * notícia do dia realmente chega até a régua. Uma notícia só basta.
     */
    const doFomc = CATALOGO_EVERGREEN.filter((t) => t.programa === "FOMC");
    expect(doFomc.length).toBeGreaterThan(0);
    const r = await prepararEvergreen({
      ...base,
      noticiasNoDia: 1,
      modoForcado: "dry_run",
      catalogo: doFomc,
      programasDaNoticia: ["FOMC"],
    });

    expect(r.extras).toHaveLength(0);
    expect(r.diagnostico.cortadosPorMotivo.ASSUNTO_DA_NOTICIA_HOJE ?? 0).toBeGreaterThan(0);
  });

  it("a instituição da notícia também cede o assunto, pelo nome inteiro", async () => {
    // A notícia do Fed chega com o ator "Federal Reserve", e não com "FOMC".
    const doFed = CATALOGO_EVERGREEN.filter((t) => t.entidade === "Federal Reserve");
    expect(doFed.length).toBeGreaterThanOrEqual(1);
    const r = await prepararEvergreen({
      ...base,
      noticiasNoDia: 1,
      modoForcado: "dry_run",
      catalogo: doFed,
      programasDaNoticia: ["Federal Reserve"],
    });
    expect(r.extras).toHaveLength(0);

    // Outro nome que começa igual não é a mesma instituição.
    const outro = await prepararEvergreen({
      ...base,
      noticiasNoDia: 1,
      modoForcado: "dry_run",
      catalogo: doFed,
      programasDaNoticia: ["Federal Reserve Bank of Minneapolis"],
    });
    expect(outro.extras.length).toBeGreaterThan(0);
  });

  it("uma família não domina o feed do dia", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 0, modoForcado: "dry_run" });

    const porFamilia: Record<string, number> = {};
    for (const p of r.extras) {
      const familia = p.grupo.primary.category;
      porFamilia[familia] = (porFamilia[familia] ?? 0) + 1;
    }
    for (const [familia, quantos] of Object.entries(porFamilia)) {
      expect(quantos, familia).toBeLessThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------- grounding
describe("grounding", () => {
  it("item cuja fonte oficial não respondeu não vira post", async () => {
    const catalogo = CATALOGO_EVERGREEN.slice(0, 3);
    const todos = catalogo.flatMap((t) => t.angulos.map((a) => identidadeDoItem({ topico: t, angulo: a })));

    const r = await prepararEvergreen({
      ...base,
      noticiasNoDia: 0,
      modoForcado: "dry_run",
      catalogo,
      montarLastroDosItens: montarLastroFake(todos),
    });

    expect(r.extras).toHaveLength(0);
    expect(r.diagnostico.semLastro.length).toBeGreaterThan(0);
    expect(r.diagnostico.semLastro[0].motivo).toContain("não respondeu");
  });

  it("a pauta adaptada carrega o texto da fonte, e é dele que a copy parte", async () => {
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 0, modoForcado: "dry_run" });

    for (const p of r.extras) {
      expect(p.enriquecimento.texto.length).toBeGreaterThan(0);
      expect(ehFonteCanonica(p.grupo.primary.url), p.grupo.primary.url).toBe(true);
    }
  });

  it("a pauta adaptada nunca é de imigração, e o eixo é o da editoria do tópico", () => {
    /*
     * `imigracao: true` era o valor de todo evergreen até 05/10/2026. Com ele,
     * a linha nova recusaria o post inteiro, e com razão. O eixo vem da
     * editoria e fala o vocabulário do classificador.
     */
    const ESPERADO: Record<string, string> = {
      economia: "economia",
      trabalho: "trabalho",
      tecnologia: "tecnologia",
      "custo-de-vida": "custo_de_vida",
      governo: "politica",
      brasil: "brasil",
    };
    for (const topico of CATALOGO_EVERGREEN) {
      const pauta = pautaDoEvergreen({ topico, angulo: topico.angulos[0] }, pacote(topico));
      expect(pauta.classificacao.imigracao, topico.id).toBe(false);
      expect(pauta.classificacao.eixo, topico.id).toBe(ESPERADO[topico.editoria]);
      expect(pauta.classificacao.eixo, topico.id).not.toBe("imigracao");
      // O ator é a instituição, nunca o código do programa.
      expect(pauta.classificacao.atores, topico.id).toEqual(topico.entidade ? [topico.entidade] : []);
    }
  });

  it("a candidata declara a verificação, com o motivo escrito", async () => {
    /*
     * O Social Guard recusa com SOCIAL_REJECT_UNVERIFIED sem prova de
     * verificação. O evergreen não passa pelo verificador de finalistas porque
     * não há o que verificar contra o quê: a fonte é a própria referência.
     */
    const r = await prepararEvergreen({ ...base, noticiasNoDia: 0, modoForcado: "dry_run" });

    for (const [, c] of r.candidatas) {
      const candidata = c as unknown as { status: string; verificacao: { status: string; motivo: string } };
      expect(candidata.status).toBe("approved");
      expect(candidata.verificacao.status).toBe("confirm");
      expect(candidata.verificacao.motivo).toContain("fonte");
    }
  });
});

// ---------------------------------------------------------------- worker
describe("o worker não sabe que o evergreen existe", () => {
  const fonteDoWorker = fs.readFileSync(
    path.join(__dirname, "../instagram/worker-service.ts"),
    "utf-8",
  );
  const fonteDaCarga = fs.readFileSync(path.join(__dirname, "../instagram/carga-v2.ts"), "utf-8");

  it("nenhuma bifurcação por evergreen no worker", () => {
    for (const palavra of ["evergreen", "EVERGREEN", "evg:"]) {
      expect(fonteDoWorker, palavra).not.toContain(palavra);
      expect(fonteDaCarga, palavra).not.toContain(palavra);
    }
  });

  it("o worker continua decidindo só por generation_version", () => {
    // Um post evergreen é `social-v2` como qualquer outro: mesma carga, mesmo
    // congelamento, mesmo hash, mesma publicação segura.
    expect(fonteDoWorker).toContain("ehSocialV2");
    expect(fonteDaCarga).toContain('GERACAO_V2 = "social-v2"');
  });
});

describe("a origem é editorial, não estrutural", () => {
  it("o store marca origin_channel = evergreen pela identidade da pauta", async () => {
    const { resolverOrigem } = await import("../social-posts-store");
    const r = resolverOrigem("evg:eb2-niw:o-que-e", []);
    expect(r.originChannel).toBe("evergreen");
    expect(r.motivo).toContain("permanente");
  });

  it("pauta de notícia continua resolvendo como antes", async () => {
    const { resolverOrigem } = await import("../social-posts-store");
    expect(resolverOrigem("u_abc123", []).originChannel).toBe("social");
  });
});

describe("a hashtag descreve o post, não a página da fonte", () => {
  /*
   * O primeiro preview de três dias saiu com "#EB5 #H1B #VistoF1 #GreenCard
   * #USCIS #ICE #CBP" num post sobre ajuste de status, e os quatro posts do dia
   * saíram com quase o mesmo conjunto.
   *
   * Nenhuma daquelas hashtags foi inventada: todas estavam no texto lido da
   * fonte. Uma página do policy manual da USCIS cita o sistema imigratório
   * inteiro, e a inferência, que existe para achar o assunto dentro de uma
   * matéria, acabou descrevendo o site da origem.
   */
  const PAGINA_COM_TUDO = [
    "U.S. Citizenship and Immigration Services (USCIS).",
    "Related agencies: Immigration and Customs Enforcement (ICE) and Customs and Border Protection (CBP).",
    "This chapter covers EB-1, EB-2, EB-3, EB-5, H-1B and F-1 classifications.",
    "See also the Supreme Court decision cited in footnote 12.",
  ].join(" ");

  it("o texto da fonte não vira assunto do post", () => {
    const item = { topico: CATALOGO_EVERGREEN[0], angulo: CATALOGO_EVERGREEN[0].angulos[0] };
    const pauta = pautaDoEvergreen(item, { ...pacote(), texto_de_origem: PAGINA_COM_TUDO } as PacoteFactual);

    const tags = hashtagsDaPauta({
      titulo: pauta.grupo.primary.title,
      resumo: pauta.enriquecimento?.assuntoParaHashtags || pauta.enriquecimento?.texto || "",
      categoria: pauta.classificacao.eixo,
      pais: "US",
      entidades: [...pauta.classificacao.atores, ...pauta.classificacao.lugares],
      keyword: "VISA",
      fechamentoDaNewsletter: "",
    });

    for (const forasteira of ["#ICE", "#CBP", "#SupremaCorte", "#VistoF1"]) {
      expect(tags).not.toContain(forasteira);
    }
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it("o texto da fonte continua inteiro para quem precisa dele", () => {
    /*
     * A separação é só para a hashtag. O gerador de copy é aterrado no texto
     * lido da fonte, e encurtar isso seria trocar um defeito de hashtag por um
     * defeito de fato.
     */
    const item = { topico: CATALOGO_EVERGREEN[0], angulo: CATALOGO_EVERGREEN[0].angulos[0] };
    const pauta = pautaDoEvergreen(item, { ...pacote(), texto_de_origem: PAGINA_COM_TUDO } as PacoteFactual);

    expect(pauta.enriquecimento?.texto).toBe(PAGINA_COM_TUDO);
    expect(pauta.grupo.primary.content).toBe(PAGINA_COM_TUDO);
  });

  it("quem não declara assunto segue usando o texto, como a notícia sempre fez", () => {
    const tags = hashtagsDaPauta({
      titulo: "USCIS muda regra de ajuste de status",
      resumo: PAGINA_COM_TUDO,
      categoria: "processo",
      pais: "US",
      entidades: ["USCIS"],
      keyword: "VISA",
      fechamentoDaNewsletter: "",
    });

    /*
     * "#EB2" só pode ter vindo do texto: não está no título nem nas entidades.
     *
     * Não asserto "#ICE" aqui porque o teto de sete hashtags o cortaria antes,
     * e o teste passaria a medir o teto em vez do caminho.
     */
    expect(tags).toContain("#EB2");
    expect(tags.length).toBe(5);
  });
});
