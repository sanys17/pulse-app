# Pulse Push Notifications

**Date:** 2026-10-09 (revises the 2026-10-08 draft)
**Status:** Draft for user review
**Scope:** Reliable Web Push that reaches the user with the app closed and the phone locked: calendar event reminders, habit reminders, a morning summary. Configured from Settings.

## What the user asked for

- Notifications that are **reliable and correct**, arriving when the app is closed.
- Kinds: calendar event reminders, **plan reminders and plan invitations**, **friend requests**, habit reminders, morning summary.
- **Alert timing follows Apple Calendar**: at time of event, 5, 10, 15, 30 minutes, 1 hour, 2 hours, 1 day, 2 days, 1 week before; up to two alerts per item; settable as a default in Settings and per item.
- **Notification settings inside the app's Settings.**
- Scheduler decision (made): **Supabase pg_cron calls a Vercel API route every minute.** Free, works on Vercel Hobby, lives in the existing repo/deploy.

## Success criteria

1. A user can turn notifications on from Settings with one permission prompt, and turn them off again.
2. Each kind has its own switch; habit and morning times are configurable.
3. Calendar events and plans alert at the user's chosen Apple-style offsets (see Alerts below), from a default in Settings that can be overridden per event (when creating it) and per plan (by each member).
4. A habit reminder arrives at the chosen local time (default 20:00) listing today's unfinished habits, and is skipped when none are left.
5. A morning summary arrives at the chosen local time (default 07:00) with today's event and habit counts, and is skipped when both are zero.
6. Tapping a notification opens the relevant screen (`/calendar`, `/habits`, `/`).
7. No duplicates, and a late or missed scheduler run still delivers (catch-up window).
8. If the sender stops running, the owner is alerted (Better Stack heartbeat).
9. Works on iPhone (installed PWA), Android Chrome, desktop Chrome/Edge/Firefox.

**Honest limits:** delivery goes through Apple/Google push services and the phone's OS (Focus modes, Low Power Mode, a force-quit app). "Reliable" here means the server side never loses or duplicates a reminder; the OS can still delay one. iPhone only supports web push for the app **added to the Home Screen** (iOS 16.4+), and the permission prompt must follow a tap.

## Alerts (Apple Calendar logic)

An alert is "N minutes before the start". Stored as an integer array of minutes, at most two values; empty array = none.

| Item has a time | Choices (stored minutes) |
|---|---|
| Timed event / plan | At time of event (0), 5, 10, 15, 30 minutes before, 1 hour (60), 2 hours (120), 1 day (1440), 2 days (2880), 1 week (10080) before, None |
| Date only (no time) | On the day at 9:00 AM (0), 1 day before at 9:00 AM (1440), 2 days (2880), 1 week (10080) before, None. The anchor is 09:00 local time of the event day. |

- **Where it is set:** (1) defaults in Settings, one pair per kind (events, plans) plus one shared default for date-only items; (2) per event in the Add Event form ("Alert" and "Second alert", default "Default"); (3) per plan, by each member, in Plan Detail ("Remind me"), because each person wants their own alert, as with shared events in Apple Calendar. `null` on the item = use the user's default.
- **Defaults:** events 15 minutes before, plans 1 hour before, date-only 'on the day at 9:00 AM'.
- **When an alert is due:** from its alert time until 15 minutes later, but never after the item has started (for "at time of event", until 15 minutes after the start). A missed run inside that window still delivers; later does not (a stale reminder is worse than none).
- **Not in v1:** "Custom" times, editing an event's alert after creation (events cannot be edited today).

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
- `calendar_events.alerts int[]` and `plan_members.alerts int[]`, both nullable (null = use the user's default; `'{}'` = none).
- `push_subscriptions(id, user_id, endpoint unique, p256dh, auth, user_agent, created_at)`. RLS: select/insert/delete own rows; no update (delete + insert).
- `notification_preferences(user_id unique, calendar_reminders default true, event_alerts int[] default '{15}', plan_reminders default true, plan_alerts int[] default '{60}', plan_invites default true, friend_requests default true, allday_alerts int[] default '{0}', habit_reminders default true, habit_reminder_time default '20:00', morning_summary default true, morning_summary_time default '07:00', created_at)`. RLS: select/insert/update own row. **Backfill** a row for every existing profile and add a trigger so new profiles get one. The client also upserts its row, so a missing row can never block Settings.
- `notification_log(user_id, kind, reference_id, sent_at, primary key (user_id, kind, reference_id))`. RLS on, no policies (server only). A daily pg_cron job deletes rows older than 3 days.
- `pending_notifications(p_now timestamptz default now())` returns `(user_id, kind, reference_id, title, body, url, tag)`, `security definer`, with `revoke execute ... from public, anon, authenticated` so only the service role can call it (otherwise any signed-in user could read other users' reminders). `p_now` lets us test with a fake clock.

Rules inside `pending_notifications`, per user with at least one subscription and the kind enabled (local = `p_now at time zone profiles.timezone`):

- **calendar** and **plan** reminders share one rule. Items: the user's `calendar_events`, and `shared_plans` where the user is a member whose `rsvp` is not `declined` and the plan status is not `cancelled` or `completed` and has a `date`. For each item take `coalesce(item.alerts, default)`, where the default is `event_alerts` / `plan_alerts` for timed items and `allday_alerts` for date-only items. For each offset: `start = (date + time) at time zone timezone` (date-only: `date + 09:00`), `alert_time = start - offset`; due when `alert_time <= p_now < least(alert_time + 15 min, start)` (offset 0: `< start + 15 min`). `reference_id = kind || ':' || item id || ':' || start || ':' || offset`, so a different offset or a rescheduled item alerts again but the same alert never repeats. Body: `"<title> at HH24:MI"` (plans: `"<title> with Anna, Tom"` up to 2 names); title carries the lead (`In 15 min`, `Now`, `Tomorrow`). Urls `/calendar` and `/social/plan/<id>`.
- **friend request**: a `friendships` row where the user is the addressee, `status = 'pending'`, created in the last 15 minutes, `friend_requests` on. Body `"Anna wants to be friends"` (name from `profiles`, falling back to `@username`), url `/social`. `reference_id = friendship id`. Only the recipient is notified; the requester gets no push.
- **plan invitation**: a `plan_members` row for the user, `rsvp = 'pending'`, created in the last 15 minutes, where the user is not the creator, `plan_invites` on. Body `"Anna invited you to <title>"`, url `/social/plan/<id>`. `reference_id = plan id`.
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

- **Calendar events**: switch, then **Alert** and **Second alert** selects with the Apple options above.
- **Plans**: switch for reminders (**Alert**, **Second alert**) and a separate switch for **invitations**.
- **Friend requests**: switch.
- **Items without a time**: one select (On the day at 9:00 AM, 1 day before, 2 days before, 1 week before).
- **Habit reminders**: switch and time select (15-minute steps).
- **Morning summary**: switch and time select (15-minute steps).

Plus **Send a test notification** (calls `api/send-test-notification`, shows a toast with the result) and a muted line `Times use your timezone: Europe/Prague`. Preferences are per account; subscriptions are per device.

## Where else alerts are set

- **Add Event form (`Calendar.tsx`)**: an "Alert" row (and "Second alert" once the first is set) below the time field, default "Default (15 minutes before)"; options switch to the date-only list when no time is entered. Saved to `calendar_events.alerts`.
- **Plan Detail**: a "Remind me" row with the same two selects, saved to the member's `plan_members.alerts`. The Create Plan sheet gets no alert field because the alert is personal to each member.
- A shared `AlertPicker` component renders the two selects and the options, so the three places stay identical.

## Reliability and monitoring

- Better Stack **Heartbeat** monitor expects a ping every minute (grace period of a few minutes); it alerts if the sender stops or fails.
- Client and API errors reported through the existing monitoring.
- The 30-minute catch-up window and the `notification_log` keep a late run from losing or repeating a reminder.

## Testing (no test runner exists)

- **SQL:** run `select * from pending_notifications('<fake time>')` against fixtures (events and plans, a habit, a user in `Europe/Prague`) around the boundaries: each Apple offset, two alerts on one item, date-only item at 09:00 and the day before, offset 0 window, an alert after the item started (must not fire), declined/cancelled plan, per-item override vs default, a plan invitation, a friend request (and none once it is accepted or declined, or after 15 minutes), midnight, Monday weekly habit, all habits done, rescheduled event.
- **Route:** call with and without the secret; with a bad token; with a dead subscription (expect it deleted).
- **End to end:** enable on a real iPhone Home Screen app, send a test, then set the habit time one minute ahead and lock the phone; tap each notification type and check the destination; disable and confirm no more arrive.
- Verification by build (`npx tsc -b`) for the TypeScript parts. I cannot run SQL against Supabase myself, so SQL checks are done by the user in the SQL editor.

## Files

New: `src/components/AlertPicker.tsx`, `src/lib/alerts.ts` (option lists and labels), `src/sw.ts`, `src/lib/push.ts`, `src/hooks/useNotificationPreferences.ts`, `src/components/Toggle.tsx`, `api/send-notifications.ts`, `api/send-test-notification.ts`, `supabase/migrations/009_push_notifications.sql`, `supabase/scheduler/send-notifications.sql`.
Changed: `vite.config.ts`, `src/pages/Settings.tsx`, `src/pages/Calendar.tsx`, `src/pages/PlanDetail.tsx`, `src/hooks/useCalendarEvents.ts`, `src/hooks/useSharedPlans.ts`, `src/lib/database.types.ts`, `package.json` (`web-push`, `workbox-*`), `.env.example`, docs (`CLAUDE.md`, `handoff.md`).

## Out of scope

"Request accepted" notifications (cheap to add later), cheer notifications, plan change/cancel notifications, Google Calendar events (integration not connected), quiet hours (use OS Focus), snooze, per-device preferences, rich actions/images, email, delivery analytics.
