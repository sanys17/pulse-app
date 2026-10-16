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
