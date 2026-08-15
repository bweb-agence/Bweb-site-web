-- =========================================================
-- 0033 — Socle « acquisition » : soumissions, contacts, timeline
-- -----------------------------------------------------------------------------
-- Le site passe d'un modèle billetterie (sessions/tickets) à un modèle tunnels
-- (pages de capture, lead magnets, webinaires, pages de vente). Il lui manquait
-- l'essentiel : une trace des formulaires soumis. Aujourd'hui un lead Contact ou
-- Devis n'existe QUE dans une boîte e-mail (api/contact.ts n'envoie que du Bird),
-- et un lead webinaire QUE dans ACQ Hub (perdu si `ingest` est injoignable).
--
-- Trois tables, une responsabilité chacune :
--   form_submissions — le BRUT, append-only. Une ligne par soumission, jamais
--                      modifiée (sauf son statut de traitement). `payload` en
--                      jsonb : un nouveau formulaire n'exige aucune migration.
--   contacts         — l'IDENTITÉ durable, dédupliquée sur e-mail OU téléphone.
--                      Le téléphone seul suffit : un lead magnet WhatsApp ne
--                      collecte pas toujours d'e-mail (d'où l'inadaptation de
--                      `customers`, dont l'e-mail est obligatoire et unique).
--   contact_events   — la TIMELINE : soumission, achat, e-mail, désabonnement.
--
-- Écriture réservée au serveur (clé service) ; le staff lit et annote. Additif :
-- ne touche ni aux réservations, ni aux paiements, ni à `customers`, qui reste
-- la base du CRM billetterie tant que celle-ci existe.
-- =========================================================

-- -----------------------------------------------------------------------------
-- 0) Normalisation du téléphone — une seule définition, partagée
-- -----------------------------------------------------------------------------
-- L'identité par téléphone ne vaut que si TOUS les producteurs écrivent le même
-- format : « 07 01 92 60 28 », « +225 0701926028 » et « 002250701926028 » sont
-- la même personne. Sans indicatif explicite on préfixe la Côte d'Ivoire (+225),
-- marché principal.
--
-- On NE retire PAS le 0 initial : depuis le passage à 10 chiffres (2021) il fait
-- partie du numéro ivoirien. Le réflexe de le supprimer vient de la France, où
-- c'est un préfixe interurbain ; l'enlever produit un numéro injoignable sur
-- WhatsApp (cf. le commentaire de api/webinaire/inscription.ts, où le même
-- piège avait été identifié).
create or replace function public.normalize_phone(p text)
returns text language sql immutable set search_path = public as $$
  with d as (
    select case
      when p is null or btrim(p) = '' then null
      when btrim(p) like '+%' or btrim(p) like '00%'
        then regexp_replace(regexp_replace(btrim(p), '^00', ''), '\D', '', 'g')
      else '225' || regexp_replace(btrim(p), '\D', '', 'g')
    end as digits
  )
  -- Hors plage E.164 plausible (8 à 15 chiffres) : on préfère NULL à un faux
  -- identifiant, qui fusionnerait des inconnus entre eux.
  select case when length(digits) between 8 and 15 then '+' || digits end from d;
$$;

-- -----------------------------------------------------------------------------
-- 1) contacts — identité durable
-- -----------------------------------------------------------------------------
create table if not exists public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  email              text,                       -- normalisé en minuscules
  phone              text,                       -- E.164 (normalize_phone)
  full_name          text,
  company            text,
  -- Deux états seulement, volontairement : a payé, ou pas encore. Un « prospect »
  -- intermédiaire se discute sans fin et ne change aucune décision — la nuance
  -- vit dans les étiquettes, qui elles sont libres.
  status             text not null default 'lead'
                       check (status in ('lead', 'client')),
  tags               text[] not null default '{}',
  notes              text,
  first_source       text,                       -- form_key de la 1re soumission
  first_utm          jsonb,                      -- attribution d'origine, figée
  email_opt_in       boolean not null default true,
  whatsapp_opt_in    boolean not null default true,
  unsubscribed_at    timestamptz,
  unsubscribe_token  uuid not null default gen_random_uuid(),
  -- Dernière transmission réussie vers ACQ Hub (synchro quotidienne, lib/syncHub.ts).
  -- NULL = jamais transmis. Comparé à `updated_at` pour ne renvoyer que ce qui a bougé.
  hub_synced_at      timestamptz,
  -- Deux fiches que tout désigne comme la même personne (l'e-mail pointe vers
  -- l'une, le téléphone vers l'autre). On NE fusionne PAS automatiquement : une
  -- fusion qui se trompe est irréversible. On signale, l'humain tranche.
  merge_candidate_id uuid references public.contacts(id) on delete set null,
  first_seen_at      timestamptz not null default now(),
  last_activity_at   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Un contact sans e-mail NI téléphone n'est joignable par personne.
  constraint contacts_identite_requise check (email is not null or phone is not null)
);

-- Unicité PARTIELLE : c'est elle qui autorise un contact sans e-mail (ou sans
-- téléphone) tout en interdisant deux fiches pour la même adresse / le même numéro.
create unique index if not exists contacts_email_uk on public.contacts (email) where email is not null;
create unique index if not exists contacts_phone_uk on public.contacts (phone) where phone is not null;
create unique index if not exists contacts_unsub_uk on public.contacts (unsubscribe_token);
create index if not exists contacts_activity_idx on public.contacts (last_activity_at desc);
create index if not exists contacts_status_idx   on public.contacts (status);
create index if not exists contacts_source_idx   on public.contacts (first_source);
create index if not exists contacts_tags_idx     on public.contacts using gin (tags);
-- File d'attente de la synchro : les jamais-transmis d'abord, puis les modifiés.
create index if not exists contacts_hub_sync_idx on public.contacts (hub_synced_at nulls first, updated_at);

-- `updated_at` maison plutôt que le `touch_updated_at()` partagé : horodater une
-- transmission vers ACQ Hub ne doit PAS compter comme une modification du
-- contact. Sinon la synchro se mord la queue — elle écrit `hub_synced_at`, le
-- trigger avance `updated_at`, le contact redevient « modifié depuis sa dernière
-- transmission », et il repart à chaque passe, indéfiniment.
create or replace function public.touch_contact_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.hub_synced_at is distinct from old.hub_synced_at
     and to_jsonb(new) - 'hub_synced_at' - 'updated_at'
       = to_jsonb(old) - 'hub_synced_at' - 'updated_at' then
    new.updated_at = old.updated_at;   -- seule la synchro a bougé
    return new;
  end if;
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_contact_updated_at();

-- -----------------------------------------------------------------------------
-- 2) form_submissions — le brut de chaque soumission
-- -----------------------------------------------------------------------------
create table if not exists public.form_submissions (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid references public.contacts(id) on delete set null,
  form_key     text not null,          -- contact | devis | webinaire-initiation | lead-…
  form_title   text,                   -- libellé affiché du formulaire
  page_path    text,                   -- page d'où part la soumission
  full_name    text,
  email        text,
  phone        text,
  message      text,                   -- récapitulatif lisible (aperçu en liste)
  payload      jsonb not null default '{}'::jsonb,   -- TOUS les champs soumis
  attachments  jsonb not null default '[]'::jsonb,
  utm          jsonb not null default '{}'::jsonb,   -- source/medium/campaign/content/term
  referrer     text,
  user_agent   text,
  ip_hash      text,                   -- haché : anti-abus, jamais l'IP en clair
  -- Trace TECHNIQUE de la notification e-mail / du relais immédiat. Jamais
  -- affichée dans la liste des soumissions : elle ne sert qu'au support, quand
  -- quelqu'un dit « je n'ai jamais reçu cette demande ». La mise à niveau des
  -- bases avec ACQ Hub, elle, passe par contacts.hub_synced_at.
  relay_target text,
  relay_status text check (relay_status in ('sent', 'failed', 'skipped')),
  relay_error  text,
  status       text not null default 'nouveau'
                 check (status in ('nouveau', 'traite', 'spam')),
  handled_by   text,
  handled_at   timestamptz,
  submitted_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists form_submissions_date_idx    on public.form_submissions (submitted_at desc);
create index if not exists form_submissions_form_idx    on public.form_submissions (form_key, submitted_at desc);
create index if not exists form_submissions_status_idx  on public.form_submissions (status);
create index if not exists form_submissions_contact_idx on public.form_submissions (contact_id, submitted_at desc);
create index if not exists form_submissions_email_idx   on public.form_submissions (lower(email));

-- -----------------------------------------------------------------------------
-- 3) contact_events — la timeline
-- -----------------------------------------------------------------------------
create table if not exists public.contact_events (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  type          text not null
                  check (type in ('soumission', 'webinaire_inscrit', 'reservation',
                                  'achat', 'email_envoye', 'campagne',
                                  'desabonnement', 'note')),
  title         text,
  amount        integer,                 -- montant en F CFA (achats)
  currency      text not null default 'XOF',
  source        text,
  meta          jsonb not null default '{}'::jsonb,
  submission_id uuid references public.form_submissions(id) on delete set null,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  -- Idempotence : un webhook rejoué (Chariow) ou un backfill relancé ne doit pas
  -- empiler le même événement deux fois.
  dedupe_key    text
);

create unique index if not exists contact_events_dedupe_uk on public.contact_events (dedupe_key) where dedupe_key is not null;
create index if not exists contact_events_contact_idx on public.contact_events (contact_id, occurred_at desc);
create index if not exists contact_events_type_idx    on public.contact_events (type, occurred_at desc);

-- -----------------------------------------------------------------------------
-- 4) resolve_contact — création / rattachement atomique
-- -----------------------------------------------------------------------------
-- Appelée par le serveur (clé service) à chaque soumission. Atomique : deux
-- soumissions simultanées de la même personne ne créent pas deux fiches.
create or replace function public.resolve_contact(
  p_email   text,
  p_phone   text,
  p_name    text default null,
  p_company text default null,
  p_source  text default null,
  p_utm     jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email    text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone    text := public.normalize_phone(p_phone);
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_company  text := nullif(btrim(coalesce(p_company, '')), '');
  v_by_email uuid;
  v_by_phone uuid;
  v_id       uuid;
begin
  if v_email is null and v_phone is null then return null; end if;

  select id into v_by_email from public.contacts where email = v_email limit 1;
  select id into v_by_phone from public.contacts where phone = v_phone limit 1;

  if v_by_email is not null and v_by_phone is not null and v_by_email <> v_by_phone then
    -- Conflit : on rattache à la fiche la plus ancienne et on signale l'autre.
    select id into v_id from public.contacts
      where id in (v_by_email, v_by_phone) order by first_seen_at asc, created_at asc limit 1;
    update public.contacts set merge_candidate_id = v_id
      where id in (v_by_email, v_by_phone) and id <> v_id and merge_candidate_id is null;
  else
    v_id := coalesce(v_by_email, v_by_phone);
  end if;

  if v_id is null then
    begin
      insert into public.contacts (email, phone, full_name, company, first_source, first_utm)
      values (v_email, v_phone, v_name, v_company, p_source, p_utm)
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      -- Course entre deux soumissions concurrentes : la fiche vient d'être créée.
      select id into v_id from public.contacts
        where (v_email is not null and email = v_email)
           or (v_phone is not null and phone = v_phone)
        limit 1;
    end;
  end if;

  update public.contacts set
    -- On ne complète un identifiant que s'il est libre : l'écraser ferait
    -- basculer la fiche sur une autre personne (et violerait l'unicité).
    email            = case when email is null and v_by_email is null then v_email else email end,
    phone            = case when phone is null and v_by_phone is null then v_phone else phone end,
    full_name        = coalesce(v_name, full_name),
    company          = coalesce(v_company, company),
    first_source     = coalesce(first_source, p_source),
    first_utm        = coalesce(first_utm, p_utm),
    last_activity_at = now()
  where id = v_id;

  return v_id;
end $$;

-- Réservée au serveur : elle contourne la RLS par construction.
revoke execute on function public.resolve_contact(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.resolve_contact(text, text, text, text, text, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 5) RLS — le staff lit et annote, le serveur écrit
-- -----------------------------------------------------------------------------
alter table public.contacts         enable row level security;
alter table public.form_submissions enable row level security;
alter table public.contact_events   enable row level security;

-- Pas de policy INSERT/DELETE : seule la clé service (qui contourne la RLS)
-- peut créer une soumission ou un contact. Rien ne s'écrit depuis le navigateur.
drop policy if exists contacts_staff_read   on public.contacts;
drop policy if exists contacts_staff_update on public.contacts;
create policy contacts_staff_read   on public.contacts for select using (public.is_staff());
create policy contacts_staff_update on public.contacts for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists form_submissions_staff_read   on public.form_submissions;
drop policy if exists form_submissions_staff_update on public.form_submissions;
create policy form_submissions_staff_read   on public.form_submissions for select using (public.is_staff());
create policy form_submissions_staff_update on public.form_submissions for update using (public.is_staff()) with check (public.is_staff());

-- Le staff peut ajouter une note manuelle sur une fiche (lot 2).
drop policy if exists contact_events_staff_read   on public.contact_events;
drop policy if exists contact_events_staff_insert on public.contact_events;
create policy contact_events_staff_read   on public.contact_events for select using (public.is_staff());
create policy contact_events_staff_insert on public.contact_events for insert with check (public.is_staff() and type = 'note');

-- Données personnelles : pas d'exposition REST au rôle non authentifié.
revoke all on public.contacts         from anon;
revoke all on public.form_submissions from anon;
revoke all on public.contact_events   from anon;

-- -----------------------------------------------------------------------------
-- 6) Désabonnement — couvrir les deux bases pendant la transition
-- -----------------------------------------------------------------------------
-- `customers` (billetterie) et `contacts` (acquisition) coexistent jusqu'au
-- retrait de la billetterie. Un désabonnement qui n'agirait que sur l'une
-- laisserait la personne joignable depuis l'autre — le contraire de ce qu'elle
-- a demandé. On propage donc par jeton ET par e-mail, dans les deux sens.
create or replace function public.unsubscribe_by_token(p_token uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_first  text;
  v_email  text;
  v_cfirst text;
  v_cemail text;
  v_found  boolean := false;
begin
  update public.customers
     set email_opt_in = false, updated_at = now()
   where unsubscribe_token = p_token
   returning split_part(coalesce(full_name, ''), ' ', 1), email into v_first, v_email;
  if found then v_found := true; end if;

  -- Variables distinctes : un UPDATE sans ligne touchée remet ses cibles INTO à
  -- NULL — réutiliser v_email/v_first ici effacerait ce que `customers` a trouvé.
  update public.contacts
     set email_opt_in = false,
         unsubscribed_at = coalesce(unsubscribed_at, now())
   where unsubscribe_token = p_token
      or (v_email is not null and email = v_email)
   returning split_part(coalesce(full_name, ''), ' ', 1), email into v_cfirst, v_cemail;
  if found then v_found := true; end if;

  v_email := coalesce(v_email, v_cemail);
  v_first := coalesce(nullif(v_first, ''), nullif(v_cfirst, ''));

  -- Sens inverse : jeton porté par un contact → couper aussi côté customers.
  if v_email is not null then
    update public.customers set email_opt_in = false, updated_at = now()
     where email = v_email and email_opt_in;
  end if;

  if not v_found then return 'notfound'; end if;
  return coalesce(nullif(v_first, ''), 'ok');
end $$;

grant execute on function public.unsubscribe_by_token(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) Reprise de l'existant — la page Contacts ne s'ouvre pas sur une base vide
-- -----------------------------------------------------------------------------
-- `customers` couvre déjà tous les e-mails des réservations (bookings.email est
-- NOT NULL et un trigger y synchronise chaque réservation).
--
-- Le téléphone n'est repris QUE s'il est unique dans `customers` : deux fiches
-- partageant un numéro (le téléphone d'une entreprise, celui d'un proche) ne
-- doivent pas se voir attribuer la même identité — l'index unique partiel les
-- rejetterait, et l'un des deux contacts serait silencieusement perdu.
with src as (
  select
    c.*,
    public.normalize_phone(c.phone) as tel,
    count(*) over (partition by public.normalize_phone(c.phone)) as tel_n
  from public.customers c
)
insert into public.contacts (
  email, phone, full_name, company, status, tags, notes,
  first_source, email_opt_in, whatsapp_opt_in, unsubscribed_at,
  first_seen_at, last_activity_at
)
select
  src.email,
  case when src.tel is not null and src.tel_n = 1 then src.tel end,
  src.full_name,
  src.company,
  case when exists (
    select 1 from public.bookings b
     where lower(btrim(b.email)) = src.email and b.status = 'confirmed'
  ) then 'client' else 'lead' end,
  src.tags,
  src.notes,
  'billetterie',
  src.email_opt_in,
  src.whatsapp_opt_in,
  case when src.email_opt_in then null else src.updated_at end,
  src.first_seen_at,
  greatest(src.first_seen_at, src.updated_at)
from src
on conflict do nothing;

-- Timeline rétroactive : chaque réservation confirmée devient un achat, chaque
-- pack acheté aussi. `dedupe_key` rend la reprise rejouable sans doublon.
insert into public.contact_events (contact_id, type, title, amount, source, occurred_at, dedupe_key, meta)
select
  ct.id,
  'reservation',
  coalesce(s.title, 'Réservation') || ' — ' || b.reference,
  case when b.amount_paid > 0 then b.amount_paid else b.amount_due end,
  'billetterie',
  b.created_at,
  'booking:' || b.id,
  jsonb_build_object('reference', b.reference, 'session_id', b.session_id)
from public.bookings b
join public.contacts ct on ct.email = lower(btrim(b.email))
left join public.sessions s on s.id = b.session_id
where b.status = 'confirmed'
on conflict do nothing;

insert into public.contact_events (contact_id, type, title, amount, source, occurred_at, dedupe_key, meta)
select
  ct.id,
  'achat',
  coalesce(p.title, 'Pack de parcours') || ' — ' || pp.reference,
  case when pp.amount_paid > 0 then pp.amount_paid else pp.amount_due end,
  'pack',
  pp.created_at,
  'pack_purchase:' || pp.id,
  jsonb_build_object('reference', pp.reference, 'pack_id', pp.pack_id)
from public.pack_purchases pp
join public.contacts ct on ct.email = lower(btrim(pp.email))
left join public.packs p on p.id = pp.pack_id
where pp.status = 'confirmed'
on conflict do nothing;

-- Un contact qui a un achat est un client, quelle que soit son origine.
update public.contacts c
   set status = 'client'
 where c.status <> 'client'
   and exists (
     select 1 from public.contact_events e
      where e.contact_id = c.id and e.type in ('achat', 'reservation')
   );
