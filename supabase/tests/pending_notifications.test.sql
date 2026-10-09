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

-- ===== [B] invitations and friend requests (added in Task 4) =====
-- ===== [C] habits and morning summary (added in Task 5) =====

select 'ALL TESTS PASSED' as result;
rollback;
