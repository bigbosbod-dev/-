-- Private bucket for classroom photos. Files live at <user id>/<photo id>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-photos', 'class-photos', false, 1048576, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "Users can read their own class photos" on storage.objects for select to authenticated
  using (bucket_id = 'class-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can upload their own class photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'class-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can update their own class photos" on storage.objects for update to authenticated
  using (bucket_id = 'class-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'class-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete their own class photos" on storage.objects for delete to authenticated
  using (bucket_id = 'class-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
