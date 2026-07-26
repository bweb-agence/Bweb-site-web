-- =========================================================
-- Bweb Agence — Schéma initial : blog, formations, billetterie, admin
-- Backend Supabase (Postgres 17). Sécurité par RLS.
-- Réservations : passage OBLIGATOIRE par la fonction create_booking()
-- (verrou de ligne -> aucun surbooking possible, par tarif).
-- =========================================================

-- ---------- Utilitaires ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Allowlist des administrateurs (par e-mail du compte Supabase Auth).
create table if not exists public.admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- L'utilisateur est admin si l'e-mail de son JWT figure dans la table admins.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Amorçage des admins (à ajuster/compléter dans l'admin ensuite).
insert into public.admins (email) values
  ('info@bwebagence.com'),
  ('soolagodwin@gmail.com'),
  ('godwinsoola@bwebagence.com')
on conflict (email) do nothing;

-- =========================================================
-- BLOG
-- =========================================================
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  title          text not null,
  excerpt        text,
  cover_url      text,
  category       text,                     -- IA, Marketing, Automatisation, Cas clients…
  body_md        text,                     -- corps en Markdown
  author         text default 'Équipe Bweb',
  reading_minutes int,
  seo_title      text,
  seo_description text,
  status         text not null default 'draft' check (status in ('draft','published')),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists posts_status_pub_idx on public.posts (status, published_at desc);
create index if not exists posts_category_idx on public.posts (category);
create trigger posts_updated before update on public.posts
  for each row execute function public.set_updated_at();

-- =========================================================
-- FORMATIONS (catalogue réutilisable)
-- =========================================================
create table if not exists public.formations (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  title          text not null,
  theme          text,                     -- IA, Marketing, Vente en ligne…
  summary        text,
  description_md text,
  duration       text,                     -- « 2 jours (14 h) »
  level          text,                     -- « Débutant accepté »
  default_price  int,                      -- FCFA
  image_url      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger formations_updated before update on public.formations
  for each row execute function public.set_updated_at();

-- =========================================================
-- SESSIONS (occurrences au calendrier, en présentiel)
-- =========================================================
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  formation_id uuid references public.formations(id) on delete set null,
  slug         text unique not null,
  title        text not null,
  theme        text,
  city         text not null default 'Abidjan',
  venue        text not null default 'Espace de formation Bweb · Cocody',
  image_url    text,                        -- affiche paysage 16/9
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  status       text not null default 'draft'
                 check (status in ('draft','published','full','cancelled')),
  likes_count  int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sessions_status_start_idx on public.sessions (status, starts_at);
create trigger sessions_updated before update on public.sessions
  for each row execute function public.set_updated_at();

-- =========================================================
-- TARIFS / BILLETS (plusieurs par session)
-- =========================================================
create table if not exists public.ticket_types (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name       text not null,                -- « Inscription anticipée », « Standard »…
  price      int not null,                 -- FCFA
  capacity   int not null default 0,       -- quota
  sold       int not null default 0,       -- vendus (maintenu par create_booking)
  badge      text,                         -- 'hot' | 'limited' | 'ok' | libre
  sales_end  timestamptz,                  -- fin de validité (ex. early bird)
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ticket_types_session_idx on public.ticket_types (session_id, sort);
alter table public.ticket_types
  add constraint ticket_sold_within_capacity check (sold >= 0 and sold <= capacity);

-- =========================================================
-- RÉSERVATIONS
-- =========================================================
create sequence if not exists public.booking_ref_seq;

create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  reference         text unique not null,
  session_id        uuid not null references public.sessions(id) on delete cascade,
  ticket_type_id    uuid not null references public.ticket_types(id) on delete restrict,
  quantity          int not null default 1 check (quantity > 0),
  full_name         text not null,
  email             text not null,
  phone             text,
  company           text,
  amount_due        int not null default 0,   -- prix total (FCFA)
  amount_paid       int not null default 0,
  is_deposit        boolean not null default false,   -- acompte 50 % (sur place)
  payment_method    text check (payment_method in ('wave','orange_money','mobile_money','sur_place')),
  payment_reference text,
  payment_proof_url text,                     -- capture d'écran (Storage)
  status            text not null default 'pending'
                      check (status in ('pending','confirmed','cancelled','waitlist')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists bookings_session_idx on public.bookings (session_id, created_at desc);
create index if not exists bookings_status_idx on public.bookings (status);
create trigger bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

-- =========================================================
-- FAQ (réutilisable ; globale ou liée à une formation)
-- =========================================================
create table if not exists public.faqs (
  id           uuid primary key default gen_random_uuid(),
  formation_id uuid references public.formations(id) on delete cascade, -- null = globale
  question     text not null,
  answer_md    text not null,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

-- =========================================================
-- FAVORIS (mesure d'intérêt ; anonyme, dédupliqué)
-- =========================================================
create table if not exists public.favorites (
  target_type text not null check (target_type in ('session','post')),
  target_id   uuid not null,
  anon_id     text not null,               -- identifiant navigateur (localStorage)
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, anon_id)
);

-- Maintien du compteur likes_count sur les sessions.
create or replace function public.sync_session_likes()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' and new.target_type = 'session') then
    update public.sessions set likes_count = likes_count + 1 where id = new.target_id;
  elsif (tg_op = 'DELETE' and old.target_type = 'session') then
    update public.sessions set likes_count = greatest(0, likes_count - 1) where id = old.target_id;
  end if;
  return null;
end;
$$;
create trigger favorites_sync_likes
  after insert or delete on public.favorites
  for each row execute function public.sync_session_likes();

-- =========================================================
-- FONCTION TRANSACTIONNELLE — anti-surbooking (par tarif)
-- =========================================================
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
  v_tt        public.ticket_types%rowtype;
  v_session   public.sessions%rowtype;
  v_ref       text;
  v_due       int;
  v_booking   public.bookings%rowtype;
begin
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;

  -- Verrou de ligne : sérialise les réservations concurrentes sur ce tarif.
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
    status
  ) values (
    v_ref, v_tt.session_id, v_tt.id, p_quantity,
    p_full_name, p_email, p_phone, p_company,
    v_due, coalesce(p_is_deposit,false), p_payment_method, p_payment_reference, p_payment_proof_url,
    'pending'
  ) returning * into v_booking;

  -- Réserve les places immédiatement (même en attente de vérification).
  update public.ticket_types set sold = sold + p_quantity where id = v_tt.id;

  -- Marque la session complète si tous les tarifs sont épuisés.
  update public.sessions s set status = 'full'
   where s.id = v_tt.session_id and s.status = 'published'
     and not exists (select 1 from public.ticket_types t
                      where t.session_id = s.id and t.sold < t.capacity);

  return jsonb_build_object('ok', true, 'reference', v_ref, 'booking_id', v_booking.id,
                            'amount_due', v_due);
end;
$$;

-- Admin : valider un paiement (déclenche l'e-mail de confirmation côté app).
create or replace function public.confirm_booking(p_booking_id uuid, p_amount_paid int default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  update public.bookings
     set status = 'confirmed',
         amount_paid = coalesce(p_amount_paid, amount_due)
   where id = p_booking_id
   returning * into v_b;
  return v_b;
end;
$$;

-- Admin : annuler/refuser -> libère les places réservées.
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  update public.bookings set status = 'cancelled'
   where id = p_booking_id and status <> 'cancelled'
   returning * into v_b;
  if found then
    update public.ticket_types set sold = greatest(0, sold - v_b.quantity)
     where id = v_b.ticket_type_id;
    update public.sessions set status = 'published'
     where id = v_b.session_id and status = 'full';
  end if;
  return v_b;
end;
$$;

grant execute on function public.create_booking(uuid,int,text,text,text,text,text,text,text,boolean)
  to anon, authenticated, service_role;
grant execute on function public.confirm_booking(uuid,int) to authenticated, service_role;
grant execute on function public.cancel_booking(uuid) to authenticated, service_role;

-- =========================================================
-- RLS
-- =========================================================
alter table public.admins       enable row level security;
alter table public.posts        enable row level security;
alter table public.formations   enable row level security;
alter table public.sessions     enable row level security;
alter table public.ticket_types enable row level security;
alter table public.bookings     enable row level security;
alter table public.faqs         enable row level security;
alter table public.favorites    enable row level security;

-- admins : lisible par les admins uniquement
create policy admins_read on public.admins for select using (public.is_admin());
create policy admins_write on public.admins for all
  using (public.is_admin()) with check (public.is_admin());

-- posts : public lit les publiés ; admin tout
create policy posts_read on public.posts for select
  using (status = 'published' or public.is_admin());
create policy posts_write on public.posts for all
  using (public.is_admin()) with check (public.is_admin());

-- formations : lecture publique ; écriture admin
create policy formations_read on public.formations for select using (true);
create policy formations_write on public.formations for all
  using (public.is_admin()) with check (public.is_admin());

-- sessions : public voit publiées + complètes ; admin tout
create policy sessions_read on public.sessions for select
  using (status in ('published','full') or public.is_admin());
create policy sessions_write on public.sessions for all
  using (public.is_admin()) with check (public.is_admin());

-- ticket_types : lisible si la session est visible ; écriture admin
create policy ticket_types_read on public.ticket_types for select
  using (exists (select 1 from public.sessions s
                 where s.id = session_id and (s.status in ('published','full') or public.is_admin())));
create policy ticket_types_write on public.ticket_types for all
  using (public.is_admin()) with check (public.is_admin());

-- bookings : jamais lisible/insérable publiquement (tout passe par les fonctions).
create policy bookings_admin_read on public.bookings for select using (public.is_admin());
create policy bookings_admin_write on public.bookings for all
  using (public.is_admin()) with check (public.is_admin());

-- faqs : lecture publique ; écriture admin
create policy faqs_read on public.faqs for select using (true);
create policy faqs_write on public.faqs for all
  using (public.is_admin()) with check (public.is_admin());

-- favorites : le public peut ajouter/retirer et lire (compteur d'intérêt)
create policy favorites_read on public.favorites for select using (true);
create policy favorites_insert on public.favorites for insert with check (true);
create policy favorites_delete on public.favorites for delete using (true);

-- =========================================================
-- STOCKAGE — justificatifs de paiement (bucket privé)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Seuls les admins peuvent lire les justificatifs (upload via service_role côté serveur).
create policy "payment_proofs_admin_read" on storage.objects for select
  using (bucket_id = 'payment-proofs' and public.is_admin());
