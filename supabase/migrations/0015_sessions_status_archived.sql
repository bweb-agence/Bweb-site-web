-- Ajoute le statut « archived » aux sessions.
-- Une session archivée (formation terminée) reste en base mais n'est plus
-- affichée au public (les pages filtrent status IN ('published','full')).
alter table sessions drop constraint if exists sessions_status_check;
alter table sessions add constraint sessions_status_check
  check (status = any (array['draft'::text, 'published'::text, 'full'::text, 'cancelled'::text, 'archived'::text]));
