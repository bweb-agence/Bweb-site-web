-- Phase 2 du mini-CRM : table `customers` = identité client durable.
--
-- Objectif : donner une existence persistante au client (au-delà de l'agrégation
-- des réservations par e-mail), pour y attacher des tags, des notes internes, le
-- consentement (RGPD) et la date de dernier contact.
--
-- Identité = e-mail normalisé (minuscules, sans espaces superflus), unique.
-- Alimentée automatiquement à chaque réservation (trigger) + backfill de l'existant.
-- Réservée à l'admin (RLS). Les réservations sans e-mail n'ont pas de fiche customer.

create table if not exists public.customers (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  full_name         text,
  phone             text,
  company           text,
  tags              text[] not null default '{}',
  notes             text,
  whatsapp_opt_in   boolean not null default true,
  email_opt_in      boolean not null default true,
  last_contacted_at timestamptz,
  first_seen_at     timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists customers_last_activity_idx on public.customers (updated_at desc);
create index if not exists customers_tags_idx on public.customers using gin (tags);

alter table public.customers enable row level security;

-- Données personnelles : accès réservé à l'admin (aucune lecture publique).
drop policy if exists customers_admin on public.customers;
create policy customers_admin on public.customers for all
  using (public.is_admin()) with check (public.is_admin());

-- Tenir `updated_at` à jour automatiquement.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

-- Synchro depuis les réservations : crée/rafraîchit la fiche client à partir de
-- l'e-mail. Ne touche jamais aux champs d'enrichissement (tags, notes, consentement).
-- IMPORTANT : toute erreur est avalée — la synchro CRM ne doit JAMAIS faire échouer
-- une réservation ou un paiement.
create or replace function public.sync_customer_from_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(new.email, '')));
begin
  if v_email = '' then return new; end if;
  insert into public.customers (email, full_name, phone, company, first_seen_at)
  values (v_email, nullif(trim(new.full_name), ''), nullif(trim(new.phone), ''), nullif(trim(new.company), ''), new.created_at)
  on conflict (email) do update set
    full_name     = coalesce(nullif(trim(excluded.full_name), ''), public.customers.full_name),
    phone         = coalesce(nullif(trim(excluded.phone), ''), public.customers.phone),
    company       = coalesce(nullif(trim(excluded.company), ''), public.customers.company),
    first_seen_at = least(public.customers.first_seen_at, excluded.first_seen_at),
    updated_at    = now();
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_sync_customer on public.bookings;
create trigger trg_sync_customer
  after insert or update of email, full_name, phone, company on public.bookings
  for each row execute function public.sync_customer_from_booking();

-- Backfill : une fiche par e-mail distinct présent dans les réservations existantes.
-- Identité = dernières valeurs non nulles ; first_seen = 1re réservation.
insert into public.customers (email, full_name, phone, company, first_seen_at)
select
  lower(trim(b.email)),
  (array_agg(nullif(trim(b.full_name), '') order by b.created_at desc) filter (where nullif(trim(b.full_name), '') is not null))[1],
  (array_agg(nullif(trim(b.phone), '')     order by b.created_at desc) filter (where nullif(trim(b.phone), '')     is not null))[1],
  (array_agg(nullif(trim(b.company), '')   order by b.created_at desc) filter (where nullif(trim(b.company), '')   is not null))[1],
  min(b.created_at)
from public.bookings b
where b.email is not null and trim(b.email) <> ''
group by lower(trim(b.email))
on conflict (email) do nothing;
