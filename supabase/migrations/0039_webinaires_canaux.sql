-- =========================================================
-- Canaux de discussion du webinaire, par édition
-- ---------------------------------------------------------
-- Le groupe WhatsApp et le canal Telegram étaient écrits en dur dans
-- src/pages/webinaire-initiation/merci.astro. Or le live est MENSUEL et son
-- canal change d'une édition à l'autre : chaque changement demandait une
-- modification de code, un déploiement, et laissait entre-temps un lien mort
-- sur la page qu'un inscrit voit juste après s'être inscrit.
--
-- Ils vivent donc désormais sur l'édition, modifiables depuis /admin/webinaires,
-- et sont repris par la page de remerciement comme par les deux premiers
-- e-mails de la séquence.
-- =========================================================

alter table public.webinaires
  add column if not exists whatsapp_url text,
  add column if not exists telegram_url text;

comment on column public.webinaires.whatsapp_url is
  'Invitation au groupe/canal WhatsApp de cette édition. Vide = le bloc disparaît de la page et des e-mails.';
comment on column public.webinaires.telegram_url is
  'Invitation au canal Telegram de cette édition. Vide = le bloc disparaît.';

-- Reprise des valeurs qui étaient en dur, pour que rien ne change à la mise en
-- ligne : l'édition de septembre garde ses canaux actuels.
update public.webinaires
   set whatsapp_url = coalesce(whatsapp_url, 'https://chat.whatsapp.com/CNLf2TbhNQCBgUhT9zLdVc'),
       telegram_url = coalesce(telegram_url, 'https://t.me/+eBmH_0ccOxkxNWRk')
 where tunnel = 'webinaire-initiation';

-- Le type de retour change : Postgres refuse un remplacement, il faut retirer
-- la fonction d'abord (même contrainte qu'en 0036).
drop function if exists public.webinaire_public(text);

create or replace function public.webinaire_public(p_slug text)
returns table (
  title text, starts_at timestamptz, duration_min int, places int,
  whatsapp_url text, telegram_url text
)
language sql stable security definer set search_path = public as $$
  select w.title, w.starts_at, w.duration_min, w.places, w.whatsapp_url, w.telegram_url
  from public.webinaires w
  where (w.tunnel = p_slug or w.slug = p_slug)
    and w.active
  order by (w.starts_at >= now() - interval '72 hours') desc,
           case when w.starts_at >= now() - interval '72 hours' then w.starts_at end asc,
           w.starts_at desc
  limit 1;
$$;

-- Le rôle public ne lit toujours PAS la table : seule cette fonction sort, et
-- elle ne rend que ce qu'une page publique a besoin d'afficher (ni le lien du
-- live, ni le replay, qui sont réservés aux inscrits par e-mail).
revoke all on function public.webinaire_public(text) from public;
grant execute on function public.webinaire_public(text) to anon, authenticated, service_role;
