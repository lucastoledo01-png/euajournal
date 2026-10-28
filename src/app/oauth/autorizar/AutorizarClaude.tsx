"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PortaoAdmin } from "@/components/admin/PortaoAdmin";

/**
 * "Autorizar o Claude" (27/10/2026): o login é o do painel, e a pessoa escolhe
 * qual projeto o Claude vai operar. Depois disso o Claude conecta sozinho e
 * não pede login de novo, até o acesso ser revogado em "Conectar ao Claude".
 */

type Projeto = { id: string; slug: string; nome: string };

export function AutorizarClaude() {
  return (
    <PortaoAdmin>
      <Tela />
    </PortaoAdmin>
  );
}

function Tela() {
  const params = useSearchParams();
  const [cliente, setCliente] = useState("Claude");
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [escolhido, setEscolhido] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/oauth/autorizar?${params.toString()}`);
      const corpo = (await r.json()) as { ok: boolean; error?: string; cliente?: string; projetos?: Projeto[] };
      if (!corpo.ok) return setErro(corpo.error ?? `HTTP ${r.status}`);
      setCliente(corpo.cliente ?? "Claude");
      setProjetos(corpo.projetos ?? []);
      setEscolhido(corpo.projetos?.[0]?.id ?? "");
    })();
  }, [params]);

  async function decidir(acao: "autorizar" | "negar") {
    setEnviando(true);
    const r = await fetch("/api/oauth/autorizar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(params.entries()), acao, projeto: escolhido }),
    });
    const corpo = (await r.json()) as { ok: boolean; error?: string; redirecionar?: string };
    if (!corpo.ok || !corpo.redirecionar) {
      setEnviando(false);
      return setErro(corpo.error ?? `HTTP ${r.status}`);
    }
    window.location.assign(corpo.redirecionar);
  }

  return (
    <main className="admin-shell flex min-h-screen items-center justify-center px-6 py-10">
      <div className="admin-glass w-full max-w-md p-6">
        <h1 className="text-[20px] text-slate-900">Conectar o {cliente} ao eua.journal</h1>
        <p className="mt-2 text-[13px] text-slate-500">
          O Claude vai poder produzir e corrigir posts do projeto escolhido. Nada vai ao ar sem a sua aprovação no
          painel, e você pode desconectar a qualquer hora em &quot;Conectar ao Claude&quot;.
        </p>

        {erro ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">{erro}</div> : null}

        {projetos.length > 0 ? (
          <label className="mt-5 block text-[12px] text-slate-500">
            Projeto
            <select
              value={escolhido}
              onChange={(e) => setEscolhido(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900"
            >
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        ) : !erro ? (
          <p className="mt-5 text-[13px] text-slate-500">Nenhum projeto com o motor Claude via MCP.</p>
        ) : null}

        <div className="mt-6 flex gap-2">
          <button type="button" className="admin-botao" disabled={!escolhido || enviando} onClick={() => decidir("autorizar")}>
            Autorizar
          </button>
          <button type="button" className="admin-botao-secundario" disabled={enviando || Boolean(erro)} onClick={() => decidir("negar")}>
            Cancelar
          </button>
        </div>
      </div>
    </main>
  );
}
