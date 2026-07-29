-- Les places (ticket_types.sold) ne diminuent QUE lorsque le paiement est confirmé.
-- Avant : create_booking() incrémentait sold dès la réservation (pending), donc les
-- paiements en ligne abandonnés bloquaient des places. Désormais sold = somme des
-- réservations « confirmed » (plafonnée à la capacité), recalculée par trigger — ce qui
-- couvre les DEUX chemins de confirmation (RPC confirm_booking ET UPDATE direct du webhook).

-- 1) Source de vérité : recalcule sold depuis les réservations confirmées.
create or replace function public.sync_ticket_sold() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tt uuid := coalesce(new.ticket_type_id, old.ticket_type_id);
  v_cap int;
  v_session uuid;
  v_confirmed int;
begin
  if v_tt is null then return coalesce(new, old); end if;
  select capacity, session_id into v_cap, v_session from public.ticket_types where id = v_tt;
  select coalesce(sum(quantity), 0) into v_confirmed
    from public.bookings where ticket_type_id = v_tt and status = 'confirmed';
  update public.ticket_types set sold = least(v_cap, v_confirmed) where id = v_tt;
  -- Session « complète » si tous les tarifs sont pleins (confirmés), sinon « publiée ».
  update public.sessions s
     set status = case
       when not exists (select 1 from public.ticket_types t where t.session_id = s.id and t.sold < t.capacity)
         then 'full' else 'published' end
   where s.id = v_session and s.status in ('published', 'full');
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_ticket_sold on public.bookings;
create trigger trg_sync_ticket_sold
  after insert or delete or update of status, quantity, ticket_type_id on public.bookings
  for each row execute function public.sync_ticket_sold();

-- 2) create_booking : n'incrémente plus sold (réservation = pending, place non bloquée).
--    Le contrôle de capacité reste basé sur les places déjà CONFIRMÉES (sold).
create or replace function public.create_booking(
  p_ticket_type_id    uuid,
  p_quantity          int,
  p_full_name         text,
  p_email             text,
  p_phone             text,
  p_company           text,
  p_payment_method    text,
  p_payment_reference text,
  p_payment_proof_url text,
  p_is_deposit        boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tt      public.ticket_types%rowtype;
  v_session public.sessions%rowtype;
  v_ref     text;
  v_due     int;
  v_booking public.bookings%rowtype;
begin
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;

  select * into v_tt from public.ticket_types where id = p_ticket_type_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ticket_not_found');
  end if;

  select * into v_session from public.sessions where id = v_tt.session_id;
  if v_session.status <> 'published' then
    return jsonb_build_object('ok', false, 'error', 'session_unavailable');
  end if;

  -- Garde-fou : on ne réserve pas un tarif déjà complet (places confirmées = capacité).
  if v_tt.sold + p_quantity > v_tt.capacity then
    return jsonb_build_object('ok', false, 'error', 'sold_out',
                              'remaining', greatest(0, v_tt.capacity - v_tt.sold));
  end if;

  v_ref := 'BWB-' || to_char(now(), 'YYYY') || '-' ||
           lpad(nextval('public.booking_ref_seq')::text, 4, '0');
  v_due := v_tt.price * p_quantity;

  insert into public.bookings (
    reference, session_id, ticket_type_id, quantity,
    full_name, email, phone, company,
    amount_due, is_deposit, payment_method, payment_reference, payment_proof_url,
    status
  ) values (
    v_ref, v_tt.session_id, v_tt.id, p_quantity,
    p_full_name, p_email, p_phone, p_company,
    v_due, coalesce(p_is_deposit,false), p_payment_method, p_payment_reference, p_payment_proof_url,
    'pending'
  ) returning * into v_booking;

  -- Aucune place bloquée ici : sold ne bougera qu'à la confirmation (trigger).
  return jsonb_build_object('ok', true, 'reference', v_ref, 'booking_id', v_booking.id,
                            'amount_due', v_due);
end;
$$;

-- 3) cancel_booking : ne touche plus sold à la main (le trigger recalcule sur le
--    passage hors 'confirmed'). Reste réservé aux admins.
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  update public.bookings set status = 'cancelled'
   where id = p_booking_id and status <> 'cancelled'
   returning * into v_b;
  return v_b;
end;
$$;

-- 4) confirm_booking : inchangé (pose status = 'confirmed' → le trigger incrémente sold).

-- 5) Backfill : aligne sold sur les réservations confirmées existantes.
update public.ticket_types t
   set sold = least(t.capacity,
     coalesce((select sum(b.quantity) from public.bookings b
                where b.ticket_type_id = t.id and b.status = 'confirmed'), 0));

update public.sessions s
   set status = case
     when not exists (select 1 from public.ticket_types t where t.session_id = s.id and t.sold < t.capacity)
       then 'full' else 'published' end
 where s.status in ('published', 'full');
