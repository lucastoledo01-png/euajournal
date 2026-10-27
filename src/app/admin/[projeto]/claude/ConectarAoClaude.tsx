"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PortaoAdmin } from "@/components/admin/PortaoAdmin";
import type { RespostaDeProjetos } from "@/components/admin/tipos";

/**
 * Conectar o Claude Code do usuário ao projeto (27/10/2026).
 *
 * Um passo para quem usa: dar um nome, copiar o comando e colar no Terminal
 * (Mac) ou no PowerShell (Windows). O comando registra o MCP online do projeto
 * no Claude Code, com o token no cabeçalho. O token aparece só aqui, uma vez.
 */

type Token = { id: string; rotulo: string; criadoEm: string; usadoEm: string | null; revogadoEm: string | null };

export function comandoDeInstalacao(origem: string, token: string): string {
  return `claude mcp add --transport http --scope user euajournal ${origem}/api/mcp --header "Authorization: Bearer ${token}"`;
}

function quando(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca";
}

export function ConectarAoClaude({ slug }: { slug: string }) {
  return (
    <PortaoAdmin>
      <Tela slug={slug} />
    </PortaoAdmin>
  );
}

function Tela({ slug }: { slug: string }) {
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [motor, setMotor] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [rotulo, setRotulo] = useState("");
  const [comando, setComando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/projetos/${id}/claude`);
    const corpo = (await r.json()) as { ok: boolean; motor?: string; tokens?: Token[]; error?: string };
    if (!corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
    setMotor(corpo.motor ?? null);
    setTokens(corpo.tokens ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/admin/projetos");
        const corpo = (await r.json()) as RespostaDeProjetos;
        const achado = (corpo.projetos ?? []).find((p) => p.slug === slug);
        if (!achado) throw new Error("projeto não encontrado");
        setProjetoId(achado.id);
        await carregar(achado.id);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao carregar");
      }
    })();
  }, [slug, carregar]);

  async function gerar() {
    if (!projetoId) return;
    setErro("");
    setCopiado(false);
    const r = await fetch(`/api/admin/projetos/${projetoId}/claude`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rotulo }),
    });
    const corpo = (await r.json()) as { ok: boolean; token?: string; error?: string };
    if (!corpo.ok || !corpo.token) return setErro(corpo.error ?? `HTTP ${r.status}`);
    setComando(comandoDeInstalacao(window.location.origin, corpo.token));
    setRotulo("");
    await carregar(projetoId);
  }

  async function revogar(id: string) {
    if (!projetoId || !window.confirm("Revogar este acesso? O Claude desse computador para de funcionar com o projeto.")) return;
    await fetch(`/api/admin/projetos/${projetoId}/claude?token=${encodeURIComponent(id)}`, { method: "DELETE" });
    await carregar(projetoId);
  }

  async function copiar() {
    if (!comando) return;
    await navigator.clipboard.writeText(comando);
    setCopiado(true);
  }

  return (
    <main className="admin-shell min-h-screen px-6 py-10 lg:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link href={`/admin/${slug}`} className="text-[11px] text-slate-400 hover:text-slate-900">
          ← Projeto
        </Link>
        <h1 className="mt-2 text-[22px] text-slate-900">Conectar ao Claude</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          O Claude Code do seu computador passa a produzir os posts deste projeto. Tudo o que ele fizer chega à fila de
          aprovação, e só vai ao ar depois que você aprovar.
        </p>

        {erro ? <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">{erro}</div> : null}

        {motor && motor !== "claude_mcp" ? (
          <div className="admin-glass mt-6 p-5 text-[13px] text-slate-600">
            Este projeto está com o motor OpenAI (automático). A conexão com o Claude vale só para projetos com o motor
            Claude via MCP.
          </div>
        ) : (
          <>
            <section className="admin-glass mt-6 p-5">
              <h2 className="text-[15px] text-slate-900">1. Instale o Claude Code</h2>
              <p className="mt-1 text-[13px] text-slate-500">No Mac ou no Windows, e entre com a sua conta do Claude.</p>

              <h2 className="mt-5 text-[15px] text-slate-900">2. Gere o comando deste computador</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={rotulo}
                  onChange={(e) => setRotulo(e.target.value)}
                  placeholder="Nome (ex.: lucas-mac)"
                  className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
                <button type="button" onClick={gerar} disabled={!rotulo.trim() || !projetoId} className="admin-botao">
                  Gerar comando
                </button>
              </div>

              {comando ? (
                <div className="mt-4">
                  <p className="text-[12px] text-slate-500">
                    Cole no Terminal (Mac) ou no PowerShell (Windows). Ele aparece só agora: copie antes de sair da tela.
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-[12px] text-slate-100">
                    {comando}
                  </pre>
                  <button type="button" onClick={copiar} className="admin-botao mt-2">
                    {copiado ? "Copiado" : "Copiar comando"}
                  </button>
                </div>
              ) : null}

              <h2 className="mt-5 text-[15px] text-slate-900">3. Use no chat do Claude Code</h2>
              <p className="mt-1 text-[13px] text-slate-500">
                Abra o Claude Code e peça, por exemplo: &quot;produza os posts de amanhã do eua.journal&quot; ou
                &quot;corrija as reprovações&quot;.
              </p>
            </section>

            <section className="admin-glass mt-6 p-5">
              <h2 className="text-[15px] text-slate-900">Computadores conectados</h2>
              {tokens.length === 0 ? (
                <p className="mt-2 text-[13px] text-slate-400">Nenhum ainda.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {tokens.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                      <div>
                        <div className={t.revogadoEm ? "text-slate-400 line-through" : "text-slate-900"}>{t.rotulo}</div>
                        <div className="text-[11px] text-slate-400">
                          criado {quando(t.criadoEm)} · último uso {quando(t.usadoEm)}
                          {t.revogadoEm ? ` · revogado ${quando(t.revogadoEm)}` : ""}
                        </div>
                      </div>
                      {t.revogadoEm ? null : (
                        <button type="button" onClick={() => revogar(t.id)} className="admin-botao-secundario">
                          Revogar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
