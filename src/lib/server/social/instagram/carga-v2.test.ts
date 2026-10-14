/*
 * A capa com foto passou a ser `capa_jornal`, da gramática de jornal.
 * A regra vive em `varianteDaCapa`, e estas fixtures representam a peça com
 * foto: quando o nome muda, elas mudam junto, e é isso que este comentário
 * existe para lembrar.
 */
import { describe, expect, it } from "vitest";
import { criarSocialPostsStore } from "../social-posts-store";
import type { PostParaGravar } from "../social-posts-store";
import { ehEnsaio, ehLegado, ehSocialV2, lerCargaV2, MOTIVO_CARGA_INCOMPLETA } from "./carga-v2";

/**
 * O encaixe entre quem grava e quem lê.
 *
 * `social-posts-store.test.ts` prova que o pipeline grava as colunas certas.
 * `worker-v2-ramo.test.ts` prova que o worker se comporta diante de uma linha.
 * Faltava o elo: a linha que o store REALMENTE monta é aceita pelo leitor do
 * worker?
 *
 * Sem este teste, os dois lados podem divergir e cada suíte continua verde:
 * bastaria o store renomear uma chave de `content_json` para toda linha V2
 * passar a falhar fechada em produção, com os dois arquivos de teste passando.
 * É o tipo de quebra que só aparece no primeiro post que não sai.
 */

function bancoEmMemoria() {
  const linhas: Array<Record<string, unknown>> = [];
  const consulta = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
    return q;
  };
  const client = {
    from: () => ({
      select: () => consulta(),
      upsert: (novas: Array<Record<string, unknown>>) => {
        linhas.push(...novas);
        return { select: async () => ({ data: novas.map((_, i) => ({ id: `id-${i}` })), error: null }) };
      },
    }),
  } as never;
  return { client, linhas };
}

const DIA = "2026-09-06";

function post(visual: unknown): PostParaGravar {
  return {
    projectId: "proj-1",
    editionDate: DIA,
    candidateId: "cand-1",
    topicId: "org:uscis",
    eventFingerprint: "uscis+prazo",
    origem: { originChannel: "social", originStoryId: null, motivo: "aprovada e verificada" },
    vaga: { posicao: 1, slot: `${DIA}-01`, quandoIso: `${DIA}T11:00:00Z`, horaLocal: "08:00" },
    visual,
    post: {
      pauta: { storyId: "s-1", pontuacao: { total: 71 }, classificacao: { eixo: "imigracao" } },
      copy: { headline: "USCIS muda prazo de análise do I-765", hashtags: [] },
      veredicto: {
        passed: true,
        issues: [],
        repairableIssues: [],
        fatalIssues: [],
        attempts: 0,
        finalDecision: "publicar",
        legendaFinal: "A mudança vale a partir de outubro.\n\n#USCIS #I765",
        hashtagsFinais: ["#USCIS", "#I765"],
      },
      tentativas: 0,
      tokens: 0,
      custoUsd: 0,
      reparosAplicados: [],
    },
    /* O artefato congelado: é ele que o worker publica. */
    formato: "static",
    artefatos: [
      {
        index: 1,
        url: "https://storage.exemplo/imigra-us/2026-09-06/social-v2.png",
        path: "imigra-us/2026-09-06/social-v2-2026-09-06-s-1/social-v2.png",
        filename: "social-v2.png",
        mime: "image/png",
        sha256: "b".repeat(64),
        bytes: 172_647,
        largura: 2160,
        altura: 2880,
        otimizado: false,
      },
    ],
  } as unknown as PostParaGravar;
}

const SEM_FOTO = { motivo: "NO_VALID_IMAGE", asset: null, entidade: { nome: "USCIS" }, fontesConsultadas: [] };
const COM_FOTO = {
  motivo: "",
  asset: {
    id: "asset-1",
    source: "wikimedia_commons",
    sourceAssetId: "File:USCIS.jpg",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:USCIS.jpg",
    author: "Alguém",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    attribution: "Foto: Alguém / Wikimedia Commons / CC BY-SA 4.0",
    rightsStatement: "",
    rightsStatus: "verified",
    rightsCheckedAt: `${DIA}T10:00:00Z`,
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/6b/USCIS.jpg",
    imageContextType: "institution",
    assetDate: 2022,
    temporalRelevanceScore: 90,
    semanticContextFit: 88,
  },
};

async function linhaGravada(visual: unknown): Promise<Record<string, unknown>> {
  const { client, linhas } = bancoEmMemoria();
  const r = await criarSocialPostsStore(client).gravar([post(visual)]);
  expect(r.gravados).toBe(1);
  return linhas[0];
}

describe("a linha que o pipeline grava é aceita pelo worker", () => {
  it("brand card: reconhecida e íntegra", async () => {
    const linha = await linhaGravada(SEM_FOTO);

    expect(ehSocialV2(linha)).toBe(true);
    const leitura = lerCargaV2(linha);
    expect(leitura.ok, leitura.ok ? "" : leitura.motivo).toBe(true);

    if (!leitura.ok) return;
    expect(leitura.carga.headline).toBe("USCIS muda prazo de análise do I-765");
    expect(leitura.carga.legenda).toBe(linha.caption);
    expect(leitura.carga.hashtags).toEqual(["#USCIS", "#I765"]);
    expect(leitura.carga.eixo).toBe("imigracao");
    expect(leitura.carga.foto).toBeNull();
    expect(leitura.carga.motivoSemFoto).toBe("NO_VALID_IMAGE");
    expect(leitura.carga.artefato.sha256).toBe("b".repeat(64));
    expect(leitura.carga.artefato.url).toContain("social-v2.png");
  });

  it("linha sem artefato falha fechada: não há o que publicar", async () => {
    /*
     * Uma linha `scheduled` sem arquivo aprovado obrigaria o worker a produzir
     * a peça, que é o que o V2 existe para não fazer.
     */
    const linha = await linhaGravada(SEM_FOTO);
    const conteudo = linha.content_json as Record<string, unknown>;
    const arte = { ...(conteudo.arte as Record<string, unknown>) };
    delete arte.artefato;

    const leitura = lerCargaV2({ ...linha, content_json: { ...conteudo, arte } });
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) expect(leitura.faltando).toContain("content_json.arte.artefato");
  });

  it("sha256 malformado é tratado como ausente", async () => {
    const linha = await linhaGravada(SEM_FOTO);
    const conteudo = linha.content_json as Record<string, unknown>;
    for (const sha of ["", "abc", "z".repeat(64), null]) {
      const arte = {
        ...(conteudo.arte as Record<string, unknown>),
        artefato: { ...((conteudo.arte as Record<string, unknown>).artefato as object), sha256: sha },
      };
      const leitura = lerCargaV2({ ...linha, content_json: { ...conteudo, arte } });
      expect(leitura.ok, String(sha)).toBe(false);
    }
  });

  it("post com foto: a URL e o crédito chegam ao worker", async () => {
    const linha = await linhaGravada(COM_FOTO);
    const leitura = lerCargaV2(linha);
    expect(leitura.ok, leitura.ok ? "" : leitura.motivo).toBe(true);

    if (!leitura.ok) return;
    expect(leitura.carga.foto).toEqual({
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/6b/USCIS.jpg",
      attribution: "Foto: Alguém / Wikimedia Commons / CC BY-SA 4.0",
    });
    expect(leitura.carga.visualAssetId).toBe("asset-1");
  });

  it("nenhuma linha do store cai na falha fechada por acidente", async () => {
    for (const visual of [SEM_FOTO, COM_FOTO]) {
      const leitura = lerCargaV2(await linhaGravada(visual));
      expect(leitura.ok).toBe(true);
    }
  });

  it("a chave que o worker exige é a que o store grava, e o nome importa", async () => {
    /*
     * Guarda contra renomeação silenciosa. Se `content_json.arte` mudar de
     * nome no store, este teste falha aqui em vez de em produção.
     */
    const linha = await linhaGravada(SEM_FOTO);
    const conteudo = linha.content_json as Record<string, unknown>;
    expect(Object.keys(conteudo)).toContain("arte");
    expect(Object.keys(conteudo)).toContain("visual");
    expect(Object.keys(conteudo)).toContain("hashtags");
    expect((conteudo.arte as Record<string, unknown>).eixo).toBe("imigracao");

    // E sem a chave, a leitura falha fechada com o código estruturado.
    const semArte = { ...linha, content_json: { ...conteudo, arte: undefined } };
    delete (semArte.content_json as Record<string, unknown>).arte;
    const leitura = lerCargaV2(semArte);
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) {
      expect(leitura.motivo).toContain(MOTIVO_CARGA_INCOMPLETA);
      expect(leitura.faltando).toContain("content_json.arte");
    }
  });

  it("a linha do store não é ensaio e passou pela guarda", async () => {
    // As duas condições que o worker confere e o worker legado ignora.
    const linha = await linhaGravada(SEM_FOTO);
    expect(linha.dry_run).toBe(false);
    expect(linha.social_guard_status).toBe("passed");
    expect(ehEnsaio(linha)).toBe(false);
  });

  it("ensaio é qualquer coisa que não seja o booleano false", async () => {
    // A pergunta sobe para antes da reconciliação com a Meta, então ela não
    // pode depender de mais nada e não pode falhar aberta.
    for (const v of [true, undefined, null, "false", 0]) {
      expect(ehEnsaio({ dry_run: v }), String(v)).toBe(true);
    }
    expect(ehEnsaio({ dry_run: false })).toBe(false);
  });
});

describe("entradas adversárias na leitura da carga", () => {
  const base = async () => await linhaGravada(SEM_FOTO);

  it("generation_version com espaço em volta ainda é social-v2", async () => {
    const linha = { ...(await base()), generation_version: "  social-v2  " };
    expect(ehSocialV2(linha)).toBe(true);
  });

  it("generation_version em maiúscula É reconhecida, porque o custo do erro é assimétrico", async () => {
    /*
     * A primeira volta deste teste afirmava o contrário, tratando a coluna como
     * declaração exata. Está errado, e o motivo é para onde o quase-acerto cai:
     * quem não é reconhecido como V2 iria para o ramo legado, que REGENERA a
     * copy. Reconhecer um "SOCIAL-V2" a mais não faz mal; deixar de reconhecer
     * destrói o post aprovado.
     */
    expect(ehSocialV2({ ...(await base()), generation_version: "SOCIAL-V2" })).toBe(true);
    expect(ehSocialV2({ ...(await base()), generation_version: " Social-V2 " })).toBe(true);
  });

  it("versão escrita e não reconhecida não é legado: ela para", async () => {
    /*
     * "não é V2" e "é legado" não são a mesma coisa. Legado é a AUSÊNCIA de
     * versão. Uma linha com `social_v3` tratada como legada iria para o gerador
     * antigo e teria a copy reescrita, que é o pior desfecho para um erro de
     * digitação numa coluna.
     */
    for (const versao of ["social_v2", "social-v3", "v2", "socialv2"]) {
      const linha = { ...(await base()), generation_version: versao };
      expect(ehSocialV2(linha), versao).toBe(false);
      expect(ehLegado(linha), versao).toBe(false);
    }
  });

  it("legado é a ausência de versão, e só ela", async () => {
    for (const versao of [null, undefined, "", "   "]) {
      expect(ehLegado({ ...(await base()), generation_version: versao }), String(versao)).toBe(true);
    }
  });

  it("lista de hashtags vazia publica: as hashtags estão desligadas por padrão desde 06/10/2026", async () => {
    // 14/10/2026: o worker exigia ao menos uma hashtag, e nenhum post saiu de 06 a 14/10.
    const linha = await base();
    const leitura = lerCargaV2({
      ...linha,
      content_json: { ...(linha.content_json as object), hashtags: ["", "   "] },
    });
    expect(leitura.ok).toBe(true);
    if (leitura.ok) expect(leitura.carga.hashtags).toEqual([]);
  });

  it("sem o campo hashtags (nem lista vazia), o registro continua incompleto", async () => {
    const linha = await base();
    const { hashtags: _fora, ...semCampo } = linha.content_json as Record<string, unknown>;
    void _fora;
    const leitura = lerCargaV2({ ...linha, content_json: semCampo });
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) expect(leitura.faltando).toContain("content_json.hashtags");
  });

  it("dry_run como string não passa: a guarda exige o booleano false", async () => {
    const leitura = lerCargaV2({ ...(await base()), dry_run: "false" });
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) expect(leitura.faltando.join(" ")).toContain("dry_run");
  });

  it("arte como array não é bloco de arte", async () => {
    const linha = await base();
    const leitura = lerCargaV2({
      ...linha,
      content_json: { ...(linha.content_json as object), arte: [] },
    });
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) expect(leitura.faltando).toContain("content_json.arte");
  });

  it("visual com foto E capa=texto se contradiz, e contradição bloqueia", async () => {
    /*
     * A primeira versão deste teste afirmava que a foto ganhava, com o
     * argumento de que ela é o que foi aprovado. Só que a mesma linha diz que a
     * decisão foi capa de texto. Escolher uma das duas é adivinhar, e não
     * faria sentido bloquear a variante contraditória e adivinhar aqui.
     */
    const linha = await base();
    const leitura = lerCargaV2({
      ...linha,
      content_json: {
        ...(linha.content_json as object),
        visual: { imageUrl: "https://upload.wikimedia.org/x.jpg", attribution: "", capa: "texto" },
      },
    });
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) expect(leitura.motivo).toContain("se contradiz");
  });

  it("variante que contradiz o registro visual bloqueia", async () => {
    /*
     * `arte.variante` era dado morto: gravado e nunca lido. Dado morto é pior
     * que dado ausente, porque parece uma conferência.
     */
    const linha = await base();
    const leitura = lerCargaV2({
      ...linha,
      content_json: {
        ...(linha.content_json as object),
        // A linha diz peça com foto de fundo, e o registro visual é capa de texto.
        arte: { versao: "v2", variante: "capa_jornal", eixo: "imigracao" },
      },
    });
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) expect(leitura.motivo).toContain("contradiz o registro visual");
  });

  it("variante coerente passa, nos dois casos", async () => {
    const semFoto = lerCargaV2(await linhaGravada(SEM_FOTO));
    const comFoto = lerCargaV2(await linhaGravada(COM_FOTO));
    expect(semFoto.ok).toBe(true);
    expect(comFoto.ok).toBe(true);
  });

  it("variante ausente não bloqueia: o que é obrigatório é o bloco, não cada campo", async () => {
    // A distinção é a mesma do eixo: registro incompleto de um campo opcional
    // não é registro contraditório.
    const linha = await base();
    const conteudo = linha.content_json as Record<string, unknown>;
    const leitura = lerCargaV2({
      ...linha,
      content_json: {
        ...conteudo,
        // Sem `variante`, mas COM artefato: o arquivo continua obrigatório.
        arte: { versao: "v2", eixo: "", artefato: (conteudo.arte as Record<string, unknown>).artefato },
      },
    });
    expect(leitura.ok, leitura.ok ? "" : leitura.motivo).toBe(true);
    if (leitura.ok) expect(leitura.carga.eixo).toBe("");
  });

  it("o motivo lista TUDO que falta, não só a primeira coisa", async () => {
    const leitura = lerCargaV2({
      generation_version: "social-v2",
      dry_run: false,
      title: "",
      caption: "",
      story_id: null,
      social_guard_status: "passed",
      content_json: {},
    });
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) {
      // Quem for consertar à mão precisa da lista inteira numa passada.
      expect(leitura.faltando.length).toBeGreaterThanOrEqual(6);
      for (const esperado of ["title", "caption", "story_id", "content_json.hashtags", "content_json.arte", "content_json.visual"]) {
        expect(leitura.faltando).toContain(esperado);
      }
    }
  });
});
