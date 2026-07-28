-- =========================================================
-- 0013 — Taxonomie unifiée des thèmes
-- Une SEULE liste de thèmes, source de vérité, réutilisée par
-- les formations, les sessions et les articles (blog).
-- Chaque thème porte sa couleur -> badges/dégradés uniformes sur tout le site.
-- =========================================================

create table if not exists public.themes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  color       text not null default 'blue'
                check (color in ('blue','warm','teal','navy','green')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Unicité insensible à la casse sur le nom (évite « IA » et « ia » en double)
create unique index if not exists themes_name_lower_idx on public.themes (lower(name));

create trigger themes_updated before update on public.themes
  for each row execute function public.set_updated_at();

-- RLS : lecture publique, écriture admin (même patron que formations/posts)
alter table public.themes enable row level security;
drop policy if exists themes_read  on public.themes;
drop policy if exists themes_write on public.themes;
create policy themes_read  on public.themes for select using (true);
create policy themes_write on public.themes for all
  using (public.is_admin()) with check (public.is_admin());

-- Colonnes de liaison (nullable). Les colonnes texte historiques
-- (formations.theme, sessions.theme, posts.category) restent en place
-- le temps de la bascule et pourront être supprimées plus tard.
alter table public.formations add column if not exists theme_id uuid references public.themes(id) on delete set null;
alter table public.sessions   add column if not exists theme_id uuid references public.themes(id) on delete set null;
alter table public.posts      add column if not exists theme_id uuid references public.themes(id) on delete set null;
create index if not exists formations_theme_id_idx on public.formations (theme_id);
create index if not exists sessions_theme_id_idx   on public.sessions (theme_id);
create index if not exists posts_theme_id_idx      on public.posts (theme_id);

-- =========================================================
-- Amorçage : reprend les valeurs texte distinctes existantes,
-- avec une couleur déduite de l'ancienne heuristique gradSuffix(),
-- et un slug normalisé. Dédoublonnage insensible à la casse.
-- =========================================================
with raw as (
  select trim(theme)    as name from public.formations where coalesce(trim(theme), '')    <> ''
  union all
  select trim(theme)    as name from public.sessions   where coalesce(trim(theme), '')    <> ''
  union all
  select trim(category) as name from public.posts      where coalesce(trim(category), '') <> ''
),
distinct_vals as (
  -- un représentant par nom (insensible à la casse)
  select (array_agg(name order by name))[1] as name
  from raw
  group by lower(name)
),
prepared as (
  select
    name,
    regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g') as slug,
    case
      when lower(name) like '%ia%' or lower(name) like '%intelligence%' then 'blue'
      when lower(name) like '%market%' or lower(name) like '%publicit%'  then 'warm'
      when lower(name) like '%autom%'                                    then 'teal'
      when lower(name) like '%vente%'                                    then 'navy'
      when lower(name) like '%cas%'                                      then 'green'
      else 'blue'
    end as color,
    row_number() over (order by name) as rn
  from distinct_vals
)
insert into public.themes (name, slug, color, sort_order)
select name, slug, color, rn from prepared
on conflict (slug) do nothing;

-- Rattachement des contenus existants au thème correspondant (par nom, insensible à la casse)
update public.formations f set theme_id = t.id
  from public.themes t
  where f.theme_id is null and lower(trim(f.theme))    = lower(t.name);
update public.sessions s set theme_id = t.id
  from public.themes t
  where s.theme_id is null and lower(trim(s.theme))    = lower(t.name);
update public.posts p set theme_id = t.id
  from public.themes t
  where p.theme_id is null and lower(trim(p.category)) = lower(t.name);
