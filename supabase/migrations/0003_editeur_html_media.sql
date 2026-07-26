-- =========================================================
-- Éditeur riche (WYSIWYG) : contenu HTML + bucket médias public
-- Le Markdown existant (body_md / description_md) reste en repli.
-- =========================================================

-- Contenu riche HTML produit par l'éditeur (TipTap).
alter table public.posts        add column if not exists body_html        text;
alter table public.formations   add column if not exists description_html text;
alter table public.sessions     add column if not exists description_html text;

-- Bucket public pour les images insérées dans l'éditeur (et couvertures).
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Lecture publique des médias ; écriture/suppression réservées aux admins.
drop policy if exists "media_public_read"  on storage.objects;
drop policy if exists "media_admin_write"  on storage.objects;
drop policy if exists "media_admin_update" on storage.objects;
drop policy if exists "media_admin_delete" on storage.objects;

create policy "media_public_read" on storage.objects for select
  using (bucket_id = 'media');
create policy "media_admin_write" on storage.objects for insert
  with check (bucket_id = 'media' and public.is_admin());
create policy "media_admin_update" on storage.objects for update
  using (bucket_id = 'media' and public.is_admin());
create policy "media_admin_delete" on storage.objects for delete
  using (bucket_id = 'media' and public.is_admin());
