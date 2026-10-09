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
