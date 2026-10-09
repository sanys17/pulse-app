-- pending_notifications: everything that is due right now, minus what was already sent.
-- Server only (service role). p_now exists so tests can use a fake clock.
create or replace function public.pending_notifications(p_now timestamptz default now())
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
           np.calendar_reminders, np.event_alerts, np.plan_reminders, np.plan_alerts,
           np.plan_invites, np.friend_requests, np.allday_alerts,
           np.habit_reminders, np.habit_reminder_time, np.morning_summary, np.morning_summary_time,
           (p_now at time zone p.timezone) as local_now
    from public.profiles p
    join public.notification_preferences np on np.user_id = p.user_id
    where exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
  ),

  -- [A] reminders for calendar events and plans
  cal_items as (
    select u.user_id, 'calendar'::text as kind, ce.id::text as item_id, ce.title, ce.date, ce.time,
           u.timezone,
           coalesce(ce.alerts, case when ce.time is null then u.allday_alerts else u.event_alerts end) as alerts,
           null::text as with_names
    from public.calendar_events ce
    join u on u.user_id = ce.user_id
    where u.calendar_reminders
  ),
  plan_items as (
    select u.user_id, 'plan'::text as kind, sp.id::text as item_id, sp.title, sp.date, sp.time,
           u.timezone,
           coalesce(pm.alerts, case when sp.time is null then u.allday_alerts else u.plan_alerts end) as alerts,
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
  -- [C-ctes] habit reminders and the morning summary are added here (Task 5)

  all_due as (
    select * from reminders
    union all
    select * from invite_due
    union all
    select * from friend_due
    -- [C-union]
  )
  select d.user_id, d.kind, d.reference_id, d.title, d.body, d.url, d.tag
  from all_due d
  where not exists (
    select 1 from public.notification_log nl
    where nl.user_id = d.user_id and nl.kind = d.kind and nl.reference_id = d.reference_id
  );
$$;

-- Only the server (service role) may call it; otherwise any signed-in user could read everyone's reminders.
revoke all on function public.pending_notifications(timestamptz) from public, anon, authenticated;
grant execute on function public.pending_notifications(timestamptz) to service_role;
