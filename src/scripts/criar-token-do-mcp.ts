import { carregarEnv, clienteDoBanco } from "./artigos-comum";
import { gerarTokenDoMcp, resumoDoToken } from "../lib/server/mcp/tokens";
import { motorDoProjeto } from "../lib/server/mcp/motor";

/**
 * O token de quem conecta o Claude Desktop (27/10/2026). Ver `docs/mcp.md`.
 *
 *   npx tsx src/scripts/criar-token-do-mcp.ts --projeto <slug> --rotulo <nome>   (ensaio: não grava)
 *   npx tsx src/scripts/criar-token-do-mcp.ts --projeto <slug> --rotulo <nome> --aplicar
 *   npx tsx src/scripts/criar-token-do-mcp.ts --revogar <id> --aplicar
 *
 * O token aparece UMA vez, nesta saída. O banco guarda só o resumo SHA-256, e
 * não há como recuperar o token depois: perdeu, revoga e cria outro. O rótulo
 * é quem vai assinar as entregas (`dono:via-claude:<rótulo>`).
 *
 * Revogar preenche `revogado_em` e não apaga a linha: a autoria das tarefas
 * já entregues continua legível.
 */

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  const valor = i > 0 ? process.argv[i + 1] : undefined;
  return valor && !valor.startsWith("--") ? valor.trim() : null;
}

async function main(): Promise<void> {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");
  const client = clienteDoBanco();
  console.log(aplicar ? "MODO: APLICAR (grava no banco)" : "MODO: ENSAIO (nada é gravado; use --aplicar)");

  const revogar = argumento("--revogar");
  if (revogar) {
    if (!aplicar) return void console.log(`Revogaria o token ${revogar}.`);
    const { error } = await client
      .from("tokens_do_mcp")
      .update({ revogado_em: new Date().toISOString() })
      .eq("id", revogar)
      .is("revogado_em", null);
    if (error) throw new Error(`não consegui revogar: ${error.message}`);
    return void console.log(`Token ${revogar} revogado.`);
  }

  const slug = argumento("--projeto");
  const rotulo = argumento("--rotulo");
  if (!slug || !rotulo || !/^[a-z0-9-]{2,40}$/.test(rotulo)) {
    throw new Error("use --projeto <slug> --rotulo <nome> (rótulo em minúsculas, números e hífen)");
  }

  const { data: projeto, error } = await client.from("projects").select("id, slug, settings").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`não consegui ler o projeto: ${error.message}`);
  if (!projeto) throw new Error(`projeto ${slug} não existe`);
  if (motorDoProjeto(projeto as { settings: Record<string, unknown> }) !== "claude_mcp") {
    console.log(`\nAVISO: o projeto ${slug} não está com settings.motor = "claude_mcp". O token será recusado até isso mudar.`);
  }

  if (!aplicar) return void console.log(`Criaria um token para ${slug}, rótulo "${rotulo}".`);

  const token = gerarTokenDoMcp();
  const { data: linha, error: erroDeGravacao } = await client
    .from("tokens_do_mcp")
    .insert({ project_id: (projeto as { id: string }).id, rotulo, token_hash: resumoDoToken(token) })
    .select("id")
    .single();
  if (erroDeGravacao) throw new Error(`não consegui gravar o token: ${erroDeGravacao.message}`);

  console.log(`\nToken criado (id ${(linha as { id: string }).id}). Copie agora, ele não aparece de novo:\n\n  ${token}\n`);
  console.log("Cole em EUAJOURNAL_MCP_TOKEN no claude_desktop_config.json (ver docs/mcp.md).");
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
