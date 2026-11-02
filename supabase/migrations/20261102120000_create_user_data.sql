-- One row per user holding the whole StudyFlow data blob (same shape as the backup file)
create table public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;
create policy "Users can read their own data" on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own data" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own data" on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own data" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);
alter table public.user_data add constraint user_data_size check (pg_column_size(data) < 1048576);
