-- Le compteur de places ne repartait jamais de zéro d'une cohorte à l'autre :
-- `cohorte_places` comptait TOUTES les ventes Chariow du produit depuis
-- toujours, sans borne. Rouvrir une cohorte obligeait donc soit à gonfler la
-- capacité, soit à supprimer des achats — c'est-à-dire des clients payants.
-- Cette borne règle le problème sans rien effacer : les ventes antérieures
-- restent en base, elles cessent simplement d'être décomptées.
alter table public.cohortes
  add column if not exists sales_counted_from timestamptz;

comment on column public.cohortes.sales_counted_from is
  'Ne décompte que les ventes Chariow postérieures à cette date. NULL = toutes les ventes, comportement d''origine. Sert à rouvrir une cohorte sans toucher aux achats déjà enregistrés.';

create or replace function public.cohorte_places(p_slug text)
returns table(title text, capacity integer, taken integer, remaining integer, starts_at timestamptz, deadline_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
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
      and (c.sales_counted_from is null or e.occurred_at >= c.sales_counted_from)
  ) v on c.chariow_product_id is not null
  where c.slug = p_slug
    and c.active;
$function$;
