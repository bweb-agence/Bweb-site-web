-- Statut « Bientôt » au niveau formation : la formation apparaît au catalogue
-- même sans date publiée, avec un CTA « être prévenu » au lieu de « réserver ».
alter table formations add column if not exists coming_soon boolean not null default false;
comment on column formations.coming_soon is 'Formation « bientôt » : visible au catalogue même sans date publiée, avec CTA « être prévenu ».';
