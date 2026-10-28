import { MARCA } from "@/lib/marca";
import { resolverCapacidade, type EstadoDaCapacidade } from "../capacidades";
import { cadenciaDoProjeto, decidirProducao, somarDiasIso, type DecisaoDeProducao } from "../cadencia";
import { zonedTimeToUtc } from "../time";
import { modoDaFila } from "../aprovacao/modo";
import type { EstadoDaAprovacao, Ramo } from "../aprovacao/contrato";

/**
 * Os avisos de operação no Telegram (06/10/2026).
 *
 * Até aqui o Telegram só falava quando algo quebrava. Com a fila de aprovação,
 * a rotina do dono passa a ter horário: a produção termina às 17:00 e alguém
 * precisa aprovar até as 06:07. Estes avisos são o relógio dessa rotina, e
 * todos passam pelo mesmo `alerts.ts` dos alertas de falha.
 *
 *   fila_pronta          fim da produção (ou 17:30 em diante, se o gancho se perdeu)
 *   lembrete_22h         22:00, se ainda há peça de amanhã sem decisão
 *   ultima_chamada       05:30, o que está pendente e não sai no horário
 *   resumo_do_dia        22:30, o que saiu, o que ficou de fora e o custo
 *   producao_vazia       fim da produção, quando ela rodou e não produziu nada
 *   producao_nao_rodou   18:30, quando era dia de produção e não há linha do run
 *   newsletter_atrasada  06:15, newsletter aprovada que não saiu
 *   candidatas_nao_gravadas  fim do ciclo do Instagram, quando a gravação das
 *                        pautas candidatas falhou e os posts seguiram
 *   leitura_de_candidatas_falhou  fim do ciclo do Instagram, quando a leitura
 *                        das pautas candidatas falhou e os posts de notícia
 *                        foram segurados (06/10/2026)
 *   newsletter_ausente   fim da produção, quando só a newsletter foi barrada
 *                        pelo QA e posts e matérias seguiram (06/10/2026)
 *
 * Três regras:
 *
 * 1. Fuso do projeto, nunca o do servidor. O contêiner roda em UTC, e 22:00
 *    em São Paulo é 01:00 do dia seguinte lá dentro.
 * 2. Um aviso por dia, gravado. A chave é `tipo:dia` em `platform_events`, e o
 *    cron de minuto em minuto pergunta antes de mandar. Aviso que se repete
 *    a cada minuto é aviso que o dono silencia.
 * 3. Os avisos da fila (fila_pronta, lembrete_22h, ultima_chamada) só existem
 *    com a capacidade `aprovacao` fora de `off`. Com ela desligada não há fila
 *    a aprovar, e avisar seria ruído.
 *
 * E nenhum aviso mente: com a fila em `dry_run` nada é segurado, então a
 * última chamada diz que as peças saem mesmo sem aprovação, em vez de dizer
 * que não saem.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type TipoDeAviso =
  | "fila_pronta"
  | "lembrete_22h"
  | "ultima_chamada"
  | "resumo_do_dia"
  | "producao_vazia"
  | "producao_nao_rodou"
  | "newsletter_atrasada"
  | "candidatas_nao_gravadas"
  | "leitura_de_candidatas_falhou"
  | "newsletter_ausente";

export type NivelDoAviso = "info" | "warning" | "critical";

export type ProjetoDosAvisos = {
  id: string;
  slug: string;
  timezone: string;
  settings?: Record<string, unknown> | null;
};

/** Uma linha de `aprovacoes`, só com o que os avisos usam. */
export type LinhaDaFila = {
  ramo: Ramo;
  estado: EstadoDaAprovacao;
  publicarEm: string | null;
  liberadoEm: string | null;
  titulo: string | null;
};

/** O que o resumo das 22:30 precisa do dia. */
export type DadosDoDia = {
  newsletterPublicada: boolean;
  assuntoDaNewsletter: string | null;
  materiasPublicadas: number;
  postsPublicados: number;
  postsComFalha: number;
  /** Motivos de corte do social do dia, com a contagem (códigos do diagnóstico). */
  motivosDeCorte: Array<{ motivo: string; quantas: number }>;
  semFoto: number;
  /** As linhas da fila com publicação no dia, para reprovadas e não aprovadas. */
  fila: LinhaDaFila[];
  custoUsd: number;
};

export type LeitorDosAvisos = {
  /** Linhas de `aprovacoes` com `publicar_em` em [inicioIso, fimIso). */
  filaEntre(projectId: string, inicioIso: string, fimIso: string): Promise<LinhaDaFila[]>;
  /** Existe linha em `newsroom_runs` da produção deste alvo, criada desde `desdeIso`? */
  producaoDeixouLinha(projectId: string, prefixos: string[], desdeIso: string): Promise<boolean>;
  dadosDoDia(projectId: string, dia: string, inicioIso: string, fimIso: string): Promise<DadosDoDia>;
};

export type RegistroDosAvisos = {
  /** O aviso desta chave já saiu, ou já desistiu de sair? */
  jaFeito(projectId: string, chave: string): Promise<boolean>;
  gravar(projectId: string, registro: RegistroDoAviso): Promise<void>;
};

export type RegistroDoAviso = {
  chave: string;
  tipo: TipoDeAviso;
  dia: string;
  enviado: boolean;
  motivo: string;
  descricao: string | null;
  texto: string;
};

export type DesfechoDoEnvio = { enviado: boolean; motivo: string; descricao: string | null };

export type DepsDosAvisos = {
  leitor: LeitorDosAvisos;
  registro: RegistroDosAvisos;
  enviar: (nivel: NivelDoAviso, texto: string) => Promise<DesfechoDoEnvio>;
  agora?: () => Date;
};

export type ResultadoDosAvisos = {
  enviados: TipoDeAviso[];
  pulados: Array<{ tipo: TipoDeAviso; motivo: string }>;
};

// ---------------------------------------------------------------------------
// Relógio e janelas
// ---------------------------------------------------------------------------

/**
 * As janelas, em hora local do projeto, fechadas nas duas pontas.
 *
 * A janela, e não o minuto exato, é o que torna o aviso robusto a um cron que
 * atrasou ou pulou um minuto: ele sai no primeiro minuto dentro dela, e a
 * chave do dia impede o segundo.
 */
/* Os avisos de evento (produção vazia, candidatas não gravadas ou não lidas) não têm janela: saem quando o evento acontece. */
export const JANELAS: Record<
  Exclude<TipoDeAviso, "producao_vazia" | "candidatas_nao_gravadas" | "leitura_de_candidatas_falhou" | "newsletter_ausente">,
  { inicio: string; fim: string }
> = {
  fila_pronta: { inicio: "17:30", fim: "21:59" },
  producao_nao_rodou: { inicio: "18:30", fim: "21:59" },
  lembrete_22h: { inicio: "22:00", fim: "23:59" },
  resumo_do_dia: { inicio: "22:30", fim: "23:59" },
  ultima_chamada: { inicio: "05:30", fim: "06:06" },
  newsletter_atrasada: { inicio: "06:15", fim: "11:59" },
};

/** Data (AAAA-MM-DD) e hora (HH:MM) locais do instante, no fuso dado. */
export function relogioLocal(agora: Date, timeZone: string): { dia: string; hora: string } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(agora)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

export function naJanela(hora: string, janela: { inicio: string; fim: string }): boolean {
  return hora >= janela.inicio && hora <= janela.fim;
}

/** O intervalo UTC [início, fim) de um dia local. */
export function limitesDoDia(dia: string, timeZone: string): { inicioIso: string; fimIso: string } {
  return {
    inicioIso: zonedTimeToUtc(dia, "00:00", timeZone).toISOString(),
    fimIso: zonedTimeToUtc(somarDiasIso(dia, 1), "00:00", timeZone).toISOString(),
  };
}

function horaLocalDe(iso: string, timeZone: string): string {
  return relogioLocal(new Date(iso), timeZone).hora;
}

/** "2026-10-06" vira "06/10". */
export function diaCurto(dia: string): string {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

// ---------------------------------------------------------------------------
// Contagens
// ---------------------------------------------------------------------------

export type ContagemPorRamo = Record<Ramo, number>;

const PENDENTES: readonly EstadoDaAprovacao[] = ["aguardando", "refazendo"];
const FORA_DA_FILA: readonly EstadoDaAprovacao[] = ["cancelada", "descartada"];

export function contarPorRamo(linhas: LinhaDaFila[]): ContagemPorRamo {
  const c: ContagemPorRamo = { newsletter: 0, artigo: 0, post: 0, plano: 0 };
  for (const l of linhas) c[l.ramo] += 1;
  return c;
}

/** As peças do dia que estão na fila: tudo menos o que já saiu dela por cancelamento ou descarte. */
export function pecasNaFila(linhas: LinhaDaFila[]): LinhaDaFila[] {
  return linhas.filter((l) => !FORA_DA_FILA.includes(l.estado));
}

/** As peças que ainda esperam decisão (aguardando ou em refação). */
export function pecasPendentes(linhas: LinhaDaFila[]): LinhaDaFila[] {
  return linhas.filter((l) => PENDENTES.includes(l.estado));
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** "1 newsletter, 2 matérias, 9 posts". Com `omitirZeros`, só o que existe. */
export function descreverContagem(c: ContagemPorRamo, omitirZeros = false): string {
  const partes: Array<[number, string]> = [
    [c.newsletter, `${c.newsletter} newsletter`],
    [c.artigo, plural(c.artigo, "matéria", "matérias")],
    [c.post, plural(c.post, "post", "posts")],
  ];
  return partes
    .filter(([n]) => !omitirZeros || n > 0)
    .map(([, t]) => t)
    .join(", ");
}

export function linkDaFila(slug: string): string {
  return `${MARCA.site}/admin/${slug}/aprovacao`;
}

function formatarUsd(valor: number): string {
  return `US$ ${valor.toFixed(2).replace(".", ",")}`;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export function textoFilaPronta(slug: string, alvo: string, hoje: string, c: ContagemPorRamo): string {
  const quando = alvo === somarDiasIso(hoje, 1) ? "de amanhã" : `de ${diaCurto(alvo)}`;
  return `A fila ${quando} está pronta: ${descreverContagem(c)}.\nAprovar em ${linkDaFila(slug)}`;
}

export function textoLembrete(slug: string, c: ContagemPorRamo, ensaio: boolean): string {
  return (
    `Lembrete: ainda há peças de amanhã sem aprovação: ${descreverContagem(c, true)}.` +
    (ensaio ? "\nA fila está em ensaio: elas saem mesmo sem aprovação." : "") +
    `\n${linkDaFila(slug)}`
  );
}

/**
 * A última chamada diz, por canal, o primeiro horário que vai passar sem a
 * peça. Uma lista de "o que não sai às 06:07" seria falsa para o post das
 * 12:00, que ainda tem a manhã inteira para ser aprovado.
 */
export function textoUltimaChamada(
  slug: string,
  pendentes: LinhaDaFila[],
  timeZone: string,
  ensaio: boolean,
): string {
  const nomes: Record<Ramo, (n: number) => string> = {
    newsletter: (n) => `${n} newsletter`,
    artigo: (n) => plural(n, "matéria", "matérias"),
    post: (n) => plural(n, "post", "posts"),
    plano: (n) => plural(n, "plano do dia", "planos do dia"),
  };
  const linhas: string[] = [];
  for (const ramo of ["plano", "newsletter", "artigo", "post"] as Ramo[]) {
    const doRamo = pendentes.filter((p) => p.ramo === ramo);
    if (doRamo.length === 0) continue;
    const horarios = doRamo
      .map((p) => p.publicarEm)
      .filter((x): x is string => Boolean(x))
      .sort();
    const primeiro = horarios[0] ? ` (a partir de ${horaLocalDe(horarios[0], timeZone)})` : "";
    const titulo = ramo === "newsletter" && doRamo[0].titulo ? `: "${doRamo[0].titulo}"` : "";
    linhas.push(`- ${nomes[ramo](doRamo.length)}${primeiro}${titulo}`);
  }
  const cabeca = ensaio
    ? "Última chamada. Ainda sem aprovação hoje (a fila está em ensaio, então sai mesmo assim):"
    : "Última chamada. Sem aprovação, isto NÃO sai no horário de hoje:";
  const pe = ensaio ? "" : "\nAprovado depois do horário, sai na hora da aprovação.";
  return `${cabeca}\n${linhas.join("\n")}${pe}\n${linkDaFila(slug)}`;
}

/** Classifica um motivo de corte em sem foto, imigração ou o resto. */
export function classificarMotivo(motivo: string): "sem_foto" | "imigracao" | "outro" {
  if (/IMIGRA|IMMIGRATION/i.test(motivo)) return "imigracao";
  if (/FOTO|PHOTO|IMAGEM|IMAGE/i.test(motivo)) return "sem_foto";
  return "outro";
}

export function textoResumoDoDia(dia: string, d: DadosDoDia): string {
  const publicado: string[] = [];
  publicado.push(
    d.newsletterPublicada
      ? `newsletter enviada${d.assuntoDaNewsletter ? ` ("${d.assuntoDaNewsletter}")` : ""}`
      : "sem newsletter",
  );
  publicado.push(plural(d.materiasPublicadas, "matéria", "matérias"));
  publicado.push(plural(d.postsPublicados, "post", "posts"));

  let semFoto = d.semFoto;
  let imigracao = 0;
  let outros = 0;
  for (const m of d.motivosDeCorte) {
    const tipo = classificarMotivo(m.motivo);
    if (tipo === "sem_foto") semFoto += m.quantas;
    else if (tipo === "imigracao") imigracao += m.quantas;
    else outros += m.quantas;
  }
  const reprovadas = d.fila.filter((l) => ["reprovada", "descartada", "cancelada"].includes(l.estado)).length;
  const naoAprovadas = pecasPendentes(d.fila).length;

  const fora: string[] = [];
  if (semFoto) fora.push(`${semFoto} sem foto`);
  if (imigracao) fora.push(`${imigracao} por imigração`);
  if (outros) fora.push(`${outros} por regra editorial ou teto do dia`);
  if (reprovadas) fora.push(plural(reprovadas, "reprovada", "reprovadas"));
  if (naoAprovadas) fora.push(`${naoAprovadas} sem aprovação`);
  if (d.postsComFalha) fora.push(plural(d.postsComFalha, "post com falha", "posts com falha"));

  return (
    `Resumo de ${diaCurto(dia)}.\n` +
    `Publicado: ${publicado.join(", ")}.\n` +
    `Ficou de fora: ${fora.length ? fora.join(", ") : "nada"}.\n` +
    `Custo do dia: ${formatarUsd(d.custoUsd)}.`
  );
}

// ---------------------------------------------------------------------------
// Modos
// ---------------------------------------------------------------------------

function modoDaProducao(projeto: ProjetoDosAvisos): EstadoDaCapacidade {
  return resolverCapacidade("producao_vespera", () => "off", projeto);
}

export function decisaoDeHoje(projeto: ProjetoDosAvisos, hoje: string): DecisaoDeProducao {
  return decidirProducao(cadenciaDoProjeto(projeto), hoje, modoDaProducao(projeto) !== "off");
}

/** Os prefixos de `idempotency_key` que a produção de um alvo deixa em `newsroom_runs`. */
export function prefixosDaProducao(hoje: string, alvo: string): string[] {
  return [`daily-edition-${alvo}`, `producao-${alvo}`, `producao-${hoje}`];
}

// ---------------------------------------------------------------------------
// Emissão idempotente
// ---------------------------------------------------------------------------

/**
 * Manda um aviso uma vez por chave, e grava o desfecho.
 *
 * O desfecho vai para o banco nos dois casos. Falha de envio também conta como
 * tentativa (o registro decide quantas aceita), para um canal quebrado não
 * virar um alerta de falha por minuto.
 */
async function emitir(
  projeto: Pick<ProjetoDosAvisos, "id">,
  tipo: TipoDeAviso,
  dia: string,
  nivel: NivelDoAviso,
  texto: string,
  deps: Pick<DepsDosAvisos, "registro" | "enviar">,
): Promise<boolean> {
  const chave = `${tipo}:${dia}`;
  if (await deps.registro.jaFeito(projeto.id, chave)) return false;
  const r = await deps.enviar(nivel, texto);
  await deps.registro.gravar(projeto.id, {
    chave,
    tipo,
    dia,
    enviado: r.enviado,
    motivo: r.motivo,
    descricao: r.descricao,
    texto,
  });
  return r.enviado;
}

// ---------------------------------------------------------------------------
// O ciclo de minuto em minuto
// ---------------------------------------------------------------------------

/**
 * Confere as janelas e manda o que venceu. Feito para rodar a cada minuto.
 *
 * Cada aviso é independente: um que falha na leitura vira `pulados` com o
 * motivo e não segura os outros.
 */
export async function cicloDosAvisos(projeto: ProjetoDosAvisos, deps: DepsDosAvisos): Promise<ResultadoDosAvisos> {
  const r: ResultadoDosAvisos = { enviados: [], pulados: [] };
  const agora = (deps.agora ?? (() => new Date()))();
  const { dia: hoje, hora } = relogioLocal(agora, projeto.timezone);
  const amanha = somarDiasIso(hoje, 1);
  const fila = modoDaFila(projeto);
  const filaLigada = fila !== "off";
  const ensaio = fila === "dry_run";

  const tentar = async (tipo: TipoDeAviso, f: () => Promise<boolean | string>) => {
    try {
      const saida = await f();
      if (saida === true) r.enviados.push(tipo);
      else if (typeof saida === "string") r.pulados.push({ tipo, motivo: saida });
    } catch (e) {
      r.pulados.push({ tipo, motivo: `erro: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  // (a) fila pronta, como rede do gancho do fim da produção.
  if (filaLigada && naJanela(hora, JANELAS.fila_pronta)) {
    await tentar("fila_pronta", async () => {
      const decisao = decisaoDeHoje(projeto, hoje);
      if (!decisao.produzir) return "hoje não é dia de produção";
      // Só depois de a produção terminar: a contagem no meio dela seria parcial.
      const inicioDoDia = limitesDoDia(hoje, projeto.timezone).inicioIso;
      if (!(await deps.leitor.producaoDeixouLinha(projeto.id, prefixosDaProducao(hoje, decisao.alvo), inicioDoDia))) {
        return "produção ainda sem linha";
      }
      return avisarFilaPronta(projeto, decisao.alvo, hoje, deps);
    });
  }

  // (e) era dia de produção e ela não deixou rastro nenhum.
  if (naJanela(hora, JANELAS.producao_nao_rodou)) {
    await tentar("producao_nao_rodou", async () => {
      const decisao = decisaoDeHoje(projeto, hoje);
      if (!decisao.produzir) return false;
      const inicioDoDia = limitesDoDia(hoje, projeto.timezone).inicioIso;
      if (await deps.leitor.producaoDeixouLinha(projeto.id, prefixosDaProducao(hoje, decisao.alvo), inicioDoDia)) {
        return false;
      }
      return emitir(
        projeto,
        "producao_nao_rodou",
        hoje,
        "critical",
        `A produção das 17:00 não rodou: nenhuma linha em newsroom_runs para ${diaCurto(decisao.alvo)}. ` +
          `Confira o cron da produção.`,
        deps,
      );
    });
  }

  // (b) lembrete das 22:00.
  if (filaLigada && naJanela(hora, JANELAS.lembrete_22h)) {
    await tentar("lembrete_22h", async () => {
      const { inicioIso, fimIso } = limitesDoDia(amanha, projeto.timezone);
      const pendentes = pecasPendentes(await deps.leitor.filaEntre(projeto.id, inicioIso, fimIso));
      if (pendentes.length === 0) return false;
      return emitir(projeto, "lembrete_22h", amanha, "warning", textoLembrete(projeto.slug, contarPorRamo(pendentes), ensaio), deps);
    });
  }

  // (c) última chamada das 05:30.
  if (filaLigada && naJanela(hora, JANELAS.ultima_chamada)) {
    await tentar("ultima_chamada", async () => {
      const { inicioIso, fimIso } = limitesDoDia(hoje, projeto.timezone);
      const pendentes = pecasPendentes(await deps.leitor.filaEntre(projeto.id, inicioIso, fimIso));
      if (pendentes.length === 0) return false;
      return emitir(
        projeto,
        "ultima_chamada",
        hoje,
        "warning",
        textoUltimaChamada(projeto.slug, pendentes, projeto.timezone, ensaio),
        deps,
      );
    });
  }

  // (e) newsletter aprovada que não saiu. Só em `enforce`: fora dele a fila não despacha.
  if (fila === "enforce" && naJanela(hora, JANELAS.newsletter_atrasada)) {
    await tentar("newsletter_atrasada", async () => {
      const { inicioIso, fimIso } = limitesDoDia(hoje, projeto.timezone);
      const linhas = await deps.leitor.filaEntre(projeto.id, inicioIso, fimIso);
      const presa = linhas.find(
        (l) => l.ramo === "newsletter" && l.estado === "aprovada" && !l.liberadoEm && l.publicarEm && Date.parse(l.publicarEm) <= agora.getTime(),
      );
      if (!presa) return false;
      return emitir(
        projeto,
        "newsletter_atrasada",
        hoje,
        "critical",
        `A newsletter de hoje foi aprovada e não saiu até ${hora}.` +
          (presa.titulo ? ` Assunto: "${presa.titulo}".` : "") +
          `\n${linkDaFila(projeto.slug)}`,
        deps,
      );
    });
  }

  // (d) resumo do dia, com ou sem fila.
  if (naJanela(hora, JANELAS.resumo_do_dia)) {
    await tentar("resumo_do_dia", async () => {
      const { inicioIso, fimIso } = limitesDoDia(hoje, projeto.timezone);
      const dados = await deps.leitor.dadosDoDia(projeto.id, hoje, inicioIso, fimIso);
      return emitir(projeto, "resumo_do_dia", hoje, "info", textoResumoDoDia(hoje, dados), deps);
    });
  }

  return r;
}

/** (a) A fila do alvo, contada e avisada. Fila vazia não é aviso de fila pronta. */
export async function avisarFilaPronta(
  projeto: ProjetoDosAvisos,
  alvo: string,
  hoje: string,
  deps: DepsDosAvisos,
): Promise<boolean | string> {
  const { inicioIso, fimIso } = limitesDoDia(alvo, projeto.timezone);
  const naFila = pecasNaFila(await deps.leitor.filaEntre(projeto.id, inicioIso, fimIso));
  if (naFila.length === 0) return "fila do alvo vazia";
  return emitir(projeto, "fila_pronta", alvo, "info", textoFilaPronta(projeto.slug, alvo, hoje, contarPorRamo(naFila)), deps);
}

// ---------------------------------------------------------------------------
// O gancho do fim da produção
// ---------------------------------------------------------------------------

/** O pedaço do desfecho da produção que os avisos leem. Ver `producao-vespera.ts`. */
export type FimDaProducao = {
  ok: boolean;
  modo: EstadoDaCapacidade;
  decisao: Pick<DecisaoDeProducao, "produzir" | "alvo" | "hoje">;
  resultado?: unknown;
  /** Só a newsletter foi barrada pelo QA; o resto seguiu. Ver `producao-vespera.ts`. */
  newsletterAusente?: { data: string; motivo: string };
};

/**
 * O texto do aviso da newsletter que falta (06/10/2026).
 *
 * Diz a data, que o resto do dia seguiu, o motivo do portão (a primeira linha
 * do bloqueio e os apontamentos do auditor, que é onde está a frase), e o
 * comando que produz só ela. Curto, porque o Telegram corta e o dono lê no
 * celular.
 */
export function textoNewsletterAusente(slug: string, data: string, motivo: string, ensaio: boolean): string {
  const linhas = motivo.split("\n").map((l) => l.trim()).filter(Boolean);
  const cabeca = (linhas[0] ?? "sem motivo").replace(/^RUN_FAILED:\s*/, "");
  const auditor = linhas.filter((l) => l.startsWith("[auditor]") || l.startsWith("[conclusão") || l.startsWith("[sem lastro")).slice(0, 3);
  return (
    `A newsletter de ${diaCurto(data)}${ensaio ? " (ensaio)" : ""} NÃO foi produzida: ${cabeca}\n` +
    (auditor.length ? `${auditor.join("\n")}\n` : "") +
    `Posts e matérias do dia seguiram para a fila.\n` +
    `Para produzir só a newsletter: npx tsx src/scripts/produzir-newsletter.ts --data ${data} (ensaio; --aplicar grava e enfileira).\n` +
    linkDaFila(slug)
  ).slice(0, 1500);
}

/**
 * Chamado quando a produção das 17:00 termina.
 *
 * A falha (`ok: false`) já tem alerta crítico na rota, e não é repetida aqui.
 * Este gancho cobre o resto: produziu nada (a redação devolveu `ok: false` com
 * um motivo, como a linha editorial sem o mínimo), produziu e nada entrou na
 * fila, ou produziu e a fila está pronta.
 */
export async function avisarFimDaProducao(
  projeto: ProjetoDosAvisos,
  fim: FimDaProducao,
  deps: DepsDosAvisos,
): Promise<ResultadoDosAvisos> {
  const r: ResultadoDosAvisos = { enviados: [], pulados: [] };
  if (!fim.ok) return { ...r, pulados: [{ tipo: "producao_vazia", motivo: "falha: a rota já alertou" }] };
  if (!fim.decisao.produzir) return { ...r, pulados: [{ tipo: "fila_pronta", motivo: "não era dia de produção" }] };

  const { alvo, hoje } = fim.decisao;
  const ensaio = fim.modo === "dry_run";
  const resultado = (fim.resultado ?? {}) as Record<string, unknown>;

  try {
    /*
     * A newsletter que falta tem aviso próprio, e o resto do gancho segue: a
     * fila pronta conta o que entrou (posts e matérias), e é ela que diz ao
     * dono que há o que aprovar. A chave é a data da EDIÇÃO.
     */
    if (fim.newsletterAusente) {
      const enviado = await emitir(
        projeto,
        "newsletter_ausente",
        fim.newsletterAusente.data,
        "critical",
        textoNewsletterAusente(projeto.slug, fim.newsletterAusente.data, fim.newsletterAusente.motivo, ensaio),
        deps,
      );
      if (enviado) r.enviados.push("newsletter_ausente");
    }

    if (resultado.ok !== true && !fim.newsletterAusente) {
      const motivo = typeof resultado.reason === "string" ? resultado.reason : "sem motivo";
      const detalhe = typeof resultado.detail === "string" ? ` ${resultado.detail}` : "";
      const enviado = await emitir(
        projeto,
        "producao_vazia",
        hoje,
        "critical",
        `A produção das 17:00${ensaio ? " (ensaio)" : ""} não produziu nada para ${diaCurto(alvo)}: ${motivo}.${detalhe}`.slice(0, 900),
        deps,
      );
      if (enviado) r.enviados.push("producao_vazia");
      return r;
    }

    if (modoDaFila(projeto) === "off") {
      r.pulados.push({ tipo: "fila_pronta", motivo: "fila de aprovação desligada" });
      return r;
    }

    const saida = await avisarFilaPronta(projeto, alvo, hoje, deps);
    if (saida === true) {
      r.enviados.push("fila_pronta");
    } else if (saida === "fila do alvo vazia" && !ensaio) {
      // Produção de verdade, fila ligada, e nada entrou: o dono não tem o que aprovar.
      const enviado = await emitir(
        projeto,
        "producao_vazia",
        hoje,
        "critical",
        `A produção das 17:00 terminou, mas nenhuma peça de ${diaCurto(alvo)} entrou na fila de aprovação.\n${linkDaFila(projeto.slug)}`,
        deps,
      );
      if (enviado) r.enviados.push("producao_vazia");
    } else if (typeof saida === "string") {
      r.pulados.push({ tipo: "fila_pronta", motivo: saida });
    }
  } catch (e) {
    r.pulados.push({ tipo: "fila_pronta", motivo: `erro: ${e instanceof Error ? e.message : String(e)}` });
  }
  return r;
}

// ---------------------------------------------------------------------------
// A gravação das candidatas falhou, e os posts seguiram
// ---------------------------------------------------------------------------

/** O que o ciclo do Instagram sabe quando a gravação das candidatas falhou. */
export type CandidatasNaoGravadas = {
  /** A data da edição do ciclo (AAAA-MM-DD): é a chave do aviso. */
  dia: string;
  /** Os erros como a guarda os registrou, com o texto do banco. */
  erros: string[];
  /** Quantos posts o ciclo gravou mesmo assim. */
  postsGravados: number;
};

/**
 * Curto e em português: o que falhou, que os posts seguiram, e o erro do banco.
 *
 * Até 06/10/2026 esta falha fechava o feed do dia inteiro, sem aviso. Agora
 * ela não fecha (ver `errosDeGravacao` em `guarda.ts`), e o aviso existe para
 * a falha não passar em silêncio: o que se perde é o reuso da classificação
 * amanhã, e uma falha que se repete todo dia é defeito, não soluço.
 */
export function textoCandidatasNaoGravadas(f: CandidatasNaoGravadas): string {
  const posts =
    f.postsGravados === 1 ? "1 post gravado" : `${f.postsGravados} posts gravados`;
  const erro = f.erros[0] ?? "sem texto do erro";
  const mais = f.erros.length > 1 ? ` (e mais ${f.erros.length - 1})` : "";
  return (
    `Instagram de ${diaCurto(f.dia)}: a gravação das pautas candidatas no banco falhou, ` +
    `e os posts seguiram normalmente (${posts}). Erro: ${erro}${mais}`
  ).slice(0, 900);
}

/**
 * Um aviso por dia, pelo mesmo `emitir` dos outros: a chave
 * `candidatas_nao_gravadas:<dia>` em `platform_events`, o envio pelo
 * `alerts.ts` e o desfecho gravado nos dois casos. O ciclo da manhã e o da
 * tarde podem falhar no mesmo dia, e o dono recebe uma mensagem só.
 */
export async function avisarCandidatasNaoGravadas(
  projeto: Pick<ProjetoDosAvisos, "id">,
  falha: CandidatasNaoGravadas,
  deps: Pick<DepsDosAvisos, "registro" | "enviar">,
): Promise<boolean> {
  if (falha.erros.length === 0) return false;
  return emitir(
    projeto,
    "candidatas_nao_gravadas",
    falha.dia,
    "warning",
    textoCandidatasNaoGravadas(falha),
    deps,
  );
}

// ---------------------------------------------------------------------------
// A leitura das candidatas falhou, e os posts de notícia foram segurados
// ---------------------------------------------------------------------------

/** O que o ciclo do Instagram sabe quando a leitura das candidatas fechou a notícia. */
export type LeituraDeCandidatasFalhou = {
  /** A data da edição do ciclo (AAAA-MM-DD): é a chave do aviso. */
  dia: string;
  /** Os erros como a guarda os registrou, já com o texto inteiro do banco (`texto-do-erro.ts`). */
  erros: string[];
  /** Quantos posts a composição tinha calculado antes do bloqueio. */
  postsSegurados: number;
};

/**
 * Curto e em português: o que ficou de fora, por quê, o erro do banco e o que
 * o dono pode fazer.
 *
 * Decisão do dono (06/10/2026): a leitura que falha CONTINUA fechando a
 * notícia do Instagram, porque sem ela o pool é reclassificado do zero e o
 * sorteio do classificador (24% de decisões trocadas, medido) volta a decidir
 * o que vai ao ar. O que mudou é que o bloqueio deixou de ser silencioso: em
 * 06/10 ele custou o dia inteiro e só foi achado por eliminação.
 *
 * O texto diz que newsletter e portal seguem porque é verdade no código: a
 * guarda classifica tudo de novo quando a leitura falha ("banco indisponível
 * não pode impedir a edição de sair"), e o bloqueio mora só na composição do
 * feed. E dá o caminho de refazer só o Instagram, que não toca e-mail nem
 * portal e não duplica post (idempotência por pauta e por acontecimento).
 *
 * O erro vai inteiro, sem corte próprio: `textoDoErro` já o limita, e o corte
 * de 900 do aviso irmão comeria justamente o `details` que diz o que houve.
 * O teto total só protege o limite de mensagem do Telegram.
 */
export function textoLeituraDeCandidatasFalhou(f: LeituraDeCandidatasFalhou): string {
  const posts =
    f.postsSegurados === 1 ? "1 post calculado ficou" : `${f.postsSegurados} posts calculados ficaram`;
  const erro = f.erros.join(" | ") || "sem texto do erro";
  return (
    `Instagram de ${diaCurto(f.dia)}: os posts de notícia foram segurados (${posts} de fora), ` +
    `porque a leitura do histórico de pautas candidatas no banco falhou. Sem ela a classificação ` +
    `seria refeita do zero, e o feed não publica assim. Newsletter e portal não são afetados. ` +
    `Para publicar, quando o banco responder, rode de novo só o Instagram: ` +
    `npx tsx src/scripts/leva-social-extra.ts --quantos=5 (ensaio) e depois com --valendo. ` +
    `Erro: ${erro}`
  ).slice(0, 3500);
}

/**
 * Um aviso por dia, pelo mesmo `emitir` dos outros: a chave
 * `leitura_de_candidatas_falhou:<dia>` em `platform_events`, o envio pelo
 * `alerts.ts` e o desfecho gravado nos dois casos. A manhã e a tarde podem
 * falhar no mesmo dia, e o dono recebe uma mensagem só. Nível `warning`, como
 * o aviso irmão: o dia continua com newsletter e portal.
 */
export async function avisarLeituraDeCandidatasFalhou(
  projeto: Pick<ProjetoDosAvisos, "id">,
  falha: LeituraDeCandidatasFalhou,
  deps: Pick<DepsDosAvisos, "registro" | "enviar">,
): Promise<boolean> {
  if (falha.erros.length === 0) return false;
  return emitir(
    projeto,
    "leitura_de_candidatas_falhou",
    falha.dia,
    "warning",
    textoLeituraDeCandidatasFalhou(falha),
    deps,
  );
}
