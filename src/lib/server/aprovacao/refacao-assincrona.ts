import {
  EXECUCOES_MAXIMAS_DA_REFACAO,
  LIMITE_DE_REFAZIMENTOS,
  MINUTOS_PARA_REFACAO_TRAVADA,
  type Aprovacao,
  type EstadoDaRefacao,
} from "./contrato";
import { enfileirar, type DepsDaFila, type ProjetoDaFila } from "./fila";
import { errosRecentesDaEtapa } from "./memoria-de-reprovacao";
import { modoDaFila } from "./modo";
import { executarRefacao } from "./refazer";
import { aprendizadoDoCanal } from "../aprendizado/do-canal";

/**
 * O processador das refações, fora do clique (06/10/2026).
 *
 * A reprovação grava `resumo.refacao` em `na_fila` e responde. Daqui em diante:
 *
 *   1. alguém chama `processarRefacoes`: o relógio da fila a cada minuto, ou o
 *      `after` da rota logo depois da reprovação, o que chegar primeiro;
 *   2. a refação é REIVINDICADA por uma escrita condicional (`rodando`, com a
 *      hora): quem não vence não roda, e dois processos nunca refazem a mesma
 *      peça;
 *   3. as etapas rodam pelos ganchos (`refazer.ts`), com a memória de
 *      reprovação e o motivo do editor;
 *   4. o desfecho vai para a linha, sempre com palavras:
 *        - deu certo: a peça volta a `aguardando` com hash novo;
 *        - seleção do artigo ou do post: a peça NOVA entra na fila e a
 *          reprovada é descartada, com o motivo e o id da substituta;
 *        - "não dá" (`ok: false` do gancho): `impossivel`, com o motivo, que o
 *          painel mostra como "não dá para refazer: ...";
 *        - falha técnica (exceção): volta para `na_fila`, e na terceira vira
 *          `impossivel`. Um processo que morreu no meio deixa `rodando`, e
 *          depois de `MINUTOS_PARA_REFACAO_TRAVADA` a linha volta a ser pega.
 *
 * Nenhum caminho deixa a peça em `refazendo` sem dizer por quê, que era o
 * defeito da fila até esta data: a refação sem gancho ficava ali para sempre.
 *
 * A refação é da PEÇA. Os ganchos só escrevem na linha da peça reprovada (ou
 * criam uma nova, na seleção), nunca nas peças irmãs da mesma pauta em outro
 * canal: a newsletter, a matéria e o post se aprovam e se refazem um a um
 * (decisão do dono, 06/10/2026).
 */

export type DesfechoDaRefacao = {
  id: string;
  desfecho: "refeita" | "substituida" | "impossivel" | "de_volta_a_fila" | "nao_reivindicada" | "com_o_claude";
  detalhe: string;
};

function agoraDe(deps: DepsDaFila): number {
  return deps.agora ? deps.agora() : Date.now();
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * A refação pendente de uma linha, ou nada.
 *
 * A peça reprovada antes desta data ficou em `refazendo` sem `resumo.refacao`:
 * ela entra como `na_fila`, com a etapa e o motivo que a linha já guarda, e
 * passa a ter desfecho em vez de silêncio.
 */
export function refacaoDaLinha(a: Aprovacao, agoraIso: string): EstadoDaRefacao | null {
  if (a.estado !== "refazendo") return null;
  if (a.resumo?.refacao) return a.resumo.refacao;
  if (!a.etapaCulpada) return null;
  return {
    estado: "na_fila",
    etapa: a.etapaCulpada,
    motivo: a.motivo ?? "",
    alvo: null,
    tentativa: Math.max(1, a.refazimentos),
    pedidaEm: a.decididoEm ?? agoraIso,
    execucoes: 0,
  };
}

export async function processarRefacoes(
  projeto: ProjetoDaFila,
  deps: DepsDaFila,
  opcoes: { ids?: string[]; limite?: number } = {},
): Promise<DesfechoDaRefacao[]> {
  // Em ensaio quem publica são os caminhos de sempre: refazer ali mexeria no que eles publicam.
  if (modoDaFila(projeto) !== "enforce") return [];

  const agora = agoraDe(deps);
  const agoraIso = iso(agora);
  const travadaAntesDe = iso(agora - MINUTOS_PARA_REFACAO_TRAVADA * 60 * 1000);
  const limite = opcoes.limite ?? 3;
  const desfechos: DesfechoDaRefacao[] = [];

  const abertas = await deps.store.abertas(projeto.id);
  for (const a of abertas) {
    if (desfechos.filter((d) => d.desfecho !== "nao_reivindicada").length >= limite) break;
    if (opcoes.ids && !opcoes.ids.includes(a.id)) continue;
    const pendente = refacaoDaLinha(a, agoraIso);
    if (!pendente) continue;

    let esperado: { estado: "na_fila" | "rodando" | "ausente"; iniciadaAntesDe?: string };
    if (!a.resumo?.refacao) esperado = { estado: "ausente" };
    else if (pendente.estado === "na_fila") esperado = { estado: "na_fila" };
    else if (pendente.estado === "rodando" && (pendente.iniciadaEm ?? "") < travadaAntesDe) {
      esperado = { estado: "rodando", iniciadaAntesDe: travadaAntesDe };
    } else continue;

    const execucoes = pendente.execucoes + 1;
    if (execucoes > EXECUCOES_MAXIMAS_DA_REFACAO) {
      const motivo = `a refação falhou ${pendente.execucoes} vezes por erro técnico: ${pendente.erro ?? "o processo parou no meio"}`;
      const marcada = await deps.store.reivindicarRefacao(a.id, esperado, {
        ...a.resumo,
        refacao: { ...pendente, estado: "impossivel", motivoImpossivel: motivo },
        refacaoPendente: motivo,
      });
      if (marcada) desfechos.push({ id: a.id, desfecho: "impossivel", detalhe: motivo });
      continue;
    }

    const rodando: EstadoDaRefacao = { ...pendente, estado: "rodando", iniciadaEm: agoraIso, execucoes };
    const reivindicada = await deps.store.reivindicarRefacao(a.id, esperado, {
      ...a.resumo,
      refacao: rodando,
      refacaoPendente: null,
    });
    if (!reivindicada) {
      desfechos.push({ id: a.id, desfecho: "nao_reivindicada", detalhe: "outro processo já pegou esta refação" });
      continue;
    }
    desfechos.push(await rodarRefacao(projeto, reivindicada, rodando, deps));
  }

  return desfechos;
}

/**
 * O "não dá", com palavras, e a peça de volta às mãos do editor quando dá.
 *
 * Se a peça na tabela ainda é a versão que estava na fila (o gancho recusou
 * antes de escrever, que é o caso comum: sem pauta para trocar, sem outra
 * foto, reescrita barrada na guarda), ela volta para `aguardando`, intacta,
 * com o motivo à vista: o editor pode aprová-la como está, reprovar outra
 * etapa ou cancelar. Uma newsletter cuja troca de pauta não deu não pode
 * ficar presa sem saída na véspera do envio.
 *
 * Se a peça já mudou (uma etapa escreveu e a seguinte falhou, como o texto
 * novo sem a arte nova), ela fica em `refazendo`: aprovar a meia-versão
 * publicaria a manchete de uma peça na arte de outra. Aí a saída é cancelar.
 */
async function marcarImpossivel(
  a: Aprovacao,
  refacao: EstadoDaRefacao,
  motivo: string,
  deps: DepsDaFila,
): Promise<DesfechoDaRefacao> {
  let intacta = false;
  try {
    const peca = await deps.pecas.ler(a.ramo, a.pecaId);
    intacta = Boolean(peca && peca.hashAtual === a.hashArtefato);
  } catch {
    // Sem conseguir olhar, não se devolve: fica em `refazendo`, que não publica nada.
  }
  await deps.store.atualizar(
    a.id,
    {
      ...(intacta ? { estado: "aguardando" as const, decididoPor: null, decididoEm: null } : {}),
      resumo: {
        ...a.resumo,
        refacao: { ...refacao, estado: "impossivel", motivoImpossivel: motivo },
        refacaoPendente: motivo,
      },
    },
    ["refazendo"],
  );
  await deps.alertar?.(
    "warning",
    "Refação não deu",
    `${a.ramo} ${a.pecaId} (${refacao.etapa}): ${motivo}. ` +
      (intacta
        ? "A peça voltou à fila como estava: aprove, reprove outra etapa ou cancele."
        : "A peça mudou pela metade e fica parada: cancele."),
  );
  return { id: a.id, desfecho: "impossivel", detalhe: motivo };
}

async function rodarRefacao(
  projeto: ProjetoDaFila,
  a: Aprovacao,
  refacao: EstadoDaRefacao,
  deps: DepsDaFila,
): Promise<DesfechoDaRefacao> {
  /*
   * A memória é do CANAL da peça (06/10/2026): a refação do post lê só o que o
   * editor recusou em posts, e a da newsletter só o da newsletter.
   */
  const [naoRepetir, aprendizado] = await Promise.all([
    errosRecentesDaEtapa(projeto.id, a.ramo, refacao.etapa, undefined, deps.store),
    aprendizadoDoCanal(deps.store, projeto.id, a.ramo, agoraDe(deps)),
  ]);

  let r: Awaited<ReturnType<typeof executarRefacao>>;
  try {
    r = await executarRefacao(
      { aprovacao: a, etapa: refacao.etapa, motivo: refacao.motivo, naoRepetir, alvo: refacao.alvo ?? null, aprendizado },
      deps.ganchos ?? {},
    );
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    if (refacao.execucoes >= EXECUCOES_MAXIMAS_DA_REFACAO) {
      return marcarImpossivel(a, refacao, `a refação falhou ${refacao.execucoes} vezes por erro técnico: ${msg}`, deps);
    }
    await deps.store.atualizar(
      a.id,
      { resumo: { ...a.resumo, refacao: { ...refacao, estado: "na_fila", iniciadaEm: null, erro: msg } } },
      ["refazendo"],
    );
    return { id: a.id, desfecho: "de_volta_a_fila", detalhe: msg };
  }

  if (!r.ok) return marcarImpossivel(a, refacao, r.motivo, deps);

  if (r.assincrona) {
    await deps.store.atualizar(
      a.id,
      { resumo: { ...a.resumo, refacao: { ...refacao, estado: "com_o_claude" }, refacaoPendente: r.assincrona } },
      ["refazendo"],
    );
    return { id: a.id, desfecho: "com_o_claude", detalhe: r.assincrona };
  }

  const em = iso(agoraDe(deps));
  const ultimaRefacao = { etapa: refacao.etapa, em, executadas: r.executadas, detalhe: r.detalhes.join(" | ") || undefined };

  if (r.substituta) {
    const nova = await enfileirar(projeto, { ...r.substituta, resumo: { ...r.substituta.resumo, substituiu: a.id } }, deps);
    if (!nova) return marcarImpossivel(a, refacao, "a peça substituta foi gravada e não entrou na fila", deps);
    /*
     * A substituta herda a contagem: é a mesma vaga, e trocar de pauta não
     * zera as duas refações que a vaga já gastou.
     */
    await deps.store.atualizar(nova.id, {
      refazimentos: a.refazimentos,
      // O horário da vaga: o ciclo pode ter enfileirado a substituta com outro.
      publicarEm: r.substituta.publicarEm ?? nova.publicarEm,
      resumo: { ...nova.resumo, ...r.substituta.resumo, substituiu: a.id, ultimaRefacao },
    });
    const motivoFinal =
      `Substituída por outra pauta na refação ${refacao.tentativa} de ${LIMITE_DE_REFAZIMENTOS} (seleção). ` +
      `Motivo: ${refacao.motivo}`;
    await deps.store.atualizar(
      a.id,
      {
        estado: "descartada",
        motivo: motivoFinal,
        resumo: { ...a.resumo, refacao: null, refacaoPendente: null, substituidaPor: nova.id },
      },
      ["refazendo"],
    );
    await deps.pecas.retirar(a.ramo, a.pecaId, "descartada", motivoFinal);
    return { id: a.id, desfecho: "substituida", detalhe: `substituída pela peça ${nova.pecaId}` };
  }

  const peca = await deps.pecas.ler(a.ramo, a.pecaId);
  if (!peca) return marcarImpossivel(a, refacao, "a peça sumiu durante a refação", deps);

  await deps.store.atualizar(
    a.id,
    {
      estado: "aguardando",
      hashArtefato: peca.hashAtual,
      resumo: {
        ...a.resumo,
        ...r.resumo,
        texto: peca.texto,
        titulo: peca.titulo,
        refacao: null,
        refacaoPendente: null,
        ultimaRefacao,
      },
      decididoPor: null,
      decididoEm: null,
    },
    ["refazendo"],
  );
  return { id: a.id, desfecho: "refeita", detalhe: `refeitas: ${r.executadas.join(", ")}` };
}
