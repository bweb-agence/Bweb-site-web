-- =========================================================
-- 0024 — État du paiement en ligne (attente / payé / échoué / abandon)
-- Le parcours de réservation est 100 % automatique (Paystack / Money Fusion) :
-- l'admin ne valide/refuse plus rien à la main. On suit donc l'état réel de
-- l'opération de paiement, distinct du cycle de vie « status » de la réservation.
--   attente  → opération en cours (l'acheteur est sur la page de paiement)
--   paye     → paiement vérifié auprès de la passerelle (→ status = confirmed)
--   echoue   → l'acheteur a tenté de payer mais n'a pas finalisé (failed/reversed)
--   abandon  → l'acheteur a quitté sans passer au paiement (abandoned)
-- =========================================================

alter table public.bookings
  add column if not exists payment_status text not null default 'attente'
    check (payment_status in ('attente', 'paye', 'echoue', 'abandon'));

-- Rétro-remplissage : les réservations déjà confirmées ont été payées.
update public.bookings set payment_status = 'paye' where status = 'confirmed';

create index if not exists bookings_payment_status_idx on public.bookings (payment_status);
