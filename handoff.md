# Pulse: Handoff (current state)

Last updated: 2026-10-16. Update this file at the end of any session that changes project state; it is imported into `CLAUDE.md`, so every session reads it first.

## Status
Deployed on Vercel from `master`. `npm run build`, `npx tsc -b` and `npm test` (94 tests) all pass.

**`feat/sky-backgrounds` was verified on the iPhone and merged as PR #16** (2026-10-16). The skies, the rebuilt arc and the gauge scale are on `master`.

**Active branch is `feat/progress-arc`, off `master` at 548ec2f.** It implements the whole progress-arc spec plus a fix for mock data that reached production with PR #16. Not merged, not deployed.

> **RELEASE ORDER — this branch does not work without its migration.**
> Run `011_per_item_reminders.sql`, then `012_open_plans.sql`, then
> `013_plan_completion.sql` in the Supabase SQL Editor, **then** deploy.
> Every write path on this branch sends columns that only exist after 013:
> adding or editing a habit, adding a task, and ticking a task. PostgREST
> rejects the whole statement (`PGRST204`) until the columns exist, and
> `toggleTask` does not roll back or warn — a tick would simply vanish on
> reload. Reads degrade gracefully (`cadenceFromRow` tolerates the missing
> columns and the old `weekly` value); writes do not.

Corrections to earlier versions of this file, found 2026-10-15: the `home-redesign-v2` work *is* committed (it was described here as uncommitted), and PRs #8 and #15 are **merged**, not open. PRs #1-#15 are all closed or merged; #16 is the only open one.

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

## Animated sky backgrounds (`feat/sky-backgrounds`, 24 commits, not merged)

Replaces the Home hero's mountain photograph with three time-of-day skies. Spec:
`docs/superpowers/specs/2026-10-15-animated-sky-backgrounds-design.md`. Plan:
`docs/superpowers/plans/2026-10-15-animated-sky-backgrounds.md`. Built task-by-task with a
fresh reviewer per task plus a whole-branch review; every Critical and Important finding was
fixed, deferred minors are listed in the plan's workspace under `.superpowers/sdd/` (gitignored).

**What exists**
- **Morning** and **afternoon** are real sky-only photographs (`morning_sky.webp`,
  `afternoon_sky.webp`, 1290x1922, ~50 KB each). Each has a breathing sun glow and beams that
  grow out of the sun and dissolve — morning sparse (23s/31s cycles), afternoon busier
  (13s/17s/21s). Afternoon also has minimal CSS cloud drift, 5px/s on a 4-minute loop.
- **Night has no photograph.** Its useful range is sRGB 9-49, so a photo of it is near-black
  with grain. It is a CSS gradient (`NIGHT_SKY` in `Home.tsx`) sampled from a real night photo
  in panel space, then scaled to 60%.
- **Stars are real.** 904 naked-eye stars from the Yale Bright Star Catalogue (CDS V/50),
  committed as `src/data/stars.ts`, projected for the observer's actual location — derived
  from the browser timezone, no geolocation permission. Twinkle is three composited layers,
  never per-star.
- **Rare nights**: 12-14 a year at every latitude tested, either the Milky Way (a photograph,
  `galaxy.webp`, screen-blended, fetched only on a galaxy night) or one planet (Venus, Mars,
  Jupiter, Saturn — each an alpha-keyed disc inside its own coloured bloom). Never both.
  Driven by a sidereal-drift ladder in `sky.ts`: no cross-night comparison, stable for a whole
  night, so a refresh cannot spoil it.

**Dev-only URL flags** (all `import.meta.env.DEV`-guarded, stripped from production)
- `?sky=morning|afternoon|night` — force a phase without waiting out the clock.
- `?rare=galaxy|planet|any` — scans forward for the next night that *genuinely* qualifies and
  renders that whole sky. `?rare=all` lays all four planets out side by side.
- `?hero=v2` — preview of an arc-led hero (percentage inside the arc, 0/100 scale, Next Up
  directly beneath, no streak). An experiment, not a decision.

**Assets**: only `.webp` files are committed. The multi-megabyte `.jpg` sources
(`morning_final`, `afternoon_final`, `galaxy`, `venus`/`mars`/`jupiter`/`saturn`) are
deliberately untracked. Consider adding `public/assets/*.jpg` to `.gitignore`.

**Resolved on 2026-10-16, before opening PR #16**
1. Device verification done by the user. This was the branch's blocker.
2. The arc was rebuilt. Its fill used the surface tokens, which made the completed half about
   13x *darker* than the empty half — progress erased the arc rather than filling it, and the
   NeuroNoise shader was animating black against black. The fill is now the accent family
   (`#D8E0F7`/`#8E9BC4`/`#6B78A0`, brightness 0.8) over a dark channel at
   `rgba(7,7,12,0.5)` that keeps the arc identical on all three skies; the track dropped to
   `rgba(142,155,196,0.2)`; `ARC_W` went 8 to 6; and the scale became `0`/`100` at the
   endpoints, rotated to the tangent, with dots at 20/40/60/80 on one ring, all derived from
   `ARC_R`/`ARC_W` instead of pinned in CSS.
3. The dev auth bypass is reverted, `react-circular-progressbar` is gone, the three
   superseded mountain photographs are deleted, and `public/assets/*.jpg` is gitignored.

**Still outstanding**
1. **"Best: N days" fails contrast over the afternoon sky**: 4.0:1 against 4.5:1 needed. It is
   `rgba(255,255,255,0.75)`, and translucent text composites with the sky behind it. The
   progress-arc work below deletes this line entirely, so it is only worth fixing if that work
   slips.
2. **The hero layout question is settled but not implemented.** `?hero=v2` and the current
   hero are both superseded by the progress-arc spec; the flag and both branches are still in
   `Home.tsx`.
3. Nine tracked assets in `public/assets` are referenced nowhere:
   `afternoon.webp`, `morning.webp`, `night.webp`, `arc-fill.svg`, `arc-track.svg`,
   `glow-ellipse.svg`, `fab-plus.svg`, `nav-left.svg`, `nav-social.svg`. Left in place
   deliberately — deleting them was outside what was asked.

## What the progress arc measures (built on `feat/progress-arc`)

Spec: `docs/superpowers/specs/2026-10-16-progress-arc-design.md`. Plan:
`docs/superpowers/plans/2026-10-16-progress-arc.md`. Implemented in ten commits; `npm test`
is 142/142 and `npm run build` is clean. Reviewed by a fresh whole-branch reviewer; two
Critical and six Important findings were fixed, deferred minors are listed below.

The arc used to measure habits only, which was an implementation default rather than a
decision. It now measures **how much of today's plan is done**: habits due today plus tasks
dated today or earlier and still open. Decided with the user:

- Overdue tasks roll forward; missed habits do not. 100% is unreachable while anything is
  overdue, deliberately.
- Undated tasks are a backlog and never affect the arc.
- No per-item weighting. Grouping is the user's lever instead.
- The printed percentage goes (the gauge scale already carries the value) and so does the
  streak, returning later with gamification. **Next Up stays.**
- Inside the dome: one line stating what is left, informational rather than congratulatory.
  A user-authored name may appear only at the start of a line or after a colon, is never
  transformed, and is capped at 20 characters — the rule that keeps it safe in Czech.
- Supplements are habits that need a cadence: every day / 2 days / 3 days / certain weekdays,
  with a user-chosen start date. This also resolves the Monday hardcode for weekly habits.

**What shipped beyond the spec, and what is still open:**

- The mock data that reached production with PR #16 is gone: `FAKE_HABITS`, `FAKE_TASKS`,
  `makeFakeEvents` and the whole fake Supplements carousel (mock UI for a feature that does
  not exist). Home has real empty states now.
- Two pre-existing UTC date-key bugs were found and fixed. `toDateKey` was
  `toISOString().slice(0,10)` in both `useHabits` and `Home`, so east of UTC a completion
  after local midnight was filed against the previous day. Now `src/lib/dateKey.ts`, tested.
- `013` redefines `pending_notifications_BASE`, not `pending_notifications`. 012 renamed
  011's function to `_base` and made `pending_notifications` a wrapper that adds the
  "someone joined your open plan" branch; replacing the wrapper would silently delete that
  feature. 013 raises an exception if `_base` is missing, i.e. if 012 was skipped.
- **Known divergence, accepted:** the push copy still says "N habits left today" and the
  morning summary still counts habits only, while the arc counts tasks too. Bringing tasks
  into the notification copy is a follow-up.
- **Deferred minors from the branch review:** `cadenceLabel` is tested but rendered nowhere,
  so the Habits list never tells you a habit's cadence; `hasHiddenWeekly` is returned by the
  hook and read by nobody; habit mutations still filter by `id` only (RLS covers it);
  the weekday chip row overflows below ~364px wide; the 20-character name cap can split an
  emoji surrogate pair; `progress.ts` sorts habit date keys against task ISO timestamps, so
  same-day ties always put habits first for a formatting reason.
- `src/pages/Tasks.tsx` is still a "Coming soon" stub, so Home's Tasks card is the only
  place tasks are visible. It lists every task and counts "N of M" over all of them, while
  the arc counts only what is planned for today; each row now shows Today / Overdue /
  Backlog / a date so the arc's number can still be reconstructed.

Needed migration `013` (a date and `completed_at` on tasks, cadence columns on habits) and
touches `pending_notifications`. **The app is also meant to support Czech, and has no i18n
layer whatsoever** — no library, no locale files. That is a project in its own right and
nothing else in this file mentions it.

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
9. **`tests/` is in no tsconfig `include`**, so `npx tsc -b` does not type-check test files. Pre-existing, project-wide.
10. `skyPhase` and `SKY_BOUNDARY_HOURS` both encode 5/11/18; `skyPhase` now derives from the shared table, but nothing asserts they agree.

## Next steps (suggested order)
1. **Run `011`, `012`, `013` in the SQL Editor, in that order.** Nothing on
   `feat/progress-arc` can be deployed before this; see the release-order box above.
2. **Run `supabase/tests/pending_notifications.test.sql`** in the SQL Editor. It is the only
   test in this project that cannot run from a dev machine, and it now covers the habit
   cadence and the "someone joined your plan" branch. Success looks like `ALL TESTS PASSED`.
3. **Device-check `feat/progress-arc`**: create a habit of each cadence; tick a task, un-tick
   it and reload (the un-tick path has no automated test and is the one place a stale
   `completed_at` would pin the arc); confirm the dome's line and the gauge scale are legible
   over all three skies.
4. Live updates for own-data tables (habits, completions, tasks, calendar events) with an echo
   guard.
4. Design cleanup: tokens for accent/status colors, one glass recipe, contrast fixes.
5. Finish verifying push notifications on a real iPhone: habit, event (two alerts), plan,
   invitation, friend request, morning summary (runbook section 7).
6. Add error surfacing to hooks (issue 3).
7. Decide when Czech happens. It needs an i18n layer that does not exist yet.

## Working with this repo
- Tooling and rules live in `CLAUDE.md`; UI rules in `docs/design-system.md`. Git: branch, PR into `master`, do not push or merge without being asked.
- A cloud Claude session also works on this repo. `git fetch` and check `gh pr list` before assuming local state is current.
- Specs and plans: `docs/superpowers/specs/`, `docs/superpowers/plans/` (process: brainstorm, spec, plan, execute). The `superpowers` plugin was installed 2026-10-15 (`obra/superpowers-marketplace`, user scope); before that these directories existed without the tooling that made them.
