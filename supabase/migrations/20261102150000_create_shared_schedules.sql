-- Read-only schedule sharing: one share link per user.
create table public.shared_schedules (
  id text primary key check (id ~ '^[A-Za-z0-9]{10,32}$'),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  owner_name text not null default '' check (char_length(owner_name) <= 50),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 262144),
  updated_at timestamptz not null default now()
);
alter table public.shared_schedules enable row level security;
-- No public select policy: links can't be listed; viewers read one row via get_shared_schedule().
create policy "Owners can read their share" on public.shared_schedules for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners can create their share" on public.shared_schedules for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners can update their share" on public.shared_schedules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners can delete their share" on public.shared_schedules for delete to authenticated using ((select auth.uid()) = user_id);

create function public.get_shared_schedule(share_id text)
returns table (owner_name text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$ select s.owner_name, s.data, s.updated_at from public.shared_schedules s where s.id = share_id; $$;
revoke all on function public.get_shared_schedule(text) from public;
grant execute on function public.get_shared_schedule(text) to anon, authenticated;
