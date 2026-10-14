-- Métricas do Instagram (14/10/2026): a métrica principal do projeto passou a
-- ser seguidores e salvamentos. Duas tabelas, uma linha por dia e por coisa
-- medida. Idempotente: pode rodar mais de uma vez.

create table if not exists public.instagram_metricas_post (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  social_post_id uuid not null references public.social_posts(id) on delete cascade,
  media_id text not null,
  dia date not null,
  alcance integer not null default 0,
  salvamentos integer not null default 0,
  compartilhamentos integer not null default 0,
  comentarios integer not null default 0,
  curtidas integer not null default 0,
  lido_em timestamptz not null default now(),
  unique (social_post_id, dia)
);
create index if not exists instagram_metricas_post_projeto_dia on public.instagram_metricas_post (project_id, dia);

create table if not exists public.instagram_seguidores_dia (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  dia date not null,
  seguidores integer not null,
  lido_em timestamptz not null default now(),
  unique (project_id, dia)
);

alter table public.instagram_metricas_post enable row level security;
alter table public.instagram_seguidores_dia enable row level security;

-- Conferência: as duas tabelas existem.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('instagram_metricas_post', 'instagram_seguidores_dia');
