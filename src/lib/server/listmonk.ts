type EnvLike = Record<string, string | undefined>;

type NewsletterLead = {
  email: string;
  source: string;
};

export type ListmonkCampaignPayload = {
  name: string;
  subject: string;
  body: string;
  listIds?: number[];
  sendAt?: string | null;
  autoSend?: boolean;
};

const homesiteListUuid = "7c3535ab-988f-4c98-88c0-b73be3b9a90b";

export type ListmonkConfig =
  | { enabled: false }
  | {
      enabled: true;
      mode: "form";
      url: string;
      formListUuid: string;
      token?: string;
      user?: string;
      listIds: number[];
    }
  | {
      enabled: true;
      mode: "api";
      url: string;
      token: string;
      user?: string;
      listIds: number[];
    };

export function getListmonkConfig(env: EnvLike = process.env): ListmonkConfig {
  const rawUrl = env.LISTMONK_URL;
  if (!rawUrl || rawUrl.trim().length === 0) {
    return { enabled: false };
  }

  const url = rawUrl.replace(/\/$/, "");
  const formListUuid = env.LISTMONK_FORM_LIST_UUID || homesiteListUuid;
  const token = env.LISTMONK_API_TOKEN || env.LISTMONK_PASSWORD;
  const user = env.LISTMONK_API_USER || env.LISTMONK_KEY_ID || env.LISTMONK_USERNAME || "apiuser";
  /*
   * `LISTMONK_DEFAULT_LIST_ID` sao IDs NUMERICOS, e o valor errado sumia calado.
   *
   * Em producao a variavel esta preenchida com um UUID de lista. `Number()` de
   * um UUID e NaN, o filtro descarta, a lista fica vazia e o codigo cai no
   * fallback fixo `[4, 1]` sem dizer nada. Quem le a configuracao acredita que
   * a campanha vai para a lista daquele UUID; ela vai para as listas 4 e 1.
   *
   * Hoje isso nao causa dano, por coincidencia: o UUID configurado E o da lista
   * 4. Mas e coincidencia, e a configuracao esta mentindo. Se alguem trocar o
   * valor esperando efeito, nao acontece nada.
   *
   * O conserto aqui NAO e adivinhar a intencao: e parar de sumir. O fallback
   * continua, porque sem lista nenhuma nao ha envio, e agora ele grita no log.
   * Resolver UUID para ID exigiria uma chamada de rede dentro de uma funcao
   * sincrona que todo mundo chama, e isso e conserto pior que o defeito.
   */
  const rawListIds = env.LISTMONK_DEFAULT_LIST_ID ?? "4,1";
  const listIds = String(rawListIds)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (String(rawListIds).trim().length > 0 && listIds.length === 0) {
    console.warn(
      "[LISTMONK] LISTMONK_DEFAULT_LIST_ID nao contem ID numerico utilizavel " +
        "(um UUID nao serve aqui). Usando o padrao [4, 1]. Campanha e inscricao " +
        "vao para essas listas, e nao para o que esta configurado.",
    );
  }

  /*
   * Com credencial, a API. O formulario publico e o plano B.
   *
   * Era o contrario: bastava `LISTMONK_FORM_LIST_UUID` existir para o site
   * postar no formulario PUBLICO do Listmonk, mesmo havendo token de API. Isso
   * amarrava a inscricao do site a uma propriedade da lista que nao tem nada a
   * ver com inscricao: ser publica.
   *
   * Em 17/09/2026 o dono tornou a `homesite` privada, para que ela sumisse da
   * pagina publica de inscricao, que e um pedido legitimo de produto. O
   * Listmonk passou a recusar o POST com HTTP 400 "UUID invalido", porque o
   * endpoint de formulario so aceita lista publica. Reproduzido contra o
   * servidor real antes de escrever esta linha.
   *
   * E a falha era SILENCIOSA: `/api/newsletter` devolve `ok: true` mesmo quando
   * o Listmonk recusa. O visitante via "inscrito", o lead era gravado no nosso
   * banco, e a pessoa nunca receberia edicao nenhuma, porque quem envia e o
   * Listmonk. So o `listmonk_sync_logs` registrava `failed`.
   *
   * A API nao tem essa restricao: ela inscreve em lista privada sem reclamar.
   * Entao a ordem certa e token primeiro. `LISTMONK_FORCE_FORM` existe para
   * voltar ao formulario de proposito, e `LISTMONK_FORCE_API` continua aceito
   * para nao quebrar quem ja o tinha ligado.
   */
  if (token && env.LISTMONK_FORCE_FORM !== "true") {
    return { enabled: true, mode: "api", url, token, user, listIds: listIds.length > 0 ? listIds : [4, 1] };
  }

  if (Boolean(env.LISTMONK_FORM_LIST_UUID) && env.LISTMONK_FORCE_API !== "true") {
    return {
      enabled: true,
      mode: "form",
      url,
      formListUuid,
      token,
      user,
      listIds: listIds.length > 0 ? listIds : [4, 1],
    };
  }

  if (!token) {
    return {
      enabled: true,
      mode: "form",
      url,
      formListUuid,
      token,
      user,
      listIds: listIds.length > 0 ? listIds : [4, 1],
    };
  }

  return { enabled: true, mode: "api", url, token, user, listIds: listIds.length > 0 ? listIds : [4, 1] };
}

export function buildListmonkFormPayload(lead: NewsletterLead, formListUuid = homesiteListUuid) {
  const payload = new URLSearchParams();
  payload.set("nonce", "");
  payload.set("email", lead.email.trim().toLowerCase());
  payload.set("l", formListUuid);

  return payload;
}

export function buildListmonkSubscriberPayload(lead: NewsletterLead, listIds: number[], preconfirm = false) {
  return {
    email: lead.email.trim().toLowerCase(),
    status: "enabled",
    lists: listIds,
    preconfirm_subscriptions: preconfirm,
    attribs: {
      source: lead.source,
      consent: "site_opt_in",
    },
  };
}

export function createListmonkClient(env: EnvLike = process.env, fetcher: typeof fetch = fetch) {
  const config = getListmonkConfig(env);

  function getAuthHeaders(): string[] {
    if (!config.enabled || !config.token) return [];

    const token = config.token.trim();
    const user = (config.user || "apiuser").trim();

    return [
      `token ${user}:${token}`,
      `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`,
      `token ${token}`,
    ];
  }

  /**
   * Quem ja existe no Listmonk entra nas listas pedidas.
   *
   * Dois passos, os dois conferidos contra o servidor real em 17/09/2026:
   * a busca por e-mail devolve o id, e `PUT /api/subscribers/lists` com
   * `action: "add"` acrescenta sem tocar no que ja estava.
   *
   * `status: "confirmed"` porque quem preencheu o formulario do site declarou a
   * intencao ali. Para lista de dupla confirmacao o Listmonk manda o e-mail de
   * confirmacao mesmo assim, entao isto nao atropela opt-in de ninguem.
   *
   * ATUALIZADO em 14/10/2026, por decisao do dono: quem vem pelo site confirma
   * por e-mail. A inscricao entra `unconfirmed` e o pedido de confirmacao sai
   * por `POST /api/subscribers/:id/optin`, que so manda para as listas de dupla
   * confirmacao ainda nao confirmadas. Falha no envio da confirmacao nao desfaz
   * a inscricao: ela fica registrada, e o dono reenvia pelo painel.
   */
  async function inscreverQuemJaExiste(
    email: string,
    listIds: number[],
    authHeader: string,
  ): Promise<{ ok: true; id: number | undefined } | { ok: false; motivo: string }> {
    if (!config.enabled) return { ok: false, motivo: "listmonk_not_configured" };
    if (listIds.length === 0) return { ok: false, motivo: "listmonk_sem_lista_alvo" };

    // Aspas simples dobradas: o `query` do Listmonk e um fragmento SQL.
    const alvo = email.trim().toLowerCase().replace(/'/g, "''");
    const busca = new URL(`${config.url}/api/subscribers`);
    busca.searchParams.set("query", `subscribers.email='${alvo}'`);
    busca.searchParams.set("per_page", "1");

    const achar = await fetcher(busca, { headers: { Authorization: authHeader } });
    if (!achar.ok) return { ok: false, motivo: `listmonk_busca_falhou_${achar.status}` };

    const corpo = (await achar.json().catch(() => ({}))) as {
      data?: { results?: Array<{ id?: number }> };
    };
    const id = corpo.data?.results?.[0]?.id;
    if (!id) return { ok: false, motivo: "listmonk_409_sem_assinante_correspondente" };

    const juntar = await fetcher(`${config.url}/api/subscribers/lists`, {
      method: "PUT",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], action: "add", target_list_ids: listIds, status: "unconfirmed" }),
    });
    if (!juntar.ok) return { ok: false, motivo: `listmonk_adicionar_lista_falhou_${juntar.status}` };

    const confirmar = await fetcher(`${config.url}/api/subscribers/${id}/optin`, {
      method: "POST",
      headers: { Authorization: authHeader },
    });
    if (!confirmar.ok) console.warn(`[LISTMONK] pedido de confirmação não enviado ao assinante ${id}: HTTP ${confirmar.status}`);

    return { ok: true, id };
  }

  return {
    async upsertSubscriber(lead: NewsletterLead) {
      if (!config.enabled) {
        return { ok: false as const, skipped: true as const, reason: "listmonk_not_configured" };
      }

      if (config.mode === "form") {
        const response = await fetcher(`${config.url}/subscription/form`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: buildListmonkFormPayload(lead, config.formListUuid),
        });

        if (!response.ok) {
          return { ok: false as const, skipped: false as const, reason: "listmonk_form_request_failed" };
        }

        return { ok: true as const, id: undefined };
      }

      const authHeaders = getAuthHeaders();
      let lastErr = "";

      for (const authHeader of authHeaders) {
        try {
          const response = await fetcher(`${config.url}/api/subscribers`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            // Sem pré-confirmação: quem vem pelo site confirma por e-mail (14/10/2026).
            body: JSON.stringify(buildListmonkSubscriberPayload(lead, config.listIds, false)),
          });

          if (response.ok) {
            const body = (await response.json().catch(() => ({}))) as { data?: { id?: number } };
            return { ok: true as const, id: body.data?.id };
          }

          /*
           * 409 NAO e sucesso, e tratar como sucesso era o defeito.
           *
           * O Listmonk responde 409 "E-mail ja existe" e, nesse caso, NAO
           * acrescenta o assinante as listas do payload. Medido contra o
           * servidor real: um assinante criado na lista 1, reenviado pedindo a
           * lista 4, recebe 409 e continua so na lista 1.
           *
           * Isso nao mordia enquanto o modo form governava, porque o endpoint
           * de formulario acrescenta a lista a quem ja existe. Passou a morder
           * no instante em que a API virou o caminho padrao, e atinge
           * exatamente quem ja e conhecido: os assinantes atuais, quem se
           * descadastrou e quer voltar, e quem entrou pelos ultraprompts.
           *
           * O conserto e fazer o que o formulario fazia: achar quem ja existe e
           * acrescentar as listas. Sao duas chamadas a mais, e so no 409.
           */
          if (response.status === 409) {
            const recuperado = await inscreverQuemJaExiste(lead.email, config.listIds, authHeader);
            if (recuperado.ok) return recuperado;
            lastErr = recuperado.motivo;
            continue;
          }

          lastErr = await response.text().catch(() => "");
        } catch (err: any) {
          lastErr = err?.message || String(err);
        }
      }

      return { ok: false as const, skipped: false as const, reason: `listmonk_request_failed: ${lastErr}` };
    },

    async createCampaign(campaign: ListmonkCampaignPayload) {
      if (!config.enabled || !config.token) {
        console.warn("[LISTMONK] API Token/Senha do Listmonk não configurado em LISTMONK_API_TOKEN ou LISTMONK_PASSWORD.");
        return { ok: false as const, skipped: true as const, reason: "listmonk_api_not_configured" };
      }

      const authHeaders = getAuthHeaders();
      let lastStatus = 0;
      let lastErrText = "";

      for (const authHeader of authHeaders) {
        try {
          console.log(`[LISTMONK] Tentando criar campanha em ${config.url}/api/campaigns com header '${authHeader.slice(0, 20)}...'`);
          const response = await fetcher(`${config.url}/api/campaigns`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: campaign.name,
              subject: campaign.subject,
              lists: campaign.listIds || config.listIds,
              type: "regular",
              content_type: "html",
              body: campaign.body,
              send_at: campaign.sendAt || null,
            }),
          });

          if (response.ok) {
            const body = (await response.json().catch(() => ({}))) as { data?: { id?: number } };
            const campaignId = body.data?.id;

            /*
             * Com `sendAt`, "enviar" quer dizer AGENDAR. Entrou em 05/10/2026
             * com a produção na véspera: a edição de amanhã é escrita às 17:00
             * e só pode sair às 06:07. `running` dispararia na hora, para a
             * lista inteira, com o conteúdo de amanhã. Sem `sendAt`, que é o
             * ciclo das 06:03, nada muda.
             */
            const statusAlvo = campaign.sendAt ? "scheduled" : "running";

            if (campaign.autoSend && campaignId) {
              const statusRes = await fetcher(`${config.url}/api/campaigns/${campaignId}/status`, {
                method: "PUT",
                headers: {
                  Authorization: authHeader,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ status: statusAlvo }),
              });

              if (!statusRes.ok) {
                const statusErr = await statusRes.text().catch(() => "");
                console.error(`[LISTMONK AUTO SEND ERROR] ${statusRes.status}: ${statusErr}`);
              } else {
                console.log(`[LISTMONK AUTO SEND] Campanha #${campaignId} disparada automaticamente com sucesso!`);
              }
            }

            return { ok: true as const, id: campaignId, status: campaign.autoSend ? statusAlvo : "draft" };
          }

          lastStatus = response.status;
          lastErrText = await response.text().catch(() => "");
          console.warn(`[LISTMONK AUTH TRY FAILED] ${response.status}: ${lastErrText}`);
        } catch (err: any) {
          console.error("[LISTMONK CAMPAIGN FETCH ERROR]", err);
          lastErrText = err?.message || String(err);
        }
      }

      return { ok: false as const, skipped: false as const, reason: `listmonk_campaign_failed_${lastStatus}: ${lastErrText}` };
    },
  };
}
