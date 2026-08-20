-- =========================================================
-- 0036 — WEBINAIRES : une édition par mois, sans tout refaire
-- ---------------------------------------------------------
-- Le live devient mensuel. Deux façons de le tenir, et une seule qui marche :
--
--   1. Réutiliser la même ligne en changeant la date. Tentant, mais le journal
--      d'envois est indexé sur (webinaire, adresse, type) : un inscrit de
--      septembre resterait « déjà servi » en octobre et ne recevrait plus rien.
--   2. Une LIGNE PAR ÉDITION, regroupées par `tunnel`. Le journal repart à
--      neuf à chaque édition, l'historique de chacune reste consultable, et on
--      duplique la précédente au lieu de tout ressaisir.
--
-- D'où les trois colonnes ci-dessous.
--
-- `tunnel` est l'identité STABLE de l'entonnoir — la `form_key` des
-- soumissions, celle que la landing et la route d'inscription connaissent.
-- `slug` reste propre à l'édition (« webinaire-initiation-2026-09 »).
--
-- `inscrits_depuis` répond à la question « qui appartient à cette édition ? ».
-- Sans elle, les inscrits de septembre recevraient aussi les rappels d'octobre,
-- alors qu'ils ont déjà vu le live. À la duplication, on la cale sur le début
-- de l'édition précédente : tout ce qui arrive après lui appartient.
-- =========================================================

alter table public.webinaires
  add column if not exists tunnel          text not null default 'webinaire-initiation',
  add column if not exists places          int  not null default 500 check (places >= 0),
  add column if not exists inscrits_depuis timestamptz;

create index if not exists webinaires_tunnel_idx on public.webinaires (tunnel, starts_at desc);

-- La signature change (la fonction rend aussi le nombre de places) : Postgres
-- refuse de remplacer une fonction dont le type de retour bouge, il faut donc
-- la retirer d'abord.
drop function if exists public.webinaire_public(text);

-- L'édition en cours d'un entonnoir : la prochaine à venir, ou à défaut la
-- dernière passée (la fenêtre de replay court encore 72 h après le live).
create or replace function public.webinaire_public(p_slug text)
returns table (title text, starts_at timestamptz, duration_min int, places int)
language sql stable security definer set search_path = public as $$
  select w.title, w.starts_at, w.duration_min, w.places
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

-- L'édition de septembre existe déjà : on lui donne son entonnoir et sa borne.
-- `inscrits_depuis` à null = tous les inscrits connus lui appartiennent, ce qui
-- est exact pour la première édition.
update public.webinaires
   set tunnel = 'webinaire-initiation',
       slug   = 'webinaire-initiation-2026-09'
 where slug = 'webinaire-initiation';
