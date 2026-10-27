import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EspacoDoProjeto } from "./EspacoDoProjeto";

/**
 * O menu do projeto tinha dez itens e cinco eram da vertical anterior.
 *
 * Estes testes prendem as duas metades da decisão de 21/09/2026: as cinco somem
 * do menu, e nenhuma delas é apagada. Arquivar sem prender vira remoção na
 * primeira faxina seguinte, e remoção não tem volta barata.
 */

const SECOES = [
  "Publicações",
  "Layout dos posts",
  "Newsletter e artigos",
  "Fontes de busca",
  "Blog",
  "Logs",
  "Avançado",
];

// "Layout" não entra na lista: o menu novo tem "Layout dos posts", que é a
// tela nova, e o que saiu foi o editor de layout desenhado à mão.
const FORA_DO_MENU = ["Sistema PROMPT", "Carrossel", "CMS", "Design"];

const PROJETOS = {
  ok: true,
  capacidades: ["coleta", "newsletter", "social"],
  moldesDoFeed: ["jornal", "jornal_bolha", "recorte", "sem_foto"],
  projetos: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "desbuguei",
      nome: "eua.journal",
      status: "active",
      nicho: "imigração",
      timezone: "America/Sao_Paulo",
      siteUrl: "https://casaloti.ia.br",
      marca: { nome: "eua.journal", cor: "#000", logoUrl: null },
      capacidades: { coleta: "enforce" },
      moldes: {},
      motor: "openai",
    },
  ],
};

function responder() {
  return vi.fn(async (url: string) => {
    const alvo = String(url);
    if (alvo.includes("/api/admin/sessao")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (alvo.includes("/api/admin/projetos")) {
      return new Response(JSON.stringify(PROJETOS), { status: 200 });
    }
    // As telas montadas dentro da seção buscam os próprios dados. Uma lista
    // vazia as deixa renderizar sem erro, que é o suficiente aqui.
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

describe("área do projeto", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "";
  });

  it("mostra as sete seções da operação diária", async () => {
    vi.stubGlobal("fetch", responder());

    render(<EspacoDoProjeto slug="desbuguei" />);

    const nav = within(await screen.findByRole("navigation", { name: "Seções do projeto" }));
    for (const secao of SECOES) {
      expect(nav.getByRole("button", { name: new RegExp(secao, "i") })).toBeInTheDocument();
    }
  });

  it("não traz a vertical arquivada para o menu", async () => {
    vi.stubGlobal("fetch", responder());

    render(<EspacoDoProjeto slug="desbuguei" />);

    const nav = within(await screen.findByRole("navigation", { name: "Seções do projeto" }));
    for (const item of FORA_DO_MENU) {
      expect(nav.queryByRole("button", { name: new RegExp(item, "i") })).toBeNull();
    }
  });

  /** Decoração volta sozinha, num commit pequeno que parece simpático. */
  it("o menu não usa emoji como ícone", async () => {
    vi.stubGlobal("fetch", responder());

    render(<EspacoDoProjeto slug="desbuguei" />);

    const nav = within(await screen.findByRole("navigation", { name: "Seções do projeto" }));
    const emoji = /\p{Extended_Pictographic}/u;
    for (const secao of SECOES) {
      const botao = nav.getByRole("button", { name: new RegExp(secao, "i") });
      expect(botao.textContent ?? "").not.toMatch(emoji);
    }
  });

  /*
   * As telas de endereço próprio (06/10/2026) só eram alcançáveis por quem
   * sabia a URL. Agora são links do menu, nas duas navegações.
   */
  it("leva às telas de endereço próprio: cadência, perfis de referência, acervo e autores", async () => {
    vi.stubGlobal("fetch", responder());

    render(<EspacoDoProjeto slug="desbuguei" />);

    const lateral = within(await screen.findByRole("navigation", { name: "Seções do projeto" }));
    const movel = within(screen.getByRole("navigation", { name: "Seções do projeto, no celular" }));
    for (const nav of [lateral, movel]) {
      expect(nav.getByRole("link", { name: "Cadência" })).toHaveAttribute("href", "/admin/desbuguei/cadencia");
      expect(nav.getByRole("link", { name: "Perfis de referência" })).toHaveAttribute(
        "href",
        "/admin/desbuguei/perfis-de-referencia",
      );
      expect(nav.getByRole("link", { name: "Acervo de imagens" })).toHaveAttribute("href", "/admin/desbuguei/acervo");
      expect(nav.getByRole("link", { name: "Autores" })).toHaveAttribute("href", "/admin/desbuguei/autores");
    }
  });

  it("slug desconhecido não abre painel nenhum", async () => {
    vi.stubGlobal("fetch", responder());

    render(<EspacoDoProjeto slug="nao-existe" />);

    await waitFor(() =>
      expect(screen.getByText(/nenhum projeto com o identificador/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("navigation", { name: "Seções do projeto" })).toBeNull();
  });
});
