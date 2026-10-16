-- 013: the Home arc measures today's plan, not just habits.
--
-- Run 011 and 012 first if they have not been applied yet; migrations are in order.
--
-- Two changes:
--   1. Tasks get a day and a completion time, so the arc can tell "due today", "overdue"
--      and "finished today" apart.
--   2. Habits get a cadence, so a supplement can be every two days and training can be
--      Mon/Wed/Fri. This also retires the client-side hardcode that made every weekly
--      habit fall on a Monday.

-- Tasks -----------------------------------------------------------------------

-- Null means backlog: a task that was never planned for any day, and so can never be
-- incomplete on one. A plain date, not timestamptz: it is written from the device's
-- local day and compared against the local day, so a point in time would only invite
-- timezone drift.
alter table public.tasks add column if not exists due_date date;

-- Required by the roll-forward rule. With only `done`, a task dated yesterday and
-- finished today would leave the denominator instead of moving into the numerator, so
-- completing it would hold the arc flat instead of raising it.
alter table public.tasks add column if not exists completed_at timestamptz;

-- Existing done tasks have no recorded completion time. Leaving them null is correct:
-- they also have no due_date, so they are backlog and the arc ignores them entirely.

-- Habits ----------------------------------------------------------------------

-- frequency now takes 'daily', 'interval' or 'weekdays'.
alter table public.habits add column if not exists interval_days smallint;
alter table public.habits add column if not exists start_date date;
alter table public.habits add column if not exists weekdays smallint[];

-- Fold the old 'weekly' into the weekday set, pinned to Monday, which is exactly what
-- the client did before (day === 1 in useHabits). Behaviour-preserving on purpose: no
-- past streak, heatmap or perfect-day count changes meaning.
update public.habits
set frequency = 'weekdays',
    weekdays = array[1]::smallint[]
where frequency = 'weekly';

alter table public.habits
  drop constraint if exists habits_frequency_check;
alter table public.habits
  add constraint habits_frequency_check
  check (frequency in ('daily', 'interval', 'weekdays'));

-- An interval needs both of its parts, and a weekday set needs at least one day.
alter table public.habits
  drop constraint if exists habits_cadence_complete;
alter table public.habits
  add constraint habits_cadence_complete
  check (
    (frequency = 'daily')
    or (frequency = 'interval' and interval_days is not null and interval_days > 0 and start_date is not null)
    or (frequency = 'weekdays' and weekdays is not null and array_length(weekdays, 1) >= 1)
  );

-- Due-ness in SQL -------------------------------------------------------------

-- Mirrors isDueOn() in src/lib/cadence.ts. Change one and you must change the other;
-- nothing crosses that boundary to catch a drift.
create or replace function public.habit_due_on(
  p_frequency text,
  p_interval_days smallint,
  p_start_date date,
  p_weekdays smallint[],
  p_on date
) returns boolean
language sql
immutable
as $$
  select case p_frequency
    when 'daily' then true
    when 'interval' then
      p_start_date is not null
      and p_interval_days is not null
      and p_interval_days > 0
      and p_on >= p_start_date
      and ((p_on - p_start_date) % p_interval_days) = 0
    when 'weekdays' then
      p_weekdays is not null
      and extract(dow from p_on)::smallint = any(p_weekdays)
    else false
  end;
$$;

-- No RLS changes: both tables already carry
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id)
-- from 001, which covers the new columns.

-- Notifications follow the cadence --------------------------------------------

-- Redefines the notification rules from 011. Only the two habit due-ness predicates
-- change: both said "daily, or weekly on a Monday", which is the rule 013 replaces.
-- Without this an every-2-days supplement would send a reminder on its off day, and
-- the morning summary would count habits the arc does not.
--
-- IMPORTANT: this replaces pending_notifications_BASE, not pending_notifications.
-- Migration 012 renamed 011's function to _base and made pending_notifications a thin
-- wrapper that unions the base rules with the "someone joined your open plan" branch.
-- Replacing the wrapper here would silently delete that branch and leave the orphaned
-- base still carrying the old weekly-on-Monday rule.
do $
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'pending_notifications_base' and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'Run 012_open_plans.sql before this migration: pending_notifications_base does not exist yet.';
  end if;
end $;

-- The rest of the body is 011 verbatim; a function has to be replaced whole.
create or replace function public.pending_notifications_base(p_now timestamptz default now())
returns table (user_id uuid, kind text, reference_id text, title text, body text, url text, tag text)
language sql
stable
security definer
set search_path = public
as $$
  with
  -- users who can receive anything: they have at least one device
  u as (
    select p.user_id, p.timezone,
           np.calendar_reminders, np.plan_reminders,
           np.plan_invites, np.friend_requests,
           np.habit_reminders, np.morning_summary, np.morning_summary_time,
           (p_now at time zone p.timezone) as local_now
    from public.profiles p
    join public.notification_preferences np on np.user_id = p.user_id
    where exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
      -- defence in depth: one unrecognised time zone must never fail the whole run
      and p.timezone in (select tz.name from pg_catalog.pg_timezone_names tz)
  ),

  -- [A] reminders for calendar events and plans
  cal_items as (
    select u.user_id, 'calendar'::text as kind, ce.id::text as item_id, ce.title, ce.date, ce.time,
           u.timezone,
           coalesce(ce.alerts, case when ce.time is null then '{0}'::int[] else '{15}'::int[] end) as alerts,
           null::text as with_names
    from public.calendar_events ce
    join u on u.user_id = ce.user_id
    where u.calendar_reminders
  ),
  plan_items as (
    select u.user_id, 'plan'::text as kind, sp.id::text as item_id, sp.title, sp.date, sp.time,
           u.timezone,
           coalesce(pm.alerts, sp.alerts, case when sp.time is null then '{0}'::int[] else '{60}'::int[] end) as alerts,
           (select string_agg(t.n, ', ') from (
              select coalesce(nullif(pr.name, ''), '@' || un.username, 'Someone') as n
              from public.plan_members m2
              left join public.profiles pr on pr.user_id = m2.user_id
              left join public.usernames un on un.user_id = m2.user_id
              where m2.plan_id = sp.id and m2.user_id <> pm.user_id and m2.rsvp <> 'declined'
              order by m2.joined_at
              limit 2
            ) t) as with_names
    from public.plan_members pm
    join public.shared_plans sp on sp.id = pm.plan_id
    join u on u.user_id = pm.user_id
    where u.plan_reminders
      and pm.rsvp <> 'declined'
      and sp.status not in ('cancelled', 'completed')
      and sp.date is not null
  ),
  items as (
    select * from cal_items
    union all
    select * from plan_items
  ),
  -- one row per (item, alert offset); date-only items start at 09:00 local time
  alert_rows as (
    select i.*, ao.minutes as offset_min,
           ((i.date + coalesce(i.time, time '09:00')) at time zone i.timezone) as start_at
    from items i
    cross join lateral unnest(i.alerts) as ao(minutes)
  ),
  reminders as (
    select r.user_id, r.kind,
           r.kind || ':' || r.item_id || ':' || to_char(r.start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') || ':' || r.offset_min as reference_id,
           (case when r.offset_min = 0 and r.time is null then 'Today'
                 when r.offset_min = 0 then 'Now'
                 when r.offset_min < 60 then 'In ' || r.offset_min || ' min'
                 when r.offset_min = 60 then 'In 1 hour'
                 when r.offset_min < 1440 then 'In ' || (r.offset_min / 60) || ' hours'
                 when r.offset_min = 1440 then 'Tomorrow'
                 when r.offset_min = 2880 then 'In 2 days'
                 else 'In 1 week' end) as title,
           r.title || coalesce(' at ' || to_char(r.time, 'HH24:MI'), '') || coalesce(' with ' || r.with_names, '') as body,
           (case when r.kind = 'plan' then '/social/plan/' || r.item_id else '/calendar' end) as url,
           (r.kind || '-' || r.item_id) as tag
    from alert_rows r
    where r.start_at - make_interval(mins => r.offset_min) <= p_now
      and p_now < case when r.offset_min = 0
                       then r.start_at + interval '15 minutes'
                       else least(r.start_at - make_interval(mins => r.offset_min) + interval '15 minutes', r.start_at)
                  end
  ),

  invite_due as (
    select u.user_id, 'invite'::text as kind, pm.plan_id::text as reference_id,
           'New plan invitation'::text as title,
           coalesce(nullif(cp.name, ''), '@' || cun.username, 'Someone') || ' invited you to ' || sp.title as body,
           ('/social/plan/' || sp.id::text) as url,
           ('invite-' || sp.id::text) as tag
    from public.plan_members pm
    join public.shared_plans sp on sp.id = pm.plan_id
    join u on u.user_id = pm.user_id
    left join public.profiles cp on cp.user_id = sp.creator_id
    left join public.usernames cun on cun.user_id = sp.creator_id
    where u.plan_invites
      and pm.rsvp = 'pending'
      and pm.user_id <> sp.creator_id
      and pm.joined_at <= p_now
      and pm.joined_at > p_now - interval '15 minutes'
  ),
  friend_due as (
    select u.user_id, 'friend'::text as kind, f.id::text as reference_id,
           'New friend request'::text as title,
           coalesce(nullif(rp.name, ''), '@' || ru.username, 'Someone') || ' wants to be friends' as body,
           '/social'::text as url,
           ('friend-' || f.id::text) as tag
    from public.friendships f
    join u on u.user_id = f.addressee_id
    left join public.profiles rp on rp.user_id = f.requester_id
    left join public.usernames ru on ru.user_id = f.requester_id
    where u.friend_requests
      and f.status = 'pending'
      and f.created_at <= p_now
      and f.created_at > p_now - interval '15 minutes'
  ),
  -- habits still open AND due today, by the same cadence rule the app uses
  open_habits as (
    select u.user_id, u.local_now, h.name, h.created_at
    from u
    join public.habits h on h.user_id = u.user_id
    where public.habit_due_on(h.frequency, h.interval_days, h.start_date, h.weekdays, u.local_now::date)
      and not exists (
        select 1 from public.completions c where c.habit_id = h.id and c.date = u.local_now::date
      )
  ),
  habit_agg as (
    select x.user_id, count(*) as n,
           string_agg(x.name, ', ' order by x.created_at) filter (where x.rn <= 3) as names
    from (
      select o.*, row_number() over (partition by o.user_id order by o.created_at) as rn
      from open_habits o
    ) x
    group by x.user_id
  ),
  -- each habit has its own reminder time; habits that share a time arrive as one notification
  habit_slots as (
    select u.user_id, u.local_now, h.reminder_time, h.name, h.created_at,
           row_number() over (partition by u.user_id, h.reminder_time order by h.created_at) as rn
    from u
    join public.habits h on h.user_id = u.user_id
    where u.habit_reminders
      and h.reminder_time is not null
      and public.habit_due_on(h.frequency, h.interval_days, h.start_date, h.weekdays, u.local_now::date)
      and not exists (
        select 1 from public.completions c where c.habit_id = h.id and c.date = u.local_now::date
      )
      and u.local_now >= (u.local_now::date + h.reminder_time)
      and u.local_now <  (u.local_now::date + h.reminder_time) + interval '30 minutes'
  ),
  habit_due as (
    select s.user_id, 'habit'::text as kind,
           ((s.local_now::date)::text || ':' || to_char(s.reminder_time, 'HH24:MI')) as reference_id,
           'Habit reminder'::text as title,
           case when count(*) = 1 then max(s.name)
                else count(*) || ' habits: ' || string_agg(s.name, ', ' order by s.created_at) filter (where s.rn <= 3)
                     || case when count(*) > 3 then ' +' || (count(*) - 3) || ' more' else '' end
           end as body,
           '/habits'::text as url,
           ('habit-' || s.local_now::date::text || '-' || to_char(s.reminder_time, 'HH24MI')) as tag
    from habit_slots s
    group by s.user_id, s.local_now, s.reminder_time
  ),
  day_counts as (
    select u.user_id,
           (select count(*) from public.calendar_events ce
             where ce.user_id = u.user_id and ce.date = u.local_now::date)
           + (select count(*) from public.plan_members pm
               join public.shared_plans sp on sp.id = pm.plan_id
               where pm.user_id = u.user_id and pm.rsvp <> 'declined'
                 and sp.status not in ('cancelled', 'completed') and sp.date = u.local_now::date) as events,
           coalesce((select a.n from habit_agg a where a.user_id = u.user_id), 0) as habits
    from u
  ),
  morning_due as (
    select u.user_id, 'morning'::text as kind, (u.local_now::date)::text as reference_id,
           'Good morning'::text as title,
           concat_ws(' · ',
             case when c.events > 0 then c.events || (case when c.events = 1 then ' event' else ' events' end) || ' today' end,
             case when c.habits > 0 then c.habits || (case when c.habits = 1 then ' habit' else ' habits' end) || ' to go' end
           ) as body,
           '/'::text as url,
           ('morning-' || u.local_now::date::text) as tag
    from u
    join day_counts c on c.user_id = u.user_id
    where u.morning_summary
      and (c.events > 0 or c.habits > 0)
      and u.local_now >= (u.local_now::date + u.morning_summary_time)
      and u.local_now <  (u.local_now::date + u.morning_summary_time) + interval '30 minutes'
  ),

  all_due as (
    select * from reminders
    union all
    select * from invite_due
    union all
    select * from friend_due
    union all
    select * from habit_due
    union all
    select * from morning_due
  )
  select d.user_id, d.kind, d.reference_id, d.title, d.body, d.url, d.tag
  from all_due d
  where not exists (
    select 1 from public.notification_log nl
    where nl.user_id = d.user_id and nl.kind = d.kind and nl.reference_id = d.reference_id
  );
$$;


-- 010, 011 and 012 all pair the grant with a revoke. CREATE OR REPLACE keeps the
-- existing ACL, so this is belt and braces, but the pattern should not break here.
revoke all on function public.pending_notifications_base(timestamptz) from public, anon, authenticated;
grant execute on function public.pending_notifications_base(timestamptz) to service_role;
