/**
 * Ensaio do calor sobre as pautas APROVADAS de verdade, contra as fontes
 * reais e SEM escrever no banco.
 *
 *   npx tsx src/scripts/ensaiar-calor.ts            # últimas 24h
 *   npx tsx src/scripts/ensaiar-calor.ts 48         # últimas 48h
 *
 * Lê `news_candidates` aprovadas, monta a pauta com o que a linha gravou
 * (título, atores, nota) e calcula o calor com Google Trends, Wikipédia,
 * Wikidata e o vetor dos títulos do dia. Imprime a ordem pela nota de hoje e
 * a ordem com o calor. Custa só os vetores dos títulos (centavos de centavo).
 *
 * Criado em 06/10/2026 junto com a capacidade `calor`, para o dono ver o que
 * ela faria antes de pôr o projeto em `dry_run`.
 *
 * Desde 28/10/2026 imprime também o TERMÔMETRO: o ranking do momento por
 * história, com a etapa atual, os veículos das últimas 3h e o título mais novo;
 * os alertas; e o que a trava seguraria, nas pautas aprovadas e nos posts das
 * últimas 24h. Continua só lendo o banco.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { PautaAvaliada } from "../lib/server/editorial/guarda";
import { calcularCalorDoDia, fontesPadraoDoCalor } from "../lib/server/editorial/calor-do-dia";
import { bonusDoCalor } from "../lib/server/editorial/calor";
import { pautasAtrasadas, termometroDoDia } from "../lib/server/editorial/termometro-do-dia";

function carregarEnv() {
  const arquivo = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const l = linha.trim();
    if (!l || l.startsWith("#") || !l.includes("=")) continue;
    const i = l.indexOf("=");
    const k = l.slice(0, i).trim();
    if (process.env[k] === undefined) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  carregarEnv();
  const horas = Number(process.argv[2] ?? 24) || 24;
  const projectId = process.env.PROJETO_ID ?? "00000000-0000-4000-8000-000000000001";
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
  const { data, error } = await client
    .from("news_candidates")
    .select("id,url,title,description,published_at,story_id,actors,editorial_score,country,editorial_axis,relevance")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .gte("published_at", desde)
    .limit(200);
  if (error) throw new Error(error.message);

  // Uma pauta por story_id: a mesma história aprovada em dois dias conta uma vez.
  const vistos = new Set<string>();
  const pool: PautaAvaliada[] = [];
  for (const c of data ?? []) {
    const id = c.story_id ?? c.id;
    if (vistos.has(id)) continue;
    vistos.add(id);
    pool.push({
      grupo: { primary: { url: c.url, title: c.title, description: c.description ?? "", published_at: c.published_at }, secondary_sources: [], secondary_urls: [] } as never,
      storyId: id,
      classificacao: { atores: (c.actors as string[]) ?? [], pais: c.country, eixo: c.editorial_axis, relevancia: c.relevance } as never,
      enriquecimento: { texto: "" } as never,
      motivoDaAprovacao: "APPROVED_US_OPPORTUNITY" as never,
      veredito: {} as never,
      pontuacao: { total: Number(c.editorial_score ?? 0), partes: {} as never, explicacao: "" },
      vetor: null,
    });
  }

  const fontes = fontesPadraoDoCalor({ client, projectId });
  const calor = await calcularCalorDoDia(pool, { fontes });
  for (const l of calor.linhas) console.log(l);

  const linhas = pool.map((p) => {
    const c = calor.porStory.get(p.storyId)!;
    return { p, c, comCalor: p.pontuacao.total + bonusDoCalor(c) };
  });
  const porNota = [...linhas].sort((a, b) => b.p.pontuacao.total - a.p.pontuacao.total);
  const porCalor = [...linhas].sort((a, b) => b.comCalor - a.comCalor);

  console.log(`\n${pool.length} pauta(s) aprovada(s) nas últimas ${horas}h\n`);
  console.log("ORDEM COM CALOR (nota + bônus) | posição pela nota | calor | sinais");
  porCalor.forEach((l, i) => {
    const antes = porNota.indexOf(l) + 1;
    console.log(
      `${String(i + 1).padStart(2)}. ${String(l.comCalor).padStart(3)} (era ${String(antes).padStart(2)}º, nota ${l.p.pontuacao.total}) ` +
        `calor ${l.c.total} :: ${l.p.grupo.primary.title.slice(0, 90)}\n      ${l.c.explicacao}`,
    );
  });

  // O termômetro: o dia inteiro, aprovado ou não, por história.
  const { data: posts } = await client
    .from("social_posts")
    .select("id,title,status,scheduled_at")
    .eq("project_id", projectId)
    .gte("created_at", desde)
    .in("status", ["draft", "scheduled", "published"])
    .limit(50);
  const comoPauta = (id: string, titulo: string) =>
    ({ storyId: id, grupo: { primary: { title: titulo }, secondary_urls: [] } }) as unknown as PautaAvaliada;
  const doPost = (posts ?? []).filter((x) => x.title).map((x) => comoPauta(`post:${x.id}`, String(x.title)));
  const t = await termometroDoDia([...pool, ...doPost], fontes);
  for (const l of t.linhas) console.log(`\n${l}`);

  console.log("\nTERMÔMETRO: o mais quente agora | etapa atual | veículos em 3h (3h antes) | título mais novo");
  t.ranking.slice(0, 15).forEach((l, i) => {
    const marcas = [l.alerta ? "ALERTA" : "", l.brasilEua ? "BR×EUA" : "", l.superadoPor ? "SUPERADA" : ""].filter(Boolean).join(" ");
    console.log(
      `${String(i + 1).padStart(2)}. calor ${String(l.calor.total).padStart(3)} | ${(l.etapaAtual ?? "-").padEnd(12)} | ` +
        `${l.veiculos3h} (${l.veiculosAntes3h}) | ${l.tituloMaisNovo.slice(0, 85)} [${l.dominioMaisNovo}] ${marcas}` +
        (l.superadoPor ? `\n      superada por: ${l.superadoPor.slice(0, 90)}` : "") +
        `\n      ${l.calor.explicacao}`,
    );
  });

  const alertas = t.ranking.filter((l) => l.alerta);
  console.log(`\nALERTAS (acelera e casa com o nicho): ${alertas.length}`);
  for (const l of alertas) console.log(`  - ${l.tituloMaisNovo} [${l.dominioMaisNovo}] ${l.veiculos3h} em 3h, ${l.veiculosAntes3h} antes`);

  const atrasadas = pautasAtrasadas([...pool, ...doPost], t.estados);
  console.log(`\nTRAVA: o que seria segurado por contar etapa superada: ${atrasadas.length}`);
  for (const a of atrasadas) console.log(`  - ${a.storyId.startsWith("post:") ? "post" : "pauta"} "${a.titulo.slice(0, 80)}": ${a.motivo}`);
  console.log(`\nEstados atuais encontrados: ${t.estados.size} de ${pool.length + doPost.length} pauta(s) e post(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
