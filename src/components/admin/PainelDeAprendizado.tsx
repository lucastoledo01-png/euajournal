"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ROTULO_DA_ETAPA, type Etapa, type Ramo } from "@/lib/server/aprovacao/contrato";

/**
 * O painel de aprendizado (06/10/2026).
 *
 * O dono: "de nada adianta esse esforço manual se não houver aprendizado".
 * Esta tela mostra se o esforço está rendendo: a taxa de aprovação de primeira
 * por canal, semana a semana; as regras que valem; as propostas que esperam
 * decisão (aprovar ou recusar aqui mesmo); o que o editor mais recusa em cada
 * etapa; e o que ele mais reescreve à mão. Tudo por canal, nunca somado.
 *
 * O componente não decide nada: decidir uma proposta é um POST para
 * `/api/admin/aprovacao/regras`, a mesma porta da fila.
 */

export type SemanaDoCanalNaTela = { semana: string; decididas: number; dePrimeira: number; taxa: number | null };
export type RegraNaTela = {
  id: string;
  ramo: Ramo;
  etapa: Etapa;
  regra: string;
  ocorrencias: number;
  exemplos: string[];
  origem: "reprovacoes" | "edicoes";
  estado: string;
  decididoEm?: string | null;
};
export type MotivoNaTela = { ramo: Ramo; etapa: Etapa; motivo: string; ocorrencias: number; exemplos: string[] };
export type EdicaoNaTela = { id: string; ramo: Ramo; antes: string; depois: string; criadoEm: string };

export type VisaoNaTela = {
  ok: boolean;
  error?: string;
  projeto?: { slug: string; nome: string };
  semanas: Record<Ramo, SemanaDoCanalNaTela[]>;
  regrasAtivas: RegraNaTela[];
  propostas: RegraNaTela[];
  motivos: MotivoNaTela[];
  edicoes: EdicaoNaTela[];
};

const RAMOS_NA_TELA: Ramo[] = ["newsletter", "artigo", "post"];
const ROTULO_DO_CANAL: Record<Ramo, string> = { newsletter: "Newsletter", artigo: "Portal", post: "Instagram", plano: "Plano do dia" };
const ROTULO_DA_ORIGEM = { reprovacoes: "reprovações repetidas", edicoes: "edições à mão" } as const;

function diaMes(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function postar(url: string, corpo: Record<string, unknown>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok && json.ok !== false, json };
}

export function PainelDeAprendizado({ slug, embutido = false }: { slug: string; embutido?: boolean }) {
  const [visao, setVisao] = useState<VisaoNaTela | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/aprendizado?projeto=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = (await r.json()) as VisaoNaTela;
      if (!r.ok || !json.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setVisao(json);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o aprendizado.");
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(id: string, decisao: "aprovada" | "recusada") {
    setOcupado(true);
    try {
      const r = await postar("/api/admin/aprovacao/regras", { projeto: slug, id, decisao });
      setAviso(r.ok ? (decisao === "aprovada" ? "Virou regra do canal." : "Proposta recusada.") : `Não: ${String(r.json.error)}`);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function resumir() {
    setOcupado(true);
    setAviso("Lendo as edições da semana...");
    try {
      const r = await postar("/api/admin/aprendizado", { projeto: slug, acao: "resumir-edicoes" });
      if (!r.ok) setAviso(`Não: ${String(r.json.error ?? "falhou")}`);
      else {
        const n = Array.isArray(r.json.propostas) ? r.json.propostas.length : 0;
        setAviso(
          r.json.chamouModelo
            ? `${n} proposta(s) a partir de ${String(r.json.edicoesLidas)} edição(ões) da semana.`
            : "Sem edições suficientes na semana para propor regra.",
        );
      }
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  const conteudo = erro ? (
    <div className="admin-glass p-6 text-center">
      <p className="text-[13px] text-slate-600">{erro}</p>
      <button className="admin-botao mt-4" onClick={() => void carregar()}>
        Tentar de novo
      </button>
    </div>
  ) : !visao ? (
    <p className="text-xs font-semibold text-slate-500">Carregando o aprendizado...</p>
  ) : (
    <VisaoDoAprendizado
      visao={visao}
      slug={slug}
      ocupado={ocupado}
      aviso={aviso}
      embutido={embutido}
      aoDecidir={(id, d) => void decidir(id, d)}
      aoResumir={() => void resumir()}
    />
  );

  if (embutido) return <div className="space-y-5">{conteudo}</div>;
  return (
    <main className="admin-shell min-h-screen px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">{conteudo}</div>
    </main>
  );
}

/** A tela em si, sem rede: é o que o teste e a captura com dados de exemplo renderizam. */
export function VisaoDoAprendizado({
  visao,
  slug,
  ocupado,
  aviso,
  embutido = false,
  aoDecidir,
  aoResumir,
}: {
  visao: VisaoNaTela;
  slug: string;
  ocupado: boolean;
  aviso?: string;
  embutido?: boolean;
  aoDecidir: (id: string, decisao: "aprovada" | "recusada") => void;
  aoResumir: () => void;
}) {
  const semanas = visao.semanas.newsletter?.map((s) => s.semana) ?? [];
  return (
    <>
      {embutido ? null : (
        <header className="space-y-1">
          <Link href={`/admin/${slug}`} className="text-[11px] text-slate-400">
            {visao.projeto?.nome ?? slug}
          </Link>
          <h1 className="text-[20px] font-semibold text-slate-900">Aprendizado</h1>
          <p className="text-[12px] text-slate-500">
            O que cada canal aprendeu com as suas aprovações, reprovações e edições. Nada vira regra sem a sua decisão.
          </p>
        </header>
      )}

      {aviso ? (
        <p role="status" className="admin-glass p-3 text-[13px] text-slate-700">
          {aviso}
        </p>
      ) : null}

      <section className="admin-glass space-y-3 p-4" aria-labelledby="taxa-por-semana">
        <div>
          <h2 id="taxa-por-semana" className="text-[13px] font-semibold text-slate-900">
            Aprovadas de primeira, por semana
          </h2>
          <p className="text-[11px] text-slate-500">
            Sem refação e sem edição à mão, sobre as decididas na semana (segunda a domingo).
          </p>
        </div>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full border-collapse text-left text-[12px] sm:min-w-[560px]">
            <thead>
              <tr className="text-[11px] text-slate-500">
                <th className="py-1 pr-3 font-medium">Canal</th>
                {semanas.map((s, i) => (
                  <th key={s} className={`px-1 py-1 text-center font-medium ${i < semanas.length - 4 ? "hidden sm:table-cell" : ""}`}>
                    {diaMes(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RAMOS_NA_TELA.map((ramo) => (
                <tr key={ramo} className="border-t border-slate-100">
                  <th scope="row" className="py-2 pr-3 font-medium text-slate-800">
                    {ROTULO_DO_CANAL[ramo]}
                  </th>
                  {(visao.semanas[ramo] ?? []).map((s, i) => (
                    <td
                      key={s.semana}
                      className={`px-1 py-2 text-center align-bottom ${i < semanas.length - 4 ? "hidden sm:table-cell" : ""}`}
                      title={
                        s.decididas
                          ? `${ROTULO_DO_CANAL[ramo]}, semana de ${diaMes(s.semana)}: ${s.dePrimeira} de ${s.decididas} de primeira`
                          : `${ROTULO_DO_CANAL[ramo]}, semana de ${diaMes(s.semana)}: nada decidido`
                      }
                    >
                      <div className="mx-auto flex h-10 w-6 items-end rounded-[4px] bg-slate-100">
                        {s.taxa !== null ? (
                          <div
                            className="w-full rounded-[4px] bg-slate-800"
                            style={{ height: `${Math.max(4, Math.round(s.taxa * 100))}%` }}
                          />
                        ) : null}
                      </div>
                      <span className="mt-1 block text-[11px] tabular-nums text-slate-600">
                        {s.taxa !== null ? `${Math.round(s.taxa * 100)}%` : "-"}
                      </span>
                      <span className="block text-[10px] tabular-nums text-slate-400">
                        {s.decididas ? `${s.dePrimeira}/${s.decididas}` : ""}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-glass space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-slate-900">Propostas esperando você ({visao.propostas.length})</h2>
            <p className="text-[11px] text-slate-500">
              Vêm do mesmo erro três vezes no mesmo canal, ou do resumo semanal das edições (segunda, 08:00).
            </p>
          </div>
          <button className="admin-botao-secundario" disabled={ocupado} onClick={aoResumir}>
            Resumir edições agora
          </button>
        </div>
        {visao.propostas.length === 0 ? <p className="text-[12px] text-slate-500">Nenhuma proposta aberta.</p> : null}
        {visao.propostas.map((r) => (
          <article key={r.id} className="space-y-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {ROTULO_DO_CANAL[r.ramo]} · {ROTULO_DA_ETAPA[r.etapa]} · {ROTULO_DA_ORIGEM[r.origem]} ({r.ocorrencias})
            </p>
            <p className="text-[13px] text-slate-900">{r.regra}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-slate-500">
              {r.exemplos.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button className="admin-botao" disabled={ocupado} onClick={() => aoDecidir(r.id, "aprovada")}>
                Virar regra
              </button>
              <button className="admin-botao-secundario" disabled={ocupado} onClick={() => aoDecidir(r.id, "recusada")}>
                Recusar
              </button>
            </div>
          </article>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="admin-glass space-y-3 p-4">
          <h2 className="text-[13px] font-semibold text-slate-900">Regras que valem ({visao.regrasAtivas.length})</h2>
          {visao.regrasAtivas.length === 0 ? <p className="text-[12px] text-slate-500">Nenhuma regra aprovada ainda.</p> : null}
          {RAMOS_NA_TELA.map((ramo) => {
            const doCanal = visao.regrasAtivas.filter((r) => r.ramo === ramo);
            if (doCanal.length === 0) return null;
            return (
              <div key={ramo} className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{ROTULO_DO_CANAL[ramo]}</h3>
                <ul className="space-y-1">
                  {doCanal.map((r) => (
                    <li key={r.id} className="text-[12px] text-slate-700">
                      <span className="text-slate-400">{ROTULO_DA_ETAPA[r.etapa]}:</span> {r.regra}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="admin-glass space-y-3 p-4">
          <h2 className="text-[13px] font-semibold text-slate-900">O que mais se recusa (30 dias)</h2>
          {visao.motivos.length === 0 ? <p className="text-[12px] text-slate-500">Nenhuma reprovação no período.</p> : null}
          <ul className="space-y-2">
            {visao.motivos.slice(0, 10).map((m, i) => (
              <li key={i} className="flex gap-3 text-[12px]">
                <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-slate-900">{m.ocorrencias}x</span>
                <span className="text-slate-700">
                  <span className="text-slate-400">
                    {ROTULO_DO_CANAL[m.ramo]} · {ROTULO_DA_ETAPA[m.etapa]}:
                  </span>{" "}
                  {m.motivo}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="admin-glass space-y-3 p-4">
        <h2 className="text-[13px] font-semibold text-slate-900">Edições recentes</h2>
        {visao.edicoes.length === 0 ? <p className="text-[12px] text-slate-500">Nenhuma edição à mão nos últimos 30 dias.</p> : null}
        {visao.edicoes.map((e) => (
          <article key={e.id} className="space-y-1 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
            <p className="text-[11px] text-slate-500">
              {ROTULO_DO_CANAL[e.ramo]} · {quando(e.criadoEm)}
            </p>
            <p className="text-[12px] text-slate-400 line-through decoration-slate-300">{e.antes}</p>
            <p className="text-[12px] text-slate-800">{e.depois}</p>
          </article>
        ))}
      </section>
    </>
  );
}
