import { describe, expect, it } from "vitest";
import type { Classificacao } from "@/lib/server/editorial/classificador";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import type { Project } from "@/lib/server/projects";
import type { AssetVisual } from "@/lib/server/visual/tipos";
import { tarefasEmMemoria } from "../tarefas-store";
import { modeloDoClaude, PedidoAoClaude } from "../newsletter/fluxo";
import { proximoPassoDoDia, type DepsDoDiretor } from "./diretor";
import { conferenteQueAnota, resultadoDaEscolha, type MaterialDaFoto } from "./fotos";
import { pacoteDaEntrega } from "./pacotes";
import { conferirPlano, veiculosLexicos, type MaterialDoPlano } from "./plano";
import { itensEditados } from "./plano-na-fila";
import { planosEmMemoria, PLANO_VAZIO } from "./plano-store";
import { linhasDaTriagem, preFiltrar, type Coletada } from "./triagem";
import { ehPrioritaria, fontesPrioritarias } from "./fontes-prioritarias";

const AGORA = Date.parse("2026-10-29T15:00:00Z");

function coletada(extra: Partial<Coletada>): Coletada {
  return { storyId: "s", url: "https://a.com/1", title: "Trump anuncia tarifa sobre o aço", summary: "", sourceDomain: "a.com", status: "collected", publishedAt: "2026-10-29T12:00:00Z", ...extra };
}

describe("a triagem", () => {
  it("pré-filtra: janela, agregador, já classificada e título repetido", () => {
    const r = preFiltrar(
      [
        coletada({ storyId: "1", url: "https://a.com/1" }),
        coletada({ storyId: "2", url: "https://b.com/2", sourceDomain: "b.com" }), // mesmo título
        coletada({ storyId: "3", url: "https://news.google.com/x", sourceDomain: "news.google.com", title: "Outra notícia qualquer aqui" }),
        coletada({ storyId: "4", url: "https://c.com/4", title: "Notícia antiga demais para hoje", publishedAt: "2026-10-27T10:00:00Z" }),
        coletada({ storyId: "5", url: "https://d.com/5", title: "Já classificada antes pelo Claude" }),
      ],
      new Set(["https://d.com/5"]),
      { agoraMs: AGORA },
    );
    expect(r.map((c) => c.storyId)).toEqual(["1"]);
  });

  it("põe a fonte prioritária na frente do corte e fica com a versão dela no título repetido", () => {
    const lista = fontesPrioritarias({ settings: { fontes_prioritarias: ["https://www.notjournal.com.br/"] } });
    const r = preFiltrar(
      [
        coletada({ storyId: "novo", url: "https://a.com/n", title: "Fed mantém os juros nesta quarta", publishedAt: "2026-10-29T14:00:00Z" }),
        coletada({ storyId: "nj", url: "https://notjournal.com.br/x", sourceDomain: "www.notjournal.com.br", title: "Fed mantém os juros nesta quarta", publishedAt: "2026-10-29T09:00:00Z" }),
        coletada({ storyId: "outro", url: "https://b.com/o", sourceDomain: "b.com", title: "Casa Branca anuncia outra coisa", publishedAt: "2026-10-29T13:00:00Z" }),
      ],
      new Set(),
      { agoraMs: AGORA, teto: 1, prioritaria: (d) => ehPrioritaria(d, lista) },
    );
    expect(r.map((c) => c.storyId)).toEqual(["nj"]);
    expect(ehPrioritaria("notjournal.com", lista)).toBe(false);
  });

  it("aplica a regra de decisão da esteira e aponta o que faltou classificar", () => {
    const base = { pais: "EUA", imigracao: false, leitura: "oportunidade", eixo: "economia", natureza: "outro", relevancia: 8, atores: ["Trump"], lugares: [], acontecimento: ["tarifa"], justificativa: "" };
    const r = linhasDaTriagem(
      {
        lote: 1,
        pautas: [
          { id: "a", titulo: "Trump anuncia tarifa", descricao: "", fonte: "x.com", url: "https://x.com/a", publicadoEm: "2026-10-29T12:00:00Z", dominio: "x.com" },
          { id: "b", titulo: "Visto novo", descricao: "", fonte: "x.com", url: "https://x.com/b", publicadoEm: "2026-10-29T12:00:00Z", dominio: "x.com" },
          { id: "c", titulo: "Sem resposta", descricao: "", fonte: "x.com", url: "https://x.com/c", publicadoEm: "2026-10-29T12:00:00Z", dominio: "x.com" },
        ],
      },
      [
        { ...base, id: "a" } as unknown as Classificacao,
        { ...base, id: "b", imigracao: true, eixo: "imigracao" } as unknown as Classificacao,
      ],
      { settings: {} },
      {},
    );
    expect(r.faltando).toEqual(["c"]);
    expect(r.linhas.find((l) => l.storyId === "a")?.status).toBe("approved");
    expect(r.linhas.find((l) => l.storyId === "b")?.status).toBe("rejected");
    expect(r.aprovadas).toBe(1);
  });
});

describe("o plano", () => {
  const material: MaterialDoPlano = {
    data: "2026-10-29",
    volumes: { newsletter: { minimo: 2, maximo: 4 }, artigos: 3, instagram: 5 },
    pautas: ["p1", "p2", "p3"].map((storyId) => ({ storyId, titulo: storyId, fonte: null, publicadoEm: null, eixo: null, pais: null, relevancia: 8, veiculos: 1, resumo: "" })),
    reels: [{ id: "r1", fonte: "instagram", autor: "x", titulo: "t", nota: 50, link: null }],
    jaUsadas: { newsletter: [], artigos: [], instagram: ["p3"] },
  };
  const bom = {
    ...PLANO_VAZIO,
    newsletter: ["p1", "p2"],
    artigos: ["p1"],
    posts: ["p2"],
    reels: ["r1"],
    porque: { p1: "quente", p2: "visual", r1: "vídeo forte" },
    cenas: { p1: { consulta: "steel factory", objeto: "fábrica" }, p2: { consulta: "white house", objeto: "Casa Branca" } },
  };

  it("passa quando respeita volume, pool, cena e porquê", () => {
    expect(conferirPlano(bom, material)).toEqual([]);
  });

  it("recusa volume, pauta de fora, repetida no canal e cena faltando", () => {
    const m = conferirPlano({ ...bom, newsletter: ["p1"], posts: ["p2", "p3", "zz"], cenas: {} }, material);
    expect(m.join(" ")).toContain("newsletter leva de 2 a 4");
    expect(m.join(" ")).toContain("zz não está entre as pautas aprovadas");
    expect(m.join(" ")).toContain("p3 já saiu neste canal");
    expect(m.join(" ")).toContain("falta a busca da foto");
  });

  it("recusa a mesma notícia de duas fontes no mesmo canal", () => {
    const comRepetida: MaterialDoPlano = {
      ...material,
      pautas: [...material.pautas, { ...material.pautas[0], storyId: "p1b" }],
    };
    const m = conferirPlano({ ...bom, artigos: ["p1", "p1b"], cenas: { ...bom.cenas, p1b: { consulta: "x y", objeto: "" } }, porque: { ...bom.porque, p1b: "x" } }, comRepetida);
    expect(m.join(" ")).toContain("mesmo título");
  });

  it("conta veículos pelos nomes em comum", () => {
    const n = veiculosLexicos("Trump anuncia tarifa contra a China", [
      { titulo: "China responde a Trump", dominio: "a.com" },
      { titulo: "Trump fala de tarifas", dominio: "b.com" },
      { titulo: "Lula viaja", dominio: "c.com" },
    ]);
    expect(n).toBe(1);
  });

  it("no painel o dono só tira item, não põe pauta nova", () => {
    const tirado = itensEditados(bom, JSON.stringify({ ...bom, posts: [] }));
    expect(tirado.posts).toEqual([]);
    expect(tirado.cenas).toEqual(bom.cenas);
    expect(() => itensEditados(bom, JSON.stringify({ ...bom, posts: ["p2", "novo"] }))).toThrow(/só dá para tirar/);
  });
});

describe("a foto e o pacote", () => {
  it("o conferente anota e não aprova nada", async () => {
    const { conferente, anotadas } = conferenteQueAnota();
    const v = await conferente({ imageUrl: "https://x/1.jpg" } as AssetVisual, { titulo: "t", papel: "cena" });
    await conferente({ imageUrl: "https://x/1.jpg" } as AssetVisual, { titulo: "t" });
    expect(v.aprovada).toBe(false);
    expect(anotadas).toHaveLength(1);
    expect(anotadas[0].papel).toBe("cena");
  });

  it("a escolha vira resultado, e a confiança baixa é recusa", () => {
    const material: MaterialDaFoto = {
      storyId: "s1", titulo: "t", resumo: "", categoria: "economia",
      candidatas: [{ indice: 0, papel: "assunto", imageUrl: "https://x/1.jpg", previa: "https://x/1.jpg", fonte: "commons", credito: "Foto: X" }],
      assets: [{ imageUrl: "https://x/1.jpg", attribution: "Foto: X" } as AssetVisual],
    };
    const ok = resultadoDaEscolha(material, { escolha: 0, descricao: "a fachada do Fed", confianca: 90 });
    expect(ok.ok && ok.resultado.status).toBe("SELECTED");
    const baixa = resultadoDaEscolha(material, { escolha: 0, descricao: "?", confianca: 40 });
    expect(baixa.ok && baixa.resultado.status).toBe("NO_VALID_IMAGE");
    const nenhuma = resultadoDaEscolha(material, { escolha: null, descricao: "nenhuma serve", confianca: 0 });
    expect(nenhuma.ok && nenhuma.resultado.asset).toBeNull();
  });

  it("o pacote exige fato e só guarda citação que está no texto", () => {
    const material = { storyId: "s1", titulo: "t", url: "https://x", texto: 'O Fed manteve os juros. "Vamos esperar mais dados", disse Powell.' };
    expect(pacoteDaEntrega({ verified_facts: [] }, material).ok).toBe(false);
    const r = pacoteDaEntrega(
      {
        verified_facts: ["O Fed manteve os juros."],
        citacoes: [
          { autor: "Powell", original: "Vamos esperar mais dados", traducao: "Vamos esperar mais dados" },
          { autor: "Powell", original: "Isto nunca foi dito por ninguém aqui", traducao: "x" },
        ],
      },
      material,
    );
    expect(r.ok && r.pacote.citacoes?.length).toBe(1);
  });
});

describe("a newsletter pelas respostas guardadas", () => {
  it("pede o que falta e responde o que já foi entregue", async () => {
    const respostas = new Map<string, unknown>();
    const modelo = modeloDoClaude("2026-10-29", respostas);
    const mensagens = [
      { role: "system" as const, content: "S" },
      { role: "user" as const, content: "U" },
    ];
    let pedido: PedidoAoClaude | null = null;
    try {
      await modelo.json("redacao", mensagens);
    } catch (e) {
      pedido = e as PedidoAoClaude;
    }
    expect(pedido).toBeInstanceOf(PedidoAoClaude);
    expect(pedido!.tipo).toBe("escrever_newsletter");
    respostas.set(pedido!.chave, { subject: "x" });
    const r = await modelo.json<{ subject: string }>("redacao", mensagens);
    expect(r.data.subject).toBe("x");
  });
});

describe("o diretor do dia", () => {
  const projeto = { id: "p1", slug: "teste", timezone: "America/Sao_Paulo", settings: {} } as unknown as Project;
  const candidata = { storyId: "s1", title: "Trump e o aço", factualPackage: null, id: "c1", projectId: "p1" } as unknown as CandidataPersistida;

  function deps() {
    const tarefas = tarefasEmMemoria();
    const planos = planosEmMemoria();
    const fotos = new Map<string, unknown>();
    const d: DepsDoDiretor = {
      tarefas,
      planos,
      abrirTriagem: async (p, data) => [await tarefas.abrir({ projectId: p.id, editionDate: data, tipo: "classificar", chave: "triagem-1", instrucao: {}, material: {}, esquema: {} })],
      abrirPlano: async (p, plano) => tarefas.abrir({ projectId: p.id, editionDate: plano.data, tipo: "propor_plano", chave: `plano-${plano.data}`, instrucao: {}, material: { planoId: plano.id }, esquema: {} }),
      candidatas: async () => new Map([["s1", candidata]]),
      foto: async (_p, id) => (fotos.get(id) as never) ?? null,
      abrirFoto: async (p, plano, c) => tarefas.abrir({ projectId: p.id, editionDate: plano.data, tipo: "escolher_foto", chave: c.storyId, instrucao: {}, material: {}, esquema: {} }),
      abrirPacote: async (p, data, c) => tarefas.abrir({ projectId: p.id, editionDate: data, tipo: "extrair_pacote", chave: c.storyId, instrucao: {}, material: {}, esquema: {} }),
      reels: async () => [],
      escolherReel: async () => true,
      verificarPeloPlano: async () => {},
      postAgendado: async () => false,
      iniciarPost: async (p, data, id) => tarefas.abrir({ projectId: p.id, editionDate: data, tipo: "escrever_post", chave: id, instrucao: {}, material: {}, esquema: {} }),
      agendarPost: async () => ({ ok: true }),
      artigoGravado: async () => false,
      iniciarArtigo: async () => ({ erro: "sem" }),
      newsletterGravada: async () => false,
      avancarNewsletter: async () => ({ pronta: true }),
    };
    return { d, tarefas, planos, fotos };
  }

  it("vai da triagem ao plano, espera o dono, prepara e produz", async () => {
    const { d, tarefas, planos, fotos } = deps();
    let passo = await proximoPassoDoDia(projeto, "2026-10-29", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.tipo).toBe("classificar");
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, {}, "claude");

    passo = await proximoPassoDoDia(projeto, "2026-10-29", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.tipo).toBe("propor_plano");
    // A entrega do plano o põe na fila: aqui, à mão.
    const plano = await planos.doDia("p1", "2026-10-29");
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, {}, "claude");
    await planos.atualizar(plano.id, { estado: "aguardando", etapa: "aguardando_aprovacao", itens: { ...PLANO_VAZIO, posts: ["s1"] } });

    passo = await proximoPassoDoDia(projeto, "2026-10-29", d);
    expect(passo.tipo).toBe("aguardar");

    // O dono aprova no painel: o despacho muda o estado e a etapa.
    await planos.atualizar(plano.id, { estado: "aprovado", etapa: "preparo" });
    passo = await proximoPassoDoDia(projeto, "2026-10-29", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.tipo).toBe("escolher_foto");
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, {}, "claude");
    fotos.set("s1", { status: "SELECTED" });

    passo = await proximoPassoDoDia(projeto, "2026-10-29", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.tipo).toBe("extrair_pacote");
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, {}, "claude");
    (candidata as { factualPackage: unknown }).factualPackage = { verified_facts: ["x"] };

    passo = await proximoPassoDoDia(projeto, "2026-10-29", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.tipo).toBe("escrever_post");
    await tarefas.entregar((passo as { tarefa: { id: string } }).tarefa.id, { pronto: { em: "x" } }, "claude");

    passo = await proximoPassoDoDia(projeto, "2026-10-29", d);
    expect(passo.tipo).toBe("pronto");
  });

  it("o post descartado só por falta de verificação volta ao Claude", async () => {
    const { d, tarefas, planos, fotos } = deps();
    const plano = await planos.doDia("p1", "2026-10-30");
    await planos.atualizar(plano.id, { estado: "aprovado", etapa: "producao", itens: { ...PLANO_VAZIO, posts: ["s1"] } });
    fotos.set("s1", { status: "SELECTED" });
    (candidata as { factualPackage: unknown }).factualPackage = { verified_facts: ["x"] };
    const t = await tarefas.abrir({ projectId: "p1", editionDate: "2026-10-30", tipo: "escrever_post", chave: "s1", instrucao: {}, material: {}, esquema: {} });
    await tarefas.cancelar(t.id, ["[SOCIAL_REJECT_UNVERIFIED] ainda não passou pela verificação de finalista"]);
    const passo = await proximoPassoDoDia(projeto, "2026-10-30", d);
    expect(passo.tipo === "tarefa" && passo.tarefa.id).toBe(t.id);
    expect(passo.tipo === "tarefa" && passo.tarefa.estado).toBe("reparar");
  });
});
