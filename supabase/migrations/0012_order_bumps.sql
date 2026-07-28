-- Order bumps : offres complémentaires proposées pendant la réservation.
-- Un bump ajoute un ticket_type (d'une autre session/formation) au panier.
create table if not exists public.order_bumps (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,      -- session où le bump s'affiche
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,  -- produit ajouté au panier
  headline       text,   -- accroche marketing
  description    text,   -- courte description
  badge          text,   -- ex : « Recommandé », « Offre limitée »
  sort           int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists order_bumps_session_idx on public.order_bumps (session_id, sort);

alter table public.order_bumps enable row level security;

-- Lecture publique (offre marketing affichée à tous).
drop policy if exists order_bumps_read on public.order_bumps;
create policy order_bumps_read on public.order_bumps for select using (true);

-- Écriture réservée à l'admin.
drop policy if exists order_bumps_write on public.order_bumps;
create policy order_bumps_write on public.order_bumps for all
  using (public.is_admin()) with check (public.is_admin());
