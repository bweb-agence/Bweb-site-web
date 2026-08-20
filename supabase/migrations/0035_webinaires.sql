-- =========================================================
-- 0035 — WEBINAIRES : la date, le lien du live et le journal d'envois
-- ---------------------------------------------------------
-- Le tunnel webinaire enregistrait ses inscrits (form_submissions) mais ne leur
-- écrivait jamais : le lien du live et les rappels partaient à la main sur
-- WhatsApp. Cette migration pose ce qui manque pour que le site envoie ses
-- propres e-mails transactionnels.
--
-- Deux tables :
--   `webinaires`       — l'événement : date, durée, lien de connexion, replay.
--                        Réglable depuis le tableau de bord, comme les cohortes :
--                        une date qui bouge ne doit pas demander un déploiement.
--   `webinaire_emails` — le journal des envois, sur le modèle éprouvé de
--                        `booking_emails` : une ligne par (webinaire, adresse,
--                        type d'e-mail), l'unicité garantissant qu'un inscrit ne
--                        reçoit jamais deux fois le même message — même si le
--                        cron repasse ou si la personne s'inscrit deux fois.
--
-- Le journal porte l'ADRESSE, pas seulement le contact : c'est elle qui reçoit,
-- et un inscrit sans fiche contact résolue (incident base, doublon en attente
-- d'arbitrage) doit quand même être protégé du doublon.
-- =========================================================

create table if not exists public.webinaires (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,          -- = form_key du tunnel (« webinaire-initiation »)
  title         text not null,
  starts_at     timestamptz not null,
  duration_min  int  not null default 60 check (duration_min > 0),
  join_url      text,                          -- lien du live (Zoom / Meet / YouTube)
  join_info     text,                          -- consigne libre (« connecte-toi 5 min avant »)
  replay_url    text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists webinaires_updated on public.webinaires;
create trigger webinaires_updated before update on public.webinaires
  for each row execute function public.set_updated_at();

create table if not exists public.webinaire_emails (
  id           uuid primary key default gen_random_uuid(),
  webinaire_id uuid not null references public.webinaires(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete set null,
  email        text not null,
  kind         text not null,   -- confirmation | reminder_1d | reminder_0d | reminder_1h | replay
  sent_at      timestamptz not null default now()
);

create unique index if not exists webinaire_emails_uk
  on public.webinaire_emails (webinaire_id, lower(email), kind);
create index if not exists webinaire_emails_webinaire_idx
  on public.webinaire_emails (webinaire_id, sent_at desc);

-- ---------- RLS ----------
-- `webinaires` porte le lien du live : il ne doit PAS être lisible par le
-- public, sinon n'importe qui rejoint le live sans s'être inscrit. Lecture
-- staff, écriture admin ; l'envoi se fait avec la clé service.
alter table public.webinaires enable row level security;
drop policy if exists webinaires_staff_read  on public.webinaires;
drop policy if exists webinaires_admin_write on public.webinaires;
create policy webinaires_staff_read  on public.webinaires for select using (public.is_staff());
create policy webinaires_admin_write on public.webinaires for all
  using (public.is_admin()) with check (public.is_admin());

-- Journal interne : aucune policy, donc rien ne le lit ni ne l'écrit hors clé
-- service (même posture que `booking_emails`).
alter table public.webinaire_emails enable row level security;
drop policy if exists webinaire_emails_staff_read on public.webinaire_emails;
create policy webinaire_emails_staff_read on public.webinaire_emails for select using (public.is_staff());

-- ---------- Ce que le public a le droit de savoir ----------
-- Le fichier .ics et, plus tard, la landing ont besoin du titre et de l'horaire.
-- Pas du lien de connexion : cette fonction ne le rend jamais.
create or replace function public.webinaire_public(p_slug text)
returns table (title text, starts_at timestamptz, duration_min int)
language sql stable security definer set search_path = public as $$
  select w.title, w.starts_at, w.duration_min
  from public.webinaires w
  where w.slug = p_slug and w.active;
$$;

revoke all on function public.webinaire_public(text) from public;
grant execute on function public.webinaire_public(text) to anon, authenticated, service_role;

-- ---------- Le live du 6 septembre ----------
-- Reprend à l'identique les constantes de /webinaire-initiation (20 h Abidjan,
-- soit 20:00 UTC). Le lien de connexion se renseigne dans le tableau de bord.
insert into public.webinaires (slug, title, starts_at, duration_min, join_info)
values ('webinaire-initiation',
        'De ta compétence à tes premières ventes : la méthode exacte en 3 étapes',
        '2026-09-06 20:00:00+00', 60,
        'Connecte-toi 5 minutes en avance, avec un carnet.')
on conflict (slug) do nothing;
