-- Champs de contenu additionnels (tous nullables, additifs).
-- formations : photo + bio du formateur, éléments « compris » libres (1 par ligne).
-- sessions   : adresse précise / indications d'accès.

alter table public.formations
  add column if not exists instructor_photo_url text,
  add column if not exists instructor_bio text,
  add column if not exists included_extra text;

alter table public.sessions
  add column if not exists address text;
