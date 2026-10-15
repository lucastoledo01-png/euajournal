import { baixarFoto, comporFotoInteira, origemPermitida } from "@/lib/server/visual/foto-inteira";

/**
 * A foto inteira, sem corte, numa moldura 5:3 (14/10/2026), servida como
 * imagem para o e-mail. Ver `foto-inteira.ts`.
 *
 * Só aceita endereço https dos hosts que o resolvedor usa: não é um proxy de
 * imagem para qualquer endereço.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src") ?? "";
  if (!origemPermitida(src)) {
    return new Response("origem não permitida", { status: 400 });
  }
  try {
    const jpg = await comporFotoInteira(await baixarFoto(src));
    return new Response(new Uint8Array(jpg), {
      headers: {
        "Content-Type": "image/jpeg",
        // A mesma foto é o mesmo endereço; um dia no navegador e uma semana na CDN.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch (erro) {
    return new Response(`foto indisponível: ${(erro as Error).message}`, { status: 502 });
  }
}
