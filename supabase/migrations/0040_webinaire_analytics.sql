-- =========================================================
-- Analyse d'une édition de webinaire : l'entonnoir, étape par étape
-- ---------------------------------------------------------
-- POURQUOI UNE FONCTION plutôt qu'une série de requêtes depuis l'admin.
-- L'écran affichait déjà deux compteurs, chacun coûtant un aller-retour PAR
-- ÉDITION. Un entonnoir en compte une dizaine : à six éditions, on passait à
-- soixante requêtes pour ouvrir une page. Tout est donc calculé ici, en un
-- appel par édition.
--
-- CE QU'ON MESURE, ET CE QU'ON NE MESURE PAS. Les chiffres viennent
-- exclusivement de nos tables. Les VISITES de la page ne sont pas dedans :
-- elles vivent dans Google Analytics, qui demande des identifiants OAuth qu'on
-- n'a pas côté serveur. Le taux « visite -> inscription » manque donc à
-- l'entonnoir, et c'est assumé — mieux vaut un entonnoir honnête et partiel
-- qu'un chiffre inventé.
--
-- RÉSERVÉ AU PERSONNEL. `security definer` pour traverser les RLS, mais
-- `is_staff()` en garde : la fonction rend des volumes d'affaires, pas de quoi
-- laisser un rôle anonyme s'en approcher.
-- =========================================================

drop function if exists public.webinaire_analytics(uuid);

create or replace function public.webinaire_analytics(p_webinaire_id uuid)
returns table (
  inscrits          int,   -- soumissions du formulaire rattachées à l'édition
  confirmations     int,   -- e-mail de confirmation effectivement parti
  rappel_1d         int,
  rappel_0d         int,
  rappel_1h         int,
  lien_live         int,   -- e-mail « c'est maintenant », avec le lien
  replay            int,
  relais_ok         int,   -- lead transmis à ACQ Hub
  relais_ko         int,   -- relais en échec ou non configuré
  desabonnes        int,   -- inscrits qui se sont depuis désabonnés
  acheteurs         int,   -- inscrits ayant acheté APRÈS leur inscription
  chiffre_affaires  bigint,
  premiere_inscription date  -- borne basse de la fenêtre, pour aligner GA4 dessus
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
    /* Le rattachement d'un inscrit à une édition se fait par l'entonnoir et la
       borne `inscrits_depuis` — exactement la règle qu'applique l'envoi des
       e-mails (src/lib/webinaireEmails.ts). Deux règles différentes donneraient
       un entonnoir qui ne décrit pas ce qui s'est réellement passé. */
    select fs.id, fs.contact_id, lower(fs.email) as email, fs.submitted_at, fs.relay_status
    from public.form_submissions fs
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
    /* « A acheté APRÈS s'être inscrit » : sans la borne temporelle, un client
       de longue date qui s'inscrit au live compterait comme une conversion du
       webinaire. On rattache par contact quand il existe, sinon par adresse —
       les soumissions les plus anciennes n'ont pas toujours de contact_id. */
    select distinct i.id as inscrit_id,
           (select coalesce(sum(e.amount), 0)
              from public.contact_events e
             where e.type = 'achat'
               and e.occurred_at >= i.submitted_at
               and (e.contact_id = i.contact_id
                    or e.contact_id in (select c.id from public.contacts c where lower(c.email) = i.email))
           ) as montant
    from inscrits_edition i
    where exists (
      select 1 from public.contact_events e
       where e.type = 'achat'
         and e.occurred_at >= i.submitted_at
         and (e.contact_id = i.contact_id
              or e.contact_id in (select c.id from public.contacts c where lower(c.email) = i.email))
    )
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
    /* Borne basse de la fenêtre : les visites GA4 doivent couvrir EXACTEMENT
       la période des inscriptions comptées ici, sinon le taux
       « visite -> inscription » compare deux périodes différentes. */
    (select min(i.submitted_at)::date from inscrits_edition i);
end;
$$;

revoke all on function public.webinaire_analytics(uuid) from public;
grant execute on function public.webinaire_analytics(uuid) to authenticated, service_role;
