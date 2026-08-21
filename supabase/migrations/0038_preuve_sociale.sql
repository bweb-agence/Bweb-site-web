-- =========================================================
-- 0038 — PREUVE SOCIALE : les achats récents, anonymisés
-- ---------------------------------------------------------
-- La page de vente affiche un bandeau défilant des achats récents. Les données
-- existent déjà (`contact_events`, type « achat », source Chariow), mais cette
-- table porte la clientèle : elle n'est lisible que par le staff, et il n'est
-- pas question de l'ouvrir au public pour un bandeau.
--
-- D'où cette fonction, qui ne rend QUE ce qui peut s'afficher en vitrine :
-- un prénom, un intitulé de produit, une date. Ni e-mail, ni téléphone, ni
-- montant, ni identifiant de contact — rien qui permette de remonter à
-- quelqu'un. Le nom de famille est réduit à son initiale.
-- =========================================================

create or replace function public.preuve_sociale(p_limite int default 24)
returns table (prenom text, produit text, quand timestamptz)
language sql stable security definer set search_path = public as $$
  select
    -- « Kouassi Jennifer » → « Jennifer K. » ; sans nom exploitable, « Un client ».
    coalesce(
      nullif(
        trim(split_part(c.full_name, ' ', 1)) ||
        case
          when split_part(c.full_name, ' ', 2) <> ''
            then ' ' || upper(left(split_part(c.full_name, ' ', 2), 1)) || '.'
          else ''
        end,
      ''),
      'Un client'
    ) as prenom,
    e.title as produit,
    e.occurred_at as quand
  from public.contact_events e
  join public.contacts c on c.id = e.contact_id
  where e.type = 'achat'
    and e.source = 'chariow'
    and e.title is not null
  order by e.occurred_at desc
  limit least(greatest(p_limite, 1), 60);
$$;

revoke all on function public.preuve_sociale(int) from public;
grant execute on function public.preuve_sociale(int) to anon, authenticated, service_role;
