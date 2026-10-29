import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { comInstrucoesDoProjeto } from "@/lib/server/instrucoes";
import { criarCandidatosStore, type CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import { buscarTextoDaFonte } from "@/lib/server/editorial/enriquecimento";
import { horariosDoPortal, horariosDosArtigos } from "@/lib/server/ramos/portal";
import { vozesDosRamosComMemoria } from "@/lib/server/ramos/vozes";
import { candidatosSupabase } from "@/lib/server/social/reels/candidatos";
import { gravarImagemDaPauta, lerImagemDaPauta } from "@/lib/server/visual/acervo/imagem-da-pauta";
import type { PautaParaImagem } from "@/lib/server/visual/resolver";
import { agendarPost } from "../post/agendar";
import { depsDoPost, projetoDaFonte } from "../post/deps";
import { iniciarPost } from "../post/fluxo";
import { tarefasSupabase, type TarefasStore } from "../tarefas-store";
import { gravarMateriaDoClaude, iniciarArtigo, type DepsDoArtigo } from "../artigo/fluxo";
import { avancarNewsletter, gravarNewsletterDoClaude, type DepsDaNewsletter } from "../newsletter/fluxo";
import type { DepsDoDiretor } from "./diretor";
import { abrirFoto, candidatasDaFoto } from "./fotos";
import { abrirPacote } from "./pacotes";
import { abrirPlano, pautaDoPlano, reelsDoPlano, volumesDoProjeto, type MaterialDoPlano } from "./plano";
import { planosSupabase, type PlanoDoDia } from "./plano-store";
import { abrirTriagem, preFiltrar, type Coletada } from "./triagem";

/** As matérias do dia na coleta do projeto de onde vêm as pautas. */
async function coletadas(client: SupabaseClient, projectIdDaFonte: string, desdeIso: string): Promise<Coletada[]> {
  const linhas: Coletada[] = [];
  for (let de = 0; de < 3000; de += 1000) {
    const { data, error } = await client
      .from("news_candidates")
      .select("story_id, url, title, summary, source_domain, status, published_at")
      .eq("project_id", projectIdDaFonte)
      .gte("published_at", desdeIso)
      .order("published_at", { ascending: false })
      .range(de, de + 999);
    if (error) throw new Error(`coleta ilegível: ${error.message}`);
    const pagina = (data ?? []) as Array<Record<string, unknown>>;
    for (const l of pagina) {
      linhas.push({
        storyId: String(l.story_id),
        url: String(l.url),
        title: String(l.title ?? ""),
        summary: String(l.summary ?? ""),
        sourceDomain: (l.source_domain as string | null) ?? null,
        status: l.status as Coletada["status"],
        publishedAt: String(l.published_at ?? ""),
      });
    }
    if (pagina.length < 1000) break;
  }
  return linhas;
}

export function paraImagemDaCandidata(c: CandidataPersistida): PautaParaImagem {
  const k = c.classificacao;
  return {
    storyId: c.storyId,
    titulo: c.title,
    resumo: c.summary,
    categoria: String(k?.eixo ?? ""),
    classificacao: { atores: k?.atores ?? [], lugares: k?.lugares ?? [], acontecimento: k?.acontecimento ?? [], pais: k?.pais },
  };
}

export function depsDoArtigo(client: SupabaseClient, tarefas: TarefasStore): DepsDoArtigo {
  return {
    tarefas,
    comInstrucoes: (projeto, fn) => comInstrucoesDoProjeto(projeto, fn),
    marca: async (projeto) => {
      const v = await vozesDosRamosComMemoria(projeto);
      return { nome: projeto.brand.displayName || projeto.name, nicho: projeto.niche, briefing: projeto.editorialPromptExtra ?? "", voz: v.artigo };
    },
    gravar: (projeto, conteudo, avisos) => gravarMateriaDoClaude(client, projeto, conteudo, avisos),
    buscarRelacionadas: async (projeto, alvo) => (await import("@/lib/server/materias-relacionadas")).buscarRelacionadas(client, projeto.id, alvo),
  };
}

export function depsDaNewsletter(client: SupabaseClient, tarefas: TarefasStore): DepsDaNewsletter {
  const candidatos = criarCandidatosStore(client);
  const planos = planosSupabase(client);
  return {
    tarefas,
    async pautas(projeto, data) {
      const plano = await planos.doDia(projeto.id, data);
      const mapa = await candidatos.buscarPorStoryIds(projeto.id, plano.itens.newsletter);
      const saida = [];
      for (const id of plano.itens.newsletter) {
        const c = mapa.get(id);
        if (c) saida.push({ candidata: c, foto: await lerImagemDaPauta(client, projeto.id, id) });
      }
      return saida;
    },
    reescrever: async (e, modelo) => (await import("@/lib/server/aprovacao/refazer-newsletter")).reescreverNewsletter(e, process.env, modelo),
    gravar: (projeto, data, r, contexto) => gravarNewsletterDoClaude(client, projeto, data, r, contexto),
  };
}

export function depsDoDiretor(client: SupabaseClient): DepsDoDiretor {
  const tarefas = tarefasSupabase(client);
  const planos = planosSupabase(client);
  const candidatos = criarCandidatosStore(client);
  const reels = candidatosSupabase(client);
  const post = depsDoPost(client);
  const artigo = depsDoArtigo(client, tarefas);
  const newsletter = depsDaNewsletter(client, tarefas);

  return {
    tarefas,
    planos,
    async abrirTriagem(projeto, data) {
      const fonte = (await projetoDaFonte(projeto)) ?? projeto;
      const agora = Date.now();
      const lista = await coletadas(client, fonte.id, new Date(agora - 24 * 3_600_000).toISOString());
      const jaClassificadas = new Set((await candidatos.buscarDaJanela(projeto.id, 3)).keys());
      return abrirTriagem(projeto, data, preFiltrar(lista, jaClassificadas, { agoraMs: agora }), {
        tarefas,
        candidatos,
        comInstrucoes: (p, fn) => comInstrucoesDoProjeto(p, fn),
      });
    },
    async abrirPlano(projeto, plano: PlanoDoDia) {
      const fonte = (await projetoDaFonte(projeto)) ?? projeto;
      const agora = Date.now();
      const doDia = (await coletadas(client, fonte.id, new Date(agora - 24 * 3_600_000).toISOString())).map((c) => ({
        titulo: c.title,
        dominio: c.sourceDomain ?? "",
      }));
      const janela = [...(await candidatos.buscarDaJanela(projeto.id, 2)).values()].filter((c) => c.status === "approved");
      const desde = new Date(agora - 30 * 86_400_000).toISOString().slice(0, 10);
      const aprovados = (await planos.aprovadosDesde(projeto.id, desde)).filter((p) => p.id !== plano.id);
      const material: MaterialDoPlano = {
        data: plano.data,
        volumes: volumesDoProjeto(projeto),
        pautas: janela
          .sort((a, b) => (b.editorialScore ?? 0) - (a.editorialScore ?? 0))
          .slice(0, 40)
          .map((c) => pautaDoPlano(c, doDia, null)),
        reels: reelsDoPlano(await reels.sugeridos(projeto.id, 10)),
        jaUsadas: {
          newsletter: aprovados.flatMap((p) => p.itens.newsletter),
          artigos: aprovados.flatMap((p) => p.itens.artigos),
          instagram: aprovados.flatMap((p) => p.itens.posts),
        },
      };
      return abrirPlano(projeto, plano, material, tarefas);
    },
    candidatas: (projeto, ids) => candidatos.buscarPorStoryIds(projeto.id, ids),
    foto: (projeto, id) => lerImagemDaPauta(client, projeto.id, id),
    async abrirFoto(projeto, plano, c) {
      const cena = plano.itens.cenas[c.storyId];
      const lista = await candidatasDaFoto(
        paraImagemDaCandidata(c),
        { consulta: cena?.consulta ?? "", objeto: cena?.objeto ?? "", falhou: !cena, motivo: cena ? "cena do Claude, no plano" : "sem cena no plano", custoUsd: 0 },
        { env: process.env, client, bancosOficiais: true },
      );
      if (lista.length === 0) {
        await gravarImagemDaPauta(client, projeto.id, {
          storyId: c.storyId,
          entidade: null,
          asset: null,
          assetSecundario: null,
          status: "NO_VALID_IMAGE",
          motivo: "NO_ENTITY_IMAGE_FOUND",
          fontesConsultadas: [],
          recusados: [],
          legenda: "",
        });
        return null;
      }
      return abrirFoto(
        projeto,
        plano.data,
        {
          storyId: c.storyId,
          titulo: c.title,
          resumo: c.summary.slice(0, 800),
          categoria: String(c.classificacao?.eixo ?? ""),
          candidatas: lista.map(({ asset: _a, ...resto }) => resto),
          assets: lista.map((x) => x.asset),
        },
        tarefas,
      );
    },
    async abrirPacote(projeto, data, c) {
      const texto = await buscarTextoDaFonte(c.canonicalUrl || c.url);
      if (!texto?.texto) return null;
      return abrirPacote(projeto, data, { storyId: c.storyId, titulo: c.title, url: c.canonicalUrl || c.url, texto: texto.texto }, tarefas);
    },
    reels: async (_projeto, ids) => (await Promise.all(ids.map((id) => reels.porId(id)))).filter((r): r is NonNullable<typeof r> => r !== null),
    escolherReel: (id) => reels.escolher(id),
    async verificarPeloPlano(projeto, storyIds) {
      const mapa = await candidatos.buscarPorStoryIds(projeto.id, storyIds);
      for (const c of mapa.values()) {
        if (c.verificacao?.status === "confirm") continue;
        await candidatos.gravarVerificacao(c.id, {
          status: "confirm",
          motivo: "aprovada pelo dono no plano do dia",
          divergencias: [],
          verificadoEm: new Date().toISOString(),
          canal: "plano",
          inputHash: "plano-do-dia",
        });
      }
    },
    async postAgendado(projeto, data, storyId) {
      const { data: linhas } = await client
        .from("social_posts")
        .select("id")
        .eq("project_id", projeto.id)
        .eq("edition_date", data)
        .eq("story_id", storyId)
        .limit(1);
      return (linhas ?? []).length > 0;
    },
    async iniciarPost(projeto, data, storyId) {
      const r = await iniciarPost(projeto, { storyId, data }, post);
      return r.ok ? r.tarefa : { erro: r.error };
    },
    async agendarPost(projeto, data, storyId) {
      const r = await agendarPost(projeto, { storyId, data }, post);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async artigoGravado(projeto, data, storyId) {
      const t = (await tarefas.doDia(projeto.id, data)).find((x) => x.tipo === "escrever_artigo" && x.chave === storyId);
      return Boolean((t?.resultado as { pronto?: unknown } | null)?.pronto);
    },
    async iniciarArtigo(projeto, plano, storyId) {
      const c = (await candidatos.buscarPorStoryIds(projeto.id, [storyId])).get(storyId);
      if (!c?.factualPackage) return { erro: "sem pacote factual" };
      const indice = plano.itens.artigos.indexOf(storyId);
      const horarios = horariosDosArtigos(plano.itens.artigos.length, plano.data, projeto.timezone, horariosDoPortal(projeto));
      return iniciarArtigo(
        projeto,
        { storyId, data: plano.data, publicarEm: horarios[indice] ?? horarios[0], candidata: c, foto: await lerImagemDaPauta(client, projeto.id, storyId) },
        artigo,
      );
    },
    async newsletterGravada(projeto, data) {
      const { data: linhas } = await client.from("news_editions").select("id").eq("project_id", projeto.id).eq("edition_date", data).limit(1);
      return (linhas ?? []).length > 0;
    },
    async avancarNewsletter(projeto: Project, data: string) {
      const r = await avancarNewsletter(projeto, data, newsletter);
      if (r.desfecho === "tarefa") return { tarefa: r.tarefa };
      if (r.desfecho === "pronto") return { pronta: true };
      return { motivo: r.motivos.join("; ") };
    },
  };
}
