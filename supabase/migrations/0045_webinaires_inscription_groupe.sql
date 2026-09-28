-- =========================================================
-- 0045 — WEBINAIRES : l'inscription par le groupe WhatsApp
-- ---------------------------------------------------------
-- Le live du 4 octobre (/webinaire-facebook-ads) n'a pas de formulaire : le
-- bouton mène directement au groupe WhatsApp, et rejoindre le groupe EST
-- l'inscription. Or tout l'écran /admin/webinaires compte des soumissions de
-- formulaire : sans elles, il affichait 0 inscrit et la date vivait en dur
-- dans la page.
--
-- Trois choses :
--   1. `inscription_groupe` : l'édition s'inscrit par le groupe. Dans ce
--      mode, le lien du groupe devient PUBLIC (c'est le bouton de la page),
--      et aucun e-mail ne part — il n'y a pas d'adresse à qui écrire.
--   2. `webinaire_clics` : un clic vers le groupe par visiteur et par
--      édition. C'est un compteur de navigateurs, pas une liste de
--      personnes : on ne sait ni qui elles sont, ni si elles ont vraiment
--      rejoint une fois dans WhatsApp.
--   3. `webinaire_public` rend aussi ce lien, pour que la page le lise.
-- =========================================================

alter table public.webinaires
  add column if not exists inscription_groupe boolean not null default false;

comment on column public.webinaires.inscription_groupe is
  'Inscription par le groupe WhatsApp, sans formulaire : whatsapp_url devient public (bouton de la page), les clics sont comptés dans webinaire_clics, aucun e-mail ne part.';

-- ---------- Les clics vers le groupe ----------
create table if not exists public.webinaire_clics (
  id            uuid primary key default gen_random_uuid(),
  webinaire_id  uuid not null references public.webinaires(id) on delete cascade,
  -- Identifiant aléatoire tiré par le navigateur, gardé dans son stockage
  -- local : un visiteur qui clique trois boutons ou revient le lendemain
  -- compte une fois. Aucune donnée personnelle.
  visiteur      text not null check (visiteur ~ '^[a-z0-9-]{8,64}$'),
  source        text,   -- utm_source, ou « facebook » quand seul fbclid est là
  campagne      text,   -- utm_campaign
  created_at    timestamptz not null default now(),
  unique (webinaire_id, visiteur)
);

create index if not exists webinaire_clics_edition_idx on public.webinaire_clics (webinaire_id, created_at);

-- Lecture par l'équipe ; écriture uniquement par la route /api/webinaire/clic
-- (clé de service). Le public n'a aucun accès direct à la table.
alter table public.webinaire_clics enable row level security;
drop policy if exists webinaire_clics_staff_read on public.webinaire_clics;
create policy webinaire_clics_staff_read on public.webinaire_clics for select using (public.is_staff());

-- ---------- L'édition en cours, avec le lien du groupe ----------
-- Le lien ne sort QUE pour une édition en inscription par le groupe : pour un
-- entonnoir à formulaire, le groupe est réservé aux inscrits (page de
-- remerciement, e-mails) et ne doit pas être lisible par n'importe qui.
-- Le type de retour change : il faut retirer l'ancienne version d'abord. Même
-- ordre de sélection qu'avant, à l'identique.
drop function if exists public.webinaire_public(text);

create or replace function public.webinaire_public(p_slug text)
returns table (title text, starts_at timestamptz, duration_min int, places int, groupe_url text)
language sql stable security definer set search_path = public as $$
  select w.title, w.starts_at, w.duration_min, w.places,
         case when w.inscription_groupe then w.whatsapp_url end
  from public.webinaires w
  where (w.tunnel = p_slug or w.slug = p_slug)
    and w.active
  order by (w.starts_at >= now() - interval '72 hours') desc,
           case when w.starts_at >= now() - interval '72 hours' then w.starts_at end asc,
           w.starts_at desc
  limit 1;
$$;

revoke all on function public.webinaire_public(text) from public;
grant execute on function public.webinaire_public(text) to anon, authenticated, service_role;

-- ---------- L'édition du 4 octobre ----------
insert into public.webinaires
  (tunnel, slug, title, starts_at, duration_min, places, whatsapp_url, inscription_groupe, active)
values
  ('webinaire-facebook-ads', 'webinaire-facebook-ads-2026-10',
   'Comment gagner 1 000 000 FCFA/mois avec les produits digitaux grâce à la publicité Facebook',
   '2026-10-04 19:00:00+00', 90, 500,
   'https://chat.whatsapp.com/Gg9cYqejJB71h9OMMmP2MM', true, true)
on conflict (slug) do nothing;
