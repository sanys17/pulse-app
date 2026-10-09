# Pulse

Mobile-first habit/health tracker PWA. React 19, TypeScript, Vite, React Router, Supabase (Postgres + Auth + RLS), deployed on Vercel. Dark glass UI, tested primarily as an installed iPhone PWA.

## Current status
@handoff.md

## Commands
- `npm run dev -- --host` start dev server on the fixed port 5173 (`strictPort`). The user tests on an iPhone at **`http://charlie.local:5173`** (the Mac's Bonjour name; use it, not the LAN IP). Google sign-in only returns to the dev server if that exact origin is in Supabase Auth, Redirect URLs (`http://localhost:5173/**` and `http://charlie.local:5173/**`). Supabase rejected the `192.168.0.65:5173` entry for unknown reasons, so don't rely on IPs.
- `npm run build` runs `tsc -b && vite build`. This is the real check.
- **Never use `npx tsc --noEmit` to verify.** The root tsconfig has `"files": []` with project references, so it checks nothing and always passes. Use `npx tsc -b`.
- There is no test runner. Verify with the build, and for UI changes say plainly when you could not test on a device.

## Design
@docs/design-system.md

Short version: tokens from `src/index.css` (`--color-*`, `--space-*`, `--radius-*`), 44px tap targets, glass only for floating chrome, springs for motion, Geist font, always dark. Check "Known drift" there before copying an existing pattern; some existing styles are not canonical.

## iOS / PWA rules (each one cost real debugging time)
- Inputs render at 16px on touch devices (global rule in `src/index.css`), otherwise iOS zooms the page and stays zoomed.
- Empty `type="date"` / `type="time"` inputs render blank on iOS. Overlay a placeholder label while empty (see `src/pages/Calendar.tsx`, `src/components/CreatePlanSheet.tsx`).
- Do not use `crypto.randomUUID()` (unavailable over plain HTTP on LAN). Temp IDs: `Date.now().toString(36) + Math.random().toString(36).slice(2, 7)`.
- Keep `-webkit-backdrop-filter` alongside `backdrop-filter`.

## Data layer
- Provider order in `src/App.tsx`: Auth, Habits, Tasks, CalendarEvents (and Social), inside an auth gate. Hooks live in `src/hooks`, contexts in `src/context`.
- Mutations are optimistic: update state, write to Supabase, **roll back on error**. Hooks also refetch on `visibilitychange`. Don't swallow errors silently in new code.
- `src/lib/database.types.ts` must stay a `type Database = {...}` (not `interface`) and every table needs `Relationships`, plus schema-level `Views`, `Functions`, `Enums`, `CompositeTypes`. Otherwise every query resolves to `never`. Update it whenever a migration changes the schema.
- localStorage is only used for the Google Calendar token and the one-time migration flag (`src/lib/migrate.ts`). Do not add new app data to localStorage.

## Monitoring
- `src/lib/monitoring.ts` reports to Better Stack (or Sentry) via the Sentry SDK; it is a no-op without `VITE_SENTRY_DSN` and only active in production builds. Privacy: `dataCollection` is locked down (no cookies, headers, bodies, query strings) and only the anonymous user id is attached. Keep it that way.
- Every Supabase request goes through `monitoredFetch` (set in `src/lib/supabase.ts`), so failed requests are reported centrally. Expected failures are listed in `src/lib/monitoringRules.ts` (duplicate `23505`, `.single()` with no row `PGRST116`, auth 4xx); add to it rather than sprinkling try/catch.
- `vite.config.ts` uploads source maps (Sentry Vite plugin, Better Stack endpoint) only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_URL` are set (Vercel build env). Never give them a `VITE_` prefix and never commit them. Upload errors only warn.
- A write that "succeeds" with 0 rows is how RLS bugs hide. For important updates/deletes use `.select("id")` and `expectRows("table.operation", data)`.
- New code: surface errors to the user (toast) and report unexpected ones with `reportError(err, { area, target })`; never swallow them silently.

## Notifications
- Spec `docs/superpowers/specs/2026-10-08-push-notifications-design.md`, plan `docs/superpowers/plans/2026-10-09-push-notifications.md`, setup and checks `docs/notifications-runbook.md`.
- What is due is decided in SQL only: `pending_notifications(p_now)` (`supabase/migrations/010_...`). Change rules there and extend `supabase/tests/pending_notifications.test.sql` (fake clock `p_now`; the user runs it in the SQL Editor). The Vercel route `api/send-notifications.ts` is thin; delivery rules live in `api/_lib/notify.ts` and are tested with `npm test`.
- `npm test` runs `node --test tests/*.test.mts` on pure modules. Pure modules in `src/lib` and `api/_lib` must have no imports except other pure modules, with `.ts` extensions, so node can load them.
- Reminders are chosen per item when it is created, not in Settings (Settings = switches + the morning summary time). Events and plans have alerts in Apple Calendar offsets, max two (`src/lib/alerts.ts`); habits have an optional `reminder_time` and habits sharing a time arrive as one notification. `null` alerts = built-in default (`builtInAlerts`: event 15 min, plan 1 hour, date-only on the day at 09:00); `{}` = none. The SQL fallbacks in migration 011 must match `builtInAlerts`. A plan's alert is set by its creator (`shared_plans.alerts`); each member can override theirs (`plan_members.alerts`).
- The service worker (`src/sw.ts`) does not run in `npm run dev`; push can only be tested on the deployed HTTPS app, on iPhone only from the Home Screen icon.
- Push endpoints are allowlisted to real push services (SQL regex in `register_push_subscription`, `isAllowedPushEndpoint` in `api/_lib/notify.ts`); extend both together if a new browser vendor needs another host. `profiles.timezone` is validated by a trigger.
- Never expose `VAPID_PRIVATE_KEY`, `CRON_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` to the client (no `VITE_` prefix).

## Supabase migrations
- Live updates: use `subscribeToTables([...], refetch)` from `src/lib/realtime.ts` in a hook's effect (debounced, refetches after a reconnect). The table must be in the `supabase_realtime` publication via a migration. Social tables are live; own-data tables (habits, completions, tasks, calendar_events) are not yet.
- Files in `supabase/migrations`, run **manually** by the user in the Supabase SQL Editor, in order (001, 003 to 011; there is no 002). Tell the user which file to run; you cannot run it.
- RLS pitfalls: an unqualified column inside a policy subquery resolves to the inner table (`pm.plan_id = id` compares to `pm.id`); a policy that queries its own table recurses; an insert with `.select()` needs a SELECT policy the new row already satisfies. For membership checks use a `security definer` helper like `is_plan_member()`.
- Always filter mutations by `user_id` as well as `id` (defense in depth beyond RLS).

## Git
- Work on a branch and open a PR into `master`. Do not push or merge without being asked.
- Commit style: `feat:`, `fix:`, `docs:`, `style:`.
- `*.local` is gitignored (`.env.local` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never commit secrets. The same variables must be set in Vercel or the app throws on startup.
- A cloud Claude session also works on this repo. Run `git fetch` and read `handoff.md` before assuming local state is current.

## Tools
- Use the LSP tool for type and symbol questions (works well for types and imports). It cannot resolve values reached through React context destructuring; use grep for those.
