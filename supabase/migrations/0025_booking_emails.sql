-- =========================================================
-- 0025 — Journal des e-mails automatiques par réservation (anti-doublon)
-- Rappels (J-5 / J-3 / J-1 / J-0) + demande d'avis (J+1). Le cron n'envoie un
-- e-mail que si (booking_id, kind) n'existe pas déjà → jamais 2× le même.
-- =========================================================

create table if not exists public.booking_emails (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind       text not null,  -- reminder_5d | reminder_3d | reminder_1d | reminder_0d | review_request
  sent_at    timestamptz not null default now(),
  unique (booking_id, kind)
);

create index if not exists booking_emails_booking_idx on public.booking_emails (booking_id);

-- Table interne : jamais exposée au public. Le cron utilise la clé service (contourne RLS).
alter table public.booking_emails enable row level security;
