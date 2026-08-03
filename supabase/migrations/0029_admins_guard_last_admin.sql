-- =========================================================
-- Invariant : il doit toujours rester AU MOINS UN admin.
-- Empêche (en base, pas seulement dans l'UI) de supprimer ou de rétrograder
-- le dernier compte de rôle 'admin' — sinon plus personne ne peut administrer.
-- =========================================================
create or replace function public.prevent_last_admin_removal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_others int;
begin
  if tg_op = 'DELETE' and old.role = 'admin' then
    select count(*) into v_others from public.admins where role = 'admin' and email <> old.email;
    if v_others = 0 then raise exception 'last_admin' using errcode = 'P0001'; end if;
    return old;
  elsif tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin' then
    select count(*) into v_others from public.admins where role = 'admin' and email <> old.email;
    if v_others = 0 then raise exception 'last_admin' using errcode = 'P0001'; end if;
    return new;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_prevent_last_admin on public.admins;
create trigger trg_prevent_last_admin
  before delete or update on public.admins
  for each row execute function public.prevent_last_admin_removal();
