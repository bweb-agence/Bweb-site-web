-- Correctif : la surcharge de create_booking réellement appelée par l'app
-- (avec p_attendance_mode, définie en 0011) incrémentait encore sold à la
-- réservation. On l'aligne sur 0017 : plus d'incrément — sold ne bouge qu'à la
-- confirmation via le trigger trg_sync_ticket_sold. Le mode de participation reste enregistré.
create or replace function public.create_booking(
  p_ticket_type_id uuid, p_quantity integer, p_full_name text, p_email text,
  p_phone text, p_company text, p_payment_method text, p_payment_reference text,
  p_payment_proof_url text, p_is_deposit boolean default false,
  p_attendance_mode text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
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
    attendance_mode, status
  ) values (
    v_ref, v_tt.session_id, v_tt.id, p_quantity,
    p_full_name, p_email, p_phone, p_company,
    v_due, coalesce(p_is_deposit,false), p_payment_method, p_payment_reference, p_payment_proof_url,
    p_attendance_mode, 'pending'
  ) returning * into v_booking;
  return jsonb_build_object('ok', true, 'reference', v_ref, 'booking_id', v_booking.id,
                            'amount_due', v_due);
end;
$function$;
