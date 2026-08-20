-- =========================================================
-- 0034 — COHORTES : le compteur de places de la page de vente
-- lit le tableau de bord, plus une constante dans le code.
-- ---------------------------------------------------------
-- La page /parcours-initiation affichait « 25 places restantes »
-- en dur : le chiffre ne bougeait pas d'une vente à l'autre et
-- personne ne pouvait le corriger sans redéployer le site.
--
-- Une cohorte = une promotion vendue en ligne (pas une date de
-- billetterie : le parcours s'encaisse sur Chariow, pas via nos
-- tarifs `ticket_types`). D'où deux sources pour les places prises :
--   1. les ventes Chariow, déjà reçues par le Pulse et inscrites
--      dans `contact_events` (type « achat », meta.product_id) ;
--   2. `seats_taken`, réglé à la main dans /admin/cohortes, pour
--      tout ce qui n'est pas passé par Chariow (paiement mobile
--      direct, invités, places réservées).
--
-- Le total est plafonné à la capacité : le site n'affiche jamais
-- un nombre négatif de places, même si la cohorte déborde.
-- =========================================================

create table if not exists public.cohortes (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,              -- lu par la page de vente
  title               text not null,
  capacity            int  not null default 30 check (capacity >= 0),
  seats_taken         int  not null default 0  check (seats_taken >= 0), -- places prises hors Chariow
  chariow_product_id  text,                              -- produit dont les ventes décomptent les places
  starts_at           timestamptz,                       -- démarrage (compte à rebours + libellé « cohorte de … »)
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists cohortes_updated on public.cohortes;
create trigger cohortes_updated before update on public.cohortes
  for each row execute function public.set_updated_at();

-- Le décompte des ventes Chariow interroge `meta->>'product_id'` : sans index,
-- chaque affichage de la landing scanne toute la timeline des contacts.
create index if not exists contact_events_chariow_produit_idx
  on public.contact_events ((meta->>'product_id'))
  where type = 'achat' and source = 'chariow';

-- ---------- RLS : lecture staff, écriture admin ----------
-- Le public ne lit JAMAIS la table (elle porte l'identifiant produit et le
-- réglage manuel) : la page de vente passe par la fonction ci-dessous.
alter table public.cohortes enable row level security;
drop policy if exists cohortes_staff_read  on public.cohortes;
drop policy if exists cohortes_admin_write on public.cohortes;
create policy cohortes_staff_read  on public.cohortes for select using (public.is_staff());
create policy cohortes_admin_write on public.cohortes for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- État public d'une cohorte ----------
-- SECURITY DEFINER : la landing (rôle `anon`) doit connaître le nombre de
-- places restantes SANS pouvoir lire `contact_events` (données clients) ni la
-- table `cohortes`. La fonction ne rend que des compteurs.
create or replace function public.cohorte_places(p_slug text)
returns table (title text, capacity int, taken int, remaining int, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.title,
         c.capacity,
         least(c.seats_taken + coalesce(v.n, 0), c.capacity)::int,
         greatest(c.capacity - (c.seats_taken + coalesce(v.n, 0)), 0)::int,
         c.starts_at
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

-- ---------- La cohorte en cours ----------
-- `seats_taken = 5` reprend l'état affiché jusqu'ici (25 places restantes sur
-- 30) : aucune vente du parcours n'est encore arrivée par le Pulse Chariow, et
-- la landing ne doit pas se remettre brutalement à 30 le jour du déploiement.
insert into public.cohortes (slug, title, capacity, seats_taken, chariow_product_id, starts_at)
values ('parcours-initiation',
        'Parcours Initiation — cohorte de septembre 2026',
        30, 5, 'prd_cuwtrrgc', '2026-09-01 09:00:00+00')
on conflict (slug) do nothing;
