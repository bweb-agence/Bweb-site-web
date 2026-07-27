-- SEO pour sessions et formations (mêmes champs que les articles).
alter table public.sessions   add column if not exists seo_title       text;
alter table public.sessions   add column if not exists seo_description text;
alter table public.sessions   add column if not exists focus_keyword   text;
alter table public.formations add column if not exists seo_title       text;
alter table public.formations add column if not exists seo_description text;
alter table public.formations add column if not exists focus_keyword   text;
