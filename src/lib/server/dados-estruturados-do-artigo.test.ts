import { describe, expect, it } from "vitest";
import {
  corpoComLeiaTambem,
  corpoComPerguntas,
  dadosEstruturadosDaEditoria,
  dadosEstruturadosDaHome,
  dadosEstruturadosDoAutor,
  dadosEstruturadosDoArtigo,
  dataDeModificacao,
  jsonLdSeguro,
  perguntasDoArtigo,
} from "./dados-estruturados-do-artigo";

const base = {
  slug: "hollywood-2026-10-04",
  title: "Hollywood nos EUA atrai capital privado para filmes independentes",
  seo_description: "Investidores privados entram no financiamento de Hollywood.",
  category: "Economia",
  cover_image: "https://upload.wikimedia.org/wikipedia/commons/d/db/Wall_Street.jpg",
  published_at: "2026-10-04T09:29:38.729Z",
  updated_at: "2026-10-04T09:29:38.729Z",
};

function grafo(d: Record<string, unknown>): Array<Record<string, unknown>> {
  return d["@graph"] as Array<Record<string, unknown>>;
}

describe("dadosEstruturadosDoArtigo", () => {
  it("NewsArticle completo: título, datas, autor Organization, editora, imagem, editoria", () => {
    const g = grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [] }));
    const materia = g.find((n) => n["@type"] === "NewsArticle")!;
    expect(materia.headline).toBe(base.title);
    expect(materia.datePublished).toBe("2026-10-04T09:29:38.729Z");
    expect(materia.dateModified).toBe("2026-10-04T09:29:38.729Z");
    expect(materia.author).toEqual({ "@type": "Organization", name: "Redação eua.journal", url: "https://casaloti.ia.br" });
    expect(materia.publisher).toEqual({ "@id": "https://casaloti.ia.br/#organizacao" });
    // A miniatura de 1280 do Commons, e não o original (que chega a 9 MB).
    expect(materia.image).toEqual(["https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Wall_Street.jpg/1280px-Wall_Street.jpg"]);
    expect(materia.articleSection).toBe("Economia");
    expect(g.some((n) => n["@type"] === "Organization" && n["@id"] === "https://casaloti.ia.br/#organizacao")).toBe(true);
  });

  it("caminho de navegação passa pela página da editoria", () => {
    const g = grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [] }));
    const caminho = g.find((n) => n["@type"] === "BreadcrumbList")!.itemListElement as Array<Record<string, unknown>>;
    expect(caminho.map((c) => c.item)).toEqual([
      "https://casaloti.ia.br",
      "https://casaloti.ia.br/editoria/economia",
      "https://casaloti.ia.br/artigos/hollywood-2026-10-04",
    ]);
    expect(caminho.map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it("FAQPage só quando há pergunta visível", () => {
    expect(grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [] })).some((n) => n["@type"] === "FAQPage")).toBe(false);
    const g = grafo(
      dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [{ pergunta: "Quanto tempo leva?", resposta: "Cerca de **um ano**." }] }),
    );
    const faq = g.find((n) => n["@type"] === "FAQPage")!;
    expect(faq.mainEntity).toEqual([
      { "@type": "Question", name: "Quanto tempo leva?", acceptedAnswer: { "@type": "Answer", text: "Cerca de um ano." } },
    ]);
  });

  it("sem capa, sem image: o logotipo não finge ser a foto da matéria", () => {
    const g = grafo(dadosEstruturadosDoArtigo({ ...base, cover_image: null }, { perguntasVisiveis: [] }));
    expect(g.find((n) => n["@type"] === "NewsArticle")!.image).toBeUndefined();
  });
});

describe("dataDeModificacao", () => {
  it("gravação da mesma rodada não conta como modificação", () => {
    expect(dataDeModificacao("2026-10-04T09:00:00Z", "2026-10-04T09:05:00Z")).toBe("2026-10-04T09:00:00.000Z");
  });

  it("mudança depois de publicar vira dateModified", () => {
    expect(dataDeModificacao("2026-10-04T09:00:00Z", "2026-10-06T12:00:00Z")).toBe("2026-10-06T12:00:00.000Z");
  });

  it("updated_at anterior à publicação não recua a data", () => {
    expect(dataDeModificacao("2026-10-04T09:00:00Z", "2026-10-01T09:00:00Z")).toBe("2026-10-04T09:00:00.000Z");
  });
});

describe("jsonLdSeguro", () => {
  it("escapa < para um título com </script> não fechar a tag", () => {
    const s = jsonLdSeguro({ headline: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("<");
    expect(JSON.parse(s).headline).toBe("</script><script>alert(1)</script>");
  });
});

describe("perguntas", () => {
  it("lê os dois formatos gravados no banco", () => {
    expect(
      perguntasDoArtigo([
        { pergunta: "A?", resposta: "a." },
        { question: "B?", answer: "b." },
        { pergunta: "sem resposta" },
        "lixo",
      ]),
    ).toEqual([
      { pergunta: "A?", resposta: "a." },
      { pergunta: "B?", resposta: "b." },
    ]);
  });

  it("a seção visível entra antes do crédito da fonte e escapa o texto", () => {
    const html = `<section><p>corpo</p></section><p class="fonte">Fonte: <a href="https://x.com">X</a></p>`;
    const r = corpoComPerguntas(html, [{ pergunta: "<b>Q</b>?", resposta: "R." }]);
    expect(r).toBe(
      `<section><p>corpo</p></section><section class="perguntas"><h2>Perguntas e respostas</h2><h3>&lt;b&gt;Q&lt;/b&gt;?</h3><p>R.</p></section><p class="fonte">Fonte: <a href="https://x.com">X</a></p>`,
    );
  });

  it("não duplica a seção que o ramo já escreveu no corpo", () => {
    const html = `<section><h2>Perguntas e respostas</h2><h3>Q?</h3><p>R.</p></section>`;
    expect(corpoComPerguntas(html, [{ pergunta: "Q?", resposta: "R." }])).toBe(html);
  });
});

describe("indexação no NewsArticle (06/10/2026)", () => {
  it("keywords, about e mentions saem das tags gravadas; sem tags, nenhum dos três", () => {
    const comTags = grafo(
      dadosEstruturadosDoArtigo(
        {
          ...base,
          content_html: "<section class=\"abertura\"><p>Fundos de Wall Street financiam filmes em Hollywood.</p></section>",
          tags: ["Economia", "assunto:Hollywood", "sobre:Place:Hollywood", "menciona:Organization:Wall Street|https://www.wikidata.org/wiki/Q127703"],
        },
        { perguntasVisiveis: [] },
      ),
    ).find((n) => n["@type"] === "NewsArticle")!;
    expect(comTags.keywords).toEqual(["Hollywood"]);
    expect(comTags.about).toEqual([{ "@type": "Place", name: "Hollywood" }]);
    expect(comTags.mentions).toEqual([{ "@type": "Organization", name: "Wall Street", sameAs: "https://www.wikidata.org/wiki/Q127703" }]);

    const semTags = grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [] })).find((n) => n["@type"] === "NewsArticle")!;
    expect(semTags).not.toHaveProperty("keywords");
    expect(semTags).not.toHaveProperty("about");
    expect(semTags).not.toHaveProperty("mentions");
  });

  it("o JSON-LD lê os assuntos PELO VALIDADOR: tag antiga genérica não sai, e entidade que o corpo não nomeia também não", () => {
    // Linha gravada antes da regra de 06/10/2026, como a de Chicago: "água" e
    // "energia" como assunto, e Trump em mentions sem estar no texto. Se a
    // página voltar a ler `indexacaoDasTags` direto, este teste quebra.
    const n = grafo(
      dadosEstruturadosDoArtigo(
        {
          ...base,
          title: "Chicago propõe um ano sem novos data centers",
          category: "Política",
          content_html:
            "<section class=\"abertura\"><p>O prefeito Brandon Johnson quer pausar os data centers.</p></section>" +
            "<section class=\"leia-tambem\"><h2>Leia também</h2><ul><li><a href=\"/artigos/x\">President Trump fala de tarifas</a></li></ul></section>",
          tags: [
            "assunto:data centers",
            "assunto:energia",
            "assunto:água",
            "assunto:governo",
            "sobre:Place:Chicago",
            "menciona:Person:Brandon Johnson",
            "menciona:Person:President Trump",
          ],
        },
        { perguntasVisiveis: [] },
      ),
    ).find((x) => x["@type"] === "NewsArticle")!;
    expect(n.keywords).toEqual(["data centers"]);
    expect(n.about).toEqual([{ "@type": "Place", name: "Chicago" }]);
    expect(n.mentions).toEqual([{ "@type": "Person", name: "Brandon Johnson" }]);
  });

  it("as perguntas gravadas entram antes da seção de fontes do molde, não depois", () => {
    const html = '<section><p>Texto.</p></section><section class="fontes"><h2>Fontes</h2><ul><li>x</li></ul></section>';
    const r = corpoComPerguntas(html, [{ pergunta: "Q?", resposta: "R." }]);
    expect(r.indexOf("Perguntas e respostas")).toBeLessThan(r.indexOf('class="fontes"'));
  });
});

describe("auditoria de SEO de 05/10/2026", () => {
  it("a capa do Pexels gravada com &amp%3B sai limpa no JSON-LD", () => {
    const g = grafo(
      dadosEstruturadosDoArtigo(
        { ...base, cover_image: "https://images.pexels.com/photos/1/p.jpeg?auto=compress&amp%3Bcs=tinysrgb&amp%3Bdpr=2&w=600" },
        { perguntasVisiveis: [] },
      ),
    );
    const materia = g.find((n) => n["@type"] === "NewsArticle")!;
    // Desde 06/10/2026 como ImageObject, nos três cortes de tamanho conhecido, e ainda sem `&amp;`.
    const imagens = materia.image as Array<{ url: string; width: number; height: number }>;
    expect(imagens.map((i) => [i.width, i.height])).toEqual([
      [1200, 675],
      [1200, 900],
      [1200, 1200],
    ]);
    expect(imagens[0].url).toBe("https://images.pexels.com/photos/1/p.jpeg?auto=compress&cs=tinysrgb&w=1200&h=675&fit=crop");
    expect(materia.isPartOf).toEqual({ "@id": "https://casaloti.ia.br/#site" });
  });

  it("a organização tem logotipo com medida e o Instagram em sameAs", () => {
    const g = grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [] }));
    const org = g.find((n) => n["@type"] === "Organization")!;
    expect(org.sameAs).toEqual(["https://instagram.com/eua.journal"]);
    expect(org.logo).toMatchObject({ width: 800, height: 142 });
  });

  it("a home declara o site e a organização, sem SearchAction porque não há busca", () => {
    const g = grafo(dadosEstruturadosDaHome());
    expect(g.map((n) => n["@type"])).toEqual(["Organization", "WebSite"]);
    expect(JSON.stringify(g)).not.toContain("SearchAction");
  });

  it("a editoria é CollectionPage com a lista das matérias e o caminho", () => {
    const g = grafo(
      dadosEstruturadosDaEditoria(
        { nome: "Economia", descricao: "Juros.", url: "https://casaloti.ia.br/editoria/economia" },
        [{ url: "https://casaloti.ia.br/artigos/a", titulo: "A" }],
      ),
    );
    const pagina = g.find((n) => n["@type"] === "CollectionPage")!;
    expect((pagina.mainEntity as { itemListElement: unknown[] }).itemListElement).toEqual([
      { "@type": "ListItem", position: 1, url: "https://casaloti.ia.br/artigos/a", name: "A" },
    ]);
    expect(g.some((n) => n["@type"] === "BreadcrumbList")).toBe(true);
  });
});

describe("corpoComLeiaTambem", () => {
  const relacionadas = [{ slug: "b-2026-10-01", titulo: "B <x>" }];
  const editoria = { nome: "Economia", href: "/editoria/economia" };

  it("põe o bloco antes das perguntas e da fonte", () => {
    const html = '<p>Texto.</p><section class="perguntas"><h2>Perguntas e respostas</h2></section><p class="fonte">Fonte</p>';
    const saida = corpoComLeiaTambem(html, relacionadas, editoria);
    expect(saida.indexOf('<section class="leia-tambem">')).toBeGreaterThan(saida.indexOf("<p>Texto.</p>"));
    expect(saida.indexOf('<section class="leia-tambem">')).toBeLessThan(saida.indexOf('class="perguntas"'));
    expect(saida).toContain('<a href="/artigos/b-2026-10-01">B &lt;x&gt;</a>');
    expect(saida).toContain('<a href="/editoria/economia">Mais de Economia</a>');
  });

  it("não duplica quando o corpo já tem o bloco (refaz com as atuais), e não inventa sem relacionadas", () => {
    const comBloco = '<p>a</p><section class="leia-tambem"><h2>Leia também</h2></section>';
    const saida = corpoComLeiaTambem(comBloco, relacionadas, editoria);
    expect((saida.match(/class="leia-tambem"/g) ?? []).length).toBe(1);
    expect(saida).toContain('<a href="/editoria/economia">Mais de Economia</a>');
    expect(corpoComLeiaTambem("<p>a</p>", [], null)).toBe("<p>a</p>");
  });
});

describe("tituloDaAba", () => {
  it("põe a marca só quando o total cabe em 60 caracteres", async () => {
    const { tituloDaAba } = await import("./dados-estruturados-do-artigo");
    expect(tituloDaAba("Emprego nos EUA quase não muda em setembro")).toBe("Emprego nos EUA quase não muda em setembro | eua.journal");
    const longo = "Juíza considera inconstitucional busca sem mandado no Flock, em Oklahoma";
    expect(tituloDaAba(longo)).toBe(longo);
  });
});

describe("autor no JSON-LD (06/10/2026)", () => {
  const autor = {
    slug: "ana-silva",
    nome: "Ana Silva",
    cargo: "Editora de Economia",
    foto_url: "https://azqpdesusdzqndvsqmko.supabase.co/storage/v1/object/public/public_assets/autores/p/ana.jpg",
    redes: { instagram: "https://www.instagram.com/ana.silva/", linkedin: "https://www.linkedin.com/in/ana-silva", site: "" },
  };

  it("com autor, o NewsArticle traz Person com url da página, cargo, foto e sameAs", () => {
    const g = grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [], autor }));
    const materia = g.find((n) => n["@type"] === "NewsArticle")!;
    expect(materia.author).toEqual({
      "@type": "Person",
      "@id": "https://casaloti.ia.br/autor/ana-silva#pessoa",
      name: "Ana Silva",
      url: "https://casaloti.ia.br/autor/ana-silva",
      jobTitle: "Editora de Economia",
      image: autor.foto_url,
      sameAs: ["https://www.instagram.com/ana.silva/", "https://www.linkedin.com/in/ana-silva"],
      worksFor: { "@id": "https://casaloti.ia.br/#organizacao" },
    });
    // Quem publica continua sendo a organização.
    expect(materia.publisher).toEqual({ "@id": "https://casaloti.ia.br/#organizacao" });
  });

  it("sem autor (ou autor nulo), segue a Redação como Organization", () => {
    const g = grafo(dadosEstruturadosDoArtigo(base, { perguntasVisiveis: [], autor: null }));
    expect(g.find((n) => n["@type"] === "NewsArticle")!.author).toEqual({
      "@type": "Organization",
      name: "Redação eua.journal",
      url: "https://casaloti.ia.br",
    });
  });

  it("a página do autor é ProfilePage com a Person como mainEntity e a lista das matérias", () => {
    const g = grafo(
      dadosEstruturadosDoAutor({ ...autor, minibio: "Cobre juros e mercado.", area: "economia" }, [
        { url: "https://casaloti.ia.br/artigos/a", titulo: "A" },
      ]),
    );
    const pagina = g.find((n) => n["@type"] === "ProfilePage")!;
    expect(pagina.url).toBe("https://casaloti.ia.br/autor/ana-silva");
    const pessoa = pagina.mainEntity as Record<string, unknown>;
    expect(pessoa["@type"]).toBe("Person");
    expect(pessoa.description).toBe("Cobre juros e mercado.");
    expect(pessoa.knowsAbout).toBe("Economia");
    const lista = g.find((n) => n["@type"] === "ItemList")!;
    expect(lista.itemListElement).toEqual([{ "@type": "ListItem", position: 1, url: "https://casaloti.ia.br/artigos/a", name: "A" }]);
  });
});

describe("seção de perguntas pela classe (14/10/2026)", () => {
  it("o título \"Entenda em 4 perguntas\" conta como seção já escrita, e a página não duplica", async () => {
    const { corpoJaTemPerguntas, corpoComPerguntas } = await import("./dados-estruturados-do-artigo");
    const html = '<section class="perguntas"><h2>Entenda em 1 pergunta</h2><h3>Quanto?</h3><p>3,6%.</p></section>';
    expect(corpoJaTemPerguntas(html)).toBe(true);
    expect(corpoComPerguntas(html, [{ pergunta: "Quanto?", resposta: "3,6%." }])).toBe(html);
  });
});

