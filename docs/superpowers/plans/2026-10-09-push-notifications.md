# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliable Web Push for Pulse (calendar event and plan reminders with Apple-style alerts, plan invitations, friend requests, habit reminders, morning summary), configurable in Settings.

**Architecture:** One SQL function (`pending_notifications`) decides what is due. A Supabase `pg_cron` job calls a Vercel API route every minute; the route claims each item in `notification_log` (at-most-once), sends it with `web-push`, and removes dead subscriptions. A custom service worker shows the notification and opens the right screen. Settings holds the switches and Apple-style alert pickers; events and plans can override the default alert.

**Tech Stack:** Supabase Postgres (RLS, `pg_cron`, `pg_net`, Vault), Vercel Node API routes, `web-push`, `vite-plugin-pwa` (`injectManifest`) + Workbox, React 19, TypeScript 6, `node:test` for pure logic.

**Spec:** `docs/superpowers/specs/2026-10-08-push-notifications-design.md` (approved 2026-10-09). Read it first; this plan implements it.

## Global Constraints

- iPhone: web push works only for the app added to the Home Screen (iOS 16.4+), and `Notification.requestPermission()` must run directly inside a tap handler.
- Every push must show a visible notification (iOS forbids silent push), even if the payload cannot be parsed.
- HTTPS only. The service worker is not registered in `npm run dev`; push can only be tested on a deployed HTTPS build, never on `http://charlie.local:5173`.
- VAPID authentication, no Firebase. Private key, `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are server-only (no `VITE_` prefix, never in the client bundle or the repo).
- Alert offsets (minutes before start): timed items `0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080` (at time of event, 5/10/15/30 minutes, 1 hour, 2 hours, 1 day, 2 days, 1 week); date-only items `0, 1440, 2880, 10080` anchored at **09:00 local time** of the event day. At most **two** alerts per item. `null` on an item = use the user's default; `'{}'` = none.
- Defaults: events `{15}`, plans `{60}`, date-only `{0}`; habit reminder `20:00`, morning summary `07:00`.
- An alert is due from its alert time until 15 minutes later, but never after the item has started (offset 0: until 15 minutes after the start). Habit and morning notifications have a 30-minute catch-up window. Friend requests and plan invitations are due for 15 minutes after creation.
- Weekly habits count on **Monday** only (mirrors `todaysHabits` in `src/hooks/useHabits.ts`). Skip habit reminders when no habit is left and the morning summary when there are 0 events and 0 habits.
- Plan reminders go to members whose RSVP is not `declined` for plans that are not `cancelled`/`completed` and have a date. Friend-request and invitation notifications go to the recipient only.
- Verification commands: `npm test` (pure logic), `npx tsc -b` and `npm run build`. **Never** `npx tsc --noEmit` (checks nothing here).
- UI follows `docs/design-system.md`: tokens, 44px tap targets, `press` class, accessible switches/selects, 16px inputs.
- New writes use `.select("id")` + `expectRows(...)`; errors go through `reportError`; no silent failures (`src/lib/monitoring.ts`).
- SQL migrations are run **manually by the user** in the Supabase SQL Editor; steps marked **[USER]** need them. The agent cannot run SQL.
- Git: work on branch `feat/push-notifications`; one PR; do not push or merge unless asked.

## Rulings (deviations from the spec, all small)

1. `pending_notifications` lives in `010_pending_notifications.sql` (not in `009`) so it can be iterated without touching the tables.
2. `push_subscriptions` has **no client INSERT/UPDATE policy**. Registration goes through a `security definer` function `register_push_subscription` that upserts for `auth.uid()` and re-assigns ownership. Reason: a phone that switches accounts would otherwise hit the global `unique(endpoint)` and keep sending the old account's reminders to it.
3. `Notification.requestPermission()` is called **before** awaiting `navigator.serviceWorker.ready` (the draft did it after, which loses the tap's user activation on iOS).
4. Server helpers are one file with **no relative imports** (`api/_lib/notify.ts`) so the same file runs under `node --test` and under Vercel's ESM build. Routes import it as `./_lib/notify.js` (see Task 7 verification).

## Review Focus (failure modes the spec implies; each has a test in the named task)

1. **Time zones and DST:** a Prague user on the day clocks change, a habit/morning window that crosses midnight. SQL tests in Tasks 3 and 5.
2. **Duplicates and lost sends:** two overlapping runs claim the same item; a run where every device fails transiently must release the claim so the next minute retries. Tests in Task 6.
3. **Multi-device and dead subscriptions:** one device returns 410 while another succeeds (remove the dead one, keep the claim); every device 410. Tests in Task 6.
4. **Permission and install states:** iPhone Safari tab (not installed), permission denied, subscription present but permission revoked in OS settings, endpoint rotated. Tests in Task 10; re-registration in Task 17.
5. **Alert edge cases:** `{}` (none) vs `null` (default), second alert equal to the first, more than two, date-only item with a timed offset, rescheduled item, alert after the item started. Tests in Tasks 1 and 3.

## File Structure

New:
- `src/lib/alerts.ts` Alert model (offsets, labels, choice helpers). Pure.
- `src/lib/notificationPrefs.ts` Row/camelCase mapping, time options. Pure.
- `src/lib/pushSupport.ts` `derivePushStatus`, `urlBase64ToUint8Array`. Pure.
- `src/lib/push.ts` Browser side: status, enable, disable, sync.
- `src/sw.ts` Custom service worker (precache + push + click).
- `src/hooks/useNotificationPreferences.ts`, `src/hooks/usePushSync.ts`
- `src/components/Toggle.tsx`, `SelectField.tsx`, `AlertPicker.tsx`, `NotificationSettings.tsx`
- `api/_lib/notify.ts`, `api/send-notifications.ts`, `api/send-test-notification.ts`
- `supabase/migrations/009_push_notifications.sql`, `010_pending_notifications.sql`
- `supabase/scheduler/send-notifications.sql`, `supabase/tests/pending_notifications.test.sql`
- `tests/alerts.test.mts`, `notificationPrefs.test.mts`, `pushSupport.test.mts`, `notify.test.mts`
- `tsconfig.sw.json`, `tsconfig.api.json`, `docs/notifications-runbook.md`

Modified: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `src/lib/database.types.ts`, `src/pages/Settings.tsx`, `src/pages/Calendar.tsx`, `src/pages/PlanDetail.tsx`, `src/hooks/useCalendarEvents.ts`, `src/hooks/useSharedPlans.ts`, `src/types.ts`, `src/App.tsx`, `.env.example`, `CLAUDE.md`, `handoff.md`.

---

### Task 1: Test harness and the alert model

**Files:**
- Create: `src/lib/alerts.ts`, `tests/alerts.test.mts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces (used by Tasks 13 to 16): `alertLabel(minutes, timed)`, `alertOffsets(timed)`, `alertSummary(alerts, timed)`, `type AlertChoice = "default" | "none" | number`, `primaryChoice(value)`, `secondaryChoice(value)`, `applyPrimary(current, choice)`, `applySecondary(current, choice)`, `normalizeAlerts(input)`, constants `MAX_ALERTS`, `DEFAULT_EVENT_ALERTS`, `DEFAULT_PLAN_ALERTS`, `DEFAULT_DATE_ONLY_ALERTS`.

- [ ] **Step 1: Add the test script**

In `package.json` `"scripts"` add (keep the others):

```json
"test": "node --test tests/*.test.mts",
```

- [ ] **Step 2: Write the failing test**

Create `tests/alerts.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertLabel,
  alertOffsets,
  alertSummary,
  applyPrimary,
  applySecondary,
  normalizeAlerts,
  primaryChoice,
  secondaryChoice,
} from "../src/lib/alerts.ts";

test("timed labels follow Apple Calendar wording", () => {
  assert.equal(alertLabel(0, true), "At time of event");
  assert.equal(alertLabel(5, true), "5 minutes before");
  assert.equal(alertLabel(60, true), "1 hour before");
  assert.equal(alertLabel(120, true), "2 hours before");
  assert.equal(alertLabel(1440, true), "1 day before");
  assert.equal(alertLabel(10080, true), "1 week before");
});

test("date-only labels are anchored at 9:00 AM", () => {
  assert.equal(alertLabel(0, false), "On the day (9:00 AM)");
  assert.equal(alertLabel(1440, false), "1 day before (9:00 AM)");
  assert.equal(alertLabel(10080, false), "1 week before (9:00 AM)");
});

test("offset lists", () => {
  assert.deepEqual([...alertOffsets(true)], [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]);
  assert.deepEqual([...alertOffsets(false)], [0, 1440, 2880, 10080]);
});

test("summary joins alerts", () => {
  assert.equal(alertSummary([], true), "None");
  assert.equal(alertSummary([15], true), "15 minutes before");
  assert.equal(alertSummary([1440, 15], true), "1 day before and 15 minutes before");
});

test("primaryChoice / secondaryChoice distinguish default, none and values", () => {
  assert.equal(primaryChoice(null), "default");
  assert.equal(primaryChoice([]), "none");
  assert.equal(primaryChoice([30, 60]), 30);
  assert.equal(secondaryChoice([30, 60]), 60);
  assert.equal(secondaryChoice([30]), "none");
  assert.equal(secondaryChoice(null), "none");
});

test("applyPrimary", () => {
  assert.equal(applyPrimary([15], "default"), null);
  assert.deepEqual(applyPrimary([15], "none"), []);
  assert.deepEqual(applyPrimary(null, 15), [15]);
  assert.deepEqual(applyPrimary([15, 60], 30), [30, 60]);
  assert.deepEqual(applyPrimary([15, 60], 60), [60]); // second alert may not equal the first
});

test("applySecondary", () => {
  assert.deepEqual(applySecondary([15], 60), [15, 60]);
  assert.deepEqual(applySecondary([15], 15), [15]);
  assert.deepEqual(applySecondary([15, 60], "none"), [15]);
  assert.deepEqual(applySecondary(null, 60), []); // no explicit first alert, nothing to add to
  assert.deepEqual(applySecondary([], 60), []);
});

test("normalizeAlerts keeps valid unique offsets, max two", () => {
  assert.deepEqual(normalizeAlerts([15, 15, 60, 120]), [15, 60]);
  assert.deepEqual(normalizeAlerts([7, 15]), [15]); // 7 is not an Apple offset
  assert.deepEqual(normalizeAlerts("nope"), []);
  assert.deepEqual(normalizeAlerts(null), []);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL (`Cannot find module '.../src/lib/alerts.ts'`).

- [ ] **Step 4: Write the implementation**

Create `src/lib/alerts.ts` (no imports; only erasable TypeScript so `node` can run it):

```ts
export const MAX_ALERTS = 2;

export const TIMED_OFFSETS: readonly number[] = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
export const DATE_ONLY_OFFSETS: readonly number[] = [0, 1440, 2880, 10080];

export const DEFAULT_EVENT_ALERTS: number[] = [15];
export const DEFAULT_PLAN_ALERTS: number[] = [60];
export const DEFAULT_DATE_ONLY_ALERTS: number[] = [0];

const TIMED_LABELS: Record<number, string> = {
  0: "At time of event",
  5: "5 minutes before",
  10: "10 minutes before",
  15: "15 minutes before",
  30: "30 minutes before",
  60: "1 hour before",
  120: "2 hours before",
  1440: "1 day before",
  2880: "2 days before",
  10080: "1 week before",
};

const DATE_ONLY_LABELS: Record<number, string> = {
  0: "On the day (9:00 AM)",
  1440: "1 day before (9:00 AM)",
  2880: "2 days before (9:00 AM)",
  10080: "1 week before (9:00 AM)",
};

export function alertLabel(minutes: number, timed: boolean): string {
  const labels = timed ? TIMED_LABELS : DATE_ONLY_LABELS;
  return labels[minutes] ?? TIMED_LABELS[minutes] ?? `${minutes} minutes before`;
}

export function alertOffsets(timed: boolean): readonly number[] {
  return timed ? TIMED_OFFSETS : DATE_ONLY_OFFSETS;
}

export function alertSummary(alerts: readonly number[], timed: boolean): string {
  if (alerts.length === 0) return "None";
  return alerts.map((m) => alertLabel(m, timed)).join(" and ");
}

// "default" = null on the item (use the user's default), "none" = empty array.
export type AlertChoice = "default" | "none" | number;

export function primaryChoice(value: number[] | null): AlertChoice {
  if (value === null) return "default";
  if (value.length === 0) return "none";
  return value[0];
}

export function secondaryChoice(value: number[] | null): "none" | number {
  return value !== null && value.length > 1 ? value[1] : "none";
}

export function applyPrimary(current: number[] | null, choice: AlertChoice): number[] | null {
  if (choice === "default") return null;
  if (choice === "none") return [];
  const second = current !== null && current.length > 1 ? current[1] : undefined;
  return second !== undefined && second !== choice ? [choice, second] : [choice];
}

export function applySecondary(current: number[] | null, choice: "none" | number): number[] {
  const first = current !== null && current.length > 0 ? current[0] : undefined;
  if (first === undefined) return [];
  if (choice === "none" || choice === first) return [first];
  return [first, choice];
}

// For values read from the database or user input.
export function normalizeAlerts(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out: number[] = [];
  for (const value of input) {
    if (typeof value === "number" && TIMED_OFFSETS.includes(value) && !out.includes(value)) out.push(value);
    if (out.length === MAX_ALERTS) break;
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (8 tests).

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc -b` (expected: no output).

```bash
git add package.json src/lib/alerts.ts tests/alerts.test.mts
git commit -m "feat: alert model with Apple Calendar offsets and node test harness"
```

---

### Task 2: Schema migration and types

**Files:**
- Create: `supabase/migrations/009_push_notifications.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces (used by Tasks 3 to 5, 7, 8, 12, 13, 15, 16, 17): tables `push_subscriptions`, `notification_preferences`, `notification_log`; columns `profiles.timezone`, `calendar_events.alerts`, `plan_members.alerts`; RPC `register_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent) returns void`; function `cleanup_notification_log() returns void`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/009_push_notifications.sql`:

```sql
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
```

- [ ] **Step 2: [USER] Run it**

Run the whole file in the Supabase SQL Editor. Expected: "Success. No rows returned." (`drop ... if exists` shows the destructive-query warning; it only drops constraints/policies this file recreates).
Then confirm: `select count(*) from public.notification_preferences;` equals `select count(*) from public.profiles;`.

- [ ] **Step 3: Update the generated types**

In `src/lib/database.types.ts` (keep it a `type Database = {...}` with `Relationships: []` on every table):

1. `profiles` Row: add `timezone: string;`; Insert: add `timezone?: string;`; Update: add `timezone?: string;`.
2. `calendar_events` Row: add `alerts: number[] | null;`; Insert: `alerts?: number[] | null;`; Update: `alerts?: number[] | null;`.
3. `plan_members` Row: add `alerts: number[] | null;`; Insert: `alerts?: number[] | null;`; Update: `alerts?: number[] | null;`.
4. Add these tables next to the others:

```ts
      push_subscriptions: {
        Row: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; created_at: string };
        Insert: { id?: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent?: string | null };
        Update: { user_agent?: string | null };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          calendar_reminders: boolean;
          event_alerts: number[];
          plan_reminders: boolean;
          plan_alerts: number[];
          plan_invites: boolean;
          friend_requests: boolean;
          allday_alerts: number[];
          habit_reminders: boolean;
          habit_reminder_time: string;
          morning_summary: boolean;
          morning_summary_time: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          calendar_reminders?: boolean;
          event_alerts?: number[];
          plan_reminders?: boolean;
          plan_alerts?: number[];
          plan_invites?: boolean;
          friend_requests?: boolean;
          allday_alerts?: number[];
          habit_reminders?: boolean;
          habit_reminder_time?: string;
          morning_summary?: boolean;
          morning_summary_time?: string;
        };
        Update: {
          calendar_reminders?: boolean;
          event_alerts?: number[];
          plan_reminders?: boolean;
          plan_alerts?: number[];
          plan_invites?: boolean;
          friend_requests?: boolean;
          allday_alerts?: number[];
          habit_reminders?: boolean;
          habit_reminder_time?: string;
          morning_summary?: boolean;
          morning_summary_time?: string;
        };
        Relationships: [];
      };
```

5. Replace `Functions: { [_ in never]: never };` with:

```ts
    Functions: {
      register_push_subscription: {
        Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent: string };
        Returns: undefined;
      };
    };
```

(`notification_log` and `pending_notifications` are server-only and use an untyped client, so they are not added here.)

- [ ] **Step 4: Verify and commit**

Run: `npx tsc -b` (expected: no output) and `npm run build` (expected: `built in`).

```bash
git add supabase/migrations/009_push_notifications.sql src/lib/database.types.ts
git commit -m "feat: push notification schema (subscriptions, preferences, log, alerts)"
```

---

### Task 3: `pending_notifications` part A (calendar and plan reminders) with SQL tests

**Files:**
- Create: `supabase/migrations/010_pending_notifications.sql`, `supabase/tests/pending_notifications.test.sql`

**Interfaces:**
- Consumes: Task 2 tables and columns.
- Produces (used by Tasks 4, 5, 7): `public.pending_notifications(p_now timestamptz default now()) returns table (user_id uuid, kind text, reference_id text, title text, body text, url text, tag text)`, callable only by the service role. Kinds so far: `calendar`, `plan`. `reference_id` for reminders is `kind:itemId:startUTC(YYYY-MM-DD"T"HH24:MI):offsetMinutes`.

The SQL is the contract for the rest of the plan. The test file is a transaction that creates fixture users, asserts, and **rolls back**, so nothing is left behind. The agent cannot run SQL: steps marked **[USER]** are run in the Supabase SQL Editor and the result pasted back.

- [ ] **Step 1: Write the failing SQL test**

Create `supabase/tests/pending_notifications.test.sql`:

```sql
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
```

- [ ] **Step 2: [USER] Run the test to see it fail**

Run the file in the SQL Editor.
Expected: error `function public.pending_notifications(timestamp with time zone) does not exist`.

- [ ] **Step 3: Write the function (part A)**

Create `supabase/migrations/010_pending_notifications.sql`. Keep the two marker comments; Tasks 4 and 5 insert at them.

```sql
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

  -- [B-ctes] invitations and friend requests are added here (Task 4)
  -- [C-ctes] habit reminders and the morning summary are added here (Task 5)

  all_due as (
    select * from reminders
    -- [B-union]
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
```

- [ ] **Step 4: [USER] Run the migration, then the test**

Run `010_pending_notifications.sql`, then `pending_notifications.test.sql`.
Expected: the last result is `ALL TESTS PASSED`. If an assertion fails, the error names it (for example `E7 DST: must not fire at 07:45Z`); paste the message back and fix the SQL, not the test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/010_pending_notifications.sql supabase/tests/pending_notifications.test.sql
git commit -m "feat: pending_notifications (calendar and plan reminders) with SQL tests"
```

---

### Task 4: `pending_notifications` part B (plan invitations, friend requests)

**Files:**
- Modify: `supabase/migrations/010_pending_notifications.sql`, `supabase/tests/pending_notifications.test.sql`

**Interfaces:**
- Consumes: Task 3 function layout (`u`, markers `[B-ctes]`, `[B-union]`).
- Produces: kinds `invite` (reference `plan id`) and `friend` (reference `friendship id`).

- [ ] **Step 1: Write the failing tests**

In `supabase/tests/pending_notifications.test.sql`, replace the line `-- ===== [B] invitations and friend requests (added in Task 4) =====` with:

```sql
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
```

- [ ] **Step 2: [USER] Run the test to see it fail**

Run the test file. Expected: failure `invite within 15 minutes` (kind not produced yet).

- [ ] **Step 3: Add the CTEs and union branches**

In `010_pending_notifications.sql`, replace the line `-- [B-ctes] invitations and friend requests are added here (Task 4)` with:

```sql
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
```

and replace the line `    -- [B-union]` with:

```sql
    union all
    select * from invite_due
    union all
    select * from friend_due
```

Keep the `[C-ctes]` and `[C-union]` marker lines.

- [ ] **Step 4: [USER] Re-run the migration, then the tests**

Run `010_pending_notifications.sql` again (it is `create or replace`), then the test file.
Expected: `ALL TESTS PASSED`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/010_pending_notifications.sql supabase/tests/pending_notifications.test.sql
git commit -m "feat: plan invitation and friend request notifications"
```

---

### Task 5: `pending_notifications` part C (habit reminders, morning summary)

**Files:**
- Modify: `supabase/migrations/010_pending_notifications.sql`, `supabase/tests/pending_notifications.test.sql`

**Interfaces:**
- Consumes: Task 3 layout (markers `[C-ctes]`, `[C-union]`).
- Produces: kinds `habit` and `morning` (reference = local date `YYYY-MM-DD`).

- [ ] **Step 1: Write the failing tests**

In the test file, replace the line `-- ===== [C] habits and morning summary (added in Task 5) =====` with:

```sql
-- ===== [C] habits and morning summary =====
insert into public.habits (id, user_id, name, icon, color, frequency, created_at) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Meditate', 'x', 'blue', 'daily',  '2026-01-01'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Read',     'x', 'blue', 'daily',  '2026-01-02'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Plan week','x', 'blue', 'weekly', '2026-01-03'),
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Run',      'x', 'blue', 'daily',  '2026-01-04'),
  ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Stretch',  'x', 'blue', 'daily',  '2026-01-05');

do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r record; begin
  -- Monday 2026-11-02 (CET): 20:00 local = 19:00Z; weekly habit counts on Monday; names capped at 3
  assert pg_temp.cnt('2026-11-02 18:59:00+00', a, 'habit') = 0, 'habit too early';
  assert pg_temp.cnt('2026-11-02 19:00:00+00', a, 'habit') = 1, 'habit at 20:00 local';
  select * into r from public.pending_notifications('2026-11-02 19:00:00+00') where user_id = a and kind = 'habit';
  assert r.body = '5 habits left today: Meditate, Read, Plan week +2 more', 'habit body: ' || r.body;
  assert r.url = '/habits', 'habit url';
  assert r.reference_id = '2026-11-02', 'habit reference is the local date';
  assert pg_temp.cnt('2026-11-02 19:29:00+00', a, 'habit') = 1, 'habit catch-up window';
  assert pg_temp.cnt('2026-11-02 19:30:00+00', a, 'habit') = 0, 'habit window expires after 30 minutes';
  -- Tuesday: the weekly habit is not due
  select * into r from public.pending_notifications('2026-11-03 19:00:00+00') where user_id = a and kind = 'habit';
  assert r.body = '4 habits left today: Meditate, Read, Run +1 more', 'tuesday body: ' || r.body;
  -- completions shrink the list, all done skips the reminder
  insert into public.completions (user_id, habit_id, date) values
    (a, 'cccccccc-0000-0000-0000-000000000001', '2026-11-03'), (a, 'cccccccc-0000-0000-0000-000000000002', '2026-11-03'),
    (a, 'cccccccc-0000-0000-0000-000000000004', '2026-11-03');
  select * into r from public.pending_notifications('2026-11-03 19:00:00+00') where user_id = a and kind = 'habit';
  assert r.body = '1 habit left today: Stretch', 'singular body: ' || r.body;
  insert into public.completions (user_id, habit_id, date) values (a, 'cccccccc-0000-0000-0000-000000000005', '2026-11-03');
  assert pg_temp.cnt('2026-11-03 19:00:00+00', a, 'habit') = 0, 'nothing left: no reminder';
  -- DST: Sunday 2026-10-25, clocks went back that night, so 20:00 local = 19:00Z (a fixed +02:00 would fire at 18:00Z)
  assert pg_temp.cnt('2026-10-25 18:00:00+00', a, 'habit') = 0, 'habit DST: not at 18:00Z';
  assert pg_temp.cnt('2026-10-25 19:00:00+00', a, 'habit') = 1, 'habit DST: at 19:00Z';
  -- late time near midnight: window is cut at midnight, never wraps or errors
  update public.notification_preferences set habit_reminder_time = '23:50' where user_id = a;
  assert pg_temp.cnt('2026-11-04 22:55:00+00', a, 'habit') = 1, 'late reminder at 23:55 local';
  assert pg_temp.cnt('2026-11-04 23:05:00+00', a, 'habit') = 0, '00:05 local next day: window ended';
  update public.notification_preferences set habit_reminder_time = '20:00' where user_id = a;
  update public.notification_preferences set habit_reminders = false where user_id = a;
  assert pg_temp.cnt('2026-11-02 19:00:00+00', a, 'habit') = 0, 'habit reminders switched off';
  update public.notification_preferences set habit_reminders = true where user_id = a;
end $$;

-- morning summary: Tuesday 2026-11-03, 07:00 local = 06:00Z; one event today, 4 open daily habits (completions above are cleared first)
delete from public.completions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.calendar_events (user_id, title, date, time) values ('aaaaaaaa-0000-0000-0000-000000000001', 'E8', '2026-11-03', '09:00');
do $$ declare a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; b constant uuid := 'aaaaaaaa-0000-0000-0000-000000000002'; r record; begin
  assert pg_temp.cnt('2026-11-03 05:59:00+00', a, 'morning') = 0, 'morning too early';
  select * into r from public.pending_notifications('2026-11-03 06:00:00+00') where user_id = a and kind = 'morning';
  assert r.body = '1 event today · 4 habits to go', 'morning body: ' || r.body;
  assert r.title = 'Good morning' and r.url = '/', 'morning title/url';
  assert pg_temp.cnt('2026-11-03 06:31:00+00', a, 'morning') = 0, 'morning window expires';
  -- nothing to say: no events, no habits (B has no habits, and no events on this date)
  assert pg_temp.cnt('2026-12-01 06:00:00+00', b, 'morning') = 0, 'nothing today: no summary';
  update public.notification_preferences set morning_summary = false where user_id = a;
  assert pg_temp.cnt('2026-11-03 06:00:00+00', a, 'morning') = 0, 'morning switched off';
  update public.notification_preferences set morning_summary = true where user_id = a;
end $$;
```

- [ ] **Step 2: [USER] Run the test to see it fail**

Expected: failure `habit at 20:00 local`.

- [ ] **Step 3: Add the CTEs and union branches**

In `010_pending_notifications.sql`, replace the line `-- [C-ctes] habit reminders and the morning summary are added here (Task 5)` with:

```sql
  -- habits still open today (daily every day; weekly on Monday, like the app)
  open_habits as (
    select u.user_id, u.local_now, h.name, h.created_at
    from u
    join public.habits h on h.user_id = u.user_id
    where (h.frequency = 'daily' or (h.frequency = 'weekly' and extract(isodow from u.local_now) = 1))
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
  habit_due as (
    select u.user_id, 'habit'::text as kind, (u.local_now::date)::text as reference_id,
           'Habits'::text as title,
           a.n || case when a.n = 1 then ' habit' else ' habits' end || ' left today: ' || a.names
             || case when a.n > 3 then ' +' || (a.n - 3) || ' more' else '' end as body,
           '/habits'::text as url,
           ('habit-' || u.local_now::date::text) as tag
    from u
    join habit_agg a on a.user_id = u.user_id
    where u.habit_reminders
      and u.local_now >= (u.local_now::date + u.habit_reminder_time)
      and u.local_now <  (u.local_now::date + u.habit_reminder_time) + interval '30 minutes'
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
```

and replace the line `    -- [C-union]` with:

```sql
    union all
    select * from habit_due
    union all
    select * from morning_due
```

(Remove the two now-empty `[B-...]`/`[C-...]` marker comments if any remain.)

- [ ] **Step 4: [USER] Re-run the migration, then the tests**

Expected: `ALL TESTS PASSED`. Also run `select * from public.pending_notifications();` once; expected: zero rows or only genuinely due items (it must not error).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/010_pending_notifications.sql supabase/tests/pending_notifications.test.sql
git commit -m "feat: habit reminder and morning summary notifications"
```

---

### Task 6: Delivery logic (claim, send, clean up) with fakes

**Files:**
- Create: `api/_lib/notify.ts`, `tests/notify.test.mts`

**Interfaces:**
- Consumes: the row shape returned by `pending_notifications` (Task 3).
- Produces (used by Tasks 7, 8): `DueNotification`, `Subscription`, `Deps`, `RunSummary`, `isAuthorized(header, secret)`, `buildPayload(n)`, `isGone(error)`, `processNotifications(due, deps): Promise<RunSummary>`.

This is the reliability core: it decides when a claim is kept or released. It has **no relative imports** so the same file runs under `node --test` and Vercel.

- [ ] **Step 1: Write the failing tests**

Create `tests/notify.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPayload,
  isAuthorized,
  isGone,
  processNotifications,
  type Deps,
  type DueNotification,
  type Subscription,
} from "../api/_lib/notify.ts";

const note = (id: string): DueNotification => ({
  user_id: "u1",
  kind: "habit",
  reference_id: id,
  title: "Habits",
  body: "2 habits left today: Read, Run",
  url: "/habits",
  tag: "habit-" + id,
});
const phone: Subscription = { endpoint: "https://push/phone", p256dh: "k", auth: "a" };
const laptop: Subscription = { endpoint: "https://push/laptop", p256dh: "k", auth: "a" };
const gone = Object.assign(new Error("gone"), { statusCode: 410 });
const flaky = Object.assign(new Error("push service down"), { statusCode: 503 });

function fakes(opts: {
  subs?: Subscription[];
  claim?: boolean;
  send?: (sub: Subscription) => Promise<void>;
  subsError?: Error;
}) {
  const calls = { sent: [] as string[], released: [] as string[], removed: [] as string[] };
  const deps: Deps = {
    claim: async () => opts.claim ?? true,
    release: async (n) => void calls.released.push(n.reference_id),
    subscriptionsFor: async () => {
      if (opts.subsError) throw opts.subsError;
      return opts.subs ?? [phone];
    },
    send: async (sub) => {
      if (opts.send) await opts.send(sub);
      calls.sent.push(sub.endpoint);
    },
    removeSubscription: async (endpoint) => void calls.removed.push(endpoint),
  };
  return { deps, calls };
}

test("delivers to every device and keeps the claim", async () => {
  const { deps, calls } = fakes({ subs: [phone, laptop] });
  const summary = await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.sent, [phone.endpoint, laptop.endpoint]);
  assert.deepEqual(calls.released, []);
  assert.equal(summary.delivered, 2);
});

test("an item another run already claimed is not sent again", async () => {
  const { deps, calls } = fakes({ claim: false });
  const summary = await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.sent, []);
  assert.equal(summary.claimed, 0);
});

test("a dead device is removed while the live one keeps the claim", async () => {
  const { deps, calls } = fakes({
    subs: [phone, laptop],
    send: async (sub) => {
      if (sub.endpoint === laptop.endpoint) throw gone;
    },
  });
  const summary = await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.removed, [laptop.endpoint]);
  assert.deepEqual(calls.sent, [phone.endpoint]);
  assert.deepEqual(calls.released, []);
  assert.equal(summary.removed, 1);
});

test("every device failing transiently releases the claim so the next minute retries", async () => {
  const { deps, calls } = fakes({
    subs: [phone, laptop],
    send: async () => {
      throw flaky;
    },
  });
  const summary = await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.released, ["d1"]);
  assert.deepEqual(calls.removed, []);
  assert.equal(summary.released, 1);
});

test("every device gone: all removed, claim kept (nothing left to retry)", async () => {
  const { deps, calls } = fakes({
    subs: [phone, laptop],
    send: async () => {
      throw gone;
    },
  });
  await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.removed, [phone.endpoint, laptop.endpoint]);
  assert.deepEqual(calls.released, []);
});

test("no devices left: claim is released", async () => {
  const { deps, calls } = fakes({ subs: [] });
  await processNotifications([note("d1")], deps);
  assert.deepEqual(calls.released, ["d1"]);
});

test("an unexpected error after claiming releases the claim and is rethrown", async () => {
  const { deps, calls } = fakes({ subsError: new Error("db down") });
  await assert.rejects(() => processNotifications([note("d1")], deps), /db down/);
  assert.deepEqual(calls.released, ["d1"]);
});

test("isAuthorized accepts only the exact bearer secret", () => {
  assert.equal(isAuthorized("Bearer s3cret", "s3cret"), true);
  assert.equal(isAuthorized("Bearer wrong", "s3cret"), false);
  assert.equal(isAuthorized("s3cret", "s3cret"), false);
  assert.equal(isAuthorized(undefined, "s3cret"), false);
  assert.equal(isAuthorized("Bearer s3cret", undefined), false);
  assert.equal(isAuthorized("Bearer s3cret", ""), false);
  assert.equal(isAuthorized("Bearer s3cret-and-more", "s3cret"), false);
});

test("buildPayload shapes the push message the service worker reads", () => {
  assert.deepEqual(JSON.parse(buildPayload(note("d1"))), {
    title: "Habits",
    body: "2 habits left today: Read, Run",
    tag: "habit-d1",
    data: { url: "/habits" },
  });
});

test("isGone recognises 404 and 410 only", () => {
  assert.equal(isGone(gone), true);
  assert.equal(isGone({ statusCode: 404 }), true);
  assert.equal(isGone(flaky), false);
  assert.equal(isGone(null), false);
  assert.equal(isGone("x"), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL (`Cannot find module '.../api/_lib/notify.ts'`).

- [ ] **Step 3: Implement**

Create `api/_lib/notify.ts`:

```ts
// Pure helpers and the delivery loop for the notification sender.
// No relative imports: this file runs under `node --test` and as a Vercel function dependency.
import { createHash, timingSafeEqual } from "node:crypto";

export interface DueNotification {
  user_id: string;
  kind: string;
  reference_id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Deps {
  /** Insert into notification_log. true = this run owns the item, false = already claimed. */
  claim(n: DueNotification): Promise<boolean>;
  release(n: DueNotification): Promise<void>;
  subscriptionsFor(userId: string): Promise<Subscription[]>;
  /** Throws on failure; a thrown error with statusCode 404/410 means the device is gone. */
  send(sub: Subscription, payload: string): Promise<void>;
  removeSubscription(endpoint: string): Promise<void>;
}

export interface RunSummary {
  due: number;
  claimed: number;
  delivered: number;
  removed: number;
  released: number;
}

export function isAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  // Hash both sides so lengths always match and comparison time does not leak the secret.
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256").update(header).digest();
  return timingSafeEqual(expected, actual);
}

export function buildPayload(n: DueNotification): string {
  return JSON.stringify({ title: n.title, body: n.body, tag: n.tag, data: { url: n.url } });
}

export function isGone(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}

export async function processNotifications(due: DueNotification[], deps: Deps): Promise<RunSummary> {
  const summary: RunSummary = { due: due.length, claimed: 0, delivered: 0, removed: 0, released: 0 };

  for (const n of due) {
    // Claim first: only the run that inserts the log row may send, so overlapping runs never duplicate.
    if (!(await deps.claim(n))) continue;
    summary.claimed++;

    try {
      const subs = await deps.subscriptionsFor(n.user_id);
      if (subs.length === 0) {
        await deps.release(n);
        summary.released++;
        continue;
      }

      const payload = buildPayload(n);
      let delivered = 0;
      let transient = 0;
      for (const sub of subs) {
        try {
          await deps.send(sub, payload);
          delivered++;
        } catch (error) {
          if (isGone(error)) {
            await deps.removeSubscription(sub.endpoint);
            summary.removed++;
          } else {
            transient++;
          }
        }
      }
      summary.delivered += delivered;

      // Nothing got through and it might work later: give the claim back so the next run retries.
      if (delivered === 0 && transient > 0) {
        await deps.release(n);
        summary.released++;
      }
    } catch (error) {
      await deps.release(n).catch(() => undefined);
      throw error;
    }
  }

  return summary;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS (all tests in `alerts.test.mts` and `notify.test.mts`).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/notify.ts tests/notify.test.mts
git commit -m "feat: notification delivery loop with atomic claim and retry rules"
```

---

### Task 7: The sender route

**Files:**
- Create: `api/send-notifications.ts`, `tsconfig.api.json`
- Modify: `tsconfig.json` (add reference), `package.json` (dependencies)

**Interfaces:**
- Consumes: `processNotifications`, `isAuthorized`, `DueNotification`, `Subscription` from Task 6; RPC `pending_notifications` (Task 3).
- Produces: `POST /api/send-notifications` returning `RunSummary` JSON; env vars `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `BETTERSTACK_HEARTBEAT_URL` (optional).

- [ ] **Step 1: Install dependencies**

```bash
npm install web-push
npm install -D @types/web-push
```

- [ ] **Step 2: Add the API tsconfig**

Create `tsconfig.api.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.api.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "erasableSyntaxOnly": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["api"]
}
```

In `tsconfig.json` add `{ "path": "./tsconfig.api.json" }` to `references`.

- [ ] **Step 3: Write the route**

Create `api/send-notifications.ts`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { isAuthorized, processNotifications, type DueNotification, type Subscription } from "./_lib/notify.js";

// Better Stack heartbeat: pinged on every successful run, "/fail" on errors. Never let it break sending.
async function ping(url: string | undefined, suffix = "") {
  if (!url) return;
  try {
    await fetch(url + suffix, { signal: AbortSignal.timeout(3000) });
  } catch {
    // ignore
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!isAuthorized(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const heartbeat = process.env.BETTERSTACK_HEARTBEAT_URL;
  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const vapidPublic = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
      throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY");
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", vapidPublic, vapidPrivate);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data, error } = await db.rpc("pending_notifications");
    if (error) throw error;
    const due = (data ?? []) as DueNotification[];

    const devices = new Map<string, Subscription[]>();
    const summary = await processNotifications(due, {
      claim: async (n) => {
        const { error: claimError } = await db
          .from("notification_log")
          .insert({ user_id: n.user_id, kind: n.kind, reference_id: n.reference_id });
        if (!claimError) return true;
        if (claimError.code === "23505") return false; // another run owns it
        throw claimError;
      },
      release: async (n) => {
        await db
          .from("notification_log")
          .delete()
          .eq("user_id", n.user_id)
          .eq("kind", n.kind)
          .eq("reference_id", n.reference_id);
      },
      subscriptionsFor: async (userId) => {
        const cached = devices.get(userId);
        if (cached) return cached;
        const { data: subs, error: subsError } = await db
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", userId);
        if (subsError) throw subsError;
        devices.set(userId, subs ?? []);
        return subs ?? [];
      },
      send: async (sub, payload) => {
        // TTL matches the 15-minute alert window: a reminder that arrives later is worse than none.
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          TTL: 900,
          urgency: "high",
        });
      },
      removeSubscription: async (endpoint) => {
        await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
        devices.clear();
      },
    });

    console.log("[send-notifications]", JSON.stringify(summary));
    await ping(heartbeat);
    return res.status(200).json(summary);
  } catch (error) {
    console.error("[send-notifications] failed", error);
    await ping(heartbeat, "/fail");
    return res.status(500).json({ error: "send failed" });
  }
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b` (expected: no output) and `npm run build` (expected: `built in`).
If `tsc` rejects `import webpush from "web-push"`, change to `import * as webpush from "web-push"` and use `webpush.setVapidDetails` unchanged; re-run.

- [ ] **Step 5: Commit**

```bash
git add api/send-notifications.ts tsconfig.api.json tsconfig.json package.json package-lock.json
git commit -m "feat: sender route for due notifications"
```

- [ ] **Step 6: Post-deploy check (after the branch is deployed; the user or agent runs it)**

Run: `curl -i -X POST https://<deployment-url>/api/send-notifications`
Expected: `HTTP/2 401` with `{"error":"unauthorized"}`. This proves the function (including its `./_lib/notify.js` import) loads on Vercel. A 500 with "Cannot find module" means the `.js` import does not resolve: fall back by copying the helpers into the route file.

---

### Task 8: Test-notification route

**Files:**
- Create: `api/send-test-notification.ts`

**Interfaces:**
- Consumes: `isGone` (Task 6), the VAPID env vars (Task 7).
- Produces (used by Task 14): `POST /api/send-test-notification` with `Authorization: Bearer <supabase access token>`; responses `200 {sent, removed}`, `401`, `404 {error: "no-device"}`, `502 {error: "delivery-failed"}`.

- [ ] **Step 1: Write the route**

Create `api/send-test-notification.ts`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { isGone } from "./_lib/notify.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: "server-not-configured" });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", vapidPublic, vapidPrivate);
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Only the signed-in user's own devices are ever targeted.
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "unauthorized" });

  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userData.user.id);
  if (error) return res.status(500).json({ error: "lookup-failed" });
  if (!subs || subs.length === 0) return res.status(404).json({ error: "no-device" });

  const payload = JSON.stringify({
    title: "Pulse",
    body: "Notifications are working on this device.",
    tag: "test",
    data: { url: "/settings" },
  });

  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        TTL: 60,
        urgency: "high",
      });
      sent++;
    } catch (sendError) {
      if (isGone(sendError)) {
        await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        removed++;
      }
    }
  }

  if (sent === 0) return res.status(502).json({ error: "delivery-failed", removed });
  return res.status(200).json({ sent, removed });
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc -b` (expected: no output) and `npm run build`.

```bash
git add api/send-test-notification.ts
git commit -m "feat: send-test-notification route for the Settings test button"
```

---

### Task 9: Scheduler SQL, VAPID keys and environment

**Files:**
- Create: `supabase/scheduler/send-notifications.sql`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the route URL (Task 7), `cleanup_notification_log()` (Task 2).
- Produces: the every-minute job `pulse-send-notifications` and the daily `pulse-clean-notification-log`; documented env vars.

- [ ] **Step 1: Write the scheduler script**

Create `supabase/scheduler/send-notifications.sql` (placeholders only; the user fills in the secret when running it, and it is never committed with a real value):

```sql
-- Run ONCE in the Supabase SQL Editor after the API route is deployed.
-- 1) Replace <CRON_SECRET> with the same value set as CRON_SECRET in Vercel.
-- 2) Replace the URL if your production domain differs.
-- Rotate the secret later with: select vault.update_secret((select id from vault.secrets where name = 'pulse_cron_secret'), '<new>');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('<CRON_SECRET>', 'pulse_cron_secret');

select cron.schedule(
  'pulse-send-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://pulse-app-habit.vercel.app/api/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);

select cron.schedule('pulse-clean-notification-log', '17 3 * * *', $$select public.cleanup_notification_log();$$);

-- Checks:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select id, status_code, content::text from net._http_response order by created desc limit 5;
-- Stop it: select cron.unschedule('pulse-send-notifications');
```

- [ ] **Step 2: Document the environment**

Append to `.env.example`:

```
# Push notifications
# Generate once: npx web-push generate-vapid-keys
VITE_VAPID_PUBLIC_KEY=
# Server-only (Vercel env vars, never VITE_-prefixed, never committed):
#   VAPID_PUBLIC_KEY (same value as above), VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:you@example.com
#   CRON_SECRET (long random string; also stored in Supabase Vault by the scheduler script)
#   SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard, Project Settings, API; bypasses RLS, server only)
#   BETTERSTACK_HEARTBEAT_URL (optional; Better Stack heartbeat monitor URL)
```

- [ ] **Step 3: [USER] Provision and enable (done later, in the runbook, Task 17)**

The user generates the VAPID keys, sets the Vercel variables and runs the scheduler script after the code is deployed. Nothing to run now.

- [ ] **Step 4: Commit**

```bash
git add supabase/scheduler/send-notifications.sql .env.example
git commit -m "feat: scheduler script and environment documentation for push"
```

---

### Task 10: Push support helpers (pure) with tests

**Files:**
- Create: `src/lib/pushSupport.ts`, `tests/pushSupport.test.mts`

**Interfaces:**
- Produces (used by Tasks 11, 12, 14): `type PushStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on"`, `interface PushEnv`, `derivePushStatus(env)`, `isIOSDevice(userAgent, platform, maxTouchPoints)`, `urlBase64ToUint8Array(base64)`, `safeTargetUrl(raw, origin)`.

Rule for every pure module in `src/lib` that a test imports: no imports except other pure modules, and those imports carry the `.ts` extension (allowed by `allowImportingTsExtensions`; Vite resolves them) so `node` can load them.

- [ ] **Step 1: Write the failing tests**

Create `tests/pushSupport.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivePushStatus,
  isIOSDevice,
  safeTargetUrl,
  urlBase64ToUint8Array,
  type PushEnv,
} from "../src/lib/pushSupport.ts";

const supported: PushEnv = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIOS: false,
  isStandalone: false,
  permission: "default",
  hasSubscription: false,
};
const status = (over: Partial<PushEnv>) => derivePushStatus({ ...supported, ...over });

test("iPhone Safari tab (not installed) needs the Home Screen app, even though PushManager is missing there", () => {
  assert.equal(status({ isIOS: true, isStandalone: false, hasPushManager: false }), "needs-install");
});

test("installed iPhone app behaves like any supported browser", () => {
  assert.equal(status({ isIOS: true, isStandalone: true }), "off");
  assert.equal(status({ isIOS: true, isStandalone: true, permission: "granted", hasSubscription: true }), "on");
});

test("unsupported when the browser lacks service workers, push or notifications", () => {
  assert.equal(status({ hasServiceWorker: false }), "unsupported");
  assert.equal(status({ hasPushManager: false }), "unsupported");
  assert.equal(status({ hasNotification: false }), "unsupported");
});

test("permission states", () => {
  assert.equal(status({ permission: "denied" }), "blocked");
  assert.equal(status({ permission: "default" }), "off");
  assert.equal(status({ permission: "granted", hasSubscription: false }), "off");
  assert.equal(status({ permission: "granted", hasSubscription: true }), "on");
  // permission revoked in system settings while a stale subscription object still exists
  assert.equal(status({ permission: "denied", hasSubscription: true }), "blocked");
});

test("isIOSDevice detects iPhone, iPad and iPadOS desktop mode", () => {
  assert.equal(isIOSDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0), false);
  assert.equal(isIOSDevice("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5), false);
});

test("urlBase64ToUint8Array decodes URL-safe base64 with and without padding", () => {
  assert.deepEqual([...urlBase64ToUint8Array("AQID")], [1, 2, 3]);
  assert.deepEqual([...urlBase64ToUint8Array("-_8")], [0xfb, 0xff]);
  assert.deepEqual([...urlBase64ToUint8Array("AQI")], [1, 2]);
});

test("safeTargetUrl keeps same-origin paths and rejects everything else", () => {
  const origin = "https://pulse.example";
  assert.equal(safeTargetUrl("/calendar", origin), "https://pulse.example/calendar");
  assert.equal(safeTargetUrl("https://pulse.example/social/plan/1", origin), "https://pulse.example/social/plan/1");
  assert.equal(safeTargetUrl("https://evil.example/x", origin), "https://pulse.example/");
  assert.equal(safeTargetUrl("javascript:alert(1)", origin), "https://pulse.example/");
  assert.equal(safeTargetUrl(undefined, origin), "https://pulse.example/");
  assert.equal(safeTargetUrl(42, origin), "https://pulse.example/");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL (`Cannot find module '.../src/lib/pushSupport.ts'`).

- [ ] **Step 3: Implement**

Create `src/lib/pushSupport.ts`:

```ts
export type PushStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on";

export interface PushEnv {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  permission: "default" | "granted" | "denied";
  hasSubscription: boolean;
}

export function derivePushStatus(env: PushEnv): PushStatus {
  // An iPhone Safari tab has no PushManager at all, so check "not installed" first to give the useful hint.
  if (env.isIOS && !env.isStandalone) return "needs-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.permission === "denied") return "blocked";
  if (env.permission === "granted" && env.hasSubscription) return "on";
  return "off";
}

export function isIOSDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Where a tapped notification may send the user: same-origin only.
export function safeTargetUrl(raw: unknown, origin: string): string {
  if (typeof raw !== "string") return `${origin}/`;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url.href : `${origin}/`;
  } catch {
    return `${origin}/`;
  }
}
```

- [ ] **Step 4: Run to verify it passes, then commit**

Run: `npm test` (expected: PASS) and `npx tsc -b` (expected: no output).

```bash
git add src/lib/pushSupport.ts tests/pushSupport.test.mts
git commit -m "feat: push support helpers (status, key decoding, safe target url)"
```

---

### Task 11: Custom service worker

**Files:**
- Create: `src/sw.ts`, `tsconfig.sw.json`
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `package.json`

**Interfaces:**
- Consumes: `safeTargetUrl` (Task 10); the push payload `{title, body, tag, data: {url}}` (Task 6).
- Produces: a service worker (`dist/sw.js`) that keeps today's behavior (precache, SPA navigation fallback, immediate updates) and shows/handles push notifications.

- [ ] **Step 1: Dependencies**

```bash
npm install workbox-core workbox-precaching workbox-routing
```

- [ ] **Step 2: Write the service worker**

Create `src/sw.ts`:

```ts
/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { safeTargetUrl } from "./lib/pushSupport";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

// What generateSW did for us before: take over right away, precache the build, SPA fallback.
// registerType "autoUpdate" relies on the worker activating itself.
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }));

interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  data?: { url?: string };
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    // fall through to the generic message below
  }
  // iOS requires every push to show a visible notification, so always show something.
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Pulse", {
      body: payload.body ?? "You have a new update.",
      tag: payload.tag,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: payload.data?.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | undefined)?.url;
  const target = safeTargetUrl(raw, self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const win of windows) {
        if (new URL(win.url).origin === self.location.origin) {
          await win.focus();
          try {
            await win.navigate(target);
          } catch {
            await self.clients.openWindow(target);
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
```

- [ ] **Step 3: Type-check the worker separately**

Create `tsconfig.sw.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.sw.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "WebWorker"],
    "types": [],
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "erasableSyntaxOnly": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/sw.ts", "src/lib/pushSupport.ts"]
}
```

In `tsconfig.json` add `{ "path": "./tsconfig.sw.json" }` to `references`. In `tsconfig.app.json` add `"exclude": ["src/sw.ts"]` next to `"include": ["src"]` (the app project uses the DOM lib; the worker file uses the WebWorker lib and must not be in it).

- [ ] **Step 4: Switch the PWA plugin to `injectManifest`**

In `vite.config.ts`, change the `VitePWA({ ... })` call: add three lines at the top and keep everything else (`registerType`, `includeAssets`, `manifest`) exactly as it is:

```ts
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // ...includeAssets and manifest unchanged
```

- [ ] **Step 5: Verify the build output**

Run:

```bash
npx tsc -b
npm run build
grep -c 'addEventListener("push"' dist/sw.js
grep -o 'index.html' dist/sw.js | head -1
grep -o 'pwa-192x192.png' dist/sw.js | head -1
```

Expected: `tsc` prints nothing; the build succeeds; the counts/matches are `1`, `index.html`, `pwa-192x192.png` (push handler present and the build precached). If `grep -c` prints `0`, open `dist/sw.js` and search for `"push"` with other quoting.

Then, **manual check on the deployed site** (the service worker does not run in `npm run dev`): after deploy, reload the live app once, open DevTools, Application, Service Workers: the new worker is `activated and running`, and the app still loads offline (turn on "Offline", reload).

- [ ] **Step 6: Commit**

```bash
git add src/sw.ts tsconfig.sw.json tsconfig.json tsconfig.app.json vite.config.ts package.json package-lock.json
git commit -m "feat: custom service worker with push and notification click handling"
```

---

### Task 12: Browser push library

**Files:**
- Create: `src/lib/push.ts`

**Interfaces:**
- Consumes: Task 10 helpers, RPC `register_push_subscription` (Task 2), `reportError` (`src/lib/monitoring.ts`).
- Produces (used by Tasks 14, 17): `getPushStatus(): Promise<PushStatus>`, `enablePush(): Promise<EnableResult>` where `type EnableResult = { ok: true } | { ok: false; reason: "denied" | "unsupported" | "not-configured" | "failed" }`, `disablePush(): Promise<void>`, `registerSubscription(subscription: PushSubscription): Promise<void>`, `currentSubscription(): Promise<PushSubscription | null>`, `currentTimeZone(): string`.

- [ ] **Step 1: Write the module**

Create `src/lib/push.ts`:

```ts
import { supabase } from "./supabase";
import { reportError } from "./monitoring";
import { derivePushStatus, isIOSDevice, urlBase64ToUint8Array, type PushStatus } from "./pushSupport";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// getRegistration() resolves to undefined when no worker is registered (e.g. `npm run dev`);
// navigator.serviceWorker.ready would hang forever there.
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushStatus(): Promise<PushStatus> {
  const hasNotification = "Notification" in window;
  const subscription = await currentSubscription();
  return derivePushStatus({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification,
    isIOS: isIOSDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    isStandalone: isStandalone(),
    permission: hasNotification ? Notification.permission : "default",
    hasSubscription: subscription !== null,
  });
}

export async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("Push subscription is missing its keys");
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "unsupported" | "not-configured" | "failed" };

// Call this directly from a tap handler.
export async function enablePush(): Promise<EnableResult> {
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "not-configured" };
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    // First await on purpose: iOS only shows the prompt while the tap's user activation is alive.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return { ok: false, reason: "unsupported" };

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    await registerSubscription(subscription);
    return { ok: true };
  } catch (error) {
    reportError(error, { area: "push", target: "enable" });
    return { ok: false, reason: "failed" };
  }
}

export async function disablePush(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    // Zero rows is fine: the server may already have removed a dead endpoint.
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
  } catch (error) {
    reportError(error, { area: "push", target: "disable" });
    throw error;
  }
}
```

- [ ] **Step 2: Declare the env var type if needed, verify, commit**

If `tsc` complains about `import.meta.env.VITE_VAPID_PUBLIC_KEY`, it will not (Vite's `ImportMetaEnv` allows extra keys); no change expected.

Run: `npx tsc -b` (expected: no output) and `npm run build`.

```bash
git add src/lib/push.ts
git commit -m "feat: browser push library (status, enable, disable, register)"
```

---

### Task 13: Preferences model, hook and form controls

**Files:**
- Create: `src/lib/notificationPrefs.ts`, `tests/notificationPrefs.test.mts`, `src/hooks/useNotificationPreferences.ts`, `src/components/Toggle.tsx`, `src/components/SelectField.tsx`

**Interfaces:**
- Consumes: `alerts.ts` (Task 1), table types (Task 2), `expectRows`/`reportError`.
- Produces (used by Tasks 14 to 16): `interface NotificationPrefs`, `DEFAULT_PREFS`, `rowToPrefs(row)`, `patchToRow(patch)`, `timeOptions(step?)`, `formatTime(value)`; hook `useNotificationPreferences(): { prefs: NotificationPrefs | null; loading: boolean; update(patch: Partial<NotificationPrefs>): Promise<boolean> }`; components `Toggle({ checked, onChange, label, disabled? })` and `SelectField({ label, value, options, onChange, disabled? })` with `interface SelectOption { value: string; label: string }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/notificationPrefs.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, formatTime, patchToRow, rowToPrefs, timeOptions } from "../src/lib/notificationPrefs.ts";

const row = {
  calendar_reminders: true,
  event_alerts: [15],
  plan_reminders: false,
  plan_alerts: [60, 5],
  plan_invites: true,
  friend_requests: false,
  allday_alerts: [0],
  habit_reminders: true,
  habit_reminder_time: "20:00:00",
  morning_summary: false,
  morning_summary_time: "07:30:00",
};

test("rowToPrefs maps columns and trims seconds from times", () => {
  const prefs = rowToPrefs(row);
  assert.equal(prefs.planReminders, false);
  assert.deepEqual(prefs.planAlerts, [60, 5]);
  assert.equal(prefs.habitReminderTime, "20:00");
  assert.equal(prefs.morningSummaryTime, "07:30");
  assert.equal(prefs.friendRequests, false);
});

test("rowToPrefs drops invalid alert values from the database", () => {
  assert.deepEqual(rowToPrefs({ ...row, event_alerts: [15, 7, 15, 60, 120] }).eventAlerts, [15, 60]);
});

test("patchToRow only emits the provided keys, in column names", () => {
  assert.deepEqual(patchToRow({ eventAlerts: [30], habitReminderTime: "21:15" }), {
    event_alerts: [30],
    habit_reminder_time: "21:15",
  });
  assert.deepEqual(patchToRow({}), {});
  assert.deepEqual(patchToRow({ planInvites: false }), { plan_invites: false });
});

test("defaults match the spec", () => {
  assert.deepEqual(DEFAULT_PREFS.eventAlerts, [15]);
  assert.deepEqual(DEFAULT_PREFS.planAlerts, [60]);
  assert.deepEqual(DEFAULT_PREFS.alldayAlerts, [0]);
  assert.equal(DEFAULT_PREFS.habitReminderTime, "20:00");
  assert.equal(DEFAULT_PREFS.morningSummaryTime, "07:00");
});

test("time options step by 15 minutes with 12-hour labels", () => {
  const options = timeOptions();
  assert.equal(options.length, 96);
  assert.deepEqual(options[0], { value: "00:00", label: "12:00 AM" });
  assert.equal(formatTime("20:00"), "8:00 PM");
  assert.equal(formatTime("07:15"), "7:15 AM");
  assert.equal(formatTime("12:30"), "12:30 PM");
  assert.equal(options.at(-1)?.value, "23:45");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL (`Cannot find module '.../src/lib/notificationPrefs.ts'`).

- [ ] **Step 3: Implement the model**

Create `src/lib/notificationPrefs.ts`:

```ts
import {
  DEFAULT_DATE_ONLY_ALERTS,
  DEFAULT_EVENT_ALERTS,
  DEFAULT_PLAN_ALERTS,
  normalizeAlerts,
} from "./alerts.ts";

export interface NotificationPrefs {
  calendarReminders: boolean;
  eventAlerts: number[];
  planReminders: boolean;
  planAlerts: number[];
  planInvites: boolean;
  friendRequests: boolean;
  alldayAlerts: number[];
  habitReminders: boolean;
  habitReminderTime: string; // "HH:MM"
  morningSummary: boolean;
  morningSummaryTime: string; // "HH:MM"
}

export interface PrefsRow {
  calendar_reminders: boolean;
  event_alerts: number[];
  plan_reminders: boolean;
  plan_alerts: number[];
  plan_invites: boolean;
  friend_requests: boolean;
  allday_alerts: number[];
  habit_reminders: boolean;
  habit_reminder_time: string;
  morning_summary: boolean;
  morning_summary_time: string;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  calendarReminders: true,
  eventAlerts: [...DEFAULT_EVENT_ALERTS],
  planReminders: true,
  planAlerts: [...DEFAULT_PLAN_ALERTS],
  planInvites: true,
  friendRequests: true,
  alldayAlerts: [...DEFAULT_DATE_ONLY_ALERTS],
  habitReminders: true,
  habitReminderTime: "20:00",
  morningSummary: true,
  morningSummaryTime: "07:00",
};

export function rowToPrefs(row: PrefsRow): NotificationPrefs {
  return {
    calendarReminders: row.calendar_reminders,
    eventAlerts: normalizeAlerts(row.event_alerts),
    planReminders: row.plan_reminders,
    planAlerts: normalizeAlerts(row.plan_alerts),
    planInvites: row.plan_invites,
    friendRequests: row.friend_requests,
    alldayAlerts: normalizeAlerts(row.allday_alerts),
    habitReminders: row.habit_reminders,
    habitReminderTime: row.habit_reminder_time.slice(0, 5),
    morningSummary: row.morning_summary,
    morningSummaryTime: row.morning_summary_time.slice(0, 5),
  };
}

const COLUMN: Record<keyof NotificationPrefs, keyof PrefsRow> = {
  calendarReminders: "calendar_reminders",
  eventAlerts: "event_alerts",
  planReminders: "plan_reminders",
  planAlerts: "plan_alerts",
  planInvites: "plan_invites",
  friendRequests: "friend_requests",
  alldayAlerts: "allday_alerts",
  habitReminders: "habit_reminders",
  habitReminderTime: "habit_reminder_time",
  morningSummary: "morning_summary",
  morningSummaryTime: "morning_summary_time",
};

export function patchToRow(patch: Partial<NotificationPrefs>): Partial<PrefsRow> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof NotificationPrefs)[]) {
    out[COLUMN[key]] = patch[key];
  }
  return out as Partial<PrefsRow>;
}

export function formatTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function timeOptions(stepMinutes = 15): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    options.push({ value, label: formatTime(value) });
  }
  return options;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Write the hook**

Create `src/hooks/useNotificationPreferences.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { expectRows, reportError } from "../lib/monitoring";
import { patchToRow, rowToPrefs, type NotificationPrefs } from "../lib/notificationPrefs.ts";

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        reportError(error, { area: "notification-prefs", target: "load" });
        setLoading(false);
        return;
      }
      if (data) {
        setPrefs(rowToPrefs(data));
      } else {
        // Defensive: the migration backfills a row, but never let a missing row block Settings.
        const { data: created, error: insertError } = await supabase
          .from("notification_preferences")
          .insert({ user_id: user.id })
          .select("*")
          .single();
        if (cancelled) return;
        if (insertError) reportError(insertError, { area: "notification-prefs", target: "create" });
        else setPrefs(rowToPrefs(created));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Optimistic; returns false (and reverts only the touched keys) when the write fails or changes nothing.
  const update = useCallback(
    async (patch: Partial<NotificationPrefs>): Promise<boolean> => {
      if (!user || !prefs) return false;
      const before: Partial<NotificationPrefs> = {};
      for (const key of Object.keys(patch) as (keyof NotificationPrefs)[]) {
        (before as Record<string, unknown>)[key] = prefs[key];
      }
      setPrefs((current) => (current ? { ...current, ...patch } : current));

      const { data, error } = await supabase
        .from("notification_preferences")
        .update(patchToRow(patch))
        .eq("user_id", user.id)
        .select("user_id");
      if (error || !expectRows("notification_preferences.update", data)) {
        setPrefs((current) => (current ? { ...current, ...before } : current));
        return false;
      }
      return true;
    },
    [user, prefs],
  );

  return { prefs, loading, update };
}
```

- [ ] **Step 6: Write the two controls**

Create `src/components/Toggle.tsx`:

```tsx
interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

// iOS-style switch with a 44px-tall hit area.
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="press"
      onClick={() => onChange(!checked)}
      style={{
        width: 56,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          width: 51,
          height: 31,
          borderRadius: 9999,
          background: checked ? "var(--color-accent)" : "var(--color-surface-dim)",
          border: `1px solid ${checked ? "transparent" : "var(--color-border)"}`,
          transition: "background 200ms ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: checked ? 21 : 1,
            width: 27,
            height: 27,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
            transition: "left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      </span>
    </button>
  );
}
```

Create `src/components/SelectField.tsx`:

```tsx
export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SelectField({ label, value, options, onChange, disabled }: SelectFieldProps) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 44,
        width: "100%",
        padding: "0 var(--space-3)",
        background: "var(--color-surface-dim)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        color: "var(--color-text)",
        fontSize: 16,
        fontFamily: "inherit",
        colorScheme: "dark",
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 7: Verify and commit**

Run: `npx tsc -b` (expected: no output) and `npm test`.

```bash
git add src/lib/notificationPrefs.ts tests/notificationPrefs.test.mts src/hooks/useNotificationPreferences.ts src/components/Toggle.tsx src/components/SelectField.tsx
git commit -m "feat: notification preferences model, hook, Toggle and SelectField"
```

---

### Task 14: Alert picker and the Settings section

**Files:**
- Create: `src/components/AlertPicker.tsx`, `src/components/NotificationSettings.tsx`
- Modify: `src/pages/Settings.tsx`

**Interfaces:**
- Consumes: Tasks 1, 10, 12, 13 and `POST /api/send-test-notification` (Task 8).
- Produces (used by Tasks 15, 16): `AlertPicker({ value: number[] | null, onChange: (value: number[] | null) => void, timed: boolean, defaultAlerts?: number[], label?: string })`. With `defaultAlerts` the first select offers "Default (…)" meaning `null`; without it the value is always an array.

- [ ] **Step 1: Write the alert picker**

Create `src/components/AlertPicker.tsx`:

```tsx
import {
  alertLabel,
  alertOffsets,
  alertSummary,
  applyPrimary,
  applySecondary,
  primaryChoice,
  secondaryChoice,
  type AlertChoice,
} from "../lib/alerts.ts";
import { SelectField, type SelectOption } from "./SelectField";

interface AlertPickerProps {
  value: number[] | null;
  onChange: (value: number[] | null) => void;
  timed: boolean;
  /** When given, the first select offers "Default (...)" which means null. */
  defaultAlerts?: number[];
  label?: string;
}

const toChoice = (raw: string): AlertChoice => (raw === "default" || raw === "none" ? raw : Number(raw));

export function AlertPicker({ value, onChange, timed, defaultAlerts, label = "Alert" }: AlertPickerProps) {
  const offsets = alertOffsets(timed);
  const primary = primaryChoice(value);
  const secondary = secondaryChoice(value);

  const primaryOptions: SelectOption[] = [
    ...(defaultAlerts ? [{ value: "default", label: `Default (${alertSummary(defaultAlerts, timed)})` }] : []),
    { value: "none", label: "None" },
    ...offsets.map((m) => ({ value: String(m), label: alertLabel(m, timed) })),
  ];
  // Keep a stored value selectable even if it is not in this list (e.g. a timed offset on a date-only item).
  if (typeof primary === "number" && !offsets.includes(primary)) {
    primaryOptions.push({ value: String(primary), label: alertLabel(primary, true) });
  }
  const secondaryOptions: SelectOption[] = [
    { value: "none", label: "None" },
    ...offsets.filter((m) => m !== primary).map((m) => ({ value: String(m), label: alertLabel(m, timed) })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <SelectField
        label={label}
        value={String(primary)}
        options={primaryOptions}
        onChange={(raw) => onChange(applyPrimary(value, toChoice(raw)))}
      />
      {typeof primary === "number" && (
        <SelectField
          label={`Second ${label.toLowerCase()}`}
          value={String(secondary)}
          options={secondaryOptions}
          onChange={(raw) => onChange(applySecondary(value, raw === "none" ? "none" : Number(raw)))}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the Notifications section**

Create `src/components/NotificationSettings.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { BellRinging } from "@phosphor-icons/react";
import { supabase } from "../lib/supabase";
import { reportError } from "../lib/monitoring";
import { currentTimeZone, disablePush, enablePush, getPushStatus } from "../lib/push";
import type { PushStatus } from "../lib/pushSupport.ts";
import { timeOptions } from "../lib/notificationPrefs.ts";
import { useNotificationPreferences } from "../hooks/useNotificationPreferences";
import { Toggle } from "./Toggle";
import { AlertPicker } from "./AlertPicker";
import { SelectField } from "./SelectField";

const card: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-4)",
};

const buttonBase: React.CSSProperties = {
  height: 44,
  borderRadius: "var(--radius-sm)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const times = timeOptions(15);

function Row({
  title,
  detail,
  checked,
  onToggle,
  children,
}: {
  title: string;
  detail?: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "var(--space-2) 0", borderTop: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          {detail && <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>{detail}</div>}
        </div>
        <Toggle checked={checked} onChange={onToggle} label={title} />
      </div>
      {checked && children && <div style={{ paddingBottom: "var(--space-2)" }}>{children}</div>}
    </div>
  );
}

export function NotificationSettings() {
  const { prefs, update } = useNotificationPreferences();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const refresh = useCallback(async () => setStatus(await getPushStatus()), []);

  useEffect(() => {
    refresh();
    // Coming back from the phone's system settings should update the card.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const save = useCallback(
    async (patch: Parameters<typeof update>[0]) => {
      const ok = await update(patch);
      if (!ok) setMessage({ text: "Couldn't save that change. Try again.", error: true });
    },
    [update],
  );

  const handleEnable = async () => {
    setBusy(true);
    setMessage(null);
    const result = await enablePush();
    await refresh();
    setBusy(false);
    if (!result.ok) {
      const text =
        result.reason === "denied"
          ? "Notifications were not allowed. You can turn them on in your phone's settings."
          : result.reason === "not-configured"
            ? "Notifications aren't set up on the server yet."
            : result.reason === "unsupported"
              ? "This browser can't receive notifications."
              : "Something went wrong turning notifications on. Try again.";
      setMessage({ text, error: true });
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await disablePush();
    } catch {
      setMessage({ text: "Couldn't turn notifications off. Try again.", error: true });
    }
    await refresh();
    setBusy(false);
  };

  const handleTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("not signed in");
      const response = await fetch("/api/send-test-notification", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setMessage({ text: "Test sent. It should arrive in a few seconds.", error: false });
      else if (response.status === 404)
        setMessage({ text: "No device is registered yet. Turn notifications off and on again.", error: true });
      else {
        setMessage({ text: "The test couldn't be delivered. Try again in a moment.", error: true });
        reportError(new Error(`send-test-notification -> ${response.status}`), { area: "push", target: "test" });
      }
    } catch (error) {
      reportError(error, { area: "push", target: "test" });
      setMessage({ text: "Couldn't reach the server. Try again.", error: true });
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <BellRinging size={22} weight="regular" color="var(--color-text-secondary)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Push notifications</div>
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
              {status === "on"
                ? "On for this device"
                : status === "blocked"
                  ? "Blocked in your phone's settings"
                  : status === "unsupported"
                    ? "Not supported in this browser"
                    : status === "needs-install"
                      ? "Add Pulse to your Home Screen first"
                      : "Reminders and updates, even when Pulse is closed"}
            </div>
          </div>
          {status === "off" && (
            <button
              className="press"
              onClick={handleEnable}
              disabled={busy}
              style={{
                ...buttonBase,
                padding: "0 var(--space-4)",
                background: "var(--color-accent)",
                border: "none",
                color: "#07070C",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Enable
            </button>
          )}
        </div>

        {status === "needs-install" && (
          <ol style={{ margin: "var(--space-3) 0 0", paddingLeft: "var(--space-5)", fontSize: 14, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
            <li>Tap the Share button in Safari.</li>
            <li>Choose "Add to Home Screen".</li>
            <li>Open Pulse from your Home Screen and come back to Settings.</li>
          </ol>
        )}
        {status === "blocked" && (
          <p style={{ margin: "var(--space-3) 0 0", fontSize: 14, color: "var(--color-text-secondary)" }}>
            Open your phone's Settings, find Pulse, and allow notifications. Then return here.
          </p>
        )}
        {message && (
          <p
            role="status"
            aria-live="polite"
            style={{ margin: "var(--space-3) 0 0", fontSize: 14, color: message.error ? "var(--color-danger)" : "var(--color-success)" }}
          >
            {message.text}
          </p>
        )}
      </div>

      {status === "on" && prefs && (
        <div style={card}>
          <Row
            title="Calendar events"
            detail="Reminders for your own events"
            checked={prefs.calendarReminders}
            onToggle={(v) => save({ calendarReminders: v })}
          >
            <AlertPicker value={prefs.eventAlerts} timed onChange={(v) => save({ eventAlerts: v ?? [] })} />
          </Row>
          <Row
            title="Plans"
            detail="Reminders for plans you're in"
            checked={prefs.planReminders}
            onToggle={(v) => save({ planReminders: v })}
          >
            <AlertPicker value={prefs.planAlerts} timed onChange={(v) => save({ planAlerts: v ?? [] })} />
          </Row>
          <Row
            title="Plan invitations"
            detail="When someone invites you to a plan"
            checked={prefs.planInvites}
            onToggle={(v) => save({ planInvites: v })}
          />
          <Row
            title="Friend requests"
            detail="When someone wants to be friends"
            checked={prefs.friendRequests}
            onToggle={(v) => save({ friendRequests: v })}
          />
          <div style={{ padding: "var(--space-2) 0", borderTop: "1px solid var(--color-border)" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Items without a time</div>
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: "var(--space-2)" }}>
              Events and plans that only have a date
            </div>
            <AlertPicker
              value={prefs.alldayAlerts}
              timed={false}
              label="Alert for items without a time"
              onChange={(v) => save({ alldayAlerts: v ?? [] })}
            />
          </div>
          <Row
            title="Habit reminders"
            detail="Unfinished habits for today"
            checked={prefs.habitReminders}
            onToggle={(v) => save({ habitReminders: v })}
          >
            <SelectField
              label="Habit reminder time"
              value={prefs.habitReminderTime}
              options={times}
              onChange={(v) => save({ habitReminderTime: v })}
            />
          </Row>
          <Row
            title="Morning summary"
            detail="Today's events and habits"
            checked={prefs.morningSummary}
            onToggle={(v) => save({ morningSummary: v })}
          >
            <SelectField
              label="Morning summary time"
              value={prefs.morningSummaryTime}
              options={times}
              onChange={(v) => save({ morningSummaryTime: v })}
            />
          </Row>

          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
            <button
              className="press"
              onClick={handleTest}
              disabled={busy}
              style={{
                ...buttonBase,
                flex: 1,
                background: "var(--color-complete-bg)",
                border: "none",
                color: "var(--color-accent)",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Send a test
            </button>
            <button
              className="press"
              onClick={handleDisable}
              disabled={busy}
              style={{
                ...buttonBase,
                flex: 1,
                background: "transparent",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Turn off
            </button>
          </div>
          <p style={{ margin: "var(--space-3) 0 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>
            Times use your time zone: {currentTimeZone()}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Put it in Settings**

In `src/pages/Settings.tsx`: add `import { NotificationSettings } from "../components/NotificationSettings";` with the other imports, and insert this block between the `{/* Integrations */}` section and the `{/* Data */}` section:

```tsx
      {/* Notifications */}
      <section>
        <SectionLabel>Notifications</SectionLabel>
        <NotificationSettings />
      </section>
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b` (expected: no output), `npm test`, `npm run build`.
Check the dev server compiles it: `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/src/components/NotificationSettings.tsx` (expected: `200`).
Note: in `npm run dev` the status shows "Off" with an Enable button that reports "This browser can't receive notifications." because no service worker runs in dev. The real check is on the deployed app (Task 18).

- [ ] **Step 5: Commit**

```bash
git add src/components/AlertPicker.tsx src/components/NotificationSettings.tsx src/pages/Settings.tsx
git commit -m "feat: Notifications section in Settings with Apple-style alert pickers"
```

---

### Task 15: Per-event alert in the Add Event form

**Files:**
- Modify: `src/hooks/useCalendarEvents.ts`, `src/pages/Calendar.tsx`

**Interfaces:**
- Consumes: `AlertPicker` (Task 14), `useNotificationPreferences` (Task 13), `calendar_events.alerts` (Task 2).
- Produces: `addEvent(data: { title; date; time; location; alerts?: number[] | null })` writes `alerts` (null = use the default).

- [ ] **Step 1: Accept and store the alert in the hook**

In `src/hooks/useCalendarEvents.ts`, change the `addEvent` parameter type and insert:

```ts
  const addEvent = useCallback(async (data: { title: string; date: string; time: string; location: string; alerts?: number[] | null }) => {
```

and in the `.insert({ ... })` object add one line after `location`:

```ts
        location: data.location || null,
        alerts: data.alerts ?? null,
```

The optimistic `CalendarEvent` built from `data` does not show alerts, so the `{ id: tempId, ...data }` object must not carry the extra key. Change it to:

```ts
    const { alerts: _alerts, ...visible } = data;
    const optimistic: CalendarEvent = { id: tempId, ...visible };
```

(If `noUnusedLocals` flags `_alerts`, use `const optimistic: CalendarEvent = { id: tempId, title: data.title, date: data.date, time: data.time, location: data.location };` instead.)

- [ ] **Step 2: Add the picker to the form**

In `src/pages/Calendar.tsx`:

1. Imports: change the React import to `import { useState, useMemo, useCallback, useEffect } from "react";` and add
   `import { AlertPicker } from "../components/AlertPicker";` and
   `import { useNotificationPreferences } from "../hooks/useNotificationPreferences";`.
2. Next to the other `useState` calls for the form add:

```tsx
  const { prefs } = useNotificationPreferences();
  const [newEventAlerts, setNewEventAlerts] = useState<number[] | null>(null);
  const eventHasTime = newEventTime !== "";
  // The choices differ for timed and date-only events, so start over when that changes.
  useEffect(() => {
    setNewEventAlerts(null);
  }, [eventHasTime]);
```

3. In the form's `onSubmit`, pass and reset the alert:

```tsx
              addEvent({ title: newEventTitle.trim(), date: selectedDate, time: newEventTime, location: newEventLocation.trim(), alerts: newEventAlerts });
              setNewEventTitle(""); setNewEventTime(""); setNewEventLocation(""); setNewEventAlerts(null); setShowAddForm(false);
```

and in the "+" button's `onPointerUp` add `setNewEventAlerts(null);` next to the other resets.

4. Insert this block between the Location `<input ... />` and the submit `<button type="submit" ...>`:

```tsx
            {prefs && (
              <div>
                <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: "var(--space-1)" }}>Alert</div>
                <AlertPicker
                  value={newEventAlerts}
                  onChange={setNewEventAlerts}
                  timed={eventHasTime}
                  defaultAlerts={eventHasTime ? prefs.eventAlerts : prefs.alldayAlerts}
                />
              </div>
            )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b` (expected: no output) and `npm run build`.
**[USER]** after deploying: add an event with "30 minutes before" and a second alert; then in the SQL Editor run `select title, alerts from public.calendar_events order by created_at desc limit 3;`. Expected: the new row shows `{30,...}`; an event left on "Default" shows `null`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCalendarEvents.ts src/pages/Calendar.tsx
git commit -m "feat: per-event alert in the Add Event form"
```

---

### Task 16: Per-plan "Remind me"

**Files:**
- Modify: `src/types.ts`, `src/hooks/useSharedPlans.ts`, `src/pages/PlanDetail.tsx`

**Interfaces:**
- Consumes: `AlertPicker` (Task 14), `useNotificationPreferences` (Task 13), `plan_members.alerts` (Task 2).
- Produces: `PlanMember.alerts: number[] | null`; `useSharedPlans().updateMyAlerts(planId, alerts): Promise<boolean>`.

- [ ] **Step 1: Type and data**

In `src/types.ts`, add to `interface PlanMember` (after `rsvp`):

```ts
  alerts: number[] | null;
```

In `src/hooks/useSharedPlans.ts`, in the member mapping (the object with `rsvp: m.rsvp as PlanMember["rsvp"]`) add:

```ts
          alerts: m.alerts ?? null,
```

Add this function next to `updateRsvp`:

```ts
  // Each member has their own alert for a plan (like shared events in Apple Calendar).
  const updateMyAlerts = useCallback(
    async (planId: string, alerts: number[] | null): Promise<boolean> => {
      if (!user) return false;
      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId
            ? { ...p, members: p.members.map((m) => (m.userId === user.id ? { ...m, alerts } : m)) }
            : p,
        ),
      );
      const { data, error } = await supabase
        .from("plan_members")
        .update({ alerts })
        .eq("plan_id", planId)
        .eq("user_id", user.id)
        .select("id");
      if (error || !expectRows("plan_members.alerts", data)) {
        await fetchAll();
        return false;
      }
      return true;
    },
    [user, fetchAll],
  );
```

and add `updateMyAlerts,` to the object returned by the hook (next to `updateRsvp`).

- [ ] **Step 2: The control**

In `src/pages/PlanDetail.tsx`: add imports

```tsx
import { AlertPicker } from "../components/AlertPicker";
import { SectionHeader } from "../components/SectionHeader";
import { useNotificationPreferences } from "../hooks/useNotificationPreferences";
```

Inside `PlanDetail()`, with the other hooks (before the early `if (!plan) return`), add:

```tsx
  const { prefs } = useNotificationPreferences();
```

After `const myRsvp = plan.members.find(...)?.rsvp;` add:

```tsx
  const myAlerts = plan.members.find((m) => m.userId === user?.id)?.alerts ?? null;
```

and insert this block directly after the closing `</div>` of the `{/* RSVP */}` block (before `{/* Members */}`):

```tsx
      {/* Reminder */}
      {plan.date && prefs && (
        <div>
          <SectionHeader title="Remind me" />
          <AlertPicker
            value={myAlerts}
            timed={Boolean(plan.time)}
            label="Reminder"
            defaultAlerts={plan.time ? prefs.planAlerts : prefs.alldayAlerts}
            onChange={(alerts) => plans.updateMyAlerts(plan.id, alerts)}
          />
        </div>
      )}
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b` (expected: no output) and `npm run build`.
**[USER]** after deploying: on a plan that has a date, pick "Remind me: 2 hours before"; run `select plan_id, user_id, alerts from public.plan_members where user_id = '<your user id>';`. Expected: `{120}` on that row. Pick "Default": expected `null`.

```bash
git add src/types.ts src/hooks/useSharedPlans.ts src/pages/PlanDetail.tsx
git commit -m "feat: per-plan reminder (Remind me) in Plan Detail"
```

---

### Task 17: Keep time zone and device registration in sync

**Files:**
- Create: `src/hooks/usePushSync.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `currentSubscription`, `currentTimeZone`, `getPushStatus`, `registerSubscription` (Task 12); `profiles.timezone` (Task 2).
- Produces: `usePushSync()`: on each app open while signed in, updates `profiles.timezone` if it changed and re-registers this device's subscription for the signed-in account.

Why: reminders are computed in the user's stored time zone (travel changes it), and an endpoint can rotate or a phone can be used by a different account since the subscription was made.

- [ ] **Step 1: Write the hook**

Create `src/hooks/usePushSync.ts`:

```ts
import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { currentSubscription, currentTimeZone, getPushStatus, registerSubscription } from "../lib/push";
import { expectRows, reportError } from "../lib/monitoring";

export function usePushSync() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const timezone = currentTimeZone();
        const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
        if (!cancelled && profile && profile.timezone !== timezone) {
          const { data, error } = await supabase
            .from("profiles")
            .update({ timezone })
            .eq("user_id", userId)
            .select("user_id");
          if (error) throw error;
          expectRows("profiles.timezone", data);
        }

        // The browser still holds a subscription: make sure the server has it under this account.
        if (!cancelled && (await getPushStatus()) === "on") {
          const subscription = await currentSubscription();
          if (subscription) await registerSubscription(subscription);
        }
      } catch (error) {
        reportError(error, { area: "push", target: "sync" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
```

- [ ] **Step 2: Call it**

In `src/App.tsx`: `import { usePushSync } from "./hooks/usePushSync";` and in `AppContent()` add `usePushSync();` on the line after `useTheme();`.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b` (expected: no output) and `npm run build`.
**[USER]** after deploying: sign in from a laptop, then check `select user_id, timezone from public.profiles;`. Expected: your row shows your real zone (for example `Europe/Prague`), not `UTC`.

```bash
git add src/hooks/usePushSync.ts src/App.tsx
git commit -m "feat: sync time zone and device registration on app open"
```

---

### Task 18: Runbook, docs and end-to-end verification

**Files:**
- Create: `docs/notifications-runbook.md`
- Modify: `CLAUDE.md`, `handoff.md`, `docs/superpowers/specs/2026-10-08-push-notifications-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the steps the user follows to switch the feature on, and the docs future sessions read.

- [ ] **Step 1: Write the runbook**

Create `docs/notifications-runbook.md`:

```markdown
# Push notifications: setup and checks

Order matters. Do these once; after that the feature is live for every user who turns it on in Settings.

## 1. Keys and secrets
1. `npx web-push generate-vapid-keys` prints a public and a private key.
2. Pick a long random `CRON_SECRET` (for example `openssl rand -hex 32`).
3. Supabase dashboard, Project Settings, API: copy the `service_role` key (never share or commit it).

## 2. Vercel environment variables (Production, then redeploy)
| Name | Value |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | the public key |
| `VAPID_PUBLIC_KEY` | the public key (same value) |
| `VAPID_PRIVATE_KEY` | the private key |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `CRON_SECRET` | the random string |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
| `BETTERSTACK_HEARTBEAT_URL` | from step 5 (can be added later) |

## 3. Database (Supabase SQL Editor, in this order)
1. `supabase/migrations/009_push_notifications.sql`
2. `supabase/migrations/010_pending_notifications.sql`
3. `supabase/tests/pending_notifications.test.sql`: the last result must read `ALL TESTS PASSED`.

## 4. Deploy, then check the route is alive
After the PR is merged and the deploy is green:
`curl -i -X POST https://pulse-app-habit.vercel.app/api/send-notifications`
Expected: `401` with `{"error":"unauthorized"}`. (`500 Cannot find module` means the shared helper import failed: see Task 7 step 6 of the plan.)

## 5. Scheduler and heartbeat
1. Better Stack, Uptime, Heartbeats, Create: period 1 minute, grace 3 minutes. Copy its URL into `BETTERSTACK_HEARTBEAT_URL` in Vercel and redeploy. Add an email alert for it.
2. In `supabase/scheduler/send-notifications.sql` replace `<CRON_SECRET>` with your secret (do not commit that change) and run it in the SQL Editor.
3. Check: `select jobname, schedule, active from cron.job;` shows two jobs. After two minutes: `select status, return_message from cron.job_run_details order by start_time desc limit 3;` shows `succeeded`, and `select id, status_code from net._http_response order by created desc limit 3;` shows `200`. The Better Stack heartbeat turns green.

## 6. Turn it on, on the iPhone
1. Open https://pulse-app-habit.vercel.app in **Safari**, Share, **Add to Home Screen**, open Pulse from the Home Screen icon, sign in.
2. Settings, Notifications, **Enable**, Allow.
3. **Send a test**: a notification arrives within seconds.

## 7. Real checks
- Habit: set the habit reminder to 2 minutes from now (with an unfinished habit). Lock the phone. It arrives; tapping opens Habits.
- Event: add an event 20 minutes from now with Alert "15 minutes before". It arrives; tapping opens Calendar.
- Second alert: add an event an hour away with "30 minutes before" and a second alert "At time of event"; both arrive.
- Plan: create a plan with a friend for tomorrow; the friend gets an invitation notification; both get the reminder at their own default or "Remind me" choice.
- Friend request: from a second account send a request; the first account's phone gets one; tapping opens Social.
- No duplicates: nothing arrives twice. Turn the app switch off: nothing arrives. "Turn off" in Settings: no more notifications, and `select count(*) from push_subscriptions;` drops.

## Troubleshooting
- Nothing arrives, heartbeat green: `select * from public.pending_notifications();` shows what the server thinks is due; check the user has a row in `push_subscriptions`; check Vercel function logs for `[send-notifications]` (counts of due/claimed/delivered/removed).
- Heartbeat red: `cron.job_run_details` and `net._http_response` (above), then Vercel logs.
- iPhone says "Add Pulse to your Home Screen": it is open in a Safari tab, not from the Home Screen icon.
- Sign-in or push works only on the deployed HTTPS site; `npm run dev` has no service worker.
```

- [ ] **Step 2: Update CLAUDE.md**

Add this section before `## Supabase migrations`:

```markdown
## Notifications
- Spec `docs/superpowers/specs/2026-10-08-push-notifications-design.md`, plan `docs/superpowers/plans/2026-10-09-push-notifications.md`, setup and checks `docs/notifications-runbook.md`.
- What is due is decided in SQL only: `pending_notifications(p_now)` (`supabase/migrations/010_...`). Change rules there and extend `supabase/tests/pending_notifications.test.sql` (fake clock `p_now`; the user runs it in the SQL Editor). The Vercel route `api/send-notifications.ts` is thin; delivery rules live in `api/_lib/notify.ts` and are tested with `npm test`.
- `npm test` runs `node --test tests/*.test.mts` on pure modules. Pure modules in `src/lib` and `api/_lib` must have no imports except other pure modules, with `.ts` extensions, so node can load them.
- Alerts follow Apple Calendar offsets, max two per item; `null` = default, `{}` = none (`src/lib/alerts.ts`).
- The service worker (`src/sw.ts`) does not run in `npm run dev`; push can only be tested on the deployed HTTPS app, on iPhone only from the Home Screen icon.
- Never expose `VAPID_PRIVATE_KEY`, `CRON_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` to the client (no `VITE_` prefix).
```

and in the migrations bullet change `(001, 003, 004, 005, 006, 007, 008; 002 is reserved for push notifications)` to `(001, 003 to 010)`.

- [ ] **Step 3: Update handoff.md and the spec**

In `handoff.md`: change the Push notifications table row to `Built on branch feat/push-notifications (see the plan); needs the runbook steps (keys, 009 and 010, scheduler, heartbeat) before it works`; add `009` and `010` to "Pending" under the Supabase section; replace Next step 3 (push notifications) with "Run the notifications runbook and verify on an iPhone"; add a Known issue: "Notifications cannot be tested in `npm run dev` (no service worker)".

In the spec, in the Database section change "`pending_notifications(...)` ... " intro to say the function is in `010_pending_notifications.sql` and that clients register devices through `register_push_subscription` (no insert policy), matching the plan's rulings.

- [ ] **Step 4: Full verification**

Run: `npm test` (all PASS), `npx tsc -b` (no output), `npm run build` (`built in`).

- [ ] **Step 5: Commit**

```bash
git add docs/notifications-runbook.md CLAUDE.md handoff.md docs/superpowers/specs/2026-10-08-push-notifications-design.md
git commit -m "docs: notifications runbook, CLAUDE.md section and handoff"
```

- [ ] **Step 6: [USER] End-to-end on the deployed app**

Follow `docs/notifications-runbook.md` sections 1 to 7. The feature is done when every check in section 7 passes on a real iPhone Home Screen app with the phone locked, and the Better Stack heartbeat has stayed green for 10 minutes.

---

## Self-Review (spec coverage)

| Spec requirement | Task |
|---|---|
| Subscribe/unsubscribe from Settings, one prompt | 12, 14 |
| Per-kind switches, habit/morning times | 13, 14 |
| Apple-style alerts (offsets, two per item, date-only at 09:00) | 1, 3, 14 |
| Defaults in Settings + per-event + per-plan overrides | 14, 15, 16 |
| Calendar reminders, plan reminders | 3 |
| Plan invitations, friend requests | 4 |
| Habit reminders (Monday weekly, skip when done), morning summary | 5 |
| Catch-up window, no duplicates, retry on transient failure | 3 to 6, 7 |
| Dead subscription cleanup, multi-device | 6, 7 |
| Service worker parity + push + tap opens screen | 11 |
| iPhone install, blocked, unsupported states; test button | 10, 12, 14, 8 |
| Time zone per user, kept current | 2, 17 |
| Secrets server-only, cron secret, scheduler | 7, 9 |
| Heartbeat monitoring | 7, 18 |
| Existing users backfilled; devices re-registered | 2, 17 |
| Docs and runbook | 18 |

Placeholder scan: no TBD/TODO; every code step shows code. Type consistency: `AlertPicker` props, `NotificationPrefs`, `PushStatus`, `DueNotification`, `Deps` and `register_push_subscription` argument names are identical wherever used. The `pg_temp.cnt` helper and the `[A]/[B]/[C]` test sections are only edited by Tasks 3 to 5.
