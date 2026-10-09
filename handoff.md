# Pulse: Handoff (current state)

Last updated: 2026-10-09. Update this file at the end of any session that changes project state; it is imported into `CLAUDE.md`, so every session reads it first.

## Status
All on `master`, deployed on Vercel, `npm run build` passes. No test runner exists; nothing is verified except by build and manual device testing.

| Area | State |
|---|---|
| Supabase backend, auth (Google + email), data hooks, localStorage migration | Done, merged (PR #1) |
| Social: usernames, friends, activity feed, shared plans + checklist | Done, merged (PR #2). Spec still marked Draft |
| Shared plan RLS fix (migration 004) and iOS date/time placeholders | Done, merged (PR #3). Migration 004 was run in Supabase |
| iOS input zoom fix (16px inputs) | Done, merged (PR #4). Not yet confirmed on device |
| Design system + CLAUDE.md | Done, merged (PR #5) |
| Friends' profile visibility (migration 005) | Merged (PR #6). **User must run `005` in the Supabase SQL Editor; not confirmed run yet** |
| **Push notifications** | **Spec only** (`docs/superpowers/specs/2026-10-08-push-notifications-design.md`, Draft). No implementation: no service-worker push handler, no `push_subscriptions` migration (002 reserved), no sender |

## Supabase (user runs SQL manually in the SQL Editor)
Applied (evidenced by plans working in the app): `001_initial_schema.sql`, `003_social.sql`, `004_fix_plan_policies.sql`. Pending confirmation: `005_friend_profile_visibility.sql`. Not confirmed from the repo: whether Google OAuth is configured in Supabase and whether `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set in Vercel (the app throws on startup without them). Ask the user if sign-in or a deploy misbehaves.

## Known issues (not fixed)
1. **Friends' names/avatars (fix merged, pending verification).** `profiles` RLS was own-row-only; migration 005 adds `can_view_profile()` and a SELECT policy for pending/accepted friends and plan co-members. Once the user has run it, verify with two accounts (friends list, requests, feed, shared plan). Username search still shows blank names for unconnected users by design.
2. **Design drift** (see `docs/design-system.md` section 9): two glass recipes, two accents (Moonstone `#8E9BC4` is canonical per the user's palette; violet `#A78BFA` hard-coded in calendar, sign-in, buttons), raw hex status colors, `transition: all`, low-contrast secondary text (`#626880` is 3.4:1 on cards).
3. **Data hooks swallow errors** (`useHabits`, `useTasks`, `useCalendarEvents`, `useProfile`, `useSharedPlans`): an expired token or RLS failure looks like an empty list. `useSharedPlans.createPlan` returns silently on failure, which hid the RLS bug. Surface errors.
4. Mutations filter by `id` only, not also `user_id` (RLS covers it; defense in depth).
5. Profile name writes to Supabase on every keystroke (Settings); debounce or save on blur.
6. Migration (`src/lib/migrate.ts`): completions insert is not deduplicated (a duplicate fails the whole batch); habit ID mapping relies on insert-return order.
7. `toggleCompletion` and `toggleTask` assign a variable inside a `setState` updater; works today but fragile. Prefer a ref.
8. Settings shows Google Calendar and Ultrahuman as "Coming Soon" (cloud session change).

## Next steps (suggested order)
1. Confirm 005 is applied and verify known issue 1 with two accounts.
2. Design cleanup: tokens for accent/status colors, one glass recipe, contrast fixes.
3. Push notifications: review and approve the spec, then plan (`superpowers:writing-plans`), then implement. Needs VAPID keys, `push_subscriptions` table, service-worker push handler (vite-plugin-pwa), a scheduled sender (Supabase Edge Function + pg_cron or Vercel cron), per-user timezone. iOS web push only works for the installed PWA.
4. Add error surfacing to hooks (issue 3).

## Working with this repo
- Tooling and rules live in `CLAUDE.md`; UI rules in `docs/design-system.md`. Git: branch, PR into `master`, do not push or merge without being asked.
- A cloud Claude session also works on this repo. `git fetch` and check `gh pr list` before assuming local state is current.
- Specs and plans: `docs/superpowers/specs/`, `docs/superpowers/plans/` (process: brainstorm, spec, plan, execute).
