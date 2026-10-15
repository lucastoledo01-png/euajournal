import { describe, expect, it } from "vitest";
import { identidadeDaPauta, renderEditionToHtml } from "./newsroom-service";
import type { EditionContent } from "./schemas";

function edicaoCom(overrides: Partial<EditionContent["stories"][number]> = {}): EditionContent {
  return {
    subject_options: ["assunto"],
    subject: "assunto",
    preheader: "preheader",
    headline: "headline",
    intro: "intro",
    stories: [
      {
        rank: 1,
        category: "Ferramentas",
        title: "Título comum",
        summary: "Um resumo com a palavra ferramenta no meio.",
        context: "contexto",
        why_it_matters: "importa",
        practical_impact: "impacto",
        humor_line: "piada",
        source_name: "Fonte",
        source_url: "https://exemplo.com/materia",
        secondary_urls: [],
        ...overrides,
      },
    ],
    quick_bits: [],
    closing: "fecho",
    final_line: "Agora você está desbugado.",
  } as EditionContent;
}

describe("montagem do HTML da newsletter", () => {
  it("neutraliza script vindo do título da fonte", () => {
    const html = renderEditionToHtml(edicaoCom({ title: '<script>alert("xss")</script>' }));

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("impede quebra de atributo pelo título, que também vai no alt da imagem", () => {
    const html = renderEditionToHtml(edicaoCom({ title: '" onerror="alert(1)' }));

    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&quot; onerror=&quot;");
  });

  it("bloqueia link com esquema executável na URL da fonte", () => {
    const html = renderEditionToHtml(edicaoCom({ source_url: "javascript:alert(1)" }));

    expect(html).not.toContain("javascript:alert");
    expect(html).toContain('href="#"');
  });

  it("preserva o link legítimo da fonte dentro do resumo", () => {
    const html = renderEditionToHtml(edicaoCom());

    expect(html).toContain('href="https://exemplo.com/materia"');
    expect(html).toContain("Título comum");
  });

  it("escapa também a abertura da edição", () => {
    const edicao = edicaoCom();
    edicao.intro = '<img src=x onerror="alert(1)">';

    expect(renderEditionToHtml(edicao)).not.toContain("<img src=x");
  });
});

describe("imagem da pauta", () => {
  it("casa a foto pela identidade da pauta, não pela posição", () => {
    const edicao = edicaoCom();
    edicao.stories = [
      { ...edicao.stories[0], title: "Primeira", source_url: "https://a.com/1" },
      { ...edicao.stories[0], rank: 2, title: "Segunda", source_url: "https://b.com/2" },
    ];

    // Só a SEGUNDA pauta tem foto. Com array posicional e um filtro de vazios
    // no caminho, essa foto aparecia na primeira.
    const imagens = new Map([
      [identidadeDaPauta(edicao.stories[1]), "https://img.com/segunda.jpg"],
    ]);

    const html = renderEditionToHtml(edicao, imagens);
    const antesDaSegunda = html.slice(0, html.indexOf("Segunda"));
    expect(antesDaSegunda).not.toContain("segunda.jpg");
    expect(html).toContain("segunda.jpg");
  });

  it("pauta sem foto sai sem imagem, e não com uma foto qualquer", () => {
    const html = renderEditionToHtml(edicaoCom(), new Map());
    expect(html).not.toContain("<img src=\"https://images.unsplash.com");
    expect(html).not.toContain("pexels-photo");
  });
});

describe("chamada do VisaMatch", () => {
  /*
   * Desde 05/10/2026 o bloco alterna de formato por edição, e a VARIANTE vai
   * no utm_content (qual formato converte). A edição desceu para o utm_term.
   */
  it("leva ao VisaMatch com a variante no utm_content e a edição no utm_term", () => {
    const html = renderEditionToHtml(edicaoCom(), new Map(), false, new Map(), "2026-10-06", { variante: "quiz" });
    expect(html).toContain("visamatch.imigrareua.com");
    expect(html).toContain("utm_content=quiz");
    expect(html).toContain("utm_term=edicao-2026-10-06");
    expect(html).toContain("Qual destes caminhos para os EUA combina mais com você?");
  });
});

describe("crédito da foto", () => {
  it("mostra a atribuição embaixo da imagem quando a licença exige", () => {
    const edicao = edicaoCom();
    const id = identidadeDaPauta(edicao.stories[0]);
    const html = renderEditionToHtml(
      edicao,
      new Map([[id, "https://upload.wikimedia.org/foto.jpg"]]),
      false,
      new Map([[id, "Foto: Gage Skidmore / Wikimedia Commons / CC BY-SA 2.0"]])
    );

    expect(html).toContain("Gage Skidmore / Wikimedia Commons / CC BY-SA 2.0");
  });

  it("não desenha nada quando a licença não exige atribuição", () => {
    const edicao = edicaoCom();
    const id = identidadeDaPauta(edicao.stories[0]);
    const html = renderEditionToHtml(edicao, new Map([[id, "https://upload.wikimedia.org/foto.jpg"]]));

    expect(html).toContain(encodeURIComponent("upload.wikimedia.org/foto.jpg"));
    expect(html).not.toContain("Wikimedia Commons /");
  });

  it("sem imagem, não sobra legenda órfã", () => {
    const edicao = edicaoCom();
    const id = identidadeDaPauta(edicao.stories[0]);
    const html = renderEditionToHtml(edicao, new Map(), false, new Map([[id, "Foto: Alguém / CC BY"]]));

    expect(html).not.toContain("Foto: Alguém");
  });
});
