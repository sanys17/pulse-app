-- Run the WHOLE file in the Supabase SQL Editor. Success: the last result shows ALL TESTS PASSED.
-- It creates fixture users and rolls everything back. If the auth.users insert complains about a
-- NOT NULL column, add that column with a dummy value (e.g. instance_id, aud, role).
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@pulse-test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@pulse-test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'c@pulse-test.local');

update public.profiles set timezone = 'Europe/Prague'
  where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003');

-- A and B have a device; C has none.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'https://push.test/a', 'k', 'a'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'https://push.test/b', 'k', 'a');

create function pg_temp.cnt(p_now timestamptz, p_user uuid, p_kind text) returns int
language sql as $$
  select count(*)::int from public.pending_notifications(p_now) where user_id = p_user and kind = p_kind
$$;

-- ===== [A] calendar events and plans =====
insert into public.calendar_events (user_id, title, date, time, alerts) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'E1', '2026-10-20', '10:00', null),     -- default {15}; 10:00 CEST = 08:00Z
  ('aaaaaaaa-0000-0000-0000-000000000001', 'E2', '2026-10-21', '12:00', '{60,15}'),-- 10:00Z; alerts 09:00Z and 09:45Z
  ('aaaaaaaa-0000-0000-0000-000000000001', 'E3', '2026-10-22', '14:00', '{}'),     -- none
  ('aaaaaaaa-0000-0000-0000-000000000001', 'E4', '2026-10-23', '16:00', '{0}'),    -- at time: 14:00Z
  ('aaaaaaaa-0000-0000-0000-000000000001', 'E5', '2026-10-24', null, null),        -- date only, default {0}: 09:00 CEST = 07:00Z
  ('aaaaaaaa-0000-0000-0000-000000000001', 'E6', '2026-10-26', null, '{1440}'),     -- alert 2026-10-25 09:00 CET = 08:00Z (clocks changed that night)
  ('aaaaaaaa-0000-0000-0000-000000000001', 'E7', '2026-10-27', '10:00', null),     -- CET: 09:00Z, alert 08:45Z
  ('aaaaaaaa-0000-0000-0000-000000000003', 'EC', '2026-10-20', '10:00', null);     -- C has no device

do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; begin
  -- E1: default 15 minutes before
  assert pg_temp.cnt('2026-10-20 07:44:59+00', a, 'calendar') = 0, 'E1 too early';
  assert pg_temp.cnt('2026-10-20 07:45:00+00', a, 'calendar') = 1, 'E1 at alert time';
  assert pg_temp.cnt('2026-10-20 07:59:00+00', a, 'calendar') = 1, 'E1 late but before start';
  assert pg_temp.cnt('2026-10-20 08:00:00+00', a, 'calendar') = 0, 'E1 must not alert after start';
  -- E2: two alerts, nothing between them
  assert pg_temp.cnt('2026-10-21 09:00:00+00', a, 'calendar') = 1, 'E2 first alert (1 hour)';
  assert pg_temp.cnt('2026-10-21 09:30:00+00', a, 'calendar') = 0, 'E2 between alerts';
  assert pg_temp.cnt('2026-10-21 09:45:00+00', a, 'calendar') = 1, 'E2 second alert (15 min)';
  -- E3: empty array means none (not "use default")
  assert pg_temp.cnt('2026-10-22 11:45:00+00', a, 'calendar') = 0, 'E3 none';
  -- E4: at time of event, 15 minutes of catch-up after the start
  assert pg_temp.cnt('2026-10-23 13:59:00+00', a, 'calendar') = 0, 'E4 before';
  assert pg_temp.cnt('2026-10-23 14:00:00+00', a, 'calendar') = 1, 'E4 at start';
  assert pg_temp.cnt('2026-10-23 14:14:00+00', a, 'calendar') = 1, 'E4 catch-up';
  assert pg_temp.cnt('2026-10-23 14:15:00+00', a, 'calendar') = 0, 'E4 expired';
  -- E5: date-only, on the day at 09:00 local
  assert pg_temp.cnt('2026-10-24 06:59:00+00', a, 'calendar') = 0, 'E5 before 9:00';
  assert pg_temp.cnt('2026-10-24 07:00:00+00', a, 'calendar') = 1, 'E5 at 9:00';
  assert pg_temp.cnt('2026-10-24 07:15:00+00', a, 'calendar') = 0, 'E5 expired';
  -- E6: 1 day before at 09:00 across the DST change (09:00 on 10-25 is CET = 08:00Z)
  assert pg_temp.cnt('2026-10-25 07:00:00+00', a, 'calendar') = 0, 'E6 DST: must not fire at 07:00Z';
  assert pg_temp.cnt('2026-10-25 08:00:00+00', a, 'calendar') = 1, 'E6 DST: fires at 08:00Z';
  -- E7: ordinary winter-time event; a fixed +02:00 would fire an hour early
  assert pg_temp.cnt('2026-10-27 07:45:00+00', a, 'calendar') = 0, 'E7 DST: must not fire at 07:45Z';
  assert pg_temp.cnt('2026-10-27 08:45:00+00', a, 'calendar') = 1, 'E7 fires at 08:45Z';
  -- a user without a device gets nothing
  assert pg_temp.cnt('2026-10-20 07:45:00+00', 'aaaaaaaa-0000-0000-0000-000000000003', 'calendar') = 0, 'C has no device';
end $$;

-- preference off, and the sent log prevents repeats
do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r record; begin
  select * into r from public.pending_notifications('2026-10-20 07:45:00+00') where user_id = a and kind = 'calendar';
  assert r.reference_id like 'calendar:%:2026-10-20T08:00:15', 'reference id format: ' || r.reference_id;
  assert r.title = 'In 15 min', 'title: ' || r.title;
  assert r.body = 'E1 at 10:00', 'body: ' || r.body;
  assert r.url = '/calendar', 'url';
  insert into public.notification_log (user_id, kind, reference_id) values (a, r.kind, r.reference_id);
  assert pg_temp.cnt('2026-10-20 07:46:00+00', a, 'calendar') = 0, 'logged item must not repeat';
  update public.notification_preferences set calendar_reminders = false where user_id = a;
  assert pg_temp.cnt('2026-10-21 09:00:00+00', a, 'calendar') = 0, 'switch off';
  update public.notification_preferences set calendar_reminders = true where user_id = a;
end $$;

-- plans: B creates, A is a member
insert into public.shared_plans (id, creator_id, title, date, time, status) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'P1', '2026-10-28', '18:00', 'planning'),   -- 17:00Z, default plan alert 60 -> 16:00Z
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'P2', '2026-10-29', '18:00', 'planning'),   -- A overrides to 15 min -> 16:45Z
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'P3', '2026-10-30', '18:00', 'cancelled'),  -- cancelled
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', 'P4', '2026-10-31', '18:00', 'planning'),   -- A declined
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002', 'P5', '2026-11-01', null, 'planning');      -- date only
insert into public.plan_members (plan_id, user_id, rsvp, alerts) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'going', null),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'pending', null),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'going', null),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'going', '{15}'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'going', null),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'declined', null),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'maybe', null);

do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r record; begin
  assert pg_temp.cnt('2026-10-28 15:59:00+00', a, 'plan') = 0, 'P1 too early';
  assert pg_temp.cnt('2026-10-28 16:00:00+00', a, 'plan') = 1, 'P1 default 1 hour before (pending members are reminded)';
  select * into r from public.pending_notifications('2026-10-28 16:00:00+00') where user_id = a and kind = 'plan';
  assert r.title = 'In 1 hour', 'plan title: ' || r.title;
  assert r.body like 'P1 at 18:00 with %', 'plan body names the other members: ' || r.body;
  assert r.url = '/social/plan/bbbbbbbb-0000-0000-0000-000000000001', 'plan url';
  -- per-member override beats the default
  assert pg_temp.cnt('2026-10-29 16:00:00+00', a, 'plan') = 0, 'P2 override: default must not fire';
  assert pg_temp.cnt('2026-10-29 16:45:00+00', a, 'plan') = 1, 'P2 override fires 15 min before';
  -- cancelled, declined are skipped
  assert pg_temp.cnt('2026-10-30 16:00:00+00', a, 'plan') = 0, 'P3 cancelled';
  assert pg_temp.cnt('2026-10-31 16:00:00+00', a, 'plan') = 0, 'P4 declined';
  -- date-only plan uses the date-only default (on the day at 09:00 CET = 08:00Z)
  assert pg_temp.cnt('2026-11-01 08:00:00+00', a, 'plan') = 1, 'P5 date-only';
end $$;

-- plan-level alert (set by the creator) and a member's own override
insert into public.shared_plans (id, creator_id, title, date, time, status, alerts) values
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002', 'P6', '2026-11-08', '18:00', 'planning', '{30}'),
  ('bbbbbbbb-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000002', 'P7', '2026-11-10', '18:00', 'planning', '{30}');
insert into public.plan_members (plan_id, user_id, rsvp, alerts) values
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'going', null),
  ('bbbbbbbb-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'going', '{5}');
do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; begin
  -- P6: no member override, so the plan's alert (30 min before 17:00Z = 16:30Z) applies, not the built-in 60
  assert pg_temp.cnt('2026-11-08 16:00:00+00', a, 'plan') = 0, 'P6: built-in 60 must not apply when the plan has an alert';
  assert pg_temp.cnt('2026-11-08 16:30:00+00', a, 'plan') = 1, 'P6: plan alert 30 minutes before';
  -- P7: the member override (5 min -> 16:55Z) beats the plan alert
  assert pg_temp.cnt('2026-11-10 16:30:00+00', a, 'plan') = 0, 'P7: plan alert must not fire when the member overrides';
  assert pg_temp.cnt('2026-11-10 16:55:00+00', a, 'plan') = 1, 'P7: member override fires';
end $$;

-- ===== [B] invitations and friend requests =====
insert into public.shared_plans (id, creator_id, title, date, time, status) values
  ('bbbbbbbb-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000002', 'Dinner', null, null, 'planning');
insert into public.plan_members (plan_id, user_id, rsvp, joined_at) values
  ('bbbbbbbb-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000002', 'going', '2026-11-05 10:00:00+00'),
  ('bbbbbbbb-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'pending', '2026-11-05 10:00:00+00');

do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; b constant uuid := 'aaaaaaaa-0000-0000-0000-000000000002'; r record; begin
  assert pg_temp.cnt('2026-11-05 10:10:00+00', a, 'invite') = 1, 'invite within 15 minutes';
  select * into r from public.pending_notifications('2026-11-05 10:10:00+00') where user_id = a and kind = 'invite';
  assert r.title = 'New plan invitation', 'invite title';
  assert r.body like '% invited you to Dinner', 'invite body: ' || r.body;
  assert r.url = '/social/plan/bbbbbbbb-0000-0000-0000-000000000010', 'invite url';
  assert pg_temp.cnt('2026-11-05 10:16:00+00', a, 'invite') = 0, 'invite expires after 15 minutes';
  assert pg_temp.cnt('2026-11-05 10:10:00+00', b, 'invite') = 0, 'creator is not invited to their own plan';
  update public.plan_members set rsvp = 'going' where plan_id = 'bbbbbbbb-0000-0000-0000-000000000010' and user_id = a;
  assert pg_temp.cnt('2026-11-05 10:10:00+00', a, 'invite') = 0, 'answered invitation is not announced';
  update public.plan_members set rsvp = 'pending' where plan_id = 'bbbbbbbb-0000-0000-0000-000000000010' and user_id = a;
  update public.notification_preferences set plan_invites = false where user_id = a;
  assert pg_temp.cnt('2026-11-05 10:10:00+00', a, 'invite') = 0, 'invites switched off';
  update public.notification_preferences set plan_invites = true where user_id = a;
end $$;

insert into public.friendships (requester_id, addressee_id, status, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'pending', '2026-11-06 11:00:00+00');

do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; b constant uuid := 'aaaaaaaa-0000-0000-0000-000000000002'; r record; begin
  assert pg_temp.cnt('2026-11-06 11:10:00+00', a, 'friend') = 1, 'friend request notifies the recipient';
  select * into r from public.pending_notifications('2026-11-06 11:10:00+00') where user_id = a and kind = 'friend';
  assert r.title = 'New friend request', 'friend title';
  assert r.body like '% wants to be friends', 'friend body: ' || r.body;
  assert r.url = '/social', 'friend url';
  assert pg_temp.cnt('2026-11-06 11:10:00+00', b, 'friend') = 0, 'requester is not notified';
  assert pg_temp.cnt('2026-11-06 11:16:00+00', a, 'friend') = 0, 'friend request expires after 15 minutes';
  update public.friendships set status = 'accepted' where addressee_id = a;
  assert pg_temp.cnt('2026-11-06 11:10:00+00', a, 'friend') = 0, 'accepted request is not announced';
  update public.friendships set status = 'pending' where addressee_id = a;
  update public.notification_preferences set friend_requests = false where user_id = a;
  assert pg_temp.cnt('2026-11-06 11:10:00+00', a, 'friend') = 0, 'friend requests switched off';
  update public.notification_preferences set friend_requests = true where user_id = a;
end $$;
-- ===== [C] habits and morning summary =====
insert into public.habits (id, user_id, name, icon, color, frequency, created_at, reminder_time) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Meditate', 'x', 'blue', 'daily',  '2026-01-01', '20:00'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Read',     'x', 'blue', 'daily',  '2026-01-02', '20:00'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Plan week','x', 'blue', 'weekly', '2026-01-03', '20:00'),
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Run',      'x', 'blue', 'daily',  '2026-01-04', '07:30'),
  ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Stretch',  'x', 'blue', 'daily',  '2026-01-05', null),
  ('cccccccc-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Journal',  'x', 'blue', 'daily',  '2026-01-06', '20:00'),
  ('cccccccc-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Walk',     'x', 'blue', 'daily',  '2026-01-07', '20:00');

do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r record; begin
  -- Monday 2026-11-02 (CET): 20:00 local = 19:00Z. Habits sharing a time arrive as ONE notification;
  -- the weekly habit counts on Monday; names are capped at 3. Run (07:30) and Stretch (no time) are not part of it.
  assert pg_temp.cnt('2026-11-02 18:59:00+00', a, 'habit') = 0, 'habit too early';
  assert pg_temp.cnt('2026-11-02 19:00:00+00', a, 'habit') = 1, 'one grouped notification at 20:00 local';
  select * into r from public.pending_notifications('2026-11-02 19:00:00+00') where user_id = a and kind = 'habit';
  assert r.body = '5 habits: Meditate, Read, Plan week +2 more', 'grouped body: ' || r.body;
  assert r.url = '/habits', 'habit url';
  assert r.reference_id = '2026-11-02:20:00', 'habit reference is local date and time: ' || r.reference_id;
  assert pg_temp.cnt('2026-11-02 19:29:00+00', a, 'habit') = 1, 'habit catch-up window';
  assert pg_temp.cnt('2026-11-02 19:30:00+00', a, 'habit') = 0, 'habit window expires after 30 minutes';
  -- a habit with its own earlier time is a separate notification
  select * into r from public.pending_notifications('2026-11-02 06:30:00+00') where user_id = a and kind = 'habit';
  assert r.body = 'Run', 'single habit body is just its name: ' || r.body;
  -- Tuesday: the weekly habit is not due
  select * into r from public.pending_notifications('2026-11-03 19:00:00+00') where user_id = a and kind = 'habit';
  assert r.body = '4 habits: Meditate, Read, Journal +1 more', 'tuesday body: ' || r.body;
  -- completions shrink the group; all done skips the reminder
  insert into public.completions (user_id, habit_id, date) values
    (a, 'cccccccc-0000-0000-0000-000000000001', '2026-11-03'), (a, 'cccccccc-0000-0000-0000-000000000002', '2026-11-03'),
    (a, 'cccccccc-0000-0000-0000-000000000006', '2026-11-03');
  select * into r from public.pending_notifications('2026-11-03 19:00:00+00') where user_id = a and kind = 'habit';
  assert r.body = 'Walk', 'one left: ' || r.body;
  insert into public.completions (user_id, habit_id, date) values (a, 'cccccccc-0000-0000-0000-000000000007', '2026-11-03');
  assert pg_temp.cnt('2026-11-03 19:00:00+00', a, 'habit') = 0, 'nothing left: no reminder';
  -- two different times, both inside their windows, are two notifications (Monday 2026-11-09, 20:20 local)
  update public.habits set reminder_time = '20:15' where id = 'cccccccc-0000-0000-0000-000000000006';
  assert pg_temp.cnt('2026-11-09 19:20:00+00', a, 'habit') = 2, 'two reminder times = two notifications';
  update public.habits set reminder_time = '20:00' where id = 'cccccccc-0000-0000-0000-000000000006';
  -- DST: Sunday 2026-10-25, clocks went back that night, so 20:00 local = 19:00Z (a fixed +02:00 would fire at 18:00Z)
  assert pg_temp.cnt('2026-10-25 18:00:00+00', a, 'habit') = 0, 'habit DST: not at 18:00Z';
  assert pg_temp.cnt('2026-10-25 19:00:00+00', a, 'habit') = 1, 'habit DST: at 19:00Z';
  -- late time near midnight: the window is cut at midnight, never wraps or errors
  update public.habits set reminder_time = '23:50' where id = 'cccccccc-0000-0000-0000-000000000001';
  assert pg_temp.cnt('2026-11-04 22:55:00+00', a, 'habit') = 1, 'late reminder at 23:55 local';
  assert pg_temp.cnt('2026-11-04 23:05:00+00', a, 'habit') = 0, '00:05 local next day: window ended';
  update public.habits set reminder_time = '20:00' where id = 'cccccccc-0000-0000-0000-000000000001';
  -- a habit without a reminder time is never reminded
  update public.habits set reminder_time = null where user_id = a;
  assert pg_temp.cnt('2026-11-02 19:00:00+00', a, 'habit') = 0, 'no reminder time, no notification';
  update public.habits set reminder_time = '20:00' where user_id = a and name in ('Meditate','Read','Plan week','Journal','Walk');
  update public.habits set reminder_time = '07:30' where id = 'cccccccc-0000-0000-0000-000000000004';
  update public.notification_preferences set habit_reminders = false where user_id = a;
  assert pg_temp.cnt('2026-11-02 19:00:00+00', a, 'habit') = 0, 'habit reminders switched off';
  update public.notification_preferences set habit_reminders = true where user_id = a;
end $$;

-- morning summary: Tuesday 2026-11-03, 07:00 local = 06:00Z; one event today, 6 open daily habits (with or without a reminder time; completions above are cleared first)
delete from public.completions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.calendar_events (user_id, title, date, time) values ('aaaaaaaa-0000-0000-0000-000000000001', 'E8', '2026-11-03', '09:00');
do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; b constant uuid := 'aaaaaaaa-0000-0000-0000-000000000002'; r record; begin
  assert pg_temp.cnt('2026-11-03 05:59:00+00', a, 'morning') = 0, 'morning too early';
  select * into r from public.pending_notifications('2026-11-03 06:00:00+00') where user_id = a and kind = 'morning';
  assert r.body = '1 event today · 6 habits to go', 'morning body: ' || r.body;
  assert r.title = 'Good morning' and r.url = '/', 'morning title/url';
  assert pg_temp.cnt('2026-11-03 06:31:00+00', a, 'morning') = 0, 'morning window expires';
  -- nothing to say: no events, no habits (B has no habits, and no events on this date)
  assert pg_temp.cnt('2026-12-01 06:00:00+00', b, 'morning') = 0, 'nothing today: no summary';
  update public.notification_preferences set morning_summary = false where user_id = a;
  assert pg_temp.cnt('2026-11-03 06:00:00+00', a, 'morning') = 0, 'morning switched off';
  update public.notification_preferences set morning_summary = true where user_id = a;
end $$;

-- ===== [D] hardening (review findings) =====
-- Device registration only accepts real push-service endpoints (blocks server-side request forgery).
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
do $$ declare e text; rejected boolean; begin
  foreach e in array array[
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QAbc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc'
  ] loop
    perform public.register_push_subscription(e, 'k', 'a', 'ua');
  end loop;
  foreach e in array array[
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://evil.example/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com@evil.example/x',
    'https://evilfcm.googleapis.com/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://fcm.googleapis.com:8443/x'
  ] loop
    rejected := false;
    begin
      perform public.register_push_subscription(e, 'k', 'a', 'ua');
    exception when others then rejected := true;
    end;
    assert rejected, 'endpoint must be rejected: ' || e;
  end loop;
end $$;

-- A bad time zone is rejected when written, and a row that got in anyway cannot break everyone's reminders.
do $$ declare rejected boolean := false; begin
  begin
    update public.profiles set timezone = 'Not/AZone' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  exception when others then rejected := true;
  end;
  assert rejected, 'an invalid time zone must be rejected on write';
end $$;
alter table public.profiles disable trigger validate_profile_timezone;
update public.profiles set timezone = 'Foo/Bar' where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'; -- B has a device, so the row is actually evaluated
alter table public.profiles enable trigger validate_profile_timezone;
do $$ begin
  -- E2's first alert (09:00Z) has not been logged by the earlier dedupe test
  assert pg_temp.cnt('2026-10-21 09:00:00+00', 'aaaaaaaa-0000-0000-0000-000000000001', 'calendar') = 1,
    'one corrupt profile must not stop other users reminders';
end $$;

-- The cleanup job is callable by the server role, but not by clients.
do $$ begin
  assert has_function_privilege('service_role', 'public.cleanup_notification_log()', 'execute'), 'service_role may clean up';
  assert not has_function_privilege('authenticated', 'public.cleanup_notification_log()', 'execute'), 'clients may not';
end $$;

select 'ALL TESTS PASSED' as result;
rollback;
