-- Niveau (badge affiché à côté du thème) + mode de session (présentiel / en ligne).
-- Le mode conditionne la page de présentation : en ligne masque le présentiel
-- (adresse, carte) et affiche les infos de connexion à la réunion.
alter table public.sessions
  add column if not exists level        text check (level in ('debutant','intermediaire','avance')),
  add column if not exists mode         text not null default 'presentiel' check (mode in ('presentiel','en_ligne')),
  add column if not exists meeting_url   text,
  add column if not exists meeting_info  text;
