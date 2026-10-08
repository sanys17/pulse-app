# Pulse Push Notifications

**Date:** 2026-10-08
**Status:** Draft
**Scope:** Sub-project 2. Reliable Web Push notifications that work with the app closed and the phone locked. Three trigger types: calendar event reminders, habit reminders, and morning summary.

---

## Goal

Give users timely nudges — a reminder before a calendar event, a prompt to complete habits, and a morning overview — delivered as native push notifications via the Web Push API. Notifications must arrive even when the browser tab is closed and the device is locked.

## Success Criteria

1. Users can subscribe to push notifications from Settings, with a single permission prompt.
2. Calendar event reminders fire at a configurable lead time (default 15 minutes before).
3. Habit reminders fire at a user-chosen time of day (default 20:00 local).
4. Morning summary fires at a user-chosen time (default 07:00 local) listing today's events and incomplete habits.
5. Tapping a notification opens the app to the relevant screen (Home, Calendar, or Habits).
6. Notifications work on Android Chrome, desktop Chrome/Edge/Firefox, and iOS Safari (PWA installed to home screen).
7. Users can independently toggle each trigger type on/off.
8. Unsubscribing removes the push subscription from the server.

---

## Platform Constraints

| Platform | Requirement | Notes |
|----------|------------|-------|
| iOS Safari | PWA must be installed to home screen | Web Push landed in iOS 16.4+ but only for home-screen PWAs |
| iOS Safari | No silent push | Every push must show a visible notification |
| Android Chrome | Works in browser and installed PWA | Most reliable platform for Web Push |
| Desktop browsers | Works in Chrome, Edge, Firefox | Safari 16+ on macOS also supported |
| All | HTTPS required | Already met (Vercel) |
| All | Service worker required | Already registered via vite-plugin-pwa |

---

## Architecture

```
┌─────────────┐     subscribe      ┌──────────────┐
│  Pulse PWA  │ ──────────────────▸ │   Supabase   │
│  (browser)  │  PushSubscription   │  push_subs   │
└─────────────┘                     └──────────────┘
                                           │
                                    ┌──────┴───────┐
                                    │  pg_cron or  │
                                    │ Vercel Cron  │
                                    └──────┬───────┘
                                           │ invokes
                                    ┌──────┴───────┐
                                    │  Edge Func / │
                                    │  Vercel API  │
                                    │  (sender)    │
                                    └──────┬───────┘
                                           │ web-push POST
                                    ┌──────┴───────┐
                                    │  Push Service │
                                    │ (FCM / APNs) │
                                    └──────┬───────┘
                                           │
                                    ┌──────┴───────┐
                                    │   Device     │
                                    │  (SW shows   │
                                    │  notification)│
                                    └──────────────┘
```

### Key decisions

1. **VAPID authentication** — industry-standard, no Firebase dependency. One VAPID key pair for the whole app.
2. **Supabase Edge Function as the sender** — runs server-side, has access to the database, and can use the `web-push` npm package to sign and deliver payloads. Alternative: Vercel API route (see trade-offs below).
3. **pg_cron for scheduling** — Supabase includes pg_cron. A cron job runs every minute, queries for due notifications, and invokes the Edge Function. Alternative: Vercel Cron (see trade-offs below).
4. **Per-user timezone** — stored in the profiles table. Defaulted from `Intl.DateTimeFormat().resolvedOptions().timeZone` on first login. All schedule comparisons happen server-side in the user's local time.

### Sender: Supabase Edge Function vs Vercel API Route

| | Supabase Edge Function | Vercel API Route |
|--|----------------------|-----------------|
| DB access | Direct (same project) | Via Supabase client + service role key |
| Scheduling | pg_cron calls `net.http_post` | Vercel Cron (`vercel.json`) |
| Cold start | Deno runtime, ~100ms | Node runtime, ~200ms |
| Cost | Included in Supabase plan (500K invocations/mo free) | Included in Vercel Hobby (but cron limited to once/day on free) |
| VAPID signing | `web-push` npm package via esm.sh | `web-push` npm package |

**Recommendation:** Vercel API route + Vercel Cron. Simpler deployment (same repo, same `vercel.json`), no need to set up Supabase CLI for Edge Functions, and the project already deploys to Vercel. Vercel Pro allows cron intervals down to every minute. If the user is on Vercel Hobby (once/day cron limit), fall back to Supabase Edge Function + pg_cron.

---

## Database Schema

### Migration: `002_push_notifications.sql`

#### `push_subscriptions`

Stores Web Push subscription objects per user per device.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| user_id | uuid | FK to auth.users, not null |
| endpoint | text | not null, unique — the push service URL |
| p256dh | text | not null — client public key |
| auth | text | not null — client auth secret |
| user_agent | text | nullable — for identifying device |
| created_at | timestamptz | default `now()` |

**RLS policies:**
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id` with check
- DELETE: `auth.uid() = user_id`
- No UPDATE — subscriptions are replaced (delete + insert) when they change.

**Unique constraint:** `(endpoint)` — a device's push endpoint is globally unique.

#### `notification_preferences`

Per-user toggles and schedule configuration.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| user_id | uuid | FK to auth.users, unique, not null |
| calendar_reminders | boolean | default true |
| calendar_lead_minutes | integer | default 15 |
| habit_reminders | boolean | default true |
| habit_reminder_time | time | default '20:00' — in user's local time |
| morning_summary | boolean | default true |
| morning_summary_time | time | default '07:00' — in user's local time |
| created_at | timestamptz | default `now()` |

**RLS policies:** Same pattern as profiles — users read/insert/update their own row.

**Trigger:** Auto-create a default preferences row when a profile is created (extend `handle_new_user` or add a second trigger on profiles).

#### Alter `profiles`

Add a `timezone` column:

```sql
alter table public.profiles add column timezone text default 'UTC';
```

Updated on login from the client's `Intl.DateTimeFormat().resolvedOptions().timeZone`.

#### `notification_log`

Prevents duplicate sends. Lightweight — rows are deleted after 48 hours by a pg_cron cleanup job.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| user_id | uuid | FK to auth.users, not null |
| type | text | not null — 'calendar', 'habit', or 'morning' |
| reference_id | text | nullable — e.g. calendar event ID |
| sent_at | timestamptz | default `now()` |

**Unique constraint:** `(user_id, type, reference_id)` — prevents sending the same reminder twice.

**RLS:** No client access needed. This table is used only by the server-side sender. RLS enabled with no policies (blocks all client access).

---

## VAPID Keys

A single VAPID key pair identifies the application to push services.

- Generated once via `npx web-push generate-vapid-keys`.
- **Public key** → `VITE_VAPID_PUBLIC_KEY` env var (client-side, safe to expose).
- **Private key** → `VAPID_PRIVATE_KEY` env var (server-side only, in Vercel env vars, NOT prefixed with `VITE_`).
- **Subject** → `mailto:` URL or app URL, e.g. `mailto:pulse@example.com`.

---

## Service Worker: Push Handler

vite-plugin-pwa uses Workbox and generates the service worker. Custom push handling requires a **custom service worker entry point**.

### Setup

In `vite.config.ts`, configure vite-plugin-pwa to use `injectManifest` mode instead of the current `generateSW`:

```ts
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  registerType: 'autoUpdate',
  // ... rest of manifest config unchanged
})
```

### `src/sw.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from 'workbox-precaching';

// Workbox precaching (replaces generateSW behavior)
precacheAndRoute(self.__WB_MANIFEST);

// Push event handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json() as {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: { url?: string };
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? '/pwa-192x192.png',
      badge: payload.badge ?? '/pwa-192x192.png',
      tag: payload.tag,
      data: payload.data,
    })
  );
});

// Notification click — open the app to the relevant screen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});
```

### Workbox dependency

Switch from the implicit Workbox (bundled by generateSW) to an explicit dependency:

```
npm install workbox-precaching
```

---

## Client: Subscription Flow

### `src/lib/push.ts`

Handles subscribing and unsubscribing on the client.

```ts
export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!('PushManager' in window)) return false;

  const registration = await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      import.meta.env.VITE_VAPID_PUBLIC_KEY
    ),
  });

  const { endpoint, keys } = subscription.toJSON();

  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh: keys!.p256dh,
      auth: keys!.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  );

  return true;
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const { endpoint } = subscription.toJSON();
    await subscription.unsubscribe();
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
}

export async function isSubscribed(): Promise<boolean> {
  if (!('PushManager' in window)) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}
```

### `urlBase64ToUint8Array`

Standard utility to convert the VAPID public key:

```ts
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
```

---

## Server: Notification Sender

### Vercel API route: `api/send-notifications.ts`

A single endpoint that:

1. Is called by Vercel Cron every minute (or pg_cron via HTTP).
2. Queries for due notifications across all users.
3. Sends web-push payloads.
4. Logs sent notifications to prevent duplicates.
5. Cleans up expired subscriptions (push services return 410 Gone).

### Authorization

The cron endpoint is protected by a `CRON_SECRET` env var. Vercel Cron sets an `Authorization: Bearer <CRON_SECRET>` header automatically. The route validates it before proceeding.

### Notification queries

Each query runs against the user's local time using their stored timezone.

**Calendar reminders:**
```sql
select ce.*, p.timezone, ps.*
from calendar_events ce
join profiles p on p.user_id = ce.user_id
join notification_preferences np on np.user_id = ce.user_id
join push_subscriptions ps on ps.user_id = ce.user_id
where np.calendar_reminders = true
  and ce.time is not null
  and (ce.date + ce.time) at time zone p.timezone
      between now() and now() + interval '1 minute'
      - (np.calendar_lead_minutes || ' minutes')::interval
  and not exists (
    select 1 from notification_log nl
    where nl.user_id = ce.user_id
      and nl.type = 'calendar'
      and nl.reference_id = ce.id::text
  );
```

**Habit reminders:**
```sql
select p.user_id, p.timezone, np.habit_reminder_time, ps.*
from notification_preferences np
join profiles p on p.user_id = np.user_id
join push_subscriptions ps on ps.user_id = np.user_id
where np.habit_reminders = true
  and (now() at time zone p.timezone)::time
      between np.habit_reminder_time
      and np.habit_reminder_time + interval '1 minute'
  and not exists (
    select 1 from notification_log nl
    where nl.user_id = np.user_id
      and nl.type = 'habit'
      and nl.reference_id = (now() at time zone p.timezone)::date::text
  );
```

The habit notification body lists incomplete habits for today (fetched in a sub-query).

**Morning summary:**
```sql
-- Same pattern as habit reminders but using morning_summary_time
-- and type = 'morning'
```

The morning summary body includes today's event count and incomplete habits carried over.

### `web-push` usage

```ts
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:pulse@example.com',
  process.env.VITE_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// For each subscription:
await webpush.sendNotification(
  { endpoint, keys: { p256dh, auth } },
  JSON.stringify({
    title: 'Pulse — Habit Reminder',
    body: '3 habits left today: Meditate, Read, Exercise',
    tag: 'habit-reminder',
    data: { url: '/habits' },
  })
);
```

### Handling expired subscriptions

If `webpush.sendNotification` throws with a 404 or 410 status, the subscription is stale. Delete it from `push_subscriptions` immediately.

---

## Settings UI

Add a **Notifications** section to Settings, between Integrations and Data.

### Layout

```
NOTIFICATIONS

┌─────────────────────────────────────────────┐
│  🔔  Push Notifications         [Subscribe] │  ← or [Subscribed ✓] toggle
│      Enable reminders and summaries         │
└─────────────────────────────────────────────┘

(visible only when subscribed:)

┌─────────────────────────────────────────────┐
│  Calendar Reminders              [toggle]    │
│  15 min before events             [▾ time]   │
├─────────────────────────────────────────────┤
│  Habit Reminders                 [toggle]    │
│  Daily at 8:00 PM                 [▾ time]   │
├─────────────────────────────────────────────┤
│  Morning Summary                 [toggle]    │
│  Daily at 7:00 AM                 [▾ time]   │
└─────────────────────────────────────────────┘
```

- Subscribe button triggers `Notification.requestPermission()` then `subscribeToPush()`.
- Each toggle writes to `notification_preferences` via Supabase.
- Time pickers are simple `<select>` dropdowns with 30-minute increments.
- Lead time for calendar reminders: dropdown with options 5, 10, 15, 30, 60 minutes.

---

## Notification Payloads

### Calendar Reminder

```json
{
  "title": "Pulse — In 15 min",
  "body": "Team standup at 10:00 AM",
  "tag": "calendar-evt-<event_id>",
  "data": { "url": "/calendar" }
}
```

### Habit Reminder

```json
{
  "title": "Pulse — Habits",
  "body": "3 habits left today: Meditate, Read, Exercise",
  "tag": "habit-reminder-<date>",
  "data": { "url": "/habits" }
}
```

If all habits are complete, skip the notification.

### Morning Summary

```json
{
  "title": "Pulse — Good morning",
  "body": "2 events today · 5 habits to go",
  "tag": "morning-<date>",
  "data": { "url": "/" }
}
```

---

## New & Modified Files

### New files

| File | Purpose |
|------|---------|
| `src/sw.ts` | Custom service worker with push + notificationclick handlers |
| `src/lib/push.ts` | Client-side subscribe/unsubscribe/check functions |
| `src/hooks/useNotificationPreferences.ts` | Read/write notification_preferences from Supabase |
| `api/send-notifications.ts` | Vercel API route — cron-triggered sender |
| `supabase/migrations/002_push_notifications.sql` | New tables + profile timezone column |

### Modified files

| File | Change |
|------|--------|
| `vite.config.ts` | Switch PWA strategy from `generateSW` to `injectManifest` |
| `src/pages/Settings.tsx` | Add Notifications section with subscribe toggle and preference controls |
| `vercel.json` | Add cron job configuration |
| `package.json` | Add `web-push`, `workbox-precaching` dependencies |
| `.env.local` / Vercel | Add `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` |

### Unchanged

- All existing pages, hooks, and contexts — push is additive.
- Existing service worker precaching behavior — preserved via `precacheAndRoute`.
- `api/ultrahuman.ts` — unchanged.

---

## Environment Variables

| Variable | Side | Where | Notes |
|----------|------|-------|-------|
| `VITE_VAPID_PUBLIC_KEY` | Client | `.env.local`, Vercel (Config) | Safe to expose |
| `VAPID_PRIVATE_KEY` | Server | Vercel only (Secret) | Never in client bundle |
| `CRON_SECRET` | Server | Vercel only (Secret) | Validates cron requests |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Vercel only (Secret) | For server-side DB queries bypassing RLS |

---

## Vercel Cron Configuration

In `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/send-notifications",
      "schedule": "* * * * *"
    }
  ]
}
```

Every-minute cron requires Vercel Pro. On Hobby, use `0 * * * *` (hourly) and accept that reminders may be late by up to 59 minutes — or switch to Supabase pg_cron + Edge Function.

---

## Testing Strategy

No automated test runner exists in this project. Manual testing:

1. **Subscribe flow:** tap Subscribe in Settings, accept browser permission, verify row appears in `push_subscriptions`.
2. **Calendar reminder:** create an event 16 minutes from now with a time, wait, verify notification arrives.
3. **Habit reminder:** set habit reminder time to 1 minute from now, verify notification lists incomplete habits.
4. **Morning summary:** set morning time to 1 minute from now, verify notification with event/habit counts.
5. **Notification tap:** tap each notification type, verify app opens to the correct screen.
6. **iOS:** install PWA to home screen, subscribe, lock phone, verify notifications arrive.
7. **Unsubscribe:** toggle off, verify row removed from `push_subscriptions`, no more notifications.
8. **Stale subscription:** manually delete the subscription from the browser (DevTools → Application → Service Workers → Push), trigger a send, verify the sender cleans up the 410'd row.

---

## What This Spec Does NOT Cover

- **Rich notifications** (images, action buttons) — start simple, enhance later.
- **Notification grouping/stacking** — browser handles this via the `tag` field.
- **Email notifications** — push only for now.
- **Snooze** — not in V1.
- **Quiet hours** — users control this via their OS Do Not Disturb settings.
- **Analytics** (delivery rates, click rates) — future enhancement.
- **Ultrahuman or Google Calendar integration** — marked as Coming Soon, separate sub-projects.
