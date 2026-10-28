import { NextResponse } from "next/server";
import { ehMotorClaude } from "@/lib/server/mcp/motor";
import type { NextRequest } from "next/server";
import { requireCron } from "@/lib/server/api-auth";
import { anexarDesfechoDoAlerta, runNewsroom } from "@/lib/server/newsroom/newsroom-service";
import { enviarAlerta, formatError, pingHealthcheck, sendAlert } from "@/lib/server/alerts";
import { cicloDasSeisCede } from "@/lib/server/producao-vespera";
import { DEFAULT_PROJECT_ID, getProjectById, requireActiveProject } from "@/lib/server/projects";
import { ligacoesDoCiclo } from "@/lib/server/newsroom/ligacoes-do-ciclo";

export const maxDuration = 300;

/**
 * Disparo diário da redação.
 *
 * A execução completa leva minutos — coleta de feeds, pipeline editorial e
 * criação da campanha — e o proxy da hospedagem encerra a requisição bem antes
 * disso. Por isso a rota responde 202 imediatamente e segue trabalhando: o
 * processo Node é persistente, então a promessa continua depois da resposta.
 *
 * O acompanhamento é pelo banco: `newsroom_runs` guarda o resultado, e o painel
 * de logs mostra o histórico.
 *
 * Para aguardar o fim (teste manual), chame com `?wait=1`.
 */
async function reportNewsroomOutcome(
  resultado: Awaited<ReturnType<typeof runNewsroom>>,
  healthcheck: string | undefined,
): Promise<void> {
  const posts = "scheduledPosts" in resultado ? (resultado.scheduledPosts?.length ?? 0) : 0;
  console.log(
    `[CRON NEWSROOM] Concluído: edição ${resultado.ok ? "gerada" : "não gerada"}, ` +
      `campanha ${"listmonkCampaignId" in resultado ? resultado.listmonkCampaignId : "-"}, ` +
      `${posts} post(s) agendado(s).`,
  );

  if (!resultado.ok) {
    const reason = "reason" in resultado ? resultado.reason : "desconhecido";

    /*
     * Dia sem pauta suficiente não é falha de execução.
     *
     * O watchdog existe para responder uma pergunta só: a chamada chegou à
     * aplicação? Chegou. A redação rodou inteira, classificou a coleta do dia
     * e a linha editorial decidiu não publicar. Marcar isso como `fail` treina
     * quem lê a ignorar o sinal, e foi o silêncio de um alerta que custou seis
     * dias em agosto.
     *
     * Então o watchdog recebe sucesso e o aviso vai por alerta, com o número
     * que importa: quantas aprovaram contra o mínimo.
     */
    if (reason === "already_executed_today") {
      await pingHealthcheck(healthcheck);
      return;
    }

    if (reason === "editorial_minimum_not_met") {
      const detalhe = "detail" in resultado ? resultado.detail : "";
      const desfecho = await enviarAlerta(
        "warning",
        "Sem newsletter hoje: a linha editorial não aprovou o mínimo",
        `${detalhe} Nada foi publicado, e isso é decisão editorial, não falha. ` +
          `O run está gravado em newsroom_runs com status cancelled.`,
      );

      /*
       * O desfecho do alerta vai para o banco, não só para o log.
       *
       * Foi assim que a investigação de 06, 07 e 08 travou: a evidência do
       * motivo estava num log de contêiner inalcançável. Se o alerta falhar de
       * novo, o motivo estará na linha do run.
       */
      const chave = "idempotencyKey" in resultado ? resultado.idempotencyKey : "";
      if (chave) await anexarDesfechoDoAlerta(chave, desfecho);

      await pingHealthcheck(healthcheck);
      return;
    }

    await sendAlert("warning", "Redação não gerou edição", `Motivo: ${reason}`);
    await pingHealthcheck(healthcheck, "fail");
    return;
  }

  const semPautas = "selectedStoriesCount" in resultado && resultado.selectedStoriesCount === 0;
  /*
   * O alerta olha o MESMO campo que o portão de retenção olha.
   *
   * O portão retém por `hallucination_risk`; o alerta avisava por `passed`.
   * `passed` é o veredito genérico que o auditor reprova por gramática, tom ou
   * implicância de estilo, então o alerta dizia "campanha retida" em dias em
   * que ela tinha sido disparada normalmente. Alerta que mente é alerta que
   * alguém aprende a ignorar.
   */
  const qaReteve =
    "qaResult" in resultado && resultado.qaResult && Boolean(resultado.qaResult.hallucination_risk);

  if (semPautas) {
    await sendAlert(
      "warning",
      "Redação rodou mas não selecionou nenhuma pauta",
      "Nenhum candidato passou no ranqueamento hoje.",
    );
  } else if (qaReteve) {
    await sendAlert(
      "warning",
      "Edição retida no QA de alucinação",
      "A campanha ficou como rascunho no Listmonk — revise no painel antes de disparar.",
    );
  }

  await pingHealthcheck(healthcheck);
}

async function reportNewsroomFailure(err: unknown, healthcheck: string | undefined): Promise<void> {
  console.error("[CRON NEWSROOM ERROR] Execução falhou:", err);
  await sendAlert("critical", "Redação falhou", formatError(err));
  await pingHealthcheck(healthcheck, "fail");
}

async function handle(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const aguardar = req.nextUrl.searchParams.get("wait") === "1";

  /**
   * Chave de idempotência alternativa.
   *
   * O padrão é `daily-edition-<data>`, e é ele que impede o cron de duplicar a
   * edição se disparar duas vezes. Enfraquecer essa guarda seria trocar um
   * problema real (duas newsletters no mesmo dia para a lista inteira) por
   * conveniência de operação.
   *
   * Passar uma chave própria diz explicitamente "esta é outra execução" — o
   * caso de uso é refazer o dia depois de mudar pauta, fonte ou marca, que é
   * quando a edição já gravada não serve mais.
   */
  const chave = req.nextUrl.searchParams.get("key")?.trim() || undefined;
  const disparadoEm = new Date().toISOString();
  const healthcheck = process.env.HEALTHCHECK_NEWSROOM_URL;

  /*
   * Com a produção na véspera NO AR (05/10/2026), este horário não produz: o
   * conteúdo de hoje foi escrito ontem às 17:00, e quem o publica é o relógio
   * da publicação. Produzir de novo aqui publicaria um segundo dia por cima
   * do primeiro, inclusive na segunda, que pela cadência do PRD não publica.
   *
   * Só cede com a capacidade declarada `enforce`. Leitura que falha NÃO cede:
   * na dúvida o ciclo de sempre roda, que é o comportamento de antes desta
   * linha existir. `?key=` também não cede, porque é refazer o dia à mão.
   */
  if (!chave) {
    const projeto = await getProjectById(DEFAULT_PROJECT_ID).catch(() => null);
    /*
     * No motor Claude (29/10/2026) quem escreve é o Claude, pelo "faça o dia"
     * do MCP: a redação do cron não roda, e nenhuma chamada à OpenAI sai.
     */
    if (ehMotorClaude(projeto)) {
      await pingHealthcheck(healthcheck);
      return NextResponse.json({ ok: true, skipped: true, motivo: "MOTOR_CLAUDE", message: "O dia deste projeto é feito pelo Claude, no MCP." });
    }
    if (cicloDasSeisCede(projeto)) {
      console.log("[CRON NEWSROOM] produção na véspera em enforce: o ciclo das 06:03 não produz hoje.");
      await pingHealthcheck(healthcheck);
      return NextResponse.json({
        ok: true,
        skipped: true,
        motivo: "PRODUCAO_NA_VESPERA",
        message: "Este projeto produz na véspera às 17:00; ver /api/cron/producao e newsroom_runs.",
      });
    }
  }

  void pingHealthcheck(healthcheck, "start");

  /*
   * As ligações do ciclo de verdade (integração de 05/10/2026): perfis de
   * referência no pool do Instagram e as peças dos ramos na fila de
   * aprovação. Com as capacidades desligadas o objeto vem vazio e a chamada é
   * a de antes. Projeto ilegível aqui não segura o ciclo: a redação lê o
   * projeto de novo, com a própria retentativa, e decide.
   */
  const execucao = (async () => {
    const projeto = await requireActiveProject(DEFAULT_PROJECT_ID).catch(() => null);
    const ligacoes = await ligacoesDoCiclo(projeto);
    return runNewsroom({
      dryRun: false,
      publishToPortal: true,
      createNewsletterCampaign: true,
      autoSend: true,
      ...(chave ? { idempotencyKey: chave } : {}),
      ...ligacoes,
    });
  })();

  if (aguardar) {
    try {
      const resultado = await execucao;
      await reportNewsroomOutcome(resultado, healthcheck);
      return NextResponse.json(resultado);
    } catch (err) {
      await reportNewsroomFailure(err, healthcheck);
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  // Sem o catch aqui, uma falha viraria unhandled rejection e poderia derrubar
  // o processo que serve o site.
  execucao
    .then((resultado) => reportNewsroomOutcome(resultado, healthcheck))
    .catch((err) => reportNewsroomFailure(err, healthcheck));

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      startedAt: disparadoEm,
      message: "Redação iniciada. Acompanhe o resultado em newsroom_runs.",
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
