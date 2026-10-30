/**
 * O endereço público do pedido, como o Claude o vê (27/10/2026).
 *
 * Atrás do Traefik o `host` é o do contêiner; quem diz o endereço de fora é
 * `x-forwarded-host` e `x-forwarded-proto`. Os metadados do OAuth precisam do
 * endereço de fora, ou o Claude tenta logar num host que ele não alcança. É o
 * mesmo cálculo da rota de login do painel.
 */
export function origemDoPedido(req: Request): string {
  const cabecalho = (nome: string) => (req.headers.get(nome) ?? "").split(",")[0].trim();
  const url = new URL(req.url);
  const host = cabecalho("x-forwarded-host") || cabecalho("host") || url.host;
  const proto = cabecalho("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Só o nome do host público, sem porta (30/10/2026): o que o captcha confere.
 * `new URL(req.url).hostname` é o do contêiner atrás do Traefik, e a inscrição
 * da newsletter era recusada como "domínio não permitido" sem nunca gravar lead.
 */
export function hostPublicoDoPedido(req: Request): string {
  return new URL(origemDoPedido(req)).hostname;
}

export function enderecoDosMetadadosDoRecurso(origem: string): string {
  return `${origem}/.well-known/oauth-protected-resource`;
}
