import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";
import { MARCA } from "@/lib/marca";

/**
 * A home do painel deixou de ser a operação e virou a escolha do projeto.
 *
 * O que estes testes prendem é a mudança de porta: a sessão passa a ser
 * perguntada ao servidor, e não lembrada no `sessionStorage`. A diferença
 * aparecia como painel aberto e vazio, com toda chamada por trás devolvendo 401
 * sem que nada na tela dissesse que era preciso entrar de novo.
 */

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
      capacidades: { coleta: "enforce", newsletter: "enforce", social: "dry_run" },
      moldes: {},
      motor: "openai",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      slug: "teste-claude",
      nome: "Teste Claude",
      status: "active",
      nicho: "teste",
      timezone: "America/Sao_Paulo",
      siteUrl: null,
      marca: { nome: "Teste Claude", cor: "#000", logoUrl: null },
      capacidades: { aprovacao: "enforce" },
      moldes: {},
      motor: "claude_mcp",
    },
  ],
};

function responderPor(sessaoOk: boolean) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/api/admin/sessao")) {
      return new Response(JSON.stringify(sessaoOk ? { ok: true } : { error: "Não autorizado" }), {
        status: sessaoOk ? 200 : 401,
      });
    }
    return new Response(JSON.stringify(PROJETOS), { status: 200 });
  });
}

describe("home do painel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("pede senha quando o servidor não reconhece a sessão", async () => {
    vi.stubGlobal("fetch", responderPor(false));

    render(<AdminPage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: new RegExp(MARCA.nome, "i") })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
  });

  /**
   * O caso que o `sessionStorage` deixava passar: a marca local existe, o
   * cookie não vale mais. Antes isto abria o painel inteiro.
   */
  it("marca antiga no navegador não abre o painel sozinha", async () => {
    sessionStorage.setItem("casaloti_admin_authed", "true");
    vi.stubGlobal("fetch", responderPor(false));

    render(<AdminPage />);

    await waitFor(() => expect(screen.getByLabelText(/senha/i)).toBeInTheDocument());
    expect(screen.queryByText(/nenhum projeto cadastrado/i)).not.toBeInTheDocument();
  });

  it("com sessão válida, lista os projetos e leva para a área de cada um", async () => {
    vi.stubGlobal("fetch", responderPor(true));

    render(<AdminPage />);

    const card = await screen.findByRole("link", { name: /eua\.journal/i });
    expect(card).toHaveAttribute("href", "/admin/desbuguei");
  });

  it("o card diz quem faz o trabalho de modelo do projeto", async () => {
    vi.stubGlobal("fetch", responderPor(true));

    render(<AdminPage />);

    const automatico = await screen.findByRole("link", { name: /eua\.journal/i });
    expect(automatico).toHaveTextContent("Motor: OpenAI (automático)");
    const claude = await screen.findByRole("link", { name: /teste claude/i });
    expect(claude).toHaveTextContent("Motor: Claude via MCP");
  });
});
