import { NextResponse } from "next/server";
import { ehMotorClaude } from "@/lib/server/mcp/motor";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { DEFAULT_PROJECT_ID, getProjectById, getProjectBySlug } from "@/lib/server/projects";
import { chegouAHoraDaTarde, configDaTarde, modoDaQuenteDaTarde } from "@/lib/server/social/quente-da-tarde";
import { rodarQuenteDaTarde } from "@/lib/server/social/quente-da-tarde-ciclo";

export const maxDuration = 300;

/**
 * O ciclo da tarde do Instagram (06/10/2026): a notícia quente no mesmo dia.
 * A regra está em `social/quente-da-tarde.ts`.
 *
 * Responde 202 e segue trabalhando, como a produção: coleta, guarda, calor e
 * arte levam minutos, e o proxy da hospedagem corta antes. O desfecho de cada
 * rodada, inclusive "sem vaga" e "nada quente", vai para `platform_events`
 * (`quente_da_tarde`). `?wait=1` aguarda o fim.
 *
 * `?relogio=1`: o crontab chama de 15 em 15 minutos e a rota só roda na
 * janela de `settings.quente_da_tarde.horario` (padrão 15:30, hora do
 * projeto). Fora da janela, ou com a capacidade em `off`, responde sem fazer
 * nada e sem gravar linha: seriam 96 linhas por dia sem nada a dizer.
 *
 * `?projeto=<slug>` escolhe o projeto; sem ele, o projeto semente.
 */
async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const aguardar = req.nextUrl.searchParams.get("wait") === "1";
  const slug = req.nextUrl.searchParams.get("projeto")?.trim();

  const projeto = slug
    ? await getProjectBySlug(slug).catch(() => null)
    : await getProjectById(DEFAULT_PROJECT_ID).catch(() => null);
  if (!projeto) {
    return NextResponse.json(
      { ok: false, error: slug ? `projeto "${slug}" não encontrado` : "projeto ilegível; nada rodou neste disparo" },
      { status: slug ? 404 : 503 },
    );
  }

  /*
   * Capacidade desligada responde antes do relógio: instalar a linha do
   * crontab antes de ligar a capacidade é inócuo, como no relógio da
   * publicação.
   */
  // No motor Claude (29/10/2026) o Claude faz o dia pelo MCP: o ciclo da tarde não escreve.
  if (modoDaQuenteDaTarde(projeto) === "off" || ehMotorClaude(projeto)) {
    return NextResponse.json({ ok: true, rodou: false, motivo: "OFF" }, { status: 200 });
  }

  if (req.nextUrl.searchParams.get("relogio") === "1") {
    const hora = chegouAHoraDaTarde(configDaTarde(projeto), new Date(), projeto.timezone);
    if (!hora.naJanela) {
      return NextResponse.json({ ok: true, rodou: false, motivo: "FORA_DO_HORARIO", ...hora }, { status: 200 });
    }
  }

  const execucao = rodarQuenteDaTarde(projeto.id);

  if (aguardar) {
    const desfecho = await execucao;
    return NextResponse.json(desfecho, { status: desfecho.ok ? 200 : 500 });
  }

  // `rodarQuenteDaTarde` não lança por contrato; o catch é a rede de baixo,
  // para uma falha não virar rejeição solta no processo que serve o site.
  execucao
    .then((d) => console.log(`[CRON TARDE] ${d.motivo} (${d.modo}): ${d.explicacao}`))
    .catch((err) => console.error("[CRON TARDE ERROR]", err));

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      startedAt: new Date().toISOString(),
      message: "Ciclo da tarde iniciado. O desfecho vai para platform_events (quente_da_tarde).",
    },
    { status: 202 },
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
