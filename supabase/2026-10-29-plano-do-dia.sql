-- O dia pelo Claude (29/10/2026): o plano do dia e o ramo "plano" na fila.
-- Para o dono rodar no SQL Editor. Idempotente.

-- 1. O plano do dia: uma linha por projeto e data. `etapa` é onde o dia está
--    (o diretor do dia retoma daqui quando a conversa do Claude cai).
create table if not exists public.planos_do_dia (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  data date not null,
  etapa text not null default 'triagem'
    check (etapa in ('triagem', 'plano', 'aguardando_aprovacao', 'preparo', 'producao', 'pronto')),
  estado text not null default 'rascunho'
    check (estado in ('rascunho', 'aguardando', 'aprovado', 'reprovado')),
  itens jsonb not null default '{}'::jsonb,
  motivo text,
  tarefa_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (project_id, data)
);

alter table public.planos_do_dia enable row level security;

-- 2. O ramo "plano" na fila de aprovação e nas reprovações.
alter table public.aprovacoes drop constraint if exists aprovacoes_ramo_check;
alter table public.aprovacoes add constraint aprovacoes_ramo_check
  check (ramo in ('newsletter', 'artigo', 'post', 'plano'));

alter table public.reprovacoes drop constraint if exists reprovacoes_ramo_check;
alter table public.reprovacoes add constraint reprovacoes_ramo_check
  check (ramo in ('newsletter', 'artigo', 'post', 'plano'));

-- 3. Conferência: tem que voltar uma linha com as três colunas verdadeiras.
select
  exists (select 1 from pg_class where oid = 'public.planos_do_dia'::regclass and relrowsecurity) as plano_ok,
  exists (select 1 from pg_constraint where conname = 'aprovacoes_ramo_check'
          and pg_get_constraintdef(oid) like '%plano%') as fila_ok,
  exists (select 1 from pg_constraint where conname = 'reprovacoes_ramo_check'
          and pg_get_constraintdef(oid) like '%plano%') as reprovacoes_ok;
