-- =========================================================
-- Rôles (admin / commercial) + réservation MANUELLE
-- Un commercial encaisse un client directement (Mobile Money / espèces) hors
-- site : il saisit la réservation dans l'admin. Elle est créée CONFIRMÉE +
-- PAYÉE (elle consomme une place, comme une vraie vente), avec le moyen de
-- paiement et l'e-mail du commercial qui l'a saisie.
--
-- Rôles : la table `admins` porte désormais un rôle.
--   - admin      : tout (inchangé).
--   - commercial : accès restreint (vente + lecture réservations/clients + relance
--                  + tableau de bord). Pas de catalogue, campagnes, ni paramètres.
-- is_admin() = rôle admin ; is_staff() = présent dans la table (admin OU commercial).
-- =========================================================

-- 1) Rôle sur les membres du staff (les existants restent 'admin' par défaut).
alter table public.admins
  add column if not exists role text not null default 'admin'
    check (role in ('admin', 'commercial'));

-- 2) is_admin() = rôle admin uniquement ; is_staff() = tout membre du staff.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and a.role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_staff() to anon, authenticated, service_role;

-- Rôle du membre courant (pour l'UI : filtrer le menu, etc.).
create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select a.role from public.admins a
  where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;
grant execute on function public.current_staff_role() to anon, authenticated, service_role;

-- 3) Réservation : origine « manuel » + qui l'a saisie + moyens de paiement étendus.
alter table public.bookings add column if not exists registered_by text;

alter table public.bookings drop constraint if exists bookings_source_check;
alter table public.bookings add constraint bookings_source_check
  check (source in ('direct', 'pack', 'manuel'));

alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check (payment_method = any (array['wave','orange_money','mtn_momo','mobile_money','especes','sur_place','money_fusion','paystack']));

-- 4) RPC : création d'une réservation manuelle (confirmée + payée).
--    Sécurité : réservée au staff. Vérifie la capacité (comme create_booking) et
--    consomme une place via le passage direct en 'confirmed' (trigger sold).
create or replace function public.create_manual_booking(
  p_ticket_type_id uuid,
  p_quantity int,
  p_full_name text,
  p_email text,
  p_phone text,
  p_payment_method text,
  p_attendance_mode text default null,
  p_amount_paid int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tt      public.ticket_types%rowtype;
  v_session public.sessions%rowtype;
  v_ref     text;
  v_due     int;
  v_paid    int;
  v_booking public.bookings%rowtype;
  v_actor   text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;
  if p_full_name is null or length(trim(p_full_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if p_email is null or p_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if p_payment_method is null or p_payment_method not in ('wave','orange_money','mtn_momo','especes') then
    return jsonb_build_object('ok', false, 'error', 'invalid_payment_method');
  end if;

  select * into v_tt from public.ticket_types where id = p_ticket_type_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'ticket_not_found'); end if;
  select * into v_session from public.sessions where id = v_tt.session_id;
  if v_session.status not in ('published', 'full') then
    return jsonb_build_object('ok', false, 'error', 'session_unavailable');
  end if;
  if v_tt.sold + p_quantity > v_tt.capacity then
    return jsonb_build_object('ok', false, 'error', 'sold_out',
                              'remaining', greatest(0, v_tt.capacity - v_tt.sold));
  end if;

  v_due := v_tt.price * p_quantity;
  v_paid := coalesce(p_amount_paid, v_due);
  v_ref := 'BWB-' || to_char(now(), 'YYYY') || '-' ||
           lpad(nextval('public.booking_ref_seq')::text, 4, '0');

  insert into public.bookings (
    reference, session_id, ticket_type_id, quantity,
    full_name, email, phone,
    amount_due, amount_paid, is_deposit,
    payment_method, payment_status, attendance_mode,
    status, source, registered_by
  ) values (
    v_ref, v_tt.session_id, v_tt.id, p_quantity,
    p_full_name, p_email, p_phone,
    v_due, v_paid, false,
    p_payment_method, 'paye', p_attendance_mode,
    'confirmed', 'manuel', v_actor
  ) returning * into v_booking;

  return jsonb_build_object('ok', true, 'reference', v_ref, 'booking_id', v_booking.id, 'amount_due', v_due);
end;
$$;
grant execute on function public.create_manual_booking(uuid,int,text,text,text,text,text,int) to authenticated, service_role;

-- 5) RLS : le STAFF (admin OU commercial) peut LIRE les données de vente.
--    Les écritures restent réservées à l'admin (la saisie manuelle passe par la
--    RPC security definer ci-dessus, qui vérifie is_staff()).
drop policy if exists bookings_admin_read on public.bookings;
create policy bookings_staff_read on public.bookings for select using (public.is_staff());

drop policy if exists customers_staff_read on public.customers;
create policy customers_staff_read on public.customers for select using (public.is_staff());

-- Sessions & tarifs : le staff voit aussi les brouillons/archivées (pour la liste
-- des réservations et la saisie). Le public reste limité à published/full.
drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select
  using (status in ('published', 'full') or public.is_staff());

drop policy if exists ticket_types_read on public.ticket_types;
create policy ticket_types_read on public.ticket_types for select
  using (exists (select 1 from public.sessions s
                 where s.id = session_id and (s.status in ('published', 'full') or public.is_staff())));

-- Avis : lecture staff (pour le KPI « avis » du tableau de bord).
drop policy if exists reviews_staff_read on public.reviews;
create policy reviews_staff_read on public.reviews for select using (public.is_staff());
