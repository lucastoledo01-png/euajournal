"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortaoAdmin, sairDoPainel } from "@/components/admin/PortaoAdmin";
import {
  ROTULO_DA_CAPACIDADE,
  ROTULO_DO_ESTADO,
  ROTULO_DO_MOTOR,
  type ProjetoDoPainel,
  type RespostaDeProjetos,
} from "@/components/admin/tipos";

/**
 * A home do painel é a lista de projetos, e nada mais.
 *
 * Até aqui ela era a operação inteira: dez abas numa barra lateral, quatro
 * números do dia por cima, e tudo isso amarrado implicitamente a um projeto só,
 * que o painel nunca nomeava. Metade das abas era da vertical anterior.
 *
 * A escolha do projeto passa a ser o primeiro gesto. Hoje existe um projeto, e
 * a tela mostraria o mesmo card sozinho; é de propósito. O lugar onde o segundo
 * projeto vai aparecer precisa existir antes do segundo projeto, senão ele
 * nasce como mais uma aba dentro do primeiro.
 */
export default function PainelHome() {
  return (
    <PortaoAdmin>
      <ListaDeProjetos />
    </PortaoAdmin>
  );
}

function ListaDeProjetos() {
  const [projetos, setProjetos] = useState<ProjetoDoPainel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const r = await fetch("/api/admin/projetos");
        const corpo = (await r.json()) as RespostaDeProjetos;
        if (!ativo) return;
        if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
        setProjetos(corpo.projetos ?? []);
        setErro("");
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Falha ao carregar os projetos.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, []);

  return (
    <main className="admin-shell min-h-screen px-6 py-10 lg:px-10">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] text-slate-900">Projetos</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Abra um projeto para operar a redação, as publicações e as fontes dele.
            </p>
          </div>
          <button type="button" onClick={sairDoPainel} className="admin-botao-secundario">
            Sair
          </button>
        </header>

        {erro ? (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
            {erro}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {carregando ? (
            <p className="text-[13px] text-slate-500">Carregando...</p>
          ) : projetos.length === 0 ? (
            <p className="text-[13px] text-slate-500">Nenhum projeto cadastrado.</p>
          ) : (
            projetos.map((p) => <CardDoProjeto key={p.id} projeto={p} />)
          )}
        </div>
      </div>
    </main>
  );
}

function CardDoProjeto({ projeto }: { projeto: ProjetoDoPainel }) {
  /*
   * Só as etapas que o projeto declarou, e no máximo três. O card responde
   * "este projeto está operando?", não "qual é a configuração completa dele",
   * que é pergunta de Avançado.
   */
  const ligadas = Object.entries(projeto.capacidades ?? {})
    .filter(([, estado]) => estado && estado !== "off")
    .slice(0, 3);

  return (
    <Link
      href={`/admin/${projeto.slug}`}
      className="admin-glass block p-6 transition-colors hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Mesma regra da barra do projeto: logotipo do banco, ou o nome. */}
          {projeto.marca.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={projeto.marca.logoUrl}
              alt={projeto.marca.nome || projeto.nome}
              className="block h-6 w-auto max-w-full"
            />
          ) : (
            <div className="truncate text-[17px] font-semibold text-slate-900">
              {projeto.marca.nome || projeto.nome}
            </div>
          )}
          {/*
            O nicho do eua.journal é um parágrafo editorial inteiro, e impresso
            solto ele tomava quatro linhas do card. Aqui ele é uma linha, com o
            resto no título do elemento para quem quiser ler.
          */}
          <div className="mt-1 line-clamp-1 text-[12px] text-slate-500" title={projeto.nicho}>
            {projeto.nicho}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">{projeto.timezone}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              projeto.status === "active" ? "bg-slate-900" : "bg-slate-300"
            }`}
          />
          {projeto.status === "active" ? "Ativo" : projeto.status}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {/*
          O motor vem antes das capacidades: ele diz QUEM trabalha, e no motor
          Claude nada sai sem o usuário abrir o Claude Desktop. É a primeira
          coisa a saber de um projeto parado.
        */}
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] ${
            projeto.motor === "claude_mcp" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          {ROTULO_DO_MOTOR[projeto.motor] ?? ROTULO_DO_MOTOR.openai}
        </span>
        {ligadas.length === 0 ? (
          <span className="text-[12px] text-slate-400">Etapas herdadas do servidor</span>
        ) : (
          ligadas.map(([capacidade, estado]) => (
            <span
              key={capacidade}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600"
            >
              {ROTULO_DA_CAPACIDADE[capacidade] ?? capacidade}
              {estado === "enforce" ? "" : `: ${ROTULO_DO_ESTADO[estado!]}`}
            </span>
          ))
        )}
      </div>
    </Link>
  );
}
