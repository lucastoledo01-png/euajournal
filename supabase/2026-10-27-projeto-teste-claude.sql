-- Projeto de teste do motor Claude via MCP (27/10/2026). Ver docs/mcp.md.
-- Copia a identidade e a linha editorial do eua.journal, com outro slug, e
-- nasce PAUSADO, com motor Claude e a fila de aprovação em enforce: nada que o
-- Claude entregar vai ao ar sem alguém aprovar no painel. Idempotente.
-- Rode DEPOIS de 2026-10-27-mcp.sql.

insert into public.projects (
  slug, name, status, niche, content_language, timezone, site_url,
  brand_display_name, brand_tagline, brand_primary_color, brand_logo_url,
  brand_social_links, newsletter_from_name, publish_hour_local,
  publish_minute_local, editorial_prompt_extra, settings
)
select
  'teste-claude', 'Teste Claude', 'paused', niche, content_language, timezone, site_url,
  brand_display_name, brand_tagline, brand_primary_color, brand_logo_url,
  brand_social_links, newsletter_from_name, publish_hour_local,
  publish_minute_local, editorial_prompt_extra,
  jsonb_build_object(
    'motor', 'claude_mcp',
    'capacidades', jsonb_build_object('aprovacao', 'enforce', 'social', 'enforce'),
    'moldes', jsonb_build_object('jornal_bolha', false, 'recorte', false),
    -- As pautas do passo 2 vêm dos posts que a esteira do eua.journal já fez (só leitura).
    'mcp', jsonb_build_object('pautas_de', 'desbuguei'),
    'linha', coalesce(settings -> 'linha', '{}'::jsonb)
  )
from public.projects
where slug = 'desbuguei'
on conflict (slug) do nothing;

-- Para quem já rodou a versão anterior deste arquivo: a fonte das pautas.
update public.projects
set settings = jsonb_set(settings, '{mcp}', coalesce(settings -> 'mcp', '{}'::jsonb) || '{"pautas_de": "desbuguei"}'::jsonb),
    updated_at = now()
where slug = 'teste-claude';

-- Conferência: o projeto existe, pausado, com motor Claude e fila em enforce.
select slug, status, settings -> 'motor' as motor, settings -> 'capacidades' as capacidades, settings -> 'mcp' as mcp
from public.projects where slug = 'teste-claude';
