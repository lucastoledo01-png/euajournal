import type { Project } from "@/lib/server/projects";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import type { CandidatoDeReel } from "@/lib/server/social/reels/candidatos";
import type { ResultadoVisual } from "@/lib/server/visual/tipos";
import type { Tarefa, TarefasStore } from "../tarefas-store";
import type { EtapaDoDia, PlanoDoDia, PlanosStore } from "./plano-store";

/**
 * O diretor do dia (29/10/2026): a máquina que leva o "faça o dia" do Claude
 * até o fim, uma etapa por vez, e retoma de onde parou.
 *
 *   triagem ─► plano ─► aguardando_aprovacao ─► preparo ─► producao ─► pronto
 *
 * A cada chamada ele olha o que está gravado (o plano do dia, as tarefas, as
 * fotos, os pacotes, os posts e as matérias) e devolve UMA coisa: a próxima
 * tarefa para o Claude, um "aguarde" (o plano espera o dono), ou "pronto".
 * Nada aqui chama modelo: as etapas abrem tarefas, e quem pensa é o Claude.
 */

export type PassoDoDia =
  | { tipo: "tarefa"; etapa: EtapaDoDia; tarefa: Tarefa; resumo: string }
  | { tipo: "aguardar"; etapa: EtapaDoDia; motivo: string }
  | { tipo: "pronto"; etapa: "pronto"; resumo: string };

export type DepsDoDiretor = {
  tarefas: TarefasStore;
  planos: PlanosStore;
  abrirTriagem: (projeto: Project, data: string) => Promise<Tarefa[]>;
  abrirPlano: (projeto: Project, plano: PlanoDoDia) => Promise<Tarefa>;
  candidatas: (projeto: Project, storyIds: string[]) => Promise<Map<string, CandidataPersistida>>;
  foto: (projeto: Project, storyId: string) => Promise<ResultadoVisual | null>;
  /** Abre `escolher_foto`; sem candidata nenhuma, grava a pauta sem foto e devolve null. */
  abrirFoto: (projeto: Project, plano: PlanoDoDia, candidata: CandidataPersistida) => Promise<Tarefa | null>;
  /** Abre `extrair_pacote`; matéria ilegível devolve null (a pauta sai do plano). */
  abrirPacote: (projeto: Project, data: string, candidata: CandidataPersistida) => Promise<Tarefa | null>;
  reels: (projeto: Project, ids: string[]) => Promise<CandidatoDeReel[]>;
  escolherReel: (id: string) => Promise<boolean>;
  /**
   * A aprovação do plano pelo dono é a verificação de finalista do Instagram
   * (29/10/2026): grava `verificacao: confirm` nas pautas de post do plano.
   * Idempotente. Sem isso o Social Guard recusava todo post do Claude como
   * `SOCIAL_REJECT_UNVERIFIED`, porque a verificação da esteira é da OpenAI.
   */
  verificarPeloPlano: (projeto: Project, storyIds: string[]) => Promise<void>;
  /** O post desta pauta já está gravado na fila? */
  postAgendado: (projeto: Project, data: string, storyId: string) => Promise<boolean>;
  iniciarPost: (projeto: Project, data: string, storyId: string) => Promise<Tarefa | { erro: string }>;
  agendarPost: (projeto: Project, data: string, storyId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  artigoGravado: (projeto: Project, data: string, storyId: string) => Promise<boolean>;
  iniciarArtigo: (projeto: Project, plano: PlanoDoDia, storyId: string) => Promise<Tarefa | { erro: string }>;
  newsletterGravada: (projeto: Project, data: string) => Promise<boolean>;
  avancarNewsletter: (projeto: Project, data: string) => Promise<{ tarefa?: Tarefa; pronta?: boolean; motivo?: string }>;
};

/** Tarefa que a escrita marcou como pronta (o post passou na guarda). */
function postPronto(t: Tarefa | undefined): boolean {
  return Boolean(t && t.estado === "entregue" && (t.resultado as { pronto?: unknown } | null)?.pronto);
}

function semPendencia(t: Tarefa | undefined): boolean {
  return !t || t.estado === "entregue" || t.estado === "cancelada";
}

export async function proximoPassoDoDia(projeto: Project, data: string, deps: DepsDoDiretor): Promise<PassoDoDia> {
  let plano = await deps.planos.doDia(projeto.id, data);
  const doDia = await deps.tarefas.doDia(projeto.id, data);
  const aberta = (tipo?: string) =>
    doDia
      .filter((t) => (t.estado === "aberta" || t.estado === "reparar") && (!tipo || t.tipo === tipo))
      .sort((a, b) => (a.estado === "reparar" ? -1 : 0) - (b.estado === "reparar" ? -1 : 0) || a.criadaEm.localeCompare(b.criadaEm))[0];
  const tarefa = (t: Tarefa, resumo: string): PassoDoDia => ({ tipo: "tarefa", etapa: plano.etapa, tarefa: t, resumo });

  // A verificação do plano vem antes de tudo: o post aberto agora é conferido na entrega, e precisa dela.
  if (plano.estado === "aprovado") await deps.verificarPeloPlano(projeto, plano.itens.posts);

  // Trabalho começado vem antes de trabalho novo, em qualquer etapa.
  const pendente = aberta();
  if (pendente) return tarefa(pendente, `continuando: ${pendente.tipo}`);

  if (plano.etapa === "triagem") {
    const triagens = doDia.filter((t) => t.tipo === "classificar");
    if (triagens.length === 0) {
      const novas = await deps.abrirTriagem(projeto, data);
      if (novas.length) return tarefa(novas[0], `triagem: ${novas.length} lote(s) de notícias para classificar`);
    }
    plano = await deps.planos.atualizar(plano.id, { etapa: "plano" });
  }

  if (plano.etapa === "plano") {
    const t = await deps.abrirPlano(projeto, plano);
    if (t.estado === "aberta" || t.estado === "reparar") return tarefa(t, "plano do dia: escolha o que produzir");
    // Entregue: a entrega já pôs o plano na fila e mudou a etapa; relê.
    plano = (await deps.planos.porId(plano.id)) ?? plano;
  }

  if (plano.etapa === "aguardando_aprovacao" || plano.estado === "aguardando") {
    return { tipo: "aguardar", etapa: "aguardando_aprovacao", motivo: "o plano está na fila de aprovação do painel: espere o dono aprovar" };
  }
  if (plano.estado === "reprovado") {
    return { tipo: "aguardar", etapa: plano.etapa, motivo: `o plano foi reprovado: ${plano.motivo ?? "sem motivo"}` };
  }

  const itens = plano.itens;
  const pautas = [...new Set([...itens.newsletter, ...itens.artigos, ...itens.posts])];

  if (plano.etapa === "preparo") {
    const candidatas = await deps.candidatas(projeto, pautas);
    for (const id of pautas) {
      const c = candidatas.get(id);
      if (!c) continue;
      const jaTemFoto = doDia.some((t) => t.tipo === "escolher_foto" && t.chave === id) || (await deps.foto(projeto, id)) !== null;
      if (!jaTemFoto) {
        const t = await deps.abrirFoto(projeto, plano, c);
        if (t) return tarefa(t, `foto da pauta: ${c.title.slice(0, 80)}`);
      }
      const jaTemPacote = Boolean(c.factualPackage) || doDia.some((t) => t.tipo === "extrair_pacote" && t.chave === id);
      if (!jaTemPacote) {
        const t = await deps.abrirPacote(projeto, data, c);
        if (t) return tarefa(t, `fatos da pauta: ${c.title.slice(0, 80)}`);
      }
    }
    for (const r of await deps.reels(projeto, itens.reels)) if (r.estado === "nova") await deps.escolherReel(r.id);
    plano = await deps.planos.atualizar(plano.id, { etapa: "producao" });
  }

  if (plano.etapa === "producao") {
    const candidatas = await deps.candidatas(projeto, pautas);
    const fotoOk = async (id: string) => (await deps.foto(projeto, id))?.status === "SELECTED";
    const pacoteOk = (id: string) => Boolean(candidatas.get(id)?.factualPackage);

    for (const id of itens.posts) {
      if (!pacoteOk(id) || !(await fotoOk(id)) || (await deps.postAgendado(projeto, data, id))) continue;
      const escrita = doDia.find((t) => t.tipo === "escrever_post" && t.chave === id);
      // O post descartado só por falta da verificação volta ao Claude, agora que o plano a gravou.
      if (escrita?.estado === "cancelada" && escrita.motivos.some((m) => m.includes("SOCIAL_REJECT_UNVERIFIED"))) {
        const devolvida = await deps.tarefas.pedirReparo(
          escrita.id,
          escrita.resultado,
          ["A pauta foi verificada pela aprovação do plano. Entregue de novo a mesma copy (o JSON do esquema)."],
          "plataforma",
        );
        return tarefa(devolvida, `post de volta: ${candidatas.get(id)?.title.slice(0, 80) ?? id}`);
      }
      if (!escrita) {
        const t = await deps.iniciarPost(projeto, data, id);
        if ("erro" in t) continue;
        return tarefa(t, `post: ${candidatas.get(id)?.title.slice(0, 80) ?? id}`);
      }
      if (postPronto(escrita)) await deps.agendarPost(projeto, data, id);
    }

    for (const id of itens.artigos) {
      if (!pacoteOk(id) || (await deps.artigoGravado(projeto, data, id))) continue;
      if (doDia.some((t) => t.tipo === "escrever_artigo" && t.chave === id)) continue;
      const t = await deps.iniciarArtigo(projeto, plano, id);
      if (!("erro" in t)) return tarefa(t, `matéria: ${candidatas.get(id)?.title.slice(0, 80) ?? id}`);
    }

    if (itens.newsletter.length && !(await deps.newsletterGravada(projeto, data))) {
      const r = await deps.avancarNewsletter(projeto, data);
      if (r.tarefa) return tarefa(r.tarefa, "newsletter");
    }

    // Reels: o worker baixa e abre a tarefa de texto; aqui só se espera o que ainda está andando.
    const reels = await deps.reels(projeto, itens.reels);
    const andando = reels.filter((r) => r.estado === "escolhida" || r.estado === "renderizando");
    if (andando.length && !doDia.some((t) => t.tipo === "escrever_reel" && semPendencia(t) === false)) {
      return { tipo: "aguardar", etapa: "producao", motivo: `${andando.length} Reel(s) com o worker (download, corte ou render): espere um minuto` };
    }

    plano = await deps.planos.atualizar(plano.id, { etapa: "pronto" });
  }

  return { tipo: "pronto", etapa: "pronto", resumo: "o dia está produzido: tudo na fila de aprovação do painel" };
}
