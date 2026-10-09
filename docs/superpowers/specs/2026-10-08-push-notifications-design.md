# Pulse Push Notifications

**Date:** 2026-10-09 (revises the 2026-10-08 draft)
**Status:** Draft for user review
**Scope:** Reliable Web Push that reaches the user with the app closed and the phone locked: calendar event reminders, habit reminders, a morning summary. Configured from Settings.

## What the user asked for

- Notifications that are **reliable and correct**, arriving when the app is closed.
- Three kinds: calendar events, habit reminders, morning summary.
- **Notification settings inside the app's Settings.**
- Scheduler decision (made): **Supabase pg_cron calls a Vercel API route every minute.** Free, works on Vercel Hobby, lives in the existing repo/deploy.

## Success criteria

1. A user can turn notifications on from Settings with one permission prompt, and turn them off again.
2. Each kind has its own switch; reminder times and the calendar lead time are configurable.
3. A calendar reminder arrives `lead` minutes before an event that has a time (default 15).
4. A habit reminder arrives at the chosen local time (default 20:00) listing today's unfinished habits, and is skipped when none are left.
5. A morning summary arrives at the chosen local time (default 07:00) with today's event and habit counts, and is skipped when both are zero.
6. Tapping a notification opens the relevant screen (`/calendar`, `/habits`, `/`).
7. No duplicates, and a late or missed scheduler run still delivers (catch-up window).
8. If the sender stops running, the owner is alerted (Better Stack heartbeat).
9. Works on iPhone (installed PWA), Android Chrome, desktop Chrome/Edge/Firefox.

**Honest limits:** delivery goes through Apple/Google push services and the phone's OS (Focus modes, Low Power Mode, a force-quit app). "Reliable" here means the server side never loses or duplicates a reminder; the OS can still delay one. iPhone only supports web push for the app **added to the Home Screen** (iOS 16.4+), and the permission prompt must follow a tap.

## Architecture

```
Settings (PWA) --subscribe--> Supabase: push_subscriptions
                              Supabase: notification_preferences, profiles.timezone

pg_cron (every minute) --pg_net POST + secret--> Vercel  /api/send-notifications
   /api/send-notifications:
     1. verify secret
     2. rpc pending_notifications()          (SQL decides what is due)
     3. claim each item in notification_log  (atomic, prevents duplicates)
     4. web-push to the user's subscriptions (VAPID)
     5. delete dead subscriptions (404/410); release claim on transient failure
     6. ping Better Stack heartbeat
Push service (APNs/FCM) --> service worker (src/sw.ts) --> notification --> tap opens screen
```

Decisions:
- **All "what is due" logic lives in one SQL function** (`pending_notifications`) so the rules sit next to the data, are testable in the SQL editor with a fake clock, and the route stays thin.
- **At-most-once with retry on transient failure:** the log row is inserted first (`on conflict do nothing`); only the run that inserted it sends. If every delivery attempt fails transiently, the row is deleted so the next minute retries inside the catch-up window.
- **Per-user timezone** in `profiles.timezone`, refreshed from `Intl.DateTimeFormat().resolvedOptions().timeZone` whenever the app opens signed in.
- **VAPID**, no Firebase.

## Database: `supabase/migrations/009_push_notifications.sql`

(002 was reserved for this; 009 is the next free number.)

- `profiles.timezone text not null default 'UTC'`.
- `push_subscriptions(id, user_id, endpoint unique, p256dh, auth, user_agent, created_at)`. RLS: select/insert/delete own rows; no update (delete + insert).
- `notification_preferences(user_id unique, calendar_reminders default true, calendar_lead_minutes default 15, habit_reminders default true, habit_reminder_time default '20:00', morning_summary default true, morning_summary_time default '07:00', created_at)`. RLS: select/insert/update own row. **Backfill** a row for every existing profile and add a trigger so new profiles get one. The client also upserts its row, so a missing row can never block Settings.
- `notification_log(user_id, kind, reference_id, sent_at, primary key (user_id, kind, reference_id))`. RLS on, no policies (server only). A daily pg_cron job deletes rows older than 3 days.
- `pending_notifications(p_now timestamptz default now())` returns `(user_id, kind, reference_id, title, body, url, tag)`, `security definer`, with `revoke execute ... from public, anon, authenticated` so only the service role can call it (otherwise any signed-in user could read other users' reminders). `p_now` lets us test with a fake clock.

Rules inside `pending_notifications`, per user with at least one subscription and the kind enabled (local = `p_now at time zone profiles.timezone`):

- **calendar**: event has a `time`; `event_start - lead <= p_now < event_start`, where `event_start = (date + time) at time zone timezone`. `reference_id = event id || ':' || date || ' ' || time`, so a rescheduled event reminds again. Body: `"<title> at HH24:MI"`, url `/calendar`.
- **habit**: `local_date + habit_reminder_time <= local_now < that + 30 minutes` (catch-up window, no midnight wrap bug). Incomplete habits = daily habits, plus weekly habits **on Monday** (mirrors `todaysHabits` in the app), with no completion for `local_date`. Skip if none. Body lists up to 3 names then `+N more`. `reference_id = local_date`, url `/habits`.
- **morning**: same window using `morning_summary_time`. Counts today's `calendar_events` and the incomplete habits above. Skip if both are 0. Body `"2 events today · 5 habits to go"`, url `/`.

## Server: `api/send-notifications.ts` (Vercel route, Node)

- `POST` only; requires `Authorization: Bearer <CRON_SECRET>` (constant-time compare); otherwise 401.
- Uses `SUPABASE_SERVICE_ROLE_KEY` (server only) to call the RPC and read subscriptions.
- `web-push` with `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (`mailto:`). Payload JSON: `{ title, body, tag, data: { url } }`.
- 404/410 from a push service: delete that subscription. Other errors: log, release the claim only if no device succeeded.
- On success pings `BETTERSTACK_HEARTBEAT_URL` (if set); on an unexpected exception pings its `/fail` and returns 500. Logs counts (due, sent, removed) for Vercel logs.
- Returns quickly; work is bounded (only due items, handful of users).

A second route, **`api/send-test-notification.ts`**, takes the signed-in user's access token (`Authorization: Bearer <supabase jwt>`), verifies it with Supabase, and sends one test push to that user's devices. It powers "Send a test notification" in Settings so a user can prove their phone is set up.

### Scheduler setup (one-time, by the user): `supabase/scheduler/send-notifications.sql`

Not a numbered migration because it contains a secret and the live URL. It enables `pg_cron` and `pg_net`, stores the secret in Supabase Vault, and schedules `net.http_post` to `https://pulse-app-habit.vercel.app/api/send-notifications` every minute, plus the daily log cleanup. The file in the repo has placeholders only.

## Client

- **`vite.config.ts`**: PWA `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`.
- **`src/sw.ts`** must keep what `generateSW` did today, or installed apps break: `precacheAndRoute(self.__WB_MANIFEST)`, `cleanupOutdatedCaches()`, SPA navigation fallback to `index.html` (denylist `/api`), and `skipWaiting` + `clientsClaim` (matches `registerType: 'autoUpdate'`). Adds `push` (always shows a notification; iOS forbids silent push) and `notificationclick` (focus an open window and navigate, else open one). Adds `workbox-*` as explicit dependencies.
- **`src/lib/push.ts`**: `getPushStatus()` returns one of `unsupported | needs-install | blocked | off | on`; `enablePush()` (permission prompt then subscribe then upsert row; must run from a tap); `disablePush()` (unsubscribe + delete row); `syncPush()` on app open (re-upsert the subscription if the endpoint changed, update `profiles.timezone`). Errors go through `reportError`.
- **`src/hooks/useNotificationPreferences.ts`**: loads/upserts the user's row, optimistic updates with rollback and an error toast; uses `expectRows`.
- **Env:** `VITE_VAPID_PUBLIC_KEY` (client). Server-only: `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `BETTERSTACK_HEARTBEAT_URL`.

## Settings UI (new "Notifications" section, between Integrations and Data)

Follows `docs/design-system.md`: card surface, 44px targets, tokens, `press` feedback, accessible switches (`role="switch"`, `aria-checked`), a new shared `Toggle` component.

States of the top card:

| Status | Shows |
|---|---|
| `unsupported` | "This browser can't receive notifications." |
| `needs-install` (iPhone, not in Home Screen app) | "Add Pulse to your Home Screen to turn on notifications" with the three share-sheet steps |
| `blocked` | "Notifications are blocked. Turn them on for Pulse in your phone's settings." |
| `off` | "Push notifications" with an **Enable** button |
| `on` | "Notifications are on for this device" with a **Turn off** action |

When `on`, three rows, each with a switch and its own control:

- **Calendar reminders**: lead time select (5, 10, 15, 30, 60 min).
- **Habit reminders**: time select (15-minute steps).
- **Morning summary**: time select (15-minute steps).

Plus **Send a test notification** (calls `api/send-test-notification`, shows a toast with the result) and a muted line `Times use your timezone: Europe/Prague`. Preferences are per account; subscriptions are per device.

## Reliability and monitoring

- Better Stack **Heartbeat** monitor expects a ping every minute (grace period of a few minutes); it alerts if the sender stops or fails.
- Client and API errors reported through the existing monitoring.
- The 30-minute catch-up window and the `notification_log` keep a late run from losing or repeating a reminder.

## Testing (no test runner exists)

- **SQL:** run `select * from pending_notifications('<fake time>')` against fixtures (an event, a habit, a user in `Europe/Prague`) around the boundaries: just before/after lead time, window edges, midnight, Monday weekly habit, all habits done, rescheduled event.
- **Route:** call with and without the secret; with a bad token; with a dead subscription (expect it deleted).
- **End to end:** enable on a real iPhone Home Screen app, send a test, then set the habit time one minute ahead and lock the phone; tap each notification type and check the destination; disable and confirm no more arrive.
- Verification by build (`npx tsc -b`) for the TypeScript parts. I cannot run SQL against Supabase myself, so SQL checks are done by the user in the SQL editor.

## Files

New: `src/sw.ts`, `src/lib/push.ts`, `src/hooks/useNotificationPreferences.ts`, `src/components/Toggle.tsx`, `api/send-notifications.ts`, `api/send-test-notification.ts`, `supabase/migrations/009_push_notifications.sql`, `supabase/scheduler/send-notifications.sql`.
Changed: `vite.config.ts`, `src/pages/Settings.tsx`, `package.json` (`web-push`, `workbox-*`), `.env.example`, docs (`CLAUDE.md`, `handoff.md`).

## Out of scope

Google Calendar events (integration not connected), quiet hours (use OS Focus), snooze, per-device preferences, rich actions/images, email, delivery analytics.
