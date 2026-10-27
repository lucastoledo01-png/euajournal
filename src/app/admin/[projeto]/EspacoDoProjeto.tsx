"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortaoAdmin, sairDoPainel } from "@/components/admin/PortaoAdmin";
import { CapacidadesDoProjeto } from "@/components/admin/CapacidadesDoProjeto";
import type { ProjetoDoPainel, RespostaDeProjetos } from "@/components/admin/tipos";
import { AdminAnalyticsDashboard } from "@/components/AdminAnalyticsDashboard";
import { AdminCommentsManager } from "@/components/AdminCommentsManager";
import { AdminLogsManager } from "@/components/AdminLogsManager";
import { AdminNewsroomManager } from "@/components/AdminNewsroomManager";
import { AdminNewsSourcesManager } from "@/components/AdminNewsSourcesManager";
import { AdminSocialPostsManager } from "@/components/AdminSocialPostsManager";
import { FerramentasArquivadas } from "@/components/admin/FerramentasArquivadas";
import { LayoutDosPosts } from "@/components/admin/LayoutDosPosts";
import { CalendarioDeConteudo } from "@/components/admin/CalendarioDeConteudo";
import { InstrucoesEditoriais } from "@/components/admin/InstrucoesEditoriais";
import { LogsDoDia } from "@/components/admin/LogsDoDia";
import { PainelDeAprendizado } from "@/components/admin/PainelDeAprendizado";

/**
 * A área de um projeto.
 *
 * O menu anterior tinha dez itens, e cinco eram da vertical de tutoriais e
 * prompts que o projeto deixou para trás quando virou usa.journal: Carrossel,
 * Layout, Sistema PROMPT, CMS Artigos e a Analytics solta. Eles não foram
 * apagados, porque desligar não é o mesmo que destruir, e voltar atrás de uma
 * remoção custa muito mais que de um arquivamento. Estão em Avançado, atrás de
 * uma dobra, em "Ferramentas arquivadas".
 *
 * O que sobra é o que se opera todo dia, e na ordem em que o dia acontece: o
 * que sai no Instagram, o que sai por e-mail e no portal, de onde vem a
 * matéria-prima, o que o leitor respondeu, o que a máquina registrou.
 */

type Secao =
  | "publicacoes"
  | "layout"
  | "newsletter"
  | "fontes"
  | "blog"
  | "calendario"
  | "instrucoes"
  | "aprendizado"
  | "logs"
  | "avancado";

const SECOES: Array<{ id: Secao; rotulo: string; descricao: string }> = [
  { id: "publicacoes", rotulo: "Publicações", descricao: "Os posts do dia no Instagram." },
  {
    id: "layout",
    rotulo: "Layout dos posts",
    descricao: "Os moldes que o feed usa e as cores da arte.",
  },
  {
    id: "newsletter",
    rotulo: "Newsletter e artigos",
    descricao: "A edição do dia, que sai por e-mail e vira artigo no portal.",
  },
  { id: "fontes", rotulo: "Fontes de busca", descricao: "De onde a redação lê o mundo." },
  { id: "blog", rotulo: "Blog", descricao: "Comentários dos leitores e audiência do portal." },
  // 05/10/2026: o calendário (só leitura) e as instruções editoriais (RF-26).
  { id: "calendario", rotulo: "Calendário", descricao: "A semana planejada e o que existe em cada canal." },
  { id: "instrucoes", rotulo: "Instruções", descricao: "O julgamento editorial de cada etapa, com versões." },
  // 06/10/2026: o que cada canal aprendeu com a fila, e as propostas de regra.
  {
    id: "aprendizado",
    rotulo: "Aprendizado",
    descricao: "O que cada canal aprendeu com aprovações, reprovações e edições.",
  },
  { id: "logs", rotulo: "Logs", descricao: "O que cada rodada da redação registrou, e por quê." },
  { id: "avancado", rotulo: "Avançado", descricao: "Etapas ligadas e ferramentas arquivadas." },
];

/*
 * As telas do projeto que moram em endereço próprio (06/10/2026). Nasceram
 * fora deste arquivo de propósito, para várias frentes não disputarem o mesmo
 * menu, e ficavam alcançáveis só por quem sabia a URL. Aqui viram links, sem
 * entrar em `SECOES`, que são as abas desta página.
 */
const PAGINAS: Array<{ caminho: string; rotulo: string }> = [
  { caminho: "cadencia", rotulo: "Cadência" },
  { caminho: "perfis-de-referencia", rotulo: "Perfis de referência" },
  { caminho: "acervo", rotulo: "Acervo de imagens" },
  { caminho: "autores", rotulo: "Autores" },
  { caminho: "claude", rotulo: "Conectar ao Claude" },
];

function secaoDaUrl(): Secao {
  if (typeof window === "undefined") return "publicacoes";
  const alvo = window.location.hash.replace("#", "");
  return SECOES.some((s) => s.id === alvo) ? (alvo as Secao) : "publicacoes";
}

export function EspacoDoProjeto({ slug }: { slug: string }) {
  return (
    <PortaoAdmin>
      <AreaDoProjeto slug={slug} />
    </PortaoAdmin>
  );
}

function AreaDoProjeto({ slug }: { slug: string }) {
  const [projeto, setProjeto] = useState<ProjetoDoPainel | null>(null);
  const [capacidades, setCapacidades] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [secao, setSecao] = useState<Secao>("publicacoes");

  /*
   * A seção fica no hash da URL, e não no estado apenas: recarregar a página
   * com F5 no meio de uma conferência de logs devolvia o painel para a primeira
   * aba. O hash também evita o limite do App Router, que exige envolver
   * `useSearchParams` num Suspense.
   */
  useEffect(() => {
    setSecao(secaoDaUrl());
    const aoTrocar = () => setSecao(secaoDaUrl());
    window.addEventListener("hashchange", aoTrocar);
    return () => window.removeEventListener("hashchange", aoTrocar);
  }, []);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const r = await fetch("/api/admin/projetos");
        const corpo = (await r.json()) as RespostaDeProjetos;
        if (!ativo) return;
        if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);

        const achado = (corpo.projetos ?? []).find((p) => p.slug === slug) ?? null;
        setProjeto(achado);
        setCapacidades(corpo.capacidades ?? []);
        setErro(achado ? "" : `Nenhum projeto com o identificador "${slug}".`);
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Falha ao carregar o projeto.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [slug]);

  function irPara(alvo: Secao) {
    setSecao(alvo);
    window.location.hash = alvo;
  }

  if (carregando) {
    return (
      <main className="admin-shell grid min-h-screen place-items-center">
        <p className="text-xs font-semibold text-slate-500">Carregando projeto...</p>
      </main>
    );
  }

  if (!projeto) {
    return (
      <main className="admin-shell grid min-h-screen place-items-center p-6">
        <div className="admin-glass max-w-sm p-8 text-center">
          <p className="text-[13px] text-slate-600">{erro}</p>
          <Link href="/admin" className="admin-botao mt-5 inline-block">
            Ver os projetos
          </Link>
        </div>
      </main>
    );
  }

  const atual = SECOES.find((s) => s.id === secao) ?? SECOES[0];

  return (
    <div className="admin-shell flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-6 py-7">
          <Link href="/admin" className="text-[11px] text-slate-400 hover:text-slate-900">
            Projetos
          </Link>
          {/*
            O logotipo vem de `projects.brand_logo_url`, e não do `marca.ts`:
            o painel é de vários projetos, e o arquivo do código é a marca de
            um só. Sem logotipo no banco, o nome em texto, como sempre foi. A
            barra é branca, então a URL gravada deve ser a versão de fundo claro.
          */}
          {projeto.marca.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={projeto.marca.logoUrl}
              alt={projeto.marca.nome || projeto.nome}
              className="mt-2 block h-6 w-auto max-w-full"
            />
          ) : (
            <span className="mt-1 block text-[15px] font-medium text-slate-900">
              {projeto.marca.nome || projeto.nome}
            </span>
          )}
        </div>

        <nav aria-label="Seções do projeto" className="flex-1 space-y-0.5 px-3">
          {SECOES.map((item) => (
            <button
              key={item.id}
              onClick={() => irPara(item.id)}
              data-active={secao === item.id}
              className="admin-sidebar-link flex w-full items-center px-4 py-2.5 text-left text-[13px]"
            >
              {item.rotulo}
            </button>
          ))}
          <div className="mt-3 border-t border-slate-100 pt-3">
            {PAGINAS.map((p) => (
              <Link
                key={p.caminho}
                href={`/admin/${projeto.slug}/${p.caminho}`}
                className="admin-sidebar-link flex w-full items-center px-4 py-2.5 text-left text-[13px]"
              >
                {p.rotulo}
              </Link>
            ))}
          </div>
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button onClick={sairDoPainel} className="admin-botao-secundario w-full">
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 lg:px-8">
          <div className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-slate-900">
              {atual.rotulo}
            </span>
            <span className="hidden truncate text-[11px] text-slate-500 sm:block">
              {atual.descricao}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* A fila mora numa URL própria, para abrir do celular sem passar pelas abas (05/10/2026). */}
            <Link href={`/admin/${projeto.slug}/aprovacao`} className="admin-botao">
              Fila de aprovação
            </Link>
            <Link
              href={projeto.siteUrl || "/"}
              target="_blank"
              className="admin-botao-secundario"
            >
              Ver site
            </Link>
            <button onClick={sairDoPainel} className="admin-botao-secundario lg:hidden">
              Sair
            </button>
          </div>
        </header>

        {/*
          A navegação da barra lateral some abaixo de 1024px, e no painel
          anterior nada a substituía: no celular dava para ver a primeira aba e
          mais nada. Aqui ela vira uma faixa rolável sob o cabeçalho, porque
          aprovar post do celular é o caso de uso que faz o resto valer.
        */}
        <nav
          aria-label="Seções do projeto, no celular"
          className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden"
        >
          {SECOES.map((item) => (
            <button
              key={item.id}
              onClick={() => irPara(item.id)}
              data-active={secao === item.id}
              className="admin-sidebar-link shrink-0 px-3 py-1.5 text-[12px]"
            >
              {item.rotulo}
            </button>
          ))}
          {PAGINAS.map((p) => (
            <Link
              key={p.caminho}
              href={`/admin/${projeto.slug}/${p.caminho}`}
              className="admin-sidebar-link shrink-0 px-3 py-1.5 text-[12px]"
            >
              {p.rotulo}
            </Link>
          ))}
        </nav>

        <main className="flex-1 space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {secao === "publicacoes" ? <AdminSocialPostsManager /> : null}
          {secao === "layout" ? (
            <LayoutDosPosts
              projeto={projeto}
              aoTrocarMoldes={(moldes) => setProjeto({ ...projeto, moldes })}
            />
          ) : null}
          {secao === "newsletter" ? <AdminNewsroomManager /> : null}
          {secao === "fontes" ? <AdminNewsSourcesManager /> : null}
          {secao === "blog" ? (
            <div className="space-y-8">
              <AdminCommentsManager />
              <AdminAnalyticsDashboard />
            </div>
          ) : null}
          {secao === "calendario" ? <CalendarioDeConteudo projeto={projeto} /> : null}
          {secao === "instrucoes" ? <InstrucoesEditoriais projeto={projeto} /> : null}
          {secao === "aprendizado" ? <PainelDeAprendizado slug={projeto.slug} embutido /> : null}
          {secao === "logs" ? (
            <div className="space-y-8">
              <LogsDoDia projeto={projeto} />
              <AdminLogsManager />
            </div>
          ) : null}
          {secao === "avancado" ? (
            <div className="space-y-8">
              <CapacidadesDoProjeto
                projeto={projeto}
                capacidades={capacidades}
                aoGravar={(novas) => setProjeto({ ...projeto, capacidades: novas })}
              />
              <FerramentasArquivadas />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
