/**
 * O cliente HTTP do servidor MCP local (27/10/2026).
 *
 * O servidor que o Claude Desktop inicia roda na máquina do usuário e não
 * toca em banco nem em Chromium: tudo passa pelas rotas `/api/mcp/*` da
 * plataforma, com o token do usuário. Assim a regra mora num lugar só, o
 * contêiner web, e o servidor local pode ser atualizado sem deploy.
 */

export type ConfigDaPlataforma = {
  /** Ex.: https://euajournal.com, sem barra no fim. */
  url: string;
  token: string;
};

export function configDoAmbiente(env: Record<string, string | undefined> = process.env): ConfigDaPlataforma {
  const url = (env.EUAJOURNAL_URL ?? "").trim().replace(/\/+$/, "");
  const token = (env.EUAJOURNAL_MCP_TOKEN ?? "").trim();
  const faltando = [!url && "EUAJOURNAL_URL", !token && "EUAJOURNAL_MCP_TOKEN"].filter(Boolean);
  if (faltando.length > 0) {
    throw new Error(`Configure ${faltando.join(" e ")} no claude_desktop_config.json (ver docs/mcp.md).`);
  }
  return { url, token };
}

export class ErroDaPlataforma extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export async function chamarPlataforma<T = unknown>(
  config: ConfigDaPlataforma,
  caminho: string,
  init: { metodo?: "GET" | "POST"; consulta?: Record<string, string | undefined>; corpo?: unknown } = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const url = new URL(`${config.url}/api/mcp/${caminho}`);
  for (const [chave, valor] of Object.entries(init.consulta ?? {})) {
    if (valor) url.searchParams.set(chave, valor);
  }
  const resposta = await fetcher(url, {
    method: init.metodo ?? "GET",
    headers: {
      authorization: `Bearer ${config.token}`,
      ...(init.corpo !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.corpo !== undefined ? JSON.stringify(init.corpo) : undefined,
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const corpo = (await resposta.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!resposta.ok || !corpo || corpo.ok === false) {
    throw new ErroDaPlataforma(resposta.status, corpo?.error ?? `A plataforma respondeu HTTP ${resposta.status}.`);
  }
  return corpo as T;
}
