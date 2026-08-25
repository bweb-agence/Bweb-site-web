-- =========================================================
-- webinaire_analytics : 12 secondes -> 3 millisecondes
-- ---------------------------------------------------------
-- L'identité d'un inscrit était résolue par une sous-requête CORRÉLÉE
-- (« le contact qui porte la même adresse »), que Postgres rejouait pour
-- chaque événement d'achat candidat. Mesuré sur 283 inscrits et 1 076
-- événements : 8 324 parcours séquentiels de la table `contacts`, 141 508
-- blocs lus, 12,1 secondes — pour UN des deux calculs, l'autre refaisant le
-- même travail. D'où un panneau d'analyse qui mettait une éternité à
-- s'afficher.
--
-- La résolution se fait maintenant UNE fois, par jointure, avant de chercher
-- les achats. Même résultat, plan en jointures de hachage : 3,5 ms.
--
-- Nuance de comportement assumée : un inscrit est désormais rattaché à UN
-- contact — celui de la soumission, ou à défaut celui qui porte son adresse.
-- L'ancienne version acceptait les deux à la fois. Sans doublon d'adresse en
-- base (vérifié : zéro), les deux donnent le même compte, et un inscrit = un
-- contact est de toute façon la règle qu'on veut.
-- =========================================================

create index if not exists contacts_email_lower_idx on public.contacts (lower(email));

create or replace function public.webinaire_analytics(p_webinaire_id uuid)
returns table (
  inscrits          int,
  confirmations     int,
  rappel_1d         int,
  rappel_0d         int,
  rappel_1h         int,
  lien_live         int,
  replay            int,
  relais_ok         int,
  relais_ko         int,
  desabonnes        int,
  acheteurs         int,
  chiffre_affaires  bigint,
  premiere_inscription date
)
language plpgsql stable security definer set search_path = public as $$
declare
  w public.webinaires%rowtype;
begin
  if not public.is_staff() then
    raise exception 'acces refuse';
  end if;

  select * into w from public.webinaires where id = p_webinaire_id;
  if not found then return; end if;

  return query
  with inscrits_edition as (
    select fs.id,
           coalesce(fs.contact_id, c.id) as contact_id,
           lower(fs.email) as email,
           fs.submitted_at,
           fs.relay_status
    from public.form_submissions fs
    left join public.contacts c on lower(c.email) = lower(fs.email)
    where fs.form_key = w.tunnel
      and fs.email is not null
      and (w.inscrits_depuis is null or fs.submitted_at >= w.inscrits_depuis)
  ),
  envois as (
    select we.kind, count(*)::int as n
    from public.webinaire_emails we
    where we.webinaire_id = w.id
    group by we.kind
  ),
  achats as (
    select i.id as inscrit_id, coalesce(sum(e.amount), 0) as montant
    from inscrits_edition i
    join public.contact_events e
      on e.contact_id = i.contact_id
     and e.type = 'achat'
     and e.occurred_at >= i.submitted_at
    where i.contact_id is not null
    group by i.id
  )
  select
    (select count(*)::int from inscrits_edition),
    coalesce((select n from envois where kind = 'confirmation'), 0),
    coalesce((select n from envois where kind = 'reminder_1d'), 0),
    coalesce((select n from envois where kind = 'reminder_0d'), 0),
    coalesce((select n from envois where kind = 'reminder_1h'), 0),
    coalesce((select n from envois where kind = 'live'), 0),
    coalesce((select n from envois where kind = 'replay'), 0),
    (select count(*)::int from inscrits_edition where relay_status = 'sent'),
    (select count(*)::int from inscrits_edition where relay_status is distinct from 'sent'),
    (select count(distinct c.id)::int
       from public.contacts c
      where c.unsubscribed_at is not null
        and lower(c.email) in (select email from inscrits_edition)),
    (select count(*)::int from achats),
    (select coalesce(sum(montant), 0)::bigint from achats),
    (select min(i.submitted_at)::date from inscrits_edition i);
end;
$$;

revoke all on function public.webinaire_analytics(uuid) from public;
grant execute on function public.webinaire_analytics(uuid) to authenticated, service_role;
