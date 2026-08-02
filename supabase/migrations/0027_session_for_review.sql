-- =========================================================
-- Lecture d'une session pour la page d'avis publique.
-- Les avis se récoltent APRÈS la formation : la session est alors souvent
-- « archived » (formation terminée), or la RLS anon ne montre que
-- published/full → le lien /avis/[session] renvoyait « introuvable ».
-- Cette fonction SECURITY DEFINER contourne la RLS et autorise aussi
-- « archived » (jamais les brouillons), pour que le lien d'avis marche
-- même une fois la session passée/archivée.
-- =========================================================
create or replace function public.session_for_review(p_slug text)
returns table (id uuid, formation_id uuid, title text, starts_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.formation_id, s.title, s.starts_at
  from public.sessions s
  where s.slug = p_slug
    and s.status in ('published', 'full', 'archived')
  limit 1;
$$;

grant execute on function public.session_for_review(text) to anon, authenticated, service_role;
