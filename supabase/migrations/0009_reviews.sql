-- Avis / témoignages sur les formations, avec modération.
--   status : 'pending' (soumis, en attente) → 'approved' (public) / 'rejected'
-- Soumission publique via RPC SECURITY DEFINER (statut forcé à 'pending').

create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  formation_id uuid references public.formations(id) on delete cascade,
  session_id   uuid references public.sessions(id) on delete set null,
  author_name  text not null,
  author_role  text,
  rating       int not null check (rating between 1 and 5),
  comment      text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now()
);
create index if not exists reviews_formation_idx on public.reviews (formation_id, status, created_at desc);

alter table public.reviews enable row level security;

-- Lecture : avis approuvés visibles de tous ; l'admin voit tout.
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select
  using (status = 'approved' or public.is_admin());

-- Écriture directe (update/delete/insert) : admin uniquement.
drop policy if exists reviews_write on public.reviews;
create policy reviews_write on public.reviews for all
  using (public.is_admin()) with check (public.is_admin());

-- Soumission publique : validée et forcée en 'pending' côté serveur.
create or replace function public.submit_review(
  p_formation_id uuid,
  p_session_id uuid,
  p_author_name text,
  p_author_role text,
  p_rating int,
  p_comment text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_author_name is null or length(trim(p_author_name)) < 2 then raise exception 'invalid_name'; end if;
  if p_comment is null or length(trim(p_comment)) < 5 then raise exception 'invalid_comment'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'invalid_rating'; end if;

  insert into public.reviews (formation_id, session_id, author_name, author_role, rating, comment, status)
  values (
    p_formation_id,
    p_session_id,
    left(trim(p_author_name), 80),
    nullif(left(trim(coalesce(p_author_role, '')), 80), ''),
    p_rating,
    left(trim(p_comment), 1000),
    'pending'
  )
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.submit_review(uuid, uuid, text, text, int, text) to anon, authenticated, service_role;
