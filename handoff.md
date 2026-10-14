# Pulse: Handoff (current state)

Last updated: 2026-10-15. Update this file at the end of any session that changes project state; it is imported into `CLAUDE.md`, so every session reads it first.

## Status
Mostly on `master`, deployed on Vercel, `npm run build` passes. No test runner exists; nothing is verified except by build and manual device testing.

**Current branch `home-redesign-v2` has zero commits — a full session of home-screen work exists only as uncommitted working-tree changes.** See "Home redesign (in progress)" below before doing anything destructive.

| Area | State |
|---|---|
| Supabase backend, auth (Google + email), data hooks, localStorage migration | Done, merged (PR #1) |
| Social: usernames, friends, activity feed, shared plans + checklist | Done, merged (PR #2). Spec still marked Draft |
| Shared plan RLS fix (migration 004) and iOS date/time placeholders | Done, merged (PR #3). Migration 004 was run in Supabase |
| iOS input zoom fix (16px inputs) | Done, merged (PR #4). Not yet confirmed on device |
| Design system + CLAUDE.md | Done, merged (PR #5) |
| Friends' profile visibility (migration 005) | Merged (PR #6). `005` run in Supabase by the user; names/avatars not separately confirmed |
| Friend requests: toast, Sent Requests section, live updates (migration 006), pinned dev port, `.local` host | In PR #8 (open). `006` and `007` are applied, so live updates are on for friendships, plans, members, checklist and feed (shared helper `src/lib/realtime.ts`); friendships also polls every 20s as a fallback. Own-data tables (habits, tasks, events) are not live yet: a refetch triggered by the user's own tap can revert a fast second tap, so it needs an echo guard first |
| Social tab redesign: needs-you requests, upcoming plans, friends' activity with one-tap cheers, owner deletes (feed entries with Undo; a plan's activity entry deletes the plan after a confirm), drag-to-dismiss sheets, 44px targets, tokens | Done, merged (PR #10). `008_feed_reactions.sql` run by the user. Not yet confirmed end to end on a device |
| Open plans (any friend can join, max 20), Leave plan, @username under names, stale-fetch fix for deleted plans | On PR #15 (`style/nav-higher`). **Needs `012_open_plans.sql` run in the SQL Editor right before deploying.** It also tightens plan_members insert (the old policy let anyone add themselves to any plan). RLS, cap and join notification checked in a local PGlite replay only; not tested on a device |
| **Push notifications** | **Live** (PR #13). Server sender via Supabase pg_cron every minute (heartbeat in Better Stack), custom service worker, Settings section. Verified: scheduler returns 200 and a test notification reaches the iPhone Home Screen app. Branch `feat/per-item-reminders` replaces global alert/time settings with per-event, per-plan and per-habit reminders (needs migration 011, run right before deploying it). Not yet confirmed one by one: habit, event, plan, invitation, friend request and morning notifications on a real device. Runbook: `docs/notifications-runbook.md` |

## Home redesign (in progress, `home-redesign-v2`, uncommitted)
Nothing here is committed and the branch is level with `master`. `npx tsc -b` and `npm run build` pass. Not tested on a device.

**Hero progress arc** (`src/pages/Home.tsx`). Oura-style shallow gauge: the top slice of a large circle, geometry in module constants near the top of the file (`ARC_R` 198, `ARC_CX` 170, `ARC_HALF_CHORD` 155, `ARC_W` 11, `ARC_BOX_W/H`). Everything derives from those — the track path, the clip ribbon, the viewBox and the overlay sizes — so changing `ARC_W` alone is safe. Three layers stacked at a strict 1:1 scale: a track `<svg>`, the shader overlay, and a glow `<svg>`. They must all stay fixed-width, because the shader is clipped with `clipPathUnits="userSpaceOnUse"`, whose units are raw CSS pixels; `width: "100%"` on any of them desyncs the clip on screens narrower than 340px.

- **Water fill** is `NeuroNoise` from `@paper-design/shaders-react`, clipped to the filled part of the arc by `buildArcClip()`. Earlier attempts that all failed and should not be retried: SVG animated patterns, CSS dashes, rAF-driven SVG gradients, `feTurbulence` + `feDisplacementMap` (pixelated), a hand-written WebGL shader in `<foreignObject>` (WebKit will not render a WebGL context there).
- **Fill animation** springs from empty via `animateSpring` (`src/lib/spring.ts`, `response: 0.55`, `damping: 1`), writing `d` and the glow position straight to the DOM through refs so a fill does not re-render the page. Interruptible, and snaps to final under `prefers-reduced-motion`.
- **Leading-edge glow** is a halo + core circle repositioned to the arc tip each frame by `arcTip()`.

**Known not-done on this branch**
- `src/App.tsx` has an auth bypass — `if (!user && import.meta.env.PROD)` — so dev skips sign-in. **Revert before merging.**
- `package.json` still lists `react-circular-progressbar`; it is no longer imported anywhere. Remove it.
- `bgImage` is hardcoded to `/assets/mount.webp` with a `TODO`; time-of-day switching is disabled.
- The Daily/Social toggle in the hero does nothing yet.
- Background photos in `public/assets` (morning/afternoon/night/mount/mount_day/mount_night, `.jpg` + `.webp`) are untracked and uncommitted.

**Background direction (decided 2026-10-15, not built).** Brainstormed with the user against mockups. The problem is not the photo's mood — it is that the arc and streak number straddle two surfaces (open sky and textured rock), so neither looks like it belongs to one thing. Agreed direction: **sky only, no horizon** — a real photograph (the user explicitly wants photographic depth and grain, not a flat gradient), one distinct sky per time of day, crossfading on clock boundaries, stars at night. The mountain goes. Consequence: the heavy radial scrim behind the hero text exists only because the photo was busy, so on an even sky it can be lightened or dropped. Open: the existing photos cannot be cropped to pure sky, so new sky assets are needed; sourcing was not settled. Brainstorm mockups are in `.superpowers/brainstorm/` (gitignored).

## Supabase (user runs SQL manually in the SQL Editor)
Applied (evidenced by plans working in the app): `001_initial_schema.sql`, `003_social.sql`, `004_fix_plan_policies.sql`., `005_friend_profile_visibility.sql` (run by the user, 2026-10-09). `006_friendships_realtime.sql` and `007_social_realtime.sql` (run by the user, 2026-10-09; verified working with two accounts), `008_feed_reactions.sql` (run by the user). Not confirmed from the repo: whether Google OAuth is configured in Supabase and whether `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set in Vercel (the app throws on startup without them). Ask the user if sign-in or a deploy misbehaves.

## Local dev setup (hard-won)
- Run `npm run dev -- --host`; port is pinned to 5173 with `strictPort`. Phone URL: `http://charlie.local:5173` (`allowedHosts: ['.local']` in `vite.config.ts`).
- Supabase Auth, Redirect URLs must contain `http://localhost:5173/**` and `http://charlie.local:5173/**` (plus the Vercel URL). The `http://192.168.0.65:5173/**` entry was rejected by Supabase even when correctly saved, so the app redirected sign-in to the live Site URL. Diagnose with the error-callback probe: `GET /auth/v1/authorize?provider=google&redirect_to=X`, then `GET /auth/v1/callback?error=access_denied&state=<state from the Location header>`; its `Location` shows the validated redirect (X if accepted, the Site URL if not).
- The app sends `redirectTo: ${window.location.origin}/` (trailing slash).

## Monitoring (live)
Better Stack error tracking (US region; EU needs a paid plan), app `Pulse-web`. `VITE_SENTRY_DSN` is set in Vercel (Production). Verified 2026-10-09: a console test error arrived tagged `production` with an anonymous user. Code: `monitoredFetch`, `expectRows` write checks, error boundary (see `CLAUDE.md`).
- **Stack traces were minified** (`index-xxxx.js at line 25:14081`). Source map upload is built on branch `feat/source-maps` (Sentry Vite plugin pointed at Better Stack). It is inert until these are set in Vercel as **build** variables (no `VITE_` prefix, never exposed to the browser): `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL` (from Better Stack, Errors, Applications, Pulse-web, Advanced settings) and `SENTRY_AUTH_TOKEN` (a Telemetry API token). Upload failures only warn; they never fail a deploy. Maps are deleted from `dist` after upload. Not verified with a real token yet: check the next real error shows the file and line.
- Still to do by the user: email alert rule for new errors, and an uptime monitor for `https://pulse-app-habit.vercel.app` (the existing monitor points at `matyassana.com`).

## Known issues (not fixed)
0. Notifications cannot be tested in `npm run dev` (no service worker); only on the deployed HTTPS app.
1. **Friends' names/avatars (fix merged and applied; the two-account live-update test passed, but names/avatars were not separately confirmed).** `profiles` RLS was own-row-only; migration 005 adds `can_view_profile()` and a SELECT policy for pending/accepted friends and plan co-members. Verify with two accounts (friends list, requests, feed, shared plan). Username search still shows blank names for unconnected users by design.
2. **Design drift** (see `docs/design-system.md` section 9): two glass recipes, two accents (Moonstone `#8E9BC4` is canonical per the user's palette; violet `#A78BFA` hard-coded in calendar, sign-in, buttons), raw hex status colors, `transition: all`, low-contrast secondary text (`#626880` is 3.4:1 on cards).
3. **Data hooks swallow errors** (failures are now reported centrally by `monitoredFetch`, but screens still show nothing; add user-facing toasts and rollback) (`useHabits`, `useTasks`, `useCalendarEvents`, `useProfile`, `useSharedPlans`): an expired token or RLS failure looks like an empty list. `useSharedPlans.createPlan` returns silently on failure, which hid the RLS bug. Surface errors.
4. Mutations filter by `id` only, not also `user_id` (RLS covers it; defense in depth).
5. Profile name writes to Supabase on every keystroke (Settings); debounce or save on blur.
6. Migration (`src/lib/migrate.ts`): completions insert is not deduplicated (a duplicate fails the whole batch); habit ID mapping relies on insert-return order.
7. `toggleCompletion` and `toggleTask` assign a variable inside a `setState` updater; works today but fragile. Prefer a ref.
8. Settings shows Google Calendar and Ultrahuman as "Coming Soon" (cloud session change).

## Next steps (suggested order)
1. Commit the `home-redesign-v2` work — it is currently one power cut away from gone.
2. Finish the home redesign: source sky assets, build the time-of-day sky, then revert the auth bypass and drop `react-circular-progressbar`.
3. Live updates for own-data tables (habits, completions, tasks, calendar events) with an echo guard.
4. Design cleanup: tokens for accent/status colors, one glass recipe, contrast fixes.
5. Finish verifying push notifications on a real iPhone: habit, event (two alerts), plan, invitation, friend request, morning summary (runbook section 7).
6. Add error surfacing to hooks (issue 3).

## Working with this repo
- Tooling and rules live in `CLAUDE.md`; UI rules in `docs/design-system.md`. Git: branch, PR into `master`, do not push or merge without being asked.
- A cloud Claude session also works on this repo. `git fetch` and check `gh pr list` before assuming local state is current.
- Specs and plans: `docs/superpowers/specs/`, `docs/superpowers/plans/` (process: brainstorm, spec, plan, execute). The `superpowers` plugin was installed 2026-10-15 (`obra/superpowers-marketplace`, user scope); before that these directories existed without the tooling that made them.
