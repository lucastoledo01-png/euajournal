import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaginaDaMateria, type MateriaDaPagina } from "./PaginaDaMateria";

const WALL_STREET =
  "https://upload.wikimedia.org/wikipedia/commons/d/db/New_York_City_%28New_York%2C_USA%29%2C_Wall_Street_--_2012_--_6614.jpg";

/**
 * O defeito que o dono viu em 05/10/2026: a capa e, logo abaixo, a mesma foto
 * de novo, porque o HTML da edição traz a foto dentro do corpo. O endereço no
 * corpo tem `&amp;` e tamanho diferente do da capa de propósito.
 */
const materia: MateriaDaPagina = {
  slug: "hollywood-2026-10-04",
  title: "Hollywood nos EUA atrai capital privado para filmes independentes",
  description: "Investidores privados entram no financiamento de Hollywood.",
  category: "Economia",
  cover_image: WALL_STREET,
  published_at: "2026-10-04T09:29:38.729Z",
  updated_at: "2026-10-04T09:29:38.729Z",
  content_html:
    `<img src="${WALL_STREET}?w=600&amp;h=360" alt="" />` +
    `<p style="font-size:12px">Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons</p>` +
    `<section><p>Investidores privados estão entrando no financiamento de Hollywood.</p></section>` +
    `<p class="fonte">Fonte: <a href="https://www.cnbc.com/x">CNBC</a></p>`,
  aeo_questions: [{ pergunta: "Quanto tempo leva uma produção independente?", resposta: "Cerca de um ano." }],
};

function jsonLd(container: HTMLElement): Record<string, unknown> {
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.innerHTML ?? "{}");
}

describe("PaginaDaMateria", () => {
  it("a foto da capa aparece uma vez, e o crédito dela fica embaixo da capa", () => {
    const { container } = render(<PaginaDaMateria article={materia} comComentarios={false} />);
    // A capa usa a foto duas vezes (a inteira e o fundo desfocado, 14/10/2026); o corpo, nenhuma.
    const noCorpo = [...(container.querySelector(".artigo-corpo")?.querySelectorAll("img") ?? [])].filter((i) => (i.getAttribute("src") ?? "").includes("Wall_Street"));
    expect(noCorpo).toHaveLength(0);
    const naCapa = [...(container.querySelector("figure")?.querySelectorAll("img") ?? [])].filter((i) => (i.getAttribute("src") ?? "").includes("Wall_Street"));
    expect(naCapa.filter((i) => i.getAttribute("aria-hidden") !== "true")).toHaveLength(1);
    // Sem legenda gravada, a neutra abre a legenda (06/10/2026), e o crédito segue junto.
    expect(container.querySelector("figcaption")?.textContent).toMatch(/^Imagem ilustrativa: .+\. · Dietmar Rabich, CC BY-SA 4\.0, via Wikimedia Commons$/);
    expect(container.querySelector(".artigo-corpo")?.innerHTML).not.toContain("Dietmar Rabich");
  });

  it("matéria gravada com \"O que você precisa saber\" não mostra o bloco (dono, 14/10/2026)", () => {
    const comBloco = {
      ...materia,
      content_html:
        `<section class="essencial"><h2>O que você precisa saber</h2><ul><li>Um tópico.</li></ul></section>` + materia.content_html,
    };
    const { container } = render(<PaginaDaMateria article={comBloco} comComentarios={false} />);
    expect(container.querySelector(".essencial")).toBeNull();
    expect(container.textContent).not.toContain("O que você precisa saber");
  });

  it("a capa mostra a foto inteira, sem cortar, sobre a própria foto desfocada (14/10/2026)", () => {
    const { container } = render(<PaginaDaMateria article={materia} comComentarios={false} />);
    const capa = container.querySelector("figure");
    const fotos = [...(capa?.querySelectorAll("img") ?? [])];
    // Uma visível, inteira (contain), e o fundo decorativo, sem texto alternativo.
    expect(fotos.some((i) => (i.getAttribute("class") ?? "").includes("object-contain"))).toBe(true);
    const fundo = fotos.find((i) => (i.getAttribute("class") ?? "").includes("blur"));
    expect(fundo?.getAttribute("alt")).toBe("");
    expect(fundo?.getAttribute("aria-hidden")).toBe("true");
  });

  it("mostra as perguntas e respostas e só então marca o FAQPage", () => {
    const { container } = render(<PaginaDaMateria article={materia} comComentarios={false} />);
    expect(screen.getByRole("heading", { name: /^Entenda em \d+ perguntas?$/ })).toBeInTheDocument();
    expect(screen.getByText("Quanto tempo leva uma produção independente?")).toBeInTheDocument();
    const grafo = jsonLd(container)["@graph"] as Array<Record<string, unknown>>;
    expect(grafo.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "NewsArticle", "BreadcrumbList", "FAQPage"]);
  });

  it("sem pergunta, sem FAQPage", () => {
    const { container } = render(<PaginaDaMateria article={{ ...materia, aeo_questions: [] }} comComentarios={false} />);
    const grafo = jsonLd(container)["@graph"] as Array<Record<string, unknown>>;
    expect(grafo.some((n) => n["@type"] === "FAQPage")).toBe(false);
    expect(screen.queryByRole("heading", { name: /^Entenda em/ })).toBeNull();
  });

  it("a linha fina que repete o começo do lide não aparece duas vezes", () => {
    const repetida = { ...materia, description: "Investidores privados estão entrando no financiamento de Hollywood." };
    const { container } = render(<PaginaDaMateria article={repetida} comComentarios={false} />);
    expect(container.querySelector("article")?.textContent?.split("Investidores privados estão entrando").length).toBe(2);
    render(<PaginaDaMateria article={materia} comComentarios={false} />);
    expect(screen.getByText("Investidores privados entram no financiamento de Hollywood.")).toBeInTheDocument();
  });

  it("o JSON-LD sai com < escapado", () => {
    const { container } = render(
      <PaginaDaMateria article={{ ...materia, title: "Título com </script> no meio" }} comComentarios={false} />,
    );
    const bruto = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? "";
    expect(bruto).not.toContain("</script>");
    expect(bruto).toContain("\\u003c/script>");
  });
});

describe("PaginaDaMateria depois da auditoria de SEO (05/10/2026)", () => {
  const semCredito: MateriaDaPagina = {
    ...materia,
    content_html: `<section><p>Investidores privados estão entrando no financiamento de Hollywood.</p></section><p class="fonte">Fonte: <a href="https://www.cnbc.com/x">CNBC</a></p>`,
    aeo_questions: [],
  };

  it("a data de publicação é um <time> com a mesma data do JSON-LD", () => {
    const { container } = render(<PaginaDaMateria article={semCredito} comComentarios={false} />);
    const tempo = container.querySelector("article time");
    expect(tempo?.getAttribute("dateTime")).toBe("2026-10-04T09:29:38.729Z");
    expect(container.textContent).not.toContain("Atualizado em");
  });

  it("modificada em outro dia, a tela mostra só a publicação e o JSON-LD guarda a modificação (06/10/2026)", () => {
    const { container } = render(
      <PaginaDaMateria article={{ ...semCredito, updated_at: "2026-10-06T12:00:00.000Z" }} comComentarios={false} />,
    );
    expect(container.textContent).not.toContain("Atualizado em");
    const jsonLd = container.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
    expect(jsonLd).toContain("dateModified");
  });

  it("foto do Commons sem crédito gravado ganha o link para a página do arquivo", () => {
    const { container } = render(<PaginaDaMateria article={semCredito} comComentarios={false} />);
    const link = container.querySelector("figcaption a");
    expect(link?.getAttribute("href")).toBe(
      "https://commons.wikimedia.org/wiki/File:New_York_City_%28New_York%2C_USA%29%2C_Wall_Street_--_2012_--_6614.jpg",
    );
  });

  it("o chapéu leva à página da editoria", () => {
    const { container } = render(<PaginaDaMateria article={semCredito} comComentarios={false} />);
    expect(container.querySelector('article header a[href="/editoria/economia"]')?.textContent).toBe("Economia");
  });

  it("matéria sem 'Leia também' ganha o bloco com as relacionadas, que fecha a página depois da fonte (06/10/2026)", () => {
    const { container } = render(
      <PaginaDaMateria article={semCredito} comComentarios={false} relacionadas={[{ slug: "outra-2026-10-01", titulo: "Outra matéria" }]} />,
    );
    const corpo = container.querySelector(".artigo-corpo")?.innerHTML ?? "";
    expect(corpo).toContain('<a href="/artigos/outra-2026-10-01">Outra matéria</a>');
    expect(corpo.indexOf("leia-tambem")).toBeGreaterThan(corpo.indexOf('class="fonte"'));
  });
});

describe("assinatura da matéria (06/10/2026)", () => {
  const autor = {
    slug: "ana-silva",
    nome: "Ana Silva",
    cargo: "Editora de Economia",
    foto_url: "https://azqpdesusdzqndvsqmko.supabase.co/storage/v1/object/public/public_assets/autores/p/ana.jpg",
    redes: { instagram: "https://www.instagram.com/ana.silva/" },
  };

  it("com autor: o nome leva à página dele, com a foto pequena, e o JSON-LD traz a Person", () => {
    const { container } = render(<PaginaDaMateria article={materia} comComentarios={false} autor={autor} />);
    const link = screen.getByRole("link", { name: "Ana Silva" });
    expect(link).toHaveAttribute("href", "/autor/ana-silva");
    expect(link).toHaveAttribute("rel", "author");
    const cabecalho = container.querySelector("article header")!;
    expect(cabecalho.querySelector(`img[src="${autor.foto_url}"]`)).not.toBeNull();
    expect(cabecalho.textContent).not.toContain("Redação");
    const grafo = jsonLd(container)["@graph"] as Array<Record<string, unknown>>;
    const noticia = grafo.find((n) => n["@type"] === "NewsArticle")!;
    expect((noticia.author as Record<string, unknown>)["@type"]).toBe("Person");
    expect((noticia.author as Record<string, unknown>).url).toBe("https://casaloti.ia.br/autor/ana-silva");
  });

  it("com autor sem foto: só o nome, sem imagem vazia", () => {
    const { container } = render(<PaginaDaMateria article={materia} comComentarios={false} autor={{ ...autor, foto_url: null }} />);
    expect(screen.getByRole("link", { name: "Ana Silva" })).toBeInTheDocument();
    expect(container.querySelector("article header img")).toBeNull();
  });

  it("sem autor: 'Por Redação eua.journal', sem link, e o JSON-LD segue Organization", () => {
    const { container } = render(<PaginaDaMateria article={materia} comComentarios={false} />);
    expect(screen.getByText("Por Redação eua.journal")).toBeInTheDocument();
    expect(container.querySelector('a[rel="author"]')).toBeNull();
    const grafo = jsonLd(container)["@graph"] as Array<Record<string, unknown>>;
    const noticia = grafo.find((n) => n["@type"] === "NewsArticle")!;
    expect(noticia.author).toEqual({ "@type": "Organization", name: "Redação eua.journal", url: "https://casaloti.ia.br" });
  });
});
