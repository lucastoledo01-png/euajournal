-- O motor Claude via MCP (27/10/2026): o usuário trabalha no Claude Desktop, e
-- a plataforma serve tarefas e valida as entregas. Duas tabelas novas.
-- Idempotente: pode rodar mais de uma vez. Ver `src/lib/server/mcp/`.

-- O token de quem conecta o Claude Desktop. Só o resumo SHA-256 fica no banco:
-- o token aparece UMA vez, no script que o cria (`criar-token-do-mcp.ts`).
-- Revogar é preencher `revogado_em`; nunca apagar, para a autoria das tarefas
-- entregues continuar legível.
create table if not exists public.tokens_do_mcp (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  rotulo text not null,
  token_hash text not null unique,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  usado_em timestamptz
);
create index if not exists tokens_do_mcp_projeto on public.tokens_do_mcp (project_id);

-- O trabalho de modelo que espera o Claude. Uma linha por tarefa: a instrução
-- exata que a produção mandaria ao modelo, o material, o esquema da resposta e,
-- depois, o resultado entregue. A chave impede abrir a mesma tarefa duas vezes
-- no mesmo dia (o story_id, ou o id do lote).
create table if not exists public.tarefas_do_claude (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  edition_date date not null,
  tipo text not null,
  chave text not null,
  estado text not null default 'aberta'
    check (estado in ('aberta', 'entregue', 'reparar', 'cancelada')),
  instrucao jsonb not null default '{}'::jsonb,
  material jsonb not null default '{}'::jsonb,
  esquema jsonb not null default '{}'::jsonb,
  resultado jsonb,
  motivos jsonb not null default '[]'::jsonb,
  tentativas integer not null default 0,
  criada_em timestamptz not null default now(),
  entregue_em timestamptz,
  entregue_por text,
  unique (project_id, edition_date, tipo, chave)
);
create index if not exists tarefas_do_claude_abertas
  on public.tarefas_do_claude (project_id, estado, criada_em);

alter table public.tokens_do_mcp enable row level security;
alter table public.tarefas_do_claude enable row level security;

-- Conferência: as duas tabelas existem.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('tokens_do_mcp', 'tarefas_do_claude');
