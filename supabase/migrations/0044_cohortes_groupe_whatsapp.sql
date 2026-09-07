-- Le lien du groupe WhatsApp de la cohorte vivait en dur dans
-- src/pages/parcours-initiation/bienvenue.astro : changer de cohorte
-- demandait une modification de code et un déploiement. Il passe en base,
-- pilotable depuis /admin/cohortes.
alter table public.cohortes
  add column if not exists whatsapp_group_url text;

comment on column public.cohortes.whatsapp_group_url is
  'Lien d''invitation du groupe WhatsApp de la cohorte, affiché sur la page de bienvenue après achat. Vide = la carte affiche « ton responsable de cohorte t''y ajoute » au lieu d''un lien mort.';

-- Reprise de la valeur qui était en dur, pour que la page ne perde rien.
update public.cohortes
set whatsapp_group_url = 'https://chat.whatsapp.com/E92GWr6ogPDLVpcWFRdBoM'
where slug = 'parcours-initiation'
  and whatsapp_group_url is null;

-- Lecture publique volontairement étroite : la page de bienvenue n'a besoin
-- que de ce lien. Elle ne lit ni la table `cohortes`, ni les compteurs, ni
-- quoi que ce soit d'autre — même principe que `cohorte_places`.
create or replace function public.cohorte_acces(p_slug text)
returns table(whatsapp_group_url text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.whatsapp_group_url
  from public.cohortes c
  where c.slug = p_slug
    and c.active;
$function$;

revoke all on function public.cohorte_acces(text) from public;
grant execute on function public.cohorte_acces(text) to anon, authenticated, service_role;
