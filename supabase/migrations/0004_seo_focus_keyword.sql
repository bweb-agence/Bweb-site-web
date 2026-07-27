-- Mot-clé cible pour l'analyse SEO des articles (façon Yoast/RankMath).
alter table public.posts add column if not exists focus_keyword text;
