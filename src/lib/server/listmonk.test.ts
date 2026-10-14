import { describe, expect, it, vi } from "vitest";
import { buildListmonkFormPayload, buildListmonkSubscriberPayload, createListmonkClient, getListmonkConfig } from "./listmonk";

const homesiteListUuid = "7c3535ab-988f-4c98-88c0-b73be3b9a90b";

describe("listmonk integration", () => {
  it("monta payload do formulario publico com lista homesite e somente email", () => {
    const payload = buildListmonkFormPayload({ email: "  Pessoa@Exemplo.com ", source: "newsletter-home" }, homesiteListUuid);

    expect(payload.get("email")).toBe("pessoa@exemplo.com");
    expect(payload.get("l")).toBe(homesiteListUuid);
    expect(payload.get("nonce")).toBe("");
    expect(payload.has("name")).toBe(false);
  });

  it("monta cadastro via API sem nome quando a API for usada como fallback", () => {
    expect(
      buildListmonkSubscriberPayload({ email: "  Pessoa@Exemplo.com ", source: "newsletter-home" }, [7]),
    ).toEqual({
      email: "pessoa@exemplo.com",
      status: "enabled",
      lists: [7],
      preconfirm_subscriptions: false,
      attribs: {
        source: "newsletter-home",
        consent: "site_opt_in",
      },
    });
  });

  it("não tenta enviar para Listmonk quando configuração está incompleta", () => {
    expect(getListmonkConfig({})).toEqual({ enabled: false });
  });

  /**
   * Este teste afirmava o contrario, e o contrario quebrou a producao.
   *
   * Ele exigia que o formulario publico tivesse precedencia mesmo havendo token,
   * e chamava o token de "token-nao-usado". Em 17/09/2026 o dono tornou a lista
   * `homesite` privada, para que ela sumisse da pagina publica de inscricao. O
   * endpoint de formulario do Listmonk so aceita lista PUBLICA, e passou a
   * responder HTTP 400 "UUID invalido", reproduzido contra o servidor real.
   *
   * O teste continuava verde, porque ele fixava a escolha do modo e nunca a
   * consequencia dela. Inverter a precedencia e o conserto; trocar o teste junto
   * e o reconhecimento de que ele guardava a regra errada.
   */
  it("usa a API quando ha token, porque ela aceita lista privada", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: 42 } }), { status: 200 }));
    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_FORM_LIST_UUID: homesiteListUuid,
        LISTMONK_API_TOKEN: "token-de-teste",
        LISTMONK_DEFAULT_LIST_ID: "7",
      },
      fetchMock,
    );

    const result = await client.upsertSubscriber({ email: "lead@casaloti.ia.br", source: "newsletter" });

    expect(result).toEqual({ ok: true, id: 42 });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://listmonk.casaloti.ia.br/api/subscribers");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).lists).toEqual([7]);
    // Quem vem pelo site confirma por e-mail (14/10/2026): o Listmonk só manda
    // a confirmação da lista de dupla confirmação quando a inscrição NÃO chega
    // pré-confirmada.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).preconfirm_subscriptions).toBe(false);
  });

  /** Sem token nao ha escolha: o formulario publico e o unico caminho. */
  it("cai no formulario publico quando nao ha token", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_FORM_LIST_UUID: homesiteListUuid,
        LISTMONK_DEFAULT_LIST_ID: "7",
      },
      fetchMock,
    );

    await client.upsertSubscriber({ email: "lead@casaloti.ia.br", source: "newsletter" });

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://listmonk.casaloti.ia.br/subscription/form");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(`l=${encodeURIComponent(homesiteListUuid)}`);
  });

  /**
   * 409 era contado como sucesso, e nao e.
   *
   * O Listmonk responde 409 "E-mail ja existe" e NAO acrescenta o assinante as
   * listas do payload. Medido contra o servidor real: criado na lista 1,
   * reenviado pedindo a lista 4, o assinante continua so na lista 1.
   *
   * Nao mordia no modo form, porque o endpoint de formulario acrescenta a lista
   * a quem ja existe. Passou a morder quando a API virou o caminho padrao, e
   * atinge justamente quem ja e conhecido: assinante atual, quem se
   * descadastrou e quer voltar, quem entrou pelos ultraprompts.
   */
  it("409 nao vira sucesso: busca quem ja existe e acrescenta as listas", async () => {
    const chamadas: string[] = [];
    const fetchMock = vi.fn(async (url: unknown, init?: { method?: string; body?: unknown }) => {
      const alvo = String(url);
      chamadas.push(`${init?.method ?? "GET"} ${alvo.split("?")[0]}`);

      if (alvo.endsWith("/api/subscribers") && init?.method === "POST") {
        return new Response(JSON.stringify({ message: "E-mail já existe." }), { status: 409 });
      }
      if (alvo.includes("/api/subscribers?")) {
        return new Response(JSON.stringify({ data: { results: [{ id: 77 }] } }), { status: 200 });
      }
      if (alvo.endsWith("/api/subscribers/lists")) {
        const corpo = JSON.parse(String(init?.body));
        expect(corpo).toMatchObject({ ids: [77], action: "add", target_list_ids: [7], status: "unconfirmed" });
        return new Response(JSON.stringify({ data: true }), { status: 200 });
      }
      if (alvo.endsWith("/api/subscribers/77/optin")) {
        return new Response(JSON.stringify({ data: true }), { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_API_TOKEN: "token-de-teste",
        LISTMONK_DEFAULT_LIST_ID: "7",
      },
      fetchMock as unknown as typeof fetch,
    );

    const result = await client.upsertSubscriber({ email: "ja@existe.com", source: "newsletter" });

    expect(result).toEqual({ ok: true, id: 77 });
    expect(chamadas).toEqual([
      "POST https://listmonk.casaloti.ia.br/api/subscribers",
      "GET https://listmonk.casaloti.ia.br/api/subscribers",
      "PUT https://listmonk.casaloti.ia.br/api/subscribers/lists",
      "POST https://listmonk.casaloti.ia.br/api/subscribers/77/optin",
    ]);
  });

  /** Se a recuperacao falhar, isso e falha, e nao um sucesso de consolacao. */
  it("409 com recuperacao falhando devolve ok:false", async () => {
    const fetchMock = vi.fn(async (url: unknown, init?: { method?: string }) => {
      const alvo = String(url);
      if (alvo.endsWith("/api/subscribers") && init?.method === "POST") {
        return new Response("{}", { status: 409 });
      }
      if (alvo.includes("/api/subscribers?")) {
        return new Response(JSON.stringify({ data: { results: [] } }), { status: 200 });
      }
      return new Response("", { status: 500 });
    });

    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_API_TOKEN: "token-de-teste",
        LISTMONK_DEFAULT_LIST_ID: "7",
      },
      fetchMock as unknown as typeof fetch,
    );

    const result = await client.upsertSubscriber({ email: "ja@existe.com", source: "newsletter" });
    expect(result).toMatchObject({ ok: false });
  });

  /** A volta deliberada ao formulario, para quem quiser o comportamento antigo. */
  it("LISTMONK_FORCE_FORM devolve a precedencia ao formulario publico", () => {
    const config = getListmonkConfig({
      LISTMONK_URL: "https://listmonk.casaloti.ia.br",
      LISTMONK_FORM_LIST_UUID: homesiteListUuid,
      LISTMONK_API_TOKEN: "token-de-teste",
      LISTMONK_FORCE_FORM: "true",
    });
    expect(config).toMatchObject({ enabled: true, mode: "form" });
  });

  /**
   * O valor errado nao pode sumir calado.
   *
   * Em producao LISTMONK_DEFAULT_LIST_ID esta com um UUID. `Number()` de UUID e
   * NaN, o filtro descarta, e o codigo caia no fallback fixo sem dizer nada:
   * a configuracao afirmava uma coisa e o envio fazia outra. Nao causava dano
   * por coincidencia, porque o UUID configurado e o da lista 4.
   */
  it("avisa quando LISTMONK_DEFAULT_LIST_ID nao tem ID numerico", () => {
    const avisos: string[] = [];
    const original = console.warn;
    console.warn = (msg: unknown) => void avisos.push(String(msg));

    try {
      const config = getListmonkConfig({
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_API_TOKEN: "token-de-teste",
        LISTMONK_DEFAULT_LIST_ID: "7c3535ab-988f-4c98-88c0-b73be3b9a90b",
      });
      expect(config).toMatchObject({ enabled: true, mode: "api", listIds: [4, 1] });
    } finally {
      console.warn = original;
    }

    expect(avisos.join(" ")).toContain("LISTMONK_DEFAULT_LIST_ID");
  });

  it("aceita ID numerico normalmente, sem avisar", () => {
    const avisos: string[] = [];
    const original = console.warn;
    console.warn = (msg: unknown) => void avisos.push(String(msg));

    try {
      const config = getListmonkConfig({
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_API_TOKEN: "token-de-teste",
        LISTMONK_DEFAULT_LIST_ID: "4",
      });
      expect(config).toMatchObject({ listIds: [4] });
    } finally {
      console.warn = original;
    }

    expect(avisos).toHaveLength(0);
  });

  /**
   * O que tornou o estrago invisivel: com o Listmonk recusando, o cliente
   * devolve `ok: false`, e a rota `/api/newsletter` responde `ok: true` assim
   * mesmo. O visitante le "inscrito" e nunca recebe edicao nenhuma.
   */
  it("recusa do Listmonk chega como ok:false, com motivo", async () => {
    const fetchMock = vi.fn(async () => new Response("UUID invalido", { status: 400 }));
    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_FORM_LIST_UUID: homesiteListUuid,
        LISTMONK_FORCE_FORM: "true",
        LISTMONK_API_TOKEN: "token-de-teste",
      },
      fetchMock,
    );

    const result = await client.upsertSubscriber({ email: "lead@casaloti.ia.br", source: "newsletter" });

    expect(result).toMatchObject({ ok: false, reason: "listmonk_form_request_failed" });
  });

  /*
   * Produção na véspera (05/10/2026): a edição de amanhã sai do Listmonk
   * AGENDADA. Disparar `running` com conteúdo de amanhã seria o pior erro
   * possível do canal, então o "não" está travado aqui.
   */
  describe("campanha com data marcada", () => {
    function clienteQueRegistra() {
      const corpos: Array<{ url: string; corpo: Record<string, unknown> }> = [];
      const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        corpos.push({ url: String(url), corpo: JSON.parse(String(init?.body ?? "{}")) });
        return new Response(JSON.stringify({ data: { id: 77 } }), { status: 200 });
      });
      const client = createListmonkClient(
        { LISTMONK_URL: "https://listmonk.casaloti.ia.br", LISTMONK_API_TOKEN: "token-de-teste", LISTMONK_DEFAULT_LIST_ID: "7" },
        fetchMock as unknown as typeof fetch,
      );
      return { client, corpos };
    }

    it("com sendAt agenda, e NÃO dispara", async () => {
      const { client, corpos } = clienteQueRegistra();
      const r = await client.createCampaign({
        name: "edição",
        subject: "assunto",
        body: "<p>x</p>",
        autoSend: true,
        sendAt: "2026-10-06T09:07:00.000Z",
      });
      expect(r).toMatchObject({ ok: true, status: "scheduled" });
      expect(corpos[0].corpo.send_at).toBe("2026-10-06T09:07:00.000Z");
      expect(corpos[1].url).toContain("/api/campaigns/77/status");
      expect(corpos[1].corpo).toEqual({ status: "scheduled" });
    });

    it("sem sendAt, que é o ciclo das 06:03, continua disparando na hora", async () => {
      const { client, corpos } = clienteQueRegistra();
      await client.createCampaign({ name: "edição", subject: "assunto", body: "<p>x</p>", autoSend: true });
      expect(corpos[1].corpo).toEqual({ status: "running" });
    });
  });
});
