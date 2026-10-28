-- Login do Claude (OAuth) no MCP do eua.journal (27/10/2026). Ver docs/mcp.md.
-- Rode DEPOIS de 2026-10-27-mcp.sql. Idempotente.

-- Os aplicativos que se cadastraram sozinhos (Claude Desktop, Claude Code).
create table if not exists public.oauth_clientes (
  client_id text primary key,
  nome text not null default '',
  redirect_uris jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);

-- O código de uso único entre o "Autorizar" e a troca por chaves (PKCE).
create table if not exists public.oauth_codigos (
  codigo_hash text primary key,
  client_id text not null references public.oauth_clientes(client_id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  rotulo text not null,
  expira_em timestamptz not null,
  usado_em timestamptz
);

-- A chave de renovação: troca a chave de acesso sem novo login. Revogar o
-- acesso no painel derruba a renovação junto.
create table if not exists public.oauth_renovacoes (
  renovacao_hash text primary key,
  client_id text not null references public.oauth_clientes(client_id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  token_id uuid not null references public.tokens_do_mcp(id) on delete cascade,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz
);

alter table public.oauth_clientes enable row level security;
alter table public.oauth_codigos enable row level security;
alter table public.oauth_renovacoes enable row level security;

select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('oauth_clientes', 'oauth_codigos', 'oauth_renovacoes');
