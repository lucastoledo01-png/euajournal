import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectBySlug, type Project } from "@/lib/server/projects";
import { comInstrucoesDoProjeto } from "@/lib/server/instrucoes";
import { criarCandidatosStore } from "@/lib/server/editorial/candidatos-store";
import { vozesDosRamosComMemoria } from "@/lib/server/ramos/vozes";
import { resolverKeywordCanonica } from "@/lib/server/social/keyword-canonica";
import { hashtagsLigadasNoProjeto } from "@/lib/server/social/legenda-final";
import type { MarcaSocial } from "@/lib/server/social/copy";
import { tarefasSupabase } from "../tarefas-store";
import type { DepsDoAgendamento } from "./agendar";
import type { DepsDoPost } from "./fluxo";
import { linhaDaFonte, materialDaLinha, slugDaFonteDasPautas } from "./material";

/**
 * As dependências de verdade do post do Claude, montadas para as rotas.
 *
 * A marca é a do ciclo social: o briefing do projeto mais a voz do post COM a
 * memória da fila (erros recentes, regras aprovadas e exemplos do canal), e a
 * keyword do funil permanente. É o que faz o aprendizado do painel chegar ao
 * Claude do mesmo jeito que chega à esteira.
 */

export async function marcaDoPostDoClaude(projeto: Project): Promise<MarcaSocial> {
  const [vozes, canonica] = await Promise.all([vozesDosRamosComMemoria(projeto), resolverKeywordCanonica(projeto.id)]);
  return {
    nome: projeto.brand.displayName || projeto.name,
    nicho: projeto.niche,
    extra: [projeto.editorialPromptExtra ?? "", vozes.post].filter(Boolean).join("\n\n"),
    keyword: canonica.ok ? canonica.keyword : "",
    hashtags: hashtagsLigadasNoProjeto(projeto.settings),
  };
}

export async function projetoDaFonte(projeto: Project): Promise<Project | null> {
  const slug = slugDaFonteDasPautas(projeto);
  return slug === projeto.slug ? projeto : getProjectBySlug(slug);
}

export function depsDoPost(client: SupabaseClient): DepsDoPost & DepsDoAgendamento {
  const candidatos = criarCandidatosStore(client);
  return {
    client,
    tarefas: tarefasSupabase(client),
    marca: marcaDoPostDoClaude,
    comInstrucoes: (projeto, fn) => comInstrucoesDoProjeto(projeto, fn),
    candidata: async (projectIdDaFonte, storyId) =>
      (await candidatos.buscarPorStoryIds(projectIdDaFonte, [storyId])).get(storyId) ?? null,
    material: async (projeto, storyId, data) => {
      const fonte = await projetoDaFonte(projeto);
      if (!fonte) return { ok: false, motivo: `o projeto de pautas "${slugDaFonteDasPautas(projeto)}" não existe` };
      const linha = await linhaDaFonte(client, fonte.id, storyId);
      if (!linha) return { ok: false, motivo: `a pauta ${storyId} não está entre os posts de ${fonte.slug}` };
      return materialDaLinha(linha, fonte.id, data);
    },
  };
}
