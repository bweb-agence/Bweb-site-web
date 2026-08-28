-- =========================================================
-- Rôle « contenu » : rédiger le site sans toucher au commerce
-- ---------------------------------------------------------
-- Il existait deux rôles : `admin` (tout) et `commercial` (vente en lecture).
-- Aucun ne convient à quelqu'un qui vient écrire des articles : le commercial
-- ne peut RIEN écrire — chaque table de contenu est protégée par `is_admin()`
-- en écriture — et l'admin donne accès au chiffre d'affaires, aux fiches
-- clients et à l'écran Équipe, donc au pouvoir d'ajouter ou de retirer des
-- administrateurs.
--
-- D'où ce troisième rôle, cadré sur ce qui alimente le site public :
-- articles, avis, formations, thèmes, sessions et leurs billets, plus le
-- dépôt d'images. Il ne voit ni les ventes, ni les contacts, ni l'Équipe.
--
-- `is_editeur()` plutôt que d'énumérer les rôles dans chaque politique : le
-- jour où un quatrième rôle doit écrire du contenu, une seule fonction change.
-- =========================================================

alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check
  check (role in ('admin', 'commercial', 'contenu'));

/* Peut modifier le contenu du site. L'admin en fait partie : sans ça, chaque
   politique devrait tester deux fonctions. */
create or replace function public.is_editeur()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and a.role in ('admin', 'contenu')
  );
$$;
revoke all on function public.is_editeur() from public;
grant execute on function public.is_editeur() to anon, authenticated, service_role;

-- Rend le rôle de la personne connectée. Avec trois rôles, « pas admin » ne
-- veut plus dire « commercial » : l'interface doit lire le rôle réel plutôt
-- que le déduire.
create or replace function public.mon_role()
returns text
language sql stable security definer set search_path = public as $$
  select a.role from public.admins a
  where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;
revoke all on function public.mon_role() from public;
grant execute on function public.mon_role() to authenticated, service_role;

-- ---------- Articles ----------
-- La lecture passe aussi à `is_editeur` : sans elle, l'éditeur ne verrait pas
-- ses propres brouillons, seulement les articles déjà publiés.
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select
  using (status = 'published' or public.is_editeur());
drop policy if exists posts_write on public.posts;
create policy posts_write on public.posts for all
  using (public.is_editeur()) with check (public.is_editeur());

-- ---------- Avis ----------
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select
  using (status = 'approved' or public.is_editeur());
drop policy if exists reviews_write on public.reviews;
create policy reviews_write on public.reviews for all
  using (public.is_editeur()) with check (public.is_editeur());

-- ---------- Catalogue ----------
drop policy if exists formations_write on public.formations;
create policy formations_write on public.formations for all
  using (public.is_editeur()) with check (public.is_editeur());

drop policy if exists themes_write on public.themes;
create policy themes_write on public.themes for all
  using (public.is_editeur()) with check (public.is_editeur());

drop policy if exists sessions_write on public.sessions;
create policy sessions_write on public.sessions for all
  using (public.is_editeur()) with check (public.is_editeur());

-- Les billets appartiennent à la session : les séparer rendrait l'écran
-- Sessions inutilisable pour un éditeur (il créerait une date sans tarif).
drop policy if exists ticket_types_write on public.ticket_types;
create policy ticket_types_write on public.ticket_types for all
  using (public.is_editeur()) with check (public.is_editeur());

-- ---------- Images ----------
-- L'éditeur d'articles téléverse dans le seau `media`. Sans ces trois
-- politiques, l'écriture du texte marcherait et l'insertion d'une image
-- échouerait — le genre de demi-accès qui use plus qu'il ne sert.
drop policy if exists media_admin_write on storage.objects;
create policy media_admin_write on storage.objects for insert
  with check (bucket_id = 'media' and public.is_editeur());

drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update
  using (bucket_id = 'media' and public.is_editeur());

drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete
  using (bucket_id = 'media' and public.is_editeur());

-- ---------- Ce qui reste FERMÉ au rôle contenu ----------
-- Rien à faire : `bookings`, `pack_purchases`, `contacts`, `contact_events`,
-- `form_submissions`, `campaigns`, `admins`… gardent `is_admin()` en écriture.
-- La lecture des réservations reste ouverte au staff (`is_staff`) : l'écran
-- Formations affiche un simple compteur d'inscrits par session, sans lequel
-- on publierait une date sans savoir si elle est pleine.

-- =========================================================
-- Cloisonner le CRM : le rôle contenu n'est pas un commercial
-- ---------------------------------------------------------
-- Piège découvert en TESTANT le rôle, pas en relisant le code : « contenu »
-- fait partie du staff, il héritait donc de tout ce qui était ouvert à
-- `is_staff()`. Mesuré avant correction, en se faisant passer pour lui :
-- il pouvait modifier 2 197 fiches contact. Le menu les cachait, la base
-- les laissait passer.
--
-- Le CRM passe donc à `is_commercial()` — admin et commercial, pas contenu.
-- =========================================================
create or replace function public.is_commercial()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and a.role in ('admin', 'commercial')
  );
$$;
revoke all on function public.is_commercial() from public;
grant execute on function public.is_commercial() to anon, authenticated, service_role;

drop policy if exists contacts_staff_read on public.contacts;
create policy contacts_staff_read on public.contacts for select using (public.is_commercial());
drop policy if exists contacts_staff_update on public.contacts;
create policy contacts_staff_update on public.contacts for update
  using (public.is_commercial()) with check (public.is_commercial());

drop policy if exists form_submissions_staff_read on public.form_submissions;
create policy form_submissions_staff_read on public.form_submissions for select using (public.is_commercial());
drop policy if exists form_submissions_staff_update on public.form_submissions;
create policy form_submissions_staff_update on public.form_submissions for update
  using (public.is_commercial()) with check (public.is_commercial());

drop policy if exists contact_events_staff_read on public.contact_events;
create policy contact_events_staff_read on public.contact_events for select using (public.is_commercial());
drop policy if exists contact_events_staff_insert on public.contact_events;
create policy contact_events_staff_insert on public.contact_events for insert
  with check (public.is_commercial() and type = 'note');

drop policy if exists customers_staff_read on public.customers;
create policy customers_staff_read on public.customers for select using (public.is_commercial());

-- `bookings_staff_read` reste ouverte au staff : l'écran Formations affiche un
-- compteur d'inscrits par session, sans lequel on publierait une date sans
-- savoir si elle est pleine. C'est un décompte, pas un fichier client.

-- Accès accordé à la personne concernée.
insert into public.admins (email, role) values ('desirehenoch@bwebagence.com', 'contenu')
on conflict (email) do update set role = excluded.role;
