/** Aprova as 7 matérias manuais de 28/10/2026 que estão aguardando na fila (decisor: o dono, pelo chat). */
import { carregarEnv, clienteDoBanco } from "./artigos-comum";
const PECAS = ["4bfb27a1-441e-4ca9-8abe-3c06461adb1c","49d7326b-1200-41bf-bc14-8a251a0f3b9d","c459ce67-8f9c-4fb1-b2b9-565b895d4702","f6f3415e-7b26-4ab6-aed5-0daf2c3697c8","59bccbc8-07ec-4fa8-a51c-ebb00c1eb178","5420b301-3341-4f24-9069-8ccc6844afeb","d14e9bc3-4aba-4cd8-a5e4-765d5807e7a5"];
const DECISOR = "Lucas Toledo (dono), aprovado pelo chat com o Claude em 28/10/2026";
(async () => {
  carregarEnv();
  const db = clienteDoBanco();
  const { requireActiveProject } = await import("../lib/server/projects");
  const { depsDaFila, projetoDaFila } = await import("../lib/server/aprovacao/integracao");
  const { aprovar } = await import("../lib/server/aprovacao/fila");
  const projeto = await requireActiveProject("00000000-0000-4000-8000-000000000001");
  const p = projetoDaFila(projeto as never, projeto.id)!;
  const deps = depsDaFila(db, p);
  const abertas = await deps.store.abertas(projeto.id);
  for (const id of PECAS) {
    const a = abertas.find((x) => x.pecaId === id && x.ramo === "artigo");
    if (!a) { console.log(id, "não está aberta"); continue; }
    if (a.avisos.length) console.log("avisos", id, JSON.stringify(a.avisos));
    const d = await aprovar(p, a.id, DECISOR, deps);
    console.log(id, d.ok ? `aprovada; ${d.liberacao?.detalhe ?? ""}` : `NÃO: ${d.motivo}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
