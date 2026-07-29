-- Phase 3 du mini-CRM : campagnes (e-mail / WhatsApp) vers la base clients.
--
-- - Table `campaigns` : historique des envois (canal, audience, message, comptes).
-- - `customers.unsubscribe_token` : jeton opaque pour un désabonnement 1-clic
--   (aucune donnée personnelle dans l'URL).
-- - RPC publique `unsubscribe_by_token` : désabonne (e-mail) via le jeton.

-- Jeton de désabonnement sur chaque fiche client.
alter table public.customers
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists customers_unsub_token_idx on public.customers (unsubscribe_token);

-- Historique des campagnes.
create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null check (channel in ('email', 'whatsapp')),
  audience         text not null,
  session_id       uuid references public.sessions(id) on delete set null,
  subject          text,
  message          text not null,
  recipients_count int not null default 0,
  sent_count       int not null default 0,
  created_by       text,
  created_at       timestamptz not null default now()
);
create index if not exists campaigns_created_idx on public.campaigns (created_at desc);

alter table public.campaigns enable row level security;
drop policy if exists campaigns_admin on public.campaigns;
create policy campaigns_admin on public.campaigns for all
  using (public.is_admin()) with check (public.is_admin());

-- Désabonnement e-mail via jeton (accessible au public, sans authentification).
create or replace function public.unsubscribe_by_token(p_token uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_first text;
begin
  update public.customers
    set email_opt_in = false, updated_at = now()
    where unsubscribe_token = p_token
    returning split_part(coalesce(full_name, ''), ' ', 1) into v_first;
  if not found then return 'notfound'; end if;
  return coalesce(nullif(v_first, ''), 'ok');
end $$;

grant execute on function public.unsubscribe_by_token(uuid) to anon, authenticated, service_role;
