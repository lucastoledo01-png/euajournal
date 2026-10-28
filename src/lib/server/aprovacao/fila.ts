import { zonedTimeToUtc } from "../time";
import {
  DECISOR_AUTOMATICO,
  ETAPAS_DO_RAMO,
  LIMITE_DE_REFAZIMENTOS,
  type Aprovacao,
  type AvisoDaPeca,
  type Etapa,
  type EstadoDaRefacao,
  type Ramo,
  type ResumoDaPeca,
} from "./contrato";
import type { FilaStore } from "./fila-store";
import { conferirEdicao, type ProblemaDaEdicao } from "./guarda-da-edicao";
import { proporRegrasDaEtapa } from "./memoria-de-reprovacao";
import { detalhesDaReprovacao, type ExtrasDaPeca } from "../aprendizado/detalhes";
import { horariosDaNewsletter, modoDaFila, modoDoRamo } from "./modo";
import { decidirPublicacao, type DecisaoDoPortao } from "./portao";
import { etapaSemGancho, MOTIVO_SEM_REGENERACAO, type GanchosDeRefazer } from "./refazer";

/**
 * O serviço da fila: enfileirar, aprovar, reprovar, refazer, cancelar, editar,
 * e liberar o que foi aprovado. Decisão de 05/10/2026 (RF-20 a RF-29).
 *
 * Tudo aqui depende de duas coisas injetadas, para que a regra seja testada
 * sem banco e sem rede: o `store` da fila e o adaptador das peças, que sabe
 * ler e escrever `social_posts`, `news_editions`, `articles` e o Listmonk.
 *
 * Liberar é o único caminho que leva uma peça da fila ao ar, e ele sempre
 * passa por `decidirPublicacao`. Nenhuma função daqui publica sem perguntar.
 */

export type ProjetoDaFila = {
  id: string;
  timezone: string;
  settings?: Record<string, unknown> | null;
};

/** O que a fila precisa saber da peça, lido da tabela dela na hora. */
export type PecaLida = {
  /** O hash da versão que está na tabela AGORA. */
  hashAtual: string;
  /** O texto que o editor pode editar à mão (legenda, assunto). */
  texto: string;
  titulo: string;
  /** O material contra o qual um número editado precisa ter lastro. */
  material: string[];
  /** A keyword do CTA, para a guarda da legenda. */
  keyword?: string;
  /**
   * A foto de fundo e a arte, para a reprovação gravar o que a peça TINHA
   * (06/10/2026, `aprendizado/detalhes.ts`). Ausente: a reprovação grava só o
   * que a linha da fila sabe.
   */
  extras?: ExtrasDaPeca;
};

export type ResultadoDoDespacho = { ok: true; detalhe: string } | { ok: false; motivo: string };

export type AdaptadorDePecas = {
  ler(ramo: Ramo, pecaId: string): Promise<PecaLida | null>;
  /** Grava o texto editado e devolve o hash da nova versão. */
  gravarTexto(ramo: Ramo, pecaId: string, novoTexto: string): Promise<{ hashNovo: string }>;
  /** Põe a peça no ar, ou na vaga do worker. Só é chamado depois de o portão liberar. */
  despachar(ramo: Ramo, pecaId: string, aprovacao: Aprovacao): Promise<ResultadoDoDespacho>;
  /** Tira a peça do caminho do ar: cancelada pelo editor ou descartada pela fila. */
  retirar(ramo: Ramo, pecaId: string, tipo: "cancelada" | "descartada", motivo: string): Promise<void>;
};

export type DepsDaFila = {
  store: FilaStore;
  pecas: AdaptadorDePecas;
  ganchos?: GanchosDeRefazer;
  alertar?: (nivel: "warning" | "info", titulo: string, detalhe: string) => Promise<unknown>;
  agora?: () => number;
};

function agoraDe(deps: DepsDaFila): number {
  return deps.agora ? deps.agora() : Date.now();
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Enfileirar
// ---------------------------------------------------------------------------

export type PecaParaFila = {
  ramo: Ramo;
  pecaId: string;
  hash: string;
  publicarEm: string | null;
  avisos: AvisoDaPeca[];
  resumo: ResumoDaPeca;
};

/**
 * Registra uma peça (ou uma versão nova dela) na fila.
 *
 * Em `off` não faz nada, e é isso que mantém o dia de amanhã igual ao de hoje.
 *
 * Versão nova de peça já registrada volta para `aguardando`, porque a decisão
 * anterior era sobre outra versão. Peça cancelada ou descartada NÃO volta: quem
 * tirou a peça do ar tirou de propósito, e um escritor que regrava a linha não
 * pode desfazer essa decisão.
 *
 * Ramo em modo automático aprova na hora e grava que foi a máquina (RF-25).
 * Com aviso de QA, nem o automático aprova: aviso é exatamente o caso em que
 * alguém precisa olhar.
 */
export async function enfileirar(
  projeto: ProjetoDaFila,
  peca: PecaParaFila,
  deps: DepsDaFila,
): Promise<Aprovacao | null> {
  if (modoDaFila(projeto) === "off") return null;

  const existente = await deps.store.porPeca(projeto.id, peca.ramo, peca.pecaId);
  let linha: Aprovacao | null;

  if (!existente) {
    linha = await deps.store.inserir({
      projectId: projeto.id,
      ramo: peca.ramo,
      pecaId: peca.pecaId,
      hashArtefato: peca.hash,
      publicarEm: peca.publicarEm,
      avisos: peca.avisos,
      resumo: peca.resumo,
    });
  } else if (existente.estado === "cancelada" || existente.estado === "descartada") {
    return existente;
  } else if (existente.hashArtefato === peca.hash) {
    return existente;
  } else {
    linha = await deps.store.atualizar(existente.id, {
      hashArtefato: peca.hash,
      publicarEm: peca.publicarEm,
      avisos: peca.avisos,
      resumo: {
        ...existente.resumo,
        ...peca.resumo,
        refacaoPendente: null,
        // A versão que o Claude refez chegou (28/10/2026): a refação que a esperava acabou.
        ...(existente.resumo?.refacao?.estado === "com_o_claude" ? { refacao: null } : {}),
      },
      estado: "aguardando",
      automatica: false,
      decididoPor: null,
      decididoEm: null,
      liberadoEm: null,
    });
  }

  if (!linha) return null;

  if (modoDoRamo(projeto, peca.ramo) === "automatico" && peca.avisos.length === 0) {
    const r = await aprovar(projeto, linha.id, DECISOR_AUTOMATICO, deps, { automatica: true });
    return r.ok ? r.aprovacao : linha;
  }

  return linha;
}

// ---------------------------------------------------------------------------
// Aprovar
// ---------------------------------------------------------------------------

export type ResultadoDaDecisao =
  | { ok: true; aprovacao: Aprovacao; liberacao?: ResultadoDaLiberacao }
  | { ok: false; motivo: string };

/**
 * Aprova UMA peça, na versão que está na tabela agora.
 *
 * O hash é relido da peça antes de aprovar. Se ela mudou desde que entrou na
 * fila (alguém regravou a legenda por fora, a arte foi recongelada), a
 * aprovação é recusada: o editor estaria aprovando o que viu, e o que viu já
 * não é o que vai ao ar.
 */
export async function aprovar(
  projeto: ProjetoDaFila,
  id: string,
  quem: string,
  deps: DepsDaFila,
  opcoes: { automatica?: boolean } = {},
): Promise<ResultadoDaDecisao> {
  if (!quem.trim()) return { ok: false, motivo: "aprovação sem autor não é aprovação registrada" };

  const atual = await deps.store.porId(id);
  if (!atual || atual.projectId !== projeto.id) return { ok: false, motivo: "aprovação não encontrada neste projeto" };
  if (atual.estado !== "aguardando") return { ok: false, motivo: `a peça está "${atual.estado}", não aguardando` };

  const peca = await deps.pecas.ler(atual.ramo, atual.pecaId);
  if (!peca) return { ok: false, motivo: "a peça não existe mais" };
  if (peca.hashAtual !== atual.hashArtefato) {
    return {
      ok: false,
      motivo: "a peça mudou depois de entrar na fila; recarregue a fila e confira a versão nova",
    };
  }

  const automatica = opcoes.automatica === true;
  const aprovada = await deps.store.atualizar(
    id,
    {
      estado: "aprovada",
      automatica,
      decididoPor: quem,
      decididoEm: iso(agoraDe(deps)),
      motivo: automatica ? "aprovada automaticamente: o ramo está em modo automático" : null,
    },
    ["aguardando"],
  );
  if (!aprovada) return { ok: false, motivo: "outra decisão chegou antes desta" };

  const liberacao = await tentarLiberar(projeto, aprovada, deps);
  const final = (await deps.store.porId(id)) ?? aprovada;
  return { ok: true, aprovacao: final, liberacao };
}

export type ResultadoDoLote = {
  aprovadas: Aprovacao[];
  /** Peças com aviso de QA que o lote NÃO aprovou: exigem decisão uma a uma (RF-21). */
  comAviso: Aprovacao[];
  falhas: Array<{ id: string; motivo: string }>;
};

/**
 * Aprova em lote, por ramo ou por lista de ids.
 *
 * Um lote nunca esconde um aviso. A peça com aviso de QA é devolvida em
 * `comAviso` sem ser aprovada, e só sai com uma aprovação individual, que é o
 * clique em que o editor está olhando para ela. Aprovar dez peças com um botão
 * e descobrir depois que uma tinha número sem lastro é o caso que a fila existe
 * para impedir.
 */
export async function aprovarEmLote(
  projeto: ProjetoDaFila,
  filtro: { ramo?: Ramo; ids?: string[] },
  quem: string,
  deps: DepsDaFila,
): Promise<ResultadoDoLote> {
  const abertas = await deps.store.abertas(projeto.id);
  const alvo = abertas.filter(
    (a) =>
      a.estado === "aguardando" &&
      (!filtro.ramo || a.ramo === filtro.ramo) &&
      (!filtro.ids || filtro.ids.includes(a.id)),
  );

  const r: ResultadoDoLote = { aprovadas: [], comAviso: [], falhas: [] };
  for (const a of alvo) {
    if (a.avisos.length > 0) {
      r.comAviso.push(a);
      continue;
    }
    const d = await aprovar(projeto, a.id, quem, deps);
    if (d.ok) r.aprovadas.push(d.aprovacao);
    else r.falhas.push({ id: a.id, motivo: d.motivo });
  }
  return r;
}

/**
 * A ordem da fila no painel: aviso primeiro, sempre (RF-21).
 *
 * Dentro de cada grupo, a que sai mais cedo vem antes. É pura e é a mesma que o
 * painel usa, para que "aviso no topo" seja uma regra testada e não um CSS.
 */
export function ordenarFila(fila: Aprovacao[]): Aprovacao[] {
  const peso = (a: Aprovacao) => (a.avisos.length > 0 ? 0 : 1);
  const quando = (a: Aprovacao) => (a.publicarEm ? Date.parse(a.publicarEm) : Number.MAX_SAFE_INTEGER);
  return fila.slice().sort((x, y) => peso(x) - peso(y) || quando(x) - quando(y));
}

// ---------------------------------------------------------------------------
// Reprovar e refazer
// ---------------------------------------------------------------------------

export type ResultadoDaReprovacao =
  | {
      ok: true;
      aprovacao: Aprovacao;
      /**
       * `refacao_agendada`: a refação entrou na fila e roda fora do clique
       * (06/10/2026). `refacao_impossivel`: não há como refazer a etapa sozinha,
       * e o motivo já está no painel. `descartada`: terceira reprovação.
       */
      desfecho: "refacao_agendada" | "refacao_impossivel" | "descartada";
      detalhe: string;
    }
  | { ok: false; motivo: string };

/**
 * Reprova apontando a etapa (RF-22) e grava a memória (RF-29).
 *
 * Duas refações; a terceira reprovação descarta, com o motivo. A contagem é da
 * PEÇA, não da etapa: reprovar o texto duas vezes e a imagem uma é a terceira
 * reprovação da mesma peça, e ela já custou três rodadas de atenção.
 *
 * Desde 06/10/2026 a reprovação só AGENDA a refação, em `resumo.refacao`, e
 * responde na hora. Quem refaz é `processarRefacoes` (`refacao-assincrona.ts`),
 * chamado pelo relógio da fila a cada minuto e logo depois da resposta desta
 * reprovação. Refazer uma seleção são minutos de pacote, redação, auditoria,
 * foto e arte, e o clique do celular não espera isso.
 *
 * A reprovação é da PEÇA, e de um canal só (decisão do dono, 06/10/2026):
 * reprovar o post não toca a matéria nem a newsletter da mesma pauta.
 */
export async function reprovar(
  projeto: ProjetoDaFila,
  id: string,
  etapa: Etapa,
  motivo: string,
  quem: string,
  deps: DepsDaFila,
  opcoes: { alvo?: string | null } = {},
): Promise<ResultadoDaReprovacao> {
  const motivoLimpo = motivo.trim();
  if (!motivoLimpo) return { ok: false, motivo: "reprovação precisa de motivo escrito: é ele que a memória guarda" };
  if (!quem.trim()) return { ok: false, motivo: "reprovação sem autor" };

  const atual = await deps.store.porId(id);
  if (!atual || atual.projectId !== projeto.id) return { ok: false, motivo: "aprovação não encontrada neste projeto" };
  if (!ETAPAS_DO_RAMO[atual.ramo].includes(etapa)) {
    return { ok: false, motivo: `a etapa "${etapa}" não existe no ramo ${atual.ramo}` };
  }
  const reprovavel = atual.estado === "aguardando" || (atual.estado === "aprovada" && !atual.liberadoEm);
  if (!reprovavel) return { ok: false, motivo: `a peça está "${atual.estado}" e não pode ser reprovada agora` };

  const agora = iso(agoraDe(deps));
  const peca = await deps.pecas.ler(atual.ramo, atual.pecaId);

  await deps.store.registrarReprovacao({
    projectId: projeto.id,
    aprovacaoId: atual.id,
    ramo: atual.ramo,
    etapa,
    motivo: motivoLimpo,
    textoReprovado: peca?.texto ?? atual.resumo.texto ?? atual.resumo.titulo ?? "",
    decididoPor: quem,
    // O que a peça tinha na etapa culpada: é disso que a etapa do canal aprende (06/10/2026).
    detalhes: detalhesDaReprovacao(atual, etapa, peca?.extras ?? null, opcoes.alvo ?? null),
  });

  // A proposta de regra é consequência, e falhar nela não desfaz a reprovação.
  try {
    await proporRegrasDaEtapa(deps.store, projeto.id, atual.ramo, etapa);
  } catch (erro) {
    console.warn(`[FILA] proposta de regra não gravada: ${erro instanceof Error ? erro.message : String(erro)}`);
  }

  if (atual.refazimentos >= LIMITE_DE_REFAZIMENTOS) {
    const motivoFinal =
      `Descartada na ${atual.refazimentos + 1}a reprovação, depois de ${atual.refazimentos} refações. ` +
      `Última etapa culpada: ${etapa}. Motivo: ${motivoLimpo}`;
    const descartada = await deps.store.atualizar(
      id,
      {
        estado: "descartada",
        decididoPor: quem,
        decididoEm: agora,
        motivo: motivoFinal,
        etapaCulpada: etapa,
        resumo: { ...atual.resumo, refacao: null },
      },
      ["aguardando", "aprovada"],
    );
    if (!descartada) return { ok: false, motivo: "outra decisão chegou antes desta" };
    await deps.pecas.retirar(atual.ramo, atual.pecaId, "descartada", motivoFinal);
    return { ok: true, aprovacao: descartada, desfecho: "descartada", detalhe: motivoFinal };
  }

  const tentativa = atual.refazimentos + 1;
  /*
   * Sem gancho para a etapa, nem se agenda: a peça fica em `refazendo` com o
   * "não dá" escrito, na hora, em vez de esperar um giro para descobrir.
   */
  const semGancho = etapaSemGancho(atual.ramo, etapa, deps.ganchos ?? {});
  const refacao: EstadoDaRefacao = semGancho
    ? {
        estado: "impossivel",
        etapa,
        motivo: motivoLimpo,
        alvo: opcoes.alvo ?? null,
        tentativa,
        pedidaEm: agora,
        execucoes: 0,
        motivoImpossivel: `${MOTIVO_SEM_REGENERACAO}: a etapa "${semGancho}" do ramo ${atual.ramo} ainda não tem regeneração automática`,
      }
    : { estado: "na_fila", etapa, motivo: motivoLimpo, alvo: opcoes.alvo ?? null, tentativa, pedidaEm: agora, execucoes: 0 };

  /*
   * Sem gancho a peça não foi tocada, então volta à mão do editor na hora,
   * com o "não dá" escrito (ver `marcarImpossivel` em `refacao-assincrona.ts`).
   */
  const refazendo = await deps.store.atualizar(
    id,
    {
      estado: semGancho ? "aguardando" : "refazendo",
      decididoPor: quem,
      decididoEm: agora,
      motivo: motivoLimpo,
      etapaCulpada: etapa,
      refazimentos: tentativa,
      resumo: { ...atual.resumo, refacao, refacaoPendente: refacao.motivoImpossivel ?? null },
    },
    ["aguardando", "aprovada"],
  );
  if (!refazendo) return { ok: false, motivo: "outra decisão chegou antes desta" };

  return refacao.estado === "impossivel"
    ? { ok: true, aprovacao: refazendo, desfecho: "refacao_impossivel", detalhe: refacao.motivoImpossivel ?? "" }
    : {
        ok: true,
        aprovacao: refazendo,
        desfecho: "refacao_agendada",
        detalhe: `refação ${tentativa} de ${LIMITE_DE_REFAZIMENTOS} na fila: começa em até um minuto`,
      };
}

// ---------------------------------------------------------------------------
// Cancelar e editar
// ---------------------------------------------------------------------------

/**
 * Cancelar é estado próprio, distinto de rascunho (RF-28).
 *
 * O incidente de 16/09 ("não existe post cancelado, só rascunho") é o motivo:
 * um post cancelado e um rascunho que ninguém terminou ficavam iguais na tabela.
 */
export async function cancelar(
  projeto: ProjetoDaFila,
  id: string,
  motivo: string,
  quem: string,
  deps: DepsDaFila,
): Promise<ResultadoDaDecisao> {
  if (!motivo.trim()) return { ok: false, motivo: "cancelamento precisa de motivo" };
  const atual = await deps.store.porId(id);
  if (!atual || atual.projectId !== projeto.id) return { ok: false, motivo: "aprovação não encontrada neste projeto" };
  if (atual.liberadoEm) return { ok: false, motivo: "a peça já foi liberada para o ar" };

  const cancelada = await deps.store.atualizar(
    id,
    { estado: "cancelada", decididoPor: quem, decididoEm: iso(agoraDe(deps)), motivo: motivo.trim() },
    ["aguardando", "aprovada", "refazendo", "reprovada"],
  );
  if (!cancelada) return { ok: false, motivo: "a peça não está num estado que se cancele" };
  await deps.pecas.retirar(atual.ramo, atual.pecaId, "cancelada", motivo.trim());
  return { ok: true, aprovacao: cancelada };
}

export type ResultadoDaEdicao =
  | { ok: true; aprovacao: Aprovacao }
  | { ok: false; motivo: string; problemas?: ProblemaDaEdicao[] };

/**
 * Edição manual do texto, na fila (RF-23).
 *
 * O texto editado passa pela guarda ANTES de voltar à fila, e a guarda é a
 * mesma régua que a máquina enfrenta: travessão, número sem lastro, legenda
 * fora da forma. Editor também erra, e o leitor não sabe quem escreveu.
 *
 * A versão editada é outra versão, então volta para `aguardando` com hash
 * novo: uma aprovação anterior não cobre o texto que ninguém aprovou.
 */
export async function editarTexto(
  projeto: ProjetoDaFila,
  id: string,
  novoTexto: string,
  quem: string,
  deps: DepsDaFila,
): Promise<ResultadoDaEdicao> {
  const atual = await deps.store.porId(id);
  if (!atual || atual.projectId !== projeto.id) return { ok: false, motivo: "aprovação não encontrada neste projeto" };
  const editavel = atual.estado === "aguardando" || (atual.estado === "aprovada" && !atual.liberadoEm);
  if (!editavel) return { ok: false, motivo: `a peça está "${atual.estado}" e não pode ser editada agora` };

  const peca = await deps.pecas.ler(atual.ramo, atual.pecaId);
  if (!peca) return { ok: false, motivo: "a peça não existe mais" };

  const problemas = conferirEdicao({
    ramo: atual.ramo,
    textoAnterior: peca.texto,
    textoNovo: novoTexto,
    material: peca.material,
    keyword: peca.keyword,
    titulo: peca.titulo,
  });
  if (problemas.length > 0) {
    return { ok: false, motivo: "o texto editado não passou na guarda", problemas };
  }

  const { hashNovo } = await deps.pecas.gravarTexto(atual.ramo, atual.pecaId, novoTexto);
  const devolvida = await deps.store.atualizar(
    id,
    {
      estado: "aguardando",
      hashArtefato: hashNovo,
      resumo: { ...atual.resumo, texto: novoTexto },
      decididoPor: null,
      decididoEm: null,
      automatica: false,
      motivo: `texto editado à mão por ${quem}`,
    },
    ["aguardando", "aprovada"],
  );
  if (!devolvida) return { ok: false, motivo: "outra decisão chegou antes desta edição" };

  /*
   * A edição vira aprendizado (06/10/2026): o antes e o depois vão para
   * `edicoes_do_editor`, e o resumo semanal lê dali os padrões de cada canal.
   * Consequência, como a proposta de regra: falhar aqui não desfaz a edição.
   */
  if (peca.texto.trim() !== novoTexto.trim()) {
    try {
      await deps.store.registrarEdicao({
        projectId: projeto.id,
        ramo: atual.ramo,
        pecaId: atual.pecaId,
        aprovacaoId: atual.id,
        etapa: "texto",
        antes: peca.texto,
        depois: novoTexto,
        editadoPor: quem,
      });
    } catch (erro) {
      console.warn(`[FILA] edição não gravada para o aprendizado: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  return { ok: true, aprovacao: devolvida };
}

// ---------------------------------------------------------------------------
// Liberar e o ciclo do relógio
// ---------------------------------------------------------------------------

export type ResultadoDaLiberacao = {
  liberada: boolean;
  decisao: DecisaoDoPortao | null;
  detalhe: string;
};

/**
 * Leva uma peça aprovada ao ar, se o portão deixar.
 *
 * É o único lugar da fila que despacha, e ele pergunta ao portão com o hash
 * relido da peça e com o horário. A newsletter aprovada às 05h espera as
 * 06:07; aprovada às 07:30, sai às 07:30 (cenário 4 do PRD).
 */
export async function tentarLiberar(
  projeto: ProjetoDaFila,
  aprovacao: Aprovacao,
  deps: DepsDaFila,
): Promise<ResultadoDaLiberacao> {
  if (aprovacao.liberadoEm) return { liberada: false, decisao: null, detalhe: "já liberada antes" };

  const modo = modoDaFila(projeto);
  /*
   * Em `dry_run` quem publica são os caminhos de sempre, que não esperam a
   * fila. Despachar daqui também publicaria duas vezes a mesma peça.
   */
  if (modo !== "enforce") return { liberada: false, decisao: null, detalhe: `fila em ${modo}: os caminhos de sempre publicam` };

  const peca = await deps.pecas.ler(aprovacao.ramo, aprovacao.pecaId);
  const decisao = decidirPublicacao({
    modo,
    ramo: aprovacao.ramo,
    aprovacao,
    hashAtual: peca?.hashAtual ?? "",
    agoraMs: agoraDe(deps),
    respeitarHorario: true,
  });
  if (!decisao.libera) return { liberada: false, decisao, detalhe: decisao.detalhe };

  const venceu = await deps.store.reivindicarLiberacao(aprovacao.id, iso(agoraDe(deps)));
  if (!venceu) return { liberada: false, decisao, detalhe: "outro ciclo já está liberando esta peça" };

  let despacho: ResultadoDoDespacho;
  try {
    despacho = await deps.pecas.despachar(aprovacao.ramo, aprovacao.pecaId, aprovacao);
  } catch (erro) {
    despacho = { ok: false, motivo: erro instanceof Error ? erro.message : String(erro) };
  }

  if (!despacho.ok) {
    await deps.store.soltarLiberacao(aprovacao.id);
    await deps.alertar?.(
      "warning",
      "Peça aprovada não foi liberada",
      `${aprovacao.ramo} ${aprovacao.pecaId}: ${despacho.motivo}`,
    );
    return { liberada: false, decisao, detalhe: despacho.motivo };
  }

  return { liberada: true, decisao, detalhe: despacho.detalhe };
}

export type ResultadoDoCiclo = {
  avisos: string[];
  liberadas: string[];
  seguradas: Array<{ id: string; motivo: string }>;
};

/**
 * O relógio da fila: aviso das 06:00 e disparo do que já pode sair.
 *
 * Idempotente de propósito, para o cron poder chamar a cada minuto: o aviso
 * grava `avisado_em` e não se repete, e a liberação grava `liberado_em`.
 *
 * O aviso é só da newsletter, que é a peça com horário de leitor: post atrasado
 * sai mais tarde no feed, e-mail atrasado chega depois de a pessoa ter saído
 * de casa.
 */
export async function cicloDaFila(projeto: ProjetoDaFila, deps: DepsDaFila): Promise<ResultadoDoCiclo> {
  const r: ResultadoDoCiclo = { avisos: [], liberadas: [], seguradas: [] };
  if (modoDaFila(projeto) !== "enforce") return r;

  const agora = agoraDe(deps);
  const abertas = await deps.store.abertas(projeto.id);
  const horarios = horariosDaNewsletter(projeto);

  for (const a of abertas) {
    if (a.ramo === "newsletter" && (a.estado === "aguardando" || a.estado === "refazendo") && !a.avisadoEm && a.publicarEm) {
      const diaLocal = new Intl.DateTimeFormat("en-CA", { timeZone: projeto.timezone }).format(new Date(a.publicarEm));
      const instanteDoAviso = zonedTimeToUtc(diaLocal, horarios.aviso, projeto.timezone).getTime();
      if (agora >= instanteDoAviso) {
        await deps.alertar?.(
          "warning",
          "Newsletter ainda não aprovada",
          `A edição de ${diaLocal} está na fila (${a.estado}). Ela sai no momento da aprovação. ` +
            `${a.resumo.titulo ? `Assunto: ${a.resumo.titulo}` : ""}`.trim(),
        );
        await deps.store.atualizar(a.id, { avisadoEm: iso(agora) });
        r.avisos.push(a.id);
      }
    }

    if (a.estado === "aprovada" && !a.liberadoEm) {
      const l = await tentarLiberar(projeto, a, deps);
      if (l.liberada) r.liberadas.push(a.id);
      else r.seguradas.push({ id: a.id, motivo: l.detalhe });
    }
  }

  return r;
}

/**
 * O instante de envio da newsletter de uma data, no fuso do projeto.
 *
 * Não lança: é chamado no meio da redação, e um fuso torto no projeto não pode
 * custar a edição do dia. Sem instante, a peça não tem hora planejada e sai na
 * aprovação.
 */
export function instanteDeEnvioDaNewsletter(projeto: ProjetoDaFila, dataLocal: string): string | null {
  try {
    return zonedTimeToUtc(dataLocal, horariosDaNewsletter(projeto).envio, projeto.timezone).toISOString();
  } catch {
    return null;
  }
}

/**
 * Os horários planejados que a redação grava na fila, para a newsletter e para
 * o artigo da edição.
 *
 * Integração de 05/10/2026, com a produção na véspera: às 17:00 de segunda a
 * redação escreve a edição de TERÇA, e o horário da fila tem de ser o de terça.
 * A data que entra aqui é a da edição (`dataDaEdicao`, que já é o alvo da
 * véspera), nunca "hoje".
 *
 * Com agendamento (a véspera em `enforce`), os horários são os da cadência, os
 * MESMOS que a campanha do Listmonk e o artigo agendado recebem. Sem isso, a
 * fila usaria `settings.aprovacao.newsletter_envio` e a cadência diria outra
 * hora: o aviso das 06:00 e o disparo sairiam de um relógio, e o resto do dia
 * de outro. Sem agendamento (o ciclo das 06:03), vale a hora da fila, como era.
 */
export function horariosDaRedacaoNaFila(
  projeto: ProjetoDaFila,
  dataDaEdicao: string,
  agendamento?: { newsletterEm: string; portalEm: string } | null,
): { newsletter: string | null; artigoDaEdicao: string | null } {
  if (agendamento) return { newsletter: agendamento.newsletterEm, artigoDaEdicao: agendamento.portalEm };
  const envio = instanteDeEnvioDaNewsletter(projeto, dataDaEdicao);
  return { newsletter: envio, artigoDaEdicao: envio };
}

// ---------------------------------------------------------------------------
// Taxa de aprovação sem retrabalho (RF-25)
// ---------------------------------------------------------------------------

export type TaxaDoRamo = { ramo: Ramo; decididas: number; dePrimeira: number; taxa: number | null };

/**
 * Das peças decididas na janela, quantas foram aprovadas sem nenhuma refação.
 *
 * É o número que diz se o ramo pode ir para o automático: um ramo que aprova
 * de primeira 95% das vezes está pedindo para o editor parar de clicar.
 * Descartada conta no denominador, porque é o pior desfecho de retrabalho.
 */
export async function taxaSemRetrabalho(
  projeto: ProjetoDaFila,
  deps: DepsDaFila,
  dias = 30,
): Promise<TaxaDoRamo[]> {
  const desde = iso(agoraDe(deps) - dias * 24 * 60 * 60 * 1000);
  const decididas = await deps.store.decididasDesde(projeto.id, desde);
  return (["newsletter", "artigo", "post"] as Ramo[]).map((ramo) => {
    const doRamo = decididas.filter((d) => d.ramo === ramo);
    const dePrimeira = doRamo.filter((d) => d.estado === "aprovada" && d.refazimentos === 0).length;
    return {
      ramo,
      decididas: doRamo.length,
      dePrimeira,
      taxa: doRamo.length > 0 ? dePrimeira / doRamo.length : null,
    };
  });
}
