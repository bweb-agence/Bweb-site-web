-- =========================================================
-- PACKS DE PARCOURS — vendre plusieurs formations d'un parcours
-- en une fois, AVANT que les dates ne soient programmées.
--
-- Un « pack » est rattaché à un parcours (thème) et regroupe des
-- formations. L'achat crée des « droits à une place » (entitlements),
-- un par formation. Dès qu'une date est publiée pour une formation
-- incluse, le détenteur est enrôlé automatiquement (booking confirmé
-- à 0 F CFA, source = 'pack') et prévenu par e-mail.
--
-- Générique : réutilisable pour tous les futurs parcours.
-- =========================================================

-- ---------- Origine d'une réservation (direct vs place de pack) ----------
alter table public.bookings
  add column if not exists source text not null default 'direct'
    check (source in ('direct', 'pack'));

-- ---------- Le pack (offre rattachée à un parcours) ----------
create table if not exists public.packs (
  id                uuid primary key default gen_random_uuid(),
  theme_id          uuid references public.themes(id) on delete set null,  -- le parcours
  slug              text unique not null,
  title             text not null,
  description       text,
  price             int  not null,                 -- prix du pack (FCFA)
  compare_at_price  int,                            -- prix « au lieu de » (optionnel)
  image_url         text,
  active            boolean not null default false, -- visible sur le site
  sort              int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists packs_theme_idx on public.packs (theme_id, sort);
create trigger packs_updated before update on public.packs
  for each row execute function public.set_updated_at();

-- ---------- Formations incluses dans un pack ----------
create table if not exists public.pack_items (
  id            uuid primary key default gen_random_uuid(),
  pack_id       uuid not null references public.packs(id) on delete cascade,
  formation_id  uuid not null references public.formations(id) on delete cascade,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  unique (pack_id, formation_id)
);
create index if not exists pack_items_pack_idx on public.pack_items (pack_id, sort);

-- ---------- Un achat de pack (client + paiement) ----------
create table if not exists public.pack_purchases (
  id                uuid primary key default gen_random_uuid(),
  pack_id           uuid references public.packs(id) on delete set null,
  reference         text unique not null,           -- PK-XXXX (généré côté app)
  full_name         text not null,
  email             text not null,
  phone             text,
  amount_due        int  not null default 0,
  amount_paid       int  not null default 0,
  attendance_mode   text check (attendance_mode in ('presentiel', 'en_ligne')), -- préférence à l'achat
  status            text not null default 'pending'
                      check (status in ('pending', 'confirmed', 'cancelled')),
  payment_status    text not null default 'attente'
                      check (payment_status in ('attente', 'paye', 'echoue', 'abandon')),
  payment_reference text,                            -- jeton passerelle
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists pack_purchases_email_idx on public.pack_purchases (lower(email));
create index if not exists pack_purchases_ref_idx   on public.pack_purchases (payment_reference);
create index if not exists pack_purchases_status_idx on public.pack_purchases (status, created_at desc);
create trigger pack_purchases_updated before update on public.pack_purchases
  for each row execute function public.set_updated_at();

-- ---------- Les « droits à une place » (1 par formation du pack) ----------
create table if not exists public.pack_entitlements (
  id                  uuid primary key default gen_random_uuid(),
  purchase_id         uuid not null references public.pack_purchases(id) on delete cascade,
  formation_id        uuid references public.formations(id) on delete set null,
  status              text not null default 'pending'
                        check (status in ('pending', 'enrolled', 'done', 'cancelled')),
  booking_id          uuid references public.bookings(id) on delete set null,   -- rempli à l'enrôlement
  enrolled_session_id uuid references public.sessions(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (purchase_id, formation_id)
);
create index if not exists pack_entitlements_purchase_idx on public.pack_entitlements (purchase_id);
create index if not exists pack_entitlements_formation_idx on public.pack_entitlements (formation_id, status);
create trigger pack_entitlements_updated before update on public.pack_entitlements
  for each row execute function public.set_updated_at();

-- =========================================================
-- RLS
-- =========================================================
alter table public.packs             enable row level security;
alter table public.pack_items        enable row level security;
alter table public.pack_purchases    enable row level security;
alter table public.pack_entitlements enable row level security;

-- Packs actifs : lecture publique (offre affichée sur le site). Admin : tout.
drop policy if exists packs_read on public.packs;
create policy packs_read on public.packs for select
  using (active = true or public.is_admin());
drop policy if exists packs_write on public.packs;
create policy packs_write on public.packs for all
  using (public.is_admin()) with check (public.is_admin());

-- Items : lisibles si le pack parent est visible. Admin : tout.
drop policy if exists pack_items_read on public.pack_items;
create policy pack_items_read on public.pack_items for select
  using (exists (select 1 from public.packs p where p.id = pack_id and (p.active or public.is_admin())));
drop policy if exists pack_items_write on public.pack_items;
create policy pack_items_write on public.pack_items for all
  using (public.is_admin()) with check (public.is_admin());

-- Achats & droits : réservés à l'admin (l'écriture publique passe par la clé
-- service côté serveur, après vérification du paiement — jamais depuis le navigateur).
drop policy if exists pack_purchases_admin on public.pack_purchases;
create policy pack_purchases_admin on public.pack_purchases for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists pack_entitlements_admin on public.pack_entitlements;
create policy pack_entitlements_admin on public.pack_entitlements for all
  using (public.is_admin()) with check (public.is_admin());
