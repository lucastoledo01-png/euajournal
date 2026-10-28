import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { listProjects } from "@/lib/server/projects";
import { capacidadesDeclaradas, CAPACIDADES } from "@/lib/server/capacidades";
import { MOLDES_DO_FEED, moldesDeclarados } from "@/lib/server/social/moldes-do-feed";
import { motorDoProjeto } from "@/lib/server/mcp/motor";

/**
 * Os projetos da plataforma, com o que cada um liga.
 *
 * `listProjects()` existia desde a migration multi-projeto e **não tinha um
 * único chamador** em todo o sistema. É o resumo do estado anterior: a casa foi
 * construída para vários projetos e ninguém nunca abriu a segunda porta.
 *
 * Esta rota é a primeira superfície de projeto do painel. Ela devolve o que o
 * card precisa mostrar e nada além: nome, identidade, estado e as capacidades
 * declaradas. Credencial não sai daqui em hipótese nenhuma, nem para dizer que
 * existe: o painel não precisa do segredo para desenhar o card, e toda rota que
 * devolve segredo vira, um dia, a rota por onde ele vazou.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const projetos = await listProjects();

    return NextResponse.json({
      ok: true,
      /** O cardápio, para o painel desenhar os interruptores sem repetir a lista. */
      capacidades: CAPACIDADES,
      /** O cardápio de moldes, pela mesma razão do de capacidades. */
      moldesDoFeed: MOLDES_DO_FEED,
      projetos: projetos.map((p) => ({
        id: p.id,
        slug: p.slug,
        nome: p.name,
        status: p.status,
        nicho: p.niche,
        timezone: p.timezone,
        siteUrl: p.siteUrl,
        marca: {
          nome: p.brand.displayName || p.name,
          cor: p.brand.primaryColor,
          logoUrl: p.brand.logoUrl,
        },
        /*
         * Só o que o projeto DECLARA. Capacidade ausente é ausente mesmo, e o
         * painel mostra "herda do ambiente" em vez de inventar um estado: dizer
         * "desligado" para algo que na verdade segue a variável global seria
         * mostrar um valor na tela e outro valendo.
         */
        capacidades: capacidadesDeclaradas(p),
        /*
         * Só o declarado, de novo. Molde ausente está ligado, e a tela precisa
         * saber a diferença entre "ligado porque ninguém mexeu" e "ligado
         * porque alguém ligou".
         */
        moldes: moldesDeclarados(p),
        /* Quem faz o trabalho de modelo: a esteira com a OpenAI, ou o Claude Desktop pelo MCP. */
        motor: motorDoProjeto(p),
      })),
    });
  } catch (err) {
    console.error("[ADMIN PROJETOS]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao listar os projetos." },
      { status: 500 },
    );
  }
}
