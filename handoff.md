# Pulse: Handoff

## What this is
Pulse is a mobile-first personal health/habit tracker PWA with a dark glass UI.
Stack: React 19, TypeScript 6, Vite 8, React Router 7, Supabase (Postgres + Auth + RLS), Phosphor Icons, Geist font, vite-plugin-pwa. Target hosting: Vercel.

## State of the work
Branch `feat/supabase-backend` (7 commits ahead of `master`) is **Sub-project 1: backend, auth, data migration. It is code-complete**, and `npx tsc --noEmit` passes. There is no test runner; type-check was the only verification, and nothing has been run against a real Supabase project yet.

What was built:
- `src/lib/supabase.ts`, `src/lib/database.types.ts`, `supabase/migrations/001_initial_schema.sql` (tables: profiles, habits, completions, tasks, calendar_events; RLS on all; `handle_new_user` trigger; unique `(user_id, habit_id, date)` on completions)
- `src/context/AuthContext.tsx` + `src/pages/SignIn.tsx`: Google OAuth and email/password; `AuthGate` in `src/App.tsx`
- Supabase-backed hooks with optimistic updates and visibility-change refetch: `useHabits`, `useTasks`, `useCalendarEvents`, `useProfile`, wrapped in contexts (provider order: Auth > Habits > Tasks > CalendarEvents)
- `src/lib/migrate.ts`: one-time localStorage-to-Supabase migration on first login (flag `pulse-migrated`), triggered from AuthContext
- Settings: Supabase profile name/avatar, sign-out, user-scoped data reset

Design spec: `docs/superpowers/specs/2026-10-08-backend-auth-data-design.md`
Plan: `docs/superpowers/plans/2026-10-08-backend-auth-data.md`

## Blocked on the user (do not try to do these yourself)
1. Create the Supabase project and run `supabase/migrations/001_initial_schema.sql` in the SQL editor.
2. Configure the Google OAuth provider in Supabase (needs a Google Cloud OAuth client).
3. Put real `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` (gitignored via `*.local`) and in Vercel env vars.
4. Manual end-to-end test: sign in, add habit/task/event, refresh, check rows in the dashboard, sign out and in as a second user (RLS), test migration by clearing `pulse-migrated` and seeding localStorage.

Until those are done the app throws on startup ("Missing VITE_SUPABASE_URL...").

## Known deferred issues (minor, from the final review)
- `database.types.ts` lacks `Views`/`Functions`/`Enums` keys (compiles fine; add if Supabase typing misbehaves)
- Data hooks ignore `{ error }` on fetch; an expired token silently shows an empty state
- Update/delete mutations filter by `id` only, not `user_id` (RLS covers it)
- Profile name writes to Supabase on every keystroke; should debounce or save on blur
- Migration: completions insert is not deduplicated (a duplicate fails the whole batch because of the unique constraint); habit ID mapping relies on insert-return order
- `toggleTask` assigns `newDone` inside a `setTasks` updater (works, fragile)
- `toggleCompletion` in `useHabits.ts` has the same pattern (`exists` set inside the updater); worth hardening with a ref

## Unrelated UI changes (committed separately)
Commit `d873b29` restyles `src/components/BottomNav.tsx` (dark glass pill, 44px targets) and reduces `src/hooks/useTheme.ts` to always apply the dark theme (light/system options removed; the hook no longer returns `theme`/`resolved`/`setTheme`). These are not part of the Supabase work.

## Next: Sub-project 2, push notifications (not started)
Goal: reliable Web Push that works with the app closed and the phone locked. Three triggers: calendar event reminders, habit reminders, morning summary.
Needs: VAPID keys, a `push_subscriptions` table, a service worker push handler (the project uses vite-plugin-pwa/workbox), a scheduled sender (Supabase Edge Function + pg_cron, or a Vercel cron), a Settings UI for reminder configuration, and per-user timezone handling.
Process used so far: brainstorm, then write a spec to `docs/superpowers/specs/`, then a plan to `docs/superpowers/plans/`, then execute. Start with the spec; the user has not reviewed one for this yet. iOS web push requires the PWA to be installed to the home screen.

## Conventions
- Dark glass UI: surfaces `rgba(20,20,30,0.75)`, `backdrop-filter: blur(20px) saturate(180%)`, accent `#A78BFA`.
- Apple-style: 44x44pt touch targets, spring animations, respond on pointer-down.
- Avoid `crypto.randomUUID()` (the user tests over LAN HTTP on a phone; it is unavailable there). Use `Date.now().toString(36) + Math.random().toString(36).slice(2, 7)` for temp IDs.
- Git: work on a branch, do not push or merge without asking the user. Commit messages are `feat:`/`fix:` style.
- Verify with `npx tsc --noEmit`.
