import { ConectarAoClaude } from "./ConectarAoClaude";

/** "Conectar ao Claude": o token e o comando que instala o MCP no Claude Code (27/10/2026). */
export default async function PaginaDoClaude({ params }: { params: Promise<{ projeto: string }> }) {
  const { projeto } = await params;
  return <ConectarAoClaude slug={projeto} />;
}
