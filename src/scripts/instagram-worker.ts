/**
 * Worker de renderização e publicação do Instagram.
 *
 * Roda na VPS, não na hospedagem do site: precisa de Chromium para renderizar
 * os slides, o que hospedagem compartilhada não oferece.
 *
 * Cada giro pega as vagas que já venceram o horário e processa uma a uma.
 * Falha em uma vaga não interrompe as demais — o motivo fica gravado na
 * própria linha, em `error_message`.
 *
 * Uso:
 *   npx tsx src/scripts/instagram-worker.ts          uma passada e encerra
 *   WORKER_INTERVAL_SECONDS=900 npx tsx ...        modo contínuo (contêiner)
 */

import { processScheduledPost, recuperarOrfaosV2 } from "../lib/server/social/instagram/worker-service";
import { findDuePosts } from "../lib/server/social/instagram/scheduler";
import { giroDosReels } from "../lib/server/social/reels/trabalho";
import { depsDoTrabalhoDeProducao } from "../lib/server/social/reels/trabalho-producao";

const LOTE_MAXIMO = 5;

async function girar(): Promise<number> {
  /*
   * Antes de pegar a fila, devolver a ela o que ficou preso.
   *
   * Uma vaga do V2 fica em `generated` enquanto o worker trabalha nela. Se o
   * processo morrer no meio, `findDuePosts` — que só devolve `scheduled` —
   * nunca mais a enxerga. A recuperação distingue os dois casos: sem container
   * na Meta, volta para a fila; com container, pergunta à Meta antes, porque
   * devolver às cegas autorizaria uma segunda publicação do mesmo post.
   */
  await recuperarOrfaosV2().catch((err) => {
    console.error("[WORKER] Recuperação de órfãs V2 falhou:", err);
  });

  const pendentes = await findDuePosts(LOTE_MAXIMO);

  if (pendentes.length === 0) {
    console.log(`[WORKER ${new Date().toISOString()}] Nenhum post vencido.`);
    return 0;
  }

  console.log(`[WORKER ${new Date().toISOString()}] ${pendentes.length} post(s) a processar.`);

  let publicados = 0;

  for (const pendente of pendentes) {
    try {
      const resultado = await processScheduledPost(pendente.id);
      if (resultado.ok && resultado.status === "published") publicados++;
    } catch (err) {
      // processScheduledPost já grava o motivo na linha; aqui só evitamos que
      // uma vaga problemática impeça as seguintes de rodar.
      console.error(`[WORKER] Erro não tratado no post ${pendente.id}:`, err);
    }
  }

  return publicados;
}

let encerrando = false;

for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    console.log(`[WORKER] ${sinal} recebido, encerrando após o giro atual.`);
    encerrando = true;
  });
}

/*
 * Os Reels (28/10/2026) giram a cada 30 s, fora do intervalo dos posts: o
 * Claude escolhe um vídeo no chat e espera a tarefa de texto, e 15 minutos de
 * espera seria a conversa morrer. O giro só lê `reels_candidatos`; sem nada
 * escolhido, é uma consulta. Erro repetido (a tabela ainda não existe) é
 * escrito uma vez só.
 */
const INTERVALO_DOS_REELS_S = 30;
let ultimoErroDosReels = "";

async function girarReels(): Promise<void> {
  try {
    const r = await giroDosReels(depsDoTrabalhoDeProducao());
    if (r.preparados || r.renderizados || r.falhas.length) {
      console.log(`[WORKER REELS] preparados ${r.preparados}, renderizados ${r.renderizados}`, r.falhas);
    }
    ultimoErroDosReels = "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== ultimoErroDosReels) console.error("[WORKER REELS] giro falhou:", msg);
    ultimoErroDosReels = msg;
  }
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const passagemUnica = process.argv.includes("--once");
  const intervaloSegundos = Number(process.env.WORKER_INTERVAL_SECONDS ?? 0);

  // Sem intervalo, uma passada e encerra — é o modo usado por cron do sistema.
  // Com intervalo, repete até receber sinal de parada — é o modo de contêiner,
  // onde a política de reinício do orquestrador cuida de falhas.
  if (passagemUnica || !Number.isFinite(intervaloSegundos) || intervaloSegundos <= 0) {
    try {
      const publicados = await girar();
      console.log(`[WORKER] Giro concluído. ${publicados} post(s) publicado(s).`);
      process.exit(0);
    } catch (err) {
      console.error("[WORKER] Falha no giro:", err);
      process.exit(1);
    }
  }

  console.log(`[WORKER] Modo contínuo, um giro a cada ${intervaloSegundos}s.`);

  while (!encerrando) {
    try {
      await girar();
    } catch (err) {
      // Uma falha de giro não derruba o worker: o próximo tenta de novo, e o
      // motivo de cada post já fica gravado em error_message.
      console.error("[WORKER] Falha no giro:", err);
    }

    for (let i = 0; i < intervaloSegundos && !encerrando; i++) {
      if (i % INTERVALO_DOS_REELS_S === 0) await girarReels();
      await dormir(1000);
    }
  }

  console.log("[WORKER] Encerrado.");
  process.exit(0);
}

main();
