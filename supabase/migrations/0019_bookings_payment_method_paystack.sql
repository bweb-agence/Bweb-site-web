-- Ajoute « paystack » aux moyens de paiement (passerelle pour les numéros +225).
alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check (payment_method = any (array['wave','orange_money','mobile_money','sur_place','money_fusion','paystack']));
