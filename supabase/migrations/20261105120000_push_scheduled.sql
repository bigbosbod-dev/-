-- One-off scheduled pushes (e.g. "Pomodoro finished"), so they arrive even while the
-- phone is locked and iOS has suspended the web app. One pending timer per user.
create table private.push_scheduled (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'timer',
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);
create index on private.push_scheduled (fire_at);
alter table private.push_scheduled enable row level security;

-- Every 10 seconds, but only call the edge function when something is actually due.
select cron.schedule('studyflow-push-scheduled', '10 seconds', $job$
  select net.http_post(
    url := 'https://tuubosxebiolhuqsqwoo.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select cron_secret from private.push_config where id = 1)),
    body := '{"action":"run-scheduled"}'::jsonb,
    timeout_milliseconds := 20000)
  where exists (select 1 from private.push_scheduled where fire_at <= now());
$job$);
