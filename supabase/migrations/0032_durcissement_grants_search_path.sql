-- 0032 — Durcissement (defense-in-depth)
-- -----------------------------------------------------------------------------
-- 1) Retire l'EXECUTE public/anon sur les RPC réservées à l'admin/staff.
--    Ces fonctions se protègent déjà en interne (is_admin()/is_staff()), donc
--    elles n'étaient pas exploitables ; on supprime néanmoins leur exposition
--    inutile via l'API REST au rôle `anon` (non authentifié).
--    On CONSERVE `authenticated` : l'UI admin appelle confirm_booking (browser)
--    et create_manual_booking (JWT de l'appelant) en tant qu'utilisateur connecté ;
--    le garde-fou interne bloque les non-admins.
REVOKE EXECUTE ON FUNCTION public.confirm_booking(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_manual_booking(uuid, integer, text, text, text, text, text, integer) FROM anon, public;

-- 2) Fige le search_path du trigger touch_updated_at (lint 0011).
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
