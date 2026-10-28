-- Reels automáticos (28/10/2026). Para o dono rodar no SQL Editor.
-- Idempotente: rodar duas vezes não muda nada.

begin;

-- ---------------------------------------------------------------------------
-- 1. O bucket dos Reels
-- ---------------------------------------------------------------------------
-- Separado de public_assets, que só aceita imagem até 10 MB. Público para
-- LEITURA, porque a Meta baixa o MP4 pelo endereço; a escrita é só da chave de
-- serviço. O JPEG é a folha de quadros que o painel e o Claude veem.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reels', 'reels', true, 104857600, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Os candidatos a Reel
-- ---------------------------------------------------------------------------
-- Um vídeo achado no Instagram, no YouTube ou colado à mão (link). A mesma
-- origem não entra duas vezes no projeto.

create table if not exists public.reels_candidatos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fonte text not null check (fonte in ('instagram', 'youtube', 'link')),
  origem_id text not null,
  permalink text,
  url_video text,
  autor text,
  titulo text,
  legenda text,
  publicado_em timestamptz,
  metricas jsonb not null default '{}'::jsonb,
  nota numeric not null default 0,
  estado text not null default 'nova'
    check (estado in ('nova', 'escolhida', 'renderizando', 'pronta', 'descartada', 'falhou')),
  motivo text,
  preparo jsonb,
  texto jsonb,
  social_post_id uuid,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  unique (project_id, fonte, origem_id)
);

create index if not exists reels_candidatos_projeto_estado
  on public.reels_candidatos (project_id, estado, nota desc);

alter table public.reels_candidatos enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Prova do estado final
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'reels' and public) then
    raise exception 'FALHOU: bucket reels ausente ou não público';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'reels_candidatos' and c.relrowsecurity
  ) then
    raise exception 'FALHOU: reels_candidatos ausente ou com RLS desligada';
  end if;
  raise notice 'reels: bucket público e tabela de candidatos com RLS';
end $$;

commit;
