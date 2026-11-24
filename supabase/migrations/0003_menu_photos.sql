-- Menu photos: one photo per menu item, shown on the till and the menu pages.
-- Photos live in a public storage bucket "menu"; only the owner and managers can upload.
-- Safe to run more than once.
begin;

alter table public.menu_items add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu', 'menu', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "mgr upload menu photos" on storage.objects;
drop policy if exists "mgr change menu photos" on storage.objects;
drop policy if exists "mgr delete menu photos" on storage.objects;
create policy "mgr upload menu photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu' and public.is_manager());
create policy "mgr change menu photos" on storage.objects for update to authenticated
  using (bucket_id = 'menu' and public.is_manager());
create policy "mgr delete menu photos" on storage.objects for delete to authenticated
  using (bucket_id = 'menu' and public.is_manager());

commit;
