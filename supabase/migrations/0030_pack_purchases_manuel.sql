-- =========================================================
-- Pack acheté MANUELLEMENT (client qui paie hors site via un commercial).
-- Symétrique de la réservation manuelle de ticket : on enregistre qui l'a saisi
-- et on autorise les moyens de paiement Mobile Money / espèces.
-- =========================================================
alter table public.pack_purchases add column if not exists registered_by text;

alter table public.pack_purchases drop constraint if exists pack_purchases_payment_method_check;
alter table public.pack_purchases add constraint pack_purchases_payment_method_check
  check (payment_method in ('paystack', 'money_fusion', 'wave', 'orange_money', 'mtn_momo', 'especes'));
