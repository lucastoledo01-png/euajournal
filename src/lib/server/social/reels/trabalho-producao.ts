import { getProjectById } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { tarefasSupabase } from "@/lib/server/mcp/tarefas-store";
import { subirArquivoParaStorage } from "@/lib/server/social/instagram/armazenamento";
import { montarReel } from "@/scripts/montar-reel";
import { candidatosSupabase } from "./candidatos";
import { gravarReel } from "./gravar";
import { BUCKET_DOS_REELS, type DepsDoTrabalho } from "./trabalho";

/** As dependências de verdade do trabalho dos Reels, para o worker. */
export function depsDoTrabalhoDeProducao(): DepsDoTrabalho {
  const client = getSupabaseAdminClient();
  return {
    candidatos: candidatosSupabase(client),
    tarefas: tarefasSupabase(client),
    projeto: (id) => getProjectById(id),
    subir: (buffer, caminho, mime) => subirArquivoParaStorage(buffer, caminho, mime, BUCKET_DOS_REELS),
    gravar: (projeto, reel) => gravarReel(projeto, reel, { client }),
    montar: (pedido) => montarReel(pedido),
  };
}
