-- =========================================================
-- 0037 — COHORTES : l'échéance d'inscription, distincte du démarrage
-- ---------------------------------------------------------
-- Le compte à rebours de la page de vente visait `starts_at`, le jour où la
-- cohorte commence. Or ce n'est pas la date qui fait décider : le visiteur
-- décide avant la CLÔTURE DES INSCRIPTIONS, qui peut tomber plus tard (on
-- accepte encore des inscrits après le démarrage) ou plus tôt (on ferme pour
-- préparer la promotion).
--
-- `deadline_at` porte donc l'échéance affichée. Vide, on retombe sur
-- `starts_at` : les cohortes déjà en base gardent leur comportement.
-- =========================================================

alter table public.cohortes
  add column if not exists deadline_at timestamptz;

comment on column public.cohortes.deadline_at is
  'Fin des inscriptions, affichée par le compte à rebours. NULL = starts_at.';

-- La fonction publique rend l'échéance à côté du reste. Le type de retour
-- change, donc il faut retirer l'ancienne version d'abord.
drop function if exists public.cohorte_places(text);

create or replace function public.cohorte_places(p_slug text)
returns table (title text, capacity int, taken int, remaining int, starts_at timestamptz, deadline_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.title,
         c.capacity,
         least(c.seats_taken + coalesce(v.n, 0), c.capacity)::int,
         greatest(c.capacity - (c.seats_taken + coalesce(v.n, 0)), 0)::int,
         c.starts_at,
         coalesce(c.deadline_at, c.starts_at)
  from public.cohortes c
  left join lateral (
    select count(*)::int as n
    from public.contact_events e
    where e.type = 'achat'
      and e.source = 'chariow'
      and e.meta->>'product_id' = c.chariow_product_id
  ) v on c.chariow_product_id is not null
  where c.slug = p_slug
    and c.active;
$$;

revoke all on function public.cohorte_places(text) from public;
grant execute on function public.cohorte_places(text) to anon, authenticated, service_role;

-- Cohorte de septembre : les inscriptions courent jusqu'à la fin du 6 septembre.
-- Abidjan est à UTC+0, donc « minuit à la fin du 6 » s'écrit 7 septembre 00:00.
update public.cohortes
   set deadline_at = '2026-09-07 00:00:00+00'
 where slug = 'parcours-initiation';
