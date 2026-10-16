# What the Home progress arc measures

Design document. Written 2026-10-16. Status: reviewed, ready to plan.

Supersedes nothing written down, because the arc's meaning was never written down. It
partly retires the open hero question in `handoff.md` ("Animated sky backgrounds",
outstanding items 2 and 3): the `?hero=v2` experiment and the current hero are both made
obsolete by what follows.

## Intent

The Home screen has carried a progress arc through two redesigns without anyone deciding
what it measures. Today it is wired to habits only — `todaysProgress` in
`src/hooks/useHabits.ts:272`, surfaced as `progressPct` at `src/pages/Home.tsx:597` — and
that was an implementation default, not a decision. Tasks exist in the app and are absent
from it.

Asked what he wants from the arc, the user's answer was "how much I did that day". Asked
what a day he'd call a good one contains, the answer was "sports, work, actual work done".
Those live in Pulse as habits and tasks.

So the arc answers exactly one question: **how much of what I planned for today have I
actually done.** It is not a score of the day, not a measure of effort, and not a judgement
of whether the day was good. Plan versus done.

Two things leave the hero as part of this. The printed percentage goes, because the gauge
scale built on 2026-10-16 (end numbers plus four dots) already makes the value readable,
and a dial does not need a digital readout. The streak goes too — the user's words: "lose
the streak, we can add it later with more gamification features."

## Goals

1. The arc represents one defined quantity: the share of today's planned items that are
   complete.
2. Habits and tasks both count toward it.
3. Items not scheduled for today never affect it, in either direction.
4. The value is readable from the gauge alone, with no number printed.
5. The space inside the dome carries one short line that tells the user what is left.
6. That line survives translation into Czech later without being restructured.

## Non-goals

- **Per-item weighting.** Explicitly rejected; see "Decisions" below.
- **Calendar events in the denominator.** Attending something is not doing it.
- **Streaks, badges, or any other gamification.** Deferred by the user to a later feature.
- **Czech localisation itself.** The app has no i18n layer at all — no library, no locale
  files, nothing but `Intl.DateTimeFormat` for timezone lookup. Czech is "probably later".
  This document only requires that the arc's copy not need *rewriting* when that day comes.
- **History or trends.** No "your average this week". Today only.

## Anti-goals

These would make the feature a failure even if it shipped and worked.

1. **A value the user cannot reconstruct.** If he glances at the arc and cannot work out in
   his head why it sits where it does, the gauge has stopped being trustworthy. This is the
   main argument against weighting.
2. **A backlog that punishes.** Adding a task he intends to do "sometime" must never lower
   today's arc. If it can, he will stop adding tasks, and the app loses the data.
3. **A sentence that congratulates on a schedule.** The line inside the dome is seen every
   day for years. Praise delivered on a timetable becomes either wallpaper or an irritant.
4. **Copy that needs rewriting rather than translating.** Any string built by concatenating
   a count or a user-authored name into an English sentence frame is a string that must be
   redesigned for Czech, not merely translated.

## Constraints

- **Mobile-first, iOS PWA.** The dome's usable interior is narrow; the line has one line of
  room, not two.
- **No i18n infrastructure exists.** Every user-facing string in the app is a hardcoded
  English literal.
- **Migrations are run by hand** by the user in the Supabase SQL Editor. The next free
  number is `013`.
- **Habit frequency today is `"daily" | "weekly"`**, and "weekly" is hardcoded to Monday
  (`day === 1`, `src/hooks/useHabits.ts:265`). Any cadence work inherits that quirk and
  should resolve it rather than build beside it.
- **Tasks today are `{ id, label, done }`** (`src/hooks/useTasks.ts:6`). No date of any kind.

## The model

**Denominator**: habits due today, plus every task that is dated today or earlier and still
open, plus every task completed today.
**Numerator**: those of them that are complete.
**Weight**: every item counts once. A supplement, a gym session and a work task are each 1.

**Tasks roll forward; habits do not.** A task you dated and missed is still a plan you made,
so it stays in the denominator until it is done — the user's decision, in his words: "make
it overdue and count to next day". A habit does not: you cannot do yesterday's push-ups, so
a missed habit is simply gone at midnight. This asymmetry is deliberate.

A consequence: 100% is unreachable while anything is overdue. That is the intended pressure.

**Excluded, by design:**

- A task with no date. It was never planned for any day, so it cannot be incomplete today.
- A habit not due today — including an every-other-day supplement on its off day.
- A habit that was due yesterday and missed.
- Calendar events, always.

**Why tasks need a completion timestamp.** With only a `done` boolean, a task dated
yesterday that is finished today would leave the denominator rather than move into the
numerator, so completing it would hold the arc flat instead of raising it. The membership
rule is therefore: a task belongs to today if `date <= today AND NOT done`, or if it was
completed today. That requires `completed_at`, not just `done`.

**The empty case matters.** When nothing is planned for today the denominator is zero. This
must not render as complete. The arc shows empty and the line says so. The current code
already returns `0` rather than dividing by zero; preserve that, but distinguish it in the
copy from "planned something, done none of it".

### Supplements

The user takes some supplements daily and some every two days. He confirmed a supplement is
"just a habit" to him — the only thing missing is the cadence. Pulse cannot express
"every N days".

**Two cadence models are needed, not one.** An interval ("every 2 days") and a weekday set
("Mon/Wed/Fri") are different ideas and neither expresses the other. Supplements want the
interval; training wants the weekdays. The option list is exactly four:

| Option | Behaviour |
|---|---|
| Every day | Due every day. |
| Every 2 days | Interval, counted from a start date. |
| Every 3 days | Interval, counted from a start date. |
| Certain weekdays | Any subset of the seven days. |

No open number field. "Every 11 days" is a fiction people do not need, and each extra option
is a decision the user pays for at every habit he creates.

**The start date is chosen by the user** and applies only to the interval options; a weekday
set needs no anchor. The user's decision: "let the user choose what day they want the
supplement/task/habit to start from". It defaults to today. Tasks are unaffected — they
already carry their one date.

**This resolves the Monday hardcode rather than working around it.** The weekday option
subsumes the current "weekly": existing weekly habits migrate to the weekday set
`{Monday}` and behave exactly as they do now, so no past streak or heatmap is
reinterpreted.

If a group of items ever feels like it is drowning out something more important — six
supplements against one gym session — the remedy is grouping them into one habit called
"Supplements", not weighting. This is the user's lever and it should be explained to him
once, in the habit form or its empty state, rather than solved in code.

## What is on screen

Sky, arc, gauge scale, one line of text inside the dome, and **Next Up**. No percentage. No
streak. No "Best: N days" line — which also disposes of the contrast failure recorded in
`handoff.md`.

**Next Up stays** (`src/pages/Home.tsx:1125`). The user: "it is important to the user
because it says your next event." Note the division of labour this creates and preserve it:
the arc answers *how much of my plan is done*, drawn from habits and tasks; Next Up answers
*what is coming*, drawn from events. Events are deliberately absent from the arc, so these
two never overlap.

This is a content swap inside the existing hero, not a third hero layout. The date and
weekday block stays.

The scale — `0` and `100` at the arc's endpoints, dots at 20/40/60/80 — is now load-bearing
rather than decorative. It is how the value is read. Its legibility on a real iPhone is
therefore a correctness requirement, not a matter of taste.

## The line inside the dome

**It states what remains. It does not evaluate.** A line that tells the user something he
did not already know earns its place every day; a line that judges him earns it once. The
bottom rung is the single exception: at zero done, encouragement is honest.

| Condition | Line |
|---|---|
| Nothing planned today | Nothing planned today |
| Planned, none done | Nothing yet today |
| 4 or more remaining | 6 left today |
| 2 or 3 remaining | `{name}` and 2 more |
| One remaining | Last one: `{name}` |
| All done | Everything done |

This replaces `praiseFor` at `src/pages/Home.tsx:324`, whose current copy ("Every habit done
today") is already wrong under this model, since tasks now count.

### Interpolating a user-authored name

Habit and task names are free text with unpredictable grammar: "Gym", "Go to gym", "Work on
Pulse", "20 min reading". A frame like "Just the {name}" breaks on three of those four. The
rule that makes it safe is about **position**, not wording:

- A name may appear **at the start of the line**, or **immediately after a colon**. Nowhere
  else.
- **Never transform it.** No lowercasing, no capitalising, no article, no pluralising. The
  user's own casing ships as typed.
- **Cap it** at roughly 20 characters with an ellipsis. Nothing stops a habit being called
  "Call mum about the thing".

Both safe positions survive Czech unchanged: "Poslední: Jít do posilovny" works.

### What Czech will cost later

The counted branches — "6 left today" and "{name} and 2 more" — are the only two lines here
that cannot be translated as-is. Czech has four plural categories and inflects the noun
along with the number (*zbývá 1 položka* / *zbývají 2 položky* / *zbývá 6 položek*), so both
need real plural-category selection rather than interpolation.

Keeping the whole ladder inside one function, as `praiseFor` already is, confines that
future rework to one place. Do not spread these strings across the component.

## Schema changes required

Two migrations' worth of change, numbered from `013`.

1. **A date on tasks.** A plain `date`, nullable, written from the device's local day so it
   agrees with the client's `toDateKey` and with the `local_now` the SQL derives from
   `profiles.timezone`. Null means backlog and is excluded from the arc.
2. **`completed_at` on tasks.** A nullable `timestamptz`, set when the task is ticked and
   cleared when it is un-ticked. Required by the roll-forward rule above; `done` alone
   cannot distinguish "finished today" from "finished last week".
3. **A cadence on habits**, expressing the four options in the table above, plus a start date
   for the interval ones. Existing `weekly` rows migrate to the weekday set `{Monday}`.

All of it needs the corresponding update to `src/lib/database.types.ts` — which must stay a
`type` with `Relationships` on every table, per `CLAUDE.md`, or every query resolves to
`never`.

Both tables are also read by `pending_notifications(p_now)` for reminders. Check whether a
cadence change affects which habits are considered due for a notification, and extend
`supabase/tests/pending_notifications.test.sql` if so.

## Decisions already made

Made by the user:

- The arc measures how much of today's plan is done.
- Habits and tasks are the inputs; a day with every habit ticked but work tasks outstanding
  is explicitly not 100%.
- Supplements are habits that need a cadence.
- The percentage goes.
- The streak goes, to return later with gamification.
- Czech is probably later.
- Overdue tasks roll forward into the next day.
- The user picks the start date a habit's cadence counts from.
- Next Up stays in the hero.

Made by me, put to the user and not objected to — a reviewer should feel free to challenge
any of these:

- Undated tasks are excluded from the denominator.
- Habits not due today are excluded from the denominator.
- No per-item weighting. The user asked whether it was necessary; the argument against is
  that a weight must be chosen for every habit forever, makes the number impossible to
  reconstruct, and can be added later with a default of 1 without breaking anything already
  built. Starting with weights and removing them is the hard direction.
- The line inside the dome is informational rather than congratulatory.
- "Next" means earliest reminder time first, nulls last, then creation order — because
  habits have a nullable `reminderTime` and tasks have only `created_at`, so there is no
  real ordering in the data today.
- Names are capped at about 20 characters.
- Habits do not roll forward when missed, although tasks do.
- The cadence option list is the four above, with no open number field.
- Weekly folds into the weekday option, with existing rows pinned to Monday so that no past
  streak, heatmap or perfect-day count changes meaning.
- The arc never reads the demo data. `src/pages/Home.tsx:542` currently substitutes
  `FAKE_HABITS`/`FAKE_TASKS` whenever the real lists are empty, which would make the
  nothing-planned state unreachable and show invented progress. Whether a first-run preview
  survives in some other form is a separate question; it must not feed the gauge.
- Bringing dated tasks into the push notification copy is **out of scope and a follow-up**.
  `pending_notifications` currently composes the habit reminder and morning summary from
  habits and events only, so on any day with an open task the push text will disagree with
  the gauge. That is accepted for now and should be logged in `handoff.md`.

## Branch and sequencing

Build this **after `feat/sky-backgrounds` is verified on a device and merged**, on a branch
off `master`. Building it on the sky branch would drag 24 unmerged commits and that branch's
stated "no device verification at all" blocker into this PR. The arc geometry and gauge scale
this document assumes (`ARC_W` 6, scale ring at `ARC_R + ARC_W / 2 + 20`) are uncommitted
work on the sky branch and arrive with that merge.

Migrations continue the existing numbering from `013` and are run in order. Note that
`011_per_item_reminders.sql` and `012_open_plans.sql` are committed but, per
`handoff.md`, not yet applied to the live database — so the user must run those first.
Do not fold this work into the unapplied `011`; keep migrations append-only.

## Left to the builder

- Type size, weight and colour of the line inside the dome, within the design system. It
  sits over a photographic sky, so it needs the same contrast treatment as the rest of the
  hero.
- How the line animates when it changes, if at all. It changes on every completion tap.
- How the every-N-days cadence is presented in the habit form.
- Whether the task date field defaults to today, and how the backlog and overdue items are
  presented in the Tasks screen now that dated, undated and overdue tasks mean different
  things.
- Whether the gauge scale is hidden in the nothing-planned state or simply shows empty.
- The exact truncation length, tuned on a device rather than guessed.
