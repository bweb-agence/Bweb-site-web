-- =========================================================
-- Bweb Agence — Durcissement sécurité (suite des avis du linter)
-- =========================================================

-- 1) search_path fixe sur les fonctions trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_session_likes()
returns trigger language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.target_type = 'session') then
    update public.sessions set likes_count = likes_count + 1 where id = new.target_id;
  elsif (tg_op = 'DELETE' and old.target_type = 'session') then
    update public.sessions set likes_count = greatest(0, likes_count - 1) where id = old.target_id;
  end if;
  return null;
end;
$$;

-- 2) La création de réservation ne doit PASSER QUE par le serveur (service_role),
--    afin d'empêcher un tiers de saturer l'inventaire via l'API publique.
revoke execute on function public.create_booking(uuid,int,text,text,text,text,text,text,text,boolean)
  from anon, authenticated;
revoke execute on function public.confirm_booking(uuid,int) from anon;
revoke execute on function public.cancel_booking(uuid) from anon;

-- 3) Favoris : via une RPC dédiée (dédup + compteur), on retire les policies « toujours vraies ».
drop policy if exists favorites_insert on public.favorites;
drop policy if exists favorites_delete on public.favorites;

create or replace function public.toggle_favorite(p_target_type text, p_target_id uuid, p_anon_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if p_target_type not in ('session','post') then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;
  select exists (select 1 from public.favorites
                 where target_type = p_target_type and target_id = p_target_id and anon_id = p_anon_id)
    into v_exists;
  if v_exists then
    delete from public.favorites
      where target_type = p_target_type and target_id = p_target_id and anon_id = p_anon_id;
    return jsonb_build_object('ok', true, 'favorited', false);
  else
    insert into public.favorites (target_type, target_id, anon_id)
      values (p_target_type, p_target_id, p_anon_id) on conflict do nothing;
    return jsonb_build_object('ok', true, 'favorited', true);
  end if;
end;
$$;
grant execute on function public.toggle_favorite(text,uuid,text) to anon, authenticated, service_role;

-- 4) Unicité (session, nom de tarif) — pour des seeds idempotents & éviter les doublons.
create unique index if not exists ticket_types_session_name_uidx
  on public.ticket_types (session_id, name);
