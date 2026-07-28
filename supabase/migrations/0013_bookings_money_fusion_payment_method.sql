-- =========================================================
-- Autoriser 'money_fusion' comme moyen de paiement des réservations.
-- Le paiement en ligne Money Fusion enregistre les réservations avec
-- payment_method = 'money_fusion' ; la contrainte d'origine ne listait
-- que wave / orange_money / mobile_money / sur_place (échec d'insertion).
-- (Déjà appliqué en base le 2026-07-28 ; ce fichier trace la migration.)
-- =========================================================
alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check (payment_method = any (array['wave','orange_money','mobile_money','sur_place','money_fusion']));
