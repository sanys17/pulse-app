-- Push notifications: schema. Run in the Supabase SQL Editor (idempotent where practical).

-- Time zone per user, refreshed by the app on open.
alter table public.profiles add column if not exists timezone text not null default 'UTC';

-- Per-item alert overrides: minutes before the start, at most 2; null = use the user's default, '{}' = none.
alter table public.calendar_events add column if not exists alerts int[];
alter table public.plan_members add column if not exists alerts int[];

alter table public.calendar_events drop constraint if exists calendar_events_alerts_valid;
alter table public.calendar_events add constraint calendar_events_alerts_valid
  check (alerts is null or (cardinality(alerts) <= 2 and alerts <@ array[0,5,10,15,30,60,120,1440,2880,10080]));

alter table public.plan_members drop constraint if exists plan_members_alerts_valid;
alter table public.plan_members add constraint plan_members_alerts_valid
  check (alerts is null or (cardinality(alerts) <= 2 and alerts <@ array[0,5,10,15,30,60,120,1440,2880,10080]));

-- Devices (one row per browser/phone).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Read own subscriptions" on public.push_subscriptions;
create policy "Read own subscriptions" on public.push_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "Delete own subscriptions" on public.push_subscriptions;
create policy "Delete own subscriptions" on public.push_subscriptions for delete using (auth.uid() = user_id);
-- No insert/update policy on purpose: devices register through register_push_subscription().

create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Only real push services; otherwise the sender could be pointed at any URL (SSRF).
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)(:443)?/' then
    raise exception 'invalid push endpoint';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- Preferences (one row per user).
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calendar_reminders boolean not null default true,
  event_alerts int[] not null default '{15}',
  plan_reminders boolean not null default true,
  plan_alerts int[] not null default '{60}',
  plan_invites boolean not null default true,
  friend_requests boolean not null default true,
  allday_alerts int[] not null default '{0}',
  habit_reminders boolean not null default true,
  habit_reminder_time time not null default '20:00',
  morning_summary boolean not null default true,
  morning_summary_time time not null default '07:00',
  created_at timestamptz not null default now(),
  constraint prefs_event_alerts_valid check (cardinality(event_alerts) <= 2 and event_alerts <@ array[0,5,10,15,30,60,120,1440,2880,10080]),
  constraint prefs_plan_alerts_valid check (cardinality(plan_alerts) <= 2 and plan_alerts <@ array[0,5,10,15,30,60,120,1440,2880,10080]),
  constraint prefs_allday_alerts_valid check (cardinality(allday_alerts) <= 2 and allday_alerts <@ array[0,1440,2880,10080])
);
alter table public.notification_preferences enable row level security;
drop policy if exists "Read own preferences" on public.notification_preferences;
create policy "Read own preferences" on public.notification_preferences for select using (auth.uid() = user_id);
drop policy if exists "Insert own preferences" on public.notification_preferences;
create policy "Insert own preferences" on public.notification_preferences for insert with check (auth.uid() = user_id);
drop policy if exists "Update own preferences" on public.notification_preferences;
create policy "Update own preferences" on public.notification_preferences for update using (auth.uid() = user_id);

-- Existing users get a row now; new users get one from a trigger.
insert into public.notification_preferences (user_id) select user_id from public.profiles on conflict (user_id) do nothing;

create or replace function public.handle_new_profile_preferences() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_preferences (user_id) values (new.user_id) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_profile_created_preferences on public.profiles;
create trigger on_profile_created_preferences after insert on public.profiles
  for each row execute function public.handle_new_profile_preferences();

-- Sent log: server only (RLS on, no policies). The primary key makes "claim" atomic.
create table if not exists public.notification_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  reference_id text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, reference_id)
);
alter table public.notification_log enable row level security;

create or replace function public.cleanup_notification_log() returns void
language sql security definer set search_path = public as $$
  delete from public.notification_log where sent_at < now() - interval '3 days';
$$;
revoke all on function public.cleanup_notification_log() from public, anon, authenticated;
grant execute on function public.cleanup_notification_log() to service_role;

-- A bad time zone string would make pending_notifications() fail for everyone. Reject it on write.
create or replace function public.validate_profile_timezone() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid time zone: %', new.timezone;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_profile_timezone on public.profiles;
create trigger validate_profile_timezone before insert or update of timezone on public.profiles
  for each row execute function public.validate_profile_timezone();
