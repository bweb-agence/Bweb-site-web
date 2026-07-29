-- Phase 3 (B) du mini-CRM : modèles d'e-mails riches (éditeur TipTap).
-- Composés dans /admin/emails avec le même éditeur que les articles, puis
-- utilisés comme corps de campagne (voir campaigns).

create table if not exists public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Nouvel e-mail',
  subject    text not null default '',
  body_html  text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_templates_updated_idx on public.email_templates (updated_at desc);

alter table public.email_templates enable row level security;
drop policy if exists email_templates_admin on public.email_templates;
create policy email_templates_admin on public.email_templates for all
  using (public.is_admin()) with check (public.is_admin());

-- Réutilise public.touch_updated_at() (défini en 0020) pour updated_at.
drop trigger if exists email_templates_touch on public.email_templates;
create trigger email_templates_touch before update on public.email_templates
  for each row execute function public.touch_updated_at();
