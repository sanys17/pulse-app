# Progress Arc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Home arc measure completion of today's plan — habits due today plus tasks dated today or overdue — and replace the printed percentage and streak with one line that says what is left.

**Architecture:** All the decidable logic goes into three pure modules under `src/lib` (`cadence.ts`, `progress.ts`, `progressCopy.ts`) so `npm test` can cover it with `node --test`; the hooks convert rows and timestamps into date keys and hand plain data to those modules. Postgres gets real columns rather than jsonb, because `pending_notifications` must evaluate habit due-ness in SQL too.

**Tech Stack:** React 19, TypeScript, Vite, Supabase (Postgres + RLS), `node --test` on `.mts` files.

**Spec:** `docs/superpowers/specs/2026-10-16-progress-arc-design.md`

**Branch:** off `master`, after `feat/sky-backgrounds` has been verified on a device and
merged. Do not build this on the sky branch — it carries 24 unmerged commits and that
branch's own unresolved device-verification blocker, and they would all land in this PR.

## Global Constraints

- Pure modules in `src/lib` may import only other pure modules, with explicit `.ts` extensions, or `node --test` cannot load them.
- Date keys are `YYYY-MM-DD` strings in the device's local day. Pure modules take date keys, never `Date` objects and never timestamps, so no timezone logic lives in tested code.
- `src/lib/database.types.ts` must stay `type Database = {...}` with `Relationships` on every table, plus schema-level `Views`, `Functions`, `Enums`, `CompositeTypes`. Otherwise every query resolves to `never`.
- Mutations filter by `user_id` as well as `id`. Important writes use `.select("id")` with `expectRows("table.operation", data)`.
- Do not use `crypto.randomUUID()`. Temp ids: `Date.now().toString(36) + Math.random().toString(36).slice(2, 7)`.
- Migrations are append-only and run by hand by the user. This plan adds `013` only.
- Inputs render at 16px on touch. Empty `type="date"` inputs need a placeholder overlay (see `src/pages/Calendar.tsx`).
- Name interpolation rule: a user-authored name appears only at the start of a line or immediately after a colon, is never transformed, and is capped at 20 characters.
- Cadence options are exactly: every day, every 2 days, every 3 days, certain weekdays. No open number field.

## Review Focus

1. **Un-ticking a task must clear `completed_at`.** If it is left set, the task stays in today's numerator forever and the arc never falls back. This one lives in a hook that talks to Supabase, so no pure test reaches it: it is verified on the device in Task 5, and Task 6 covers the shape it would produce.
2. **A task completed at 23:59 local** must land on today's date key, not tomorrow's — `completed_at` is `timestamptz` and the key is local. Test in Task 5.
3. **An interval habit whose start date is in the future** must not be due today. Test in Task 1.
4. **Un-completing a habit** must take the arc back down; the spec only ever describes it going up. Test in Task 6.
5. **A name longer than the cap, or empty/whitespace**, must not produce a broken or misleading line. Test in Task 7.

---

### Task 1: Cadence model

**Files:**
- Create: `src/lib/cadence.ts`
- Test: `tests/cadence.test.mts`

**Interfaces:**
- Produces:
  - `type Cadence = { kind: "daily" } | { kind: "interval"; days: number; startDate: string } | { kind: "weekdays"; days: number[] }` — `days` for weekdays uses JS `getDay()` numbering, 0 = Sunday.
  - `isDueOn(cadence: Cadence, dateKey: string): boolean`
  - `cadenceLabel(cadence: Cadence): string`
  - `dayNumber(dateKey: string): number` — whole days since epoch, parsed as UTC so DST cannot shift it.

- [ ] **Step 1: Write the failing tests** in `tests/cadence.test.mts`

```ts
test("daily is due every day", () => {
  assert.equal(isDueOn({ kind: "daily" }, "2026-10-16"), true);
});

test("every 2 days counts from the start date", () => {
  const c = { kind: "interval", days: 2, startDate: "2026-10-16" } as const;
  assert.equal(isDueOn(c, "2026-10-16"), true);
  assert.equal(isDueOn(c, "2026-10-17"), false);
  assert.equal(isDueOn(c, "2026-10-18"), true);
});

test("an interval habit is not due before its start date", () => {
  const c = { kind: "interval", days: 2, startDate: "2026-10-20" } as const;
  assert.equal(isDueOn(c, "2026-10-16"), false);
});

test("an interval spanning a DST change keeps its parity", () => {
  // Europe/Prague turns the clocks back on 2026-10-25.
  const c = { kind: "interval", days: 2, startDate: "2026-10-23" } as const;
  assert.equal(isDueOn(c, "2026-10-27"), true);
  assert.equal(isDueOn(c, "2026-10-26"), false);
});

test("weekdays is due only on its own days", () => {
  const c = { kind: "weekdays", days: [1, 3, 5] } as const; // Mon, Wed, Fri
  assert.equal(isDueOn(c, "2026-10-16"), true);  // Friday
  assert.equal(isDueOn(c, "2026-10-17"), false); // Saturday
});

test("labels name the cadence", () => {
  assert.equal(cadenceLabel({ kind: "daily" }), "Every day");
  assert.equal(cadenceLabel({ kind: "interval", days: 3, startDate: "2026-10-16" }), "Every 3 days");
  assert.equal(cadenceLabel({ kind: "weekdays", days: [1, 3, 5] }), "Mon, Wed, Fri");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot find module `../src/lib/cadence.ts`

- [ ] **Step 3: Implement `src/lib/cadence.ts`**

`dayNumber` parses the key with `Date.UTC` and divides by 86400000 — that is what makes the DST test pass. `isDueOn` for an interval is `dayNumber(dateKey) >= dayNumber(startDate)` and the difference modulo `days` being zero.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cadence.ts tests/cadence.test.mts
git commit -m "feat: habit cadence model"
```

---

### Task 2: Migration 013 and generated types

**Files:**
- Create: `supabase/migrations/013_plan_completion.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: `tasks.due_date date null`, `tasks.completed_at timestamptz null`, `habits.interval_days smallint null`, `habits.start_date date null`, `habits.weekdays smallint[] null`. `habits.frequency` takes the values `daily`, `interval`, `weekdays`.
- Produces: `public.habit_due_on(frequency text, interval_days smallint, start_date date, weekdays smallint[], d date) returns boolean`, mirroring `isDueOn` from Task 1 for use in SQL.

- [ ] **Step 1: Write `supabase/migrations/013_plan_completion.sql`**

Add the five columns. Then migrate existing rows so that no past behaviour changes meaning:

```sql
update public.habits
set frequency = 'weekdays', weekdays = array[1]::smallint[]
where frequency = 'weekly';
```

Then define `habit_due_on`, matching Task 1's rules exactly: `daily` is always true; `interval` is `d >= start_date and (d - start_date) % interval_days = 0`; `weekdays` is `extract(dow from d)::smallint = any(weekdays)`. No RLS changes — both tables already have `for all using (auth.uid() = user_id)`.

- [ ] **Step 2: Update `src/lib/database.types.ts`** with the new columns on `tasks` and `habits` in `Row`, `Insert` and `Update`, and add `habit_due_on` to the schema's `Functions`.

- [ ] **Step 3: Verify the types still resolve**

Run: `npx tsc -b`
Expected: exit 0. If any query now resolves to `never`, the `type`/`Relationships` shape has been broken — see Global Constraints.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_plan_completion.sql src/lib/database.types.ts
git commit -m "feat: schema for dated tasks and habit cadence"
```

**Note for the human partner:** this migration must be run in the Supabase SQL Editor before the feature works, and `011` and `012` must be run first — per `handoff.md` neither has been applied yet.

---

### Task 3: Habits read their cadence

**Files:**
- Modify: `src/types.ts` (the `Habit` and `HabitInput` interfaces)
- Modify: `src/hooks/useHabits.ts:264-290`

**Interfaces:**
- Consumes: `Cadence`, `isDueOn` from Task 1.
- Produces: `Habit.cadence: Cadence` replacing `Habit.frequency`. `useHabits` still returns `todaysHabits`, `todaysProgress`, `hasHiddenWeekly` with their current shapes.

- [ ] **Step 1: Replace `frequency` with `cadence` on `Habit` and `HabitInput`** in `src/types.ts`, and map the new columns to and from a `Cadence` in the fetch, insert and update paths of `useHabits`.

- [ ] **Step 2: Replace the `todaysHabits` filter** at `src/hooks/useHabits.ts:264-269` with `isDueOn(h.cadence, todayKey)`, deleting the `day === 1` Monday hardcode. Update `hasHiddenWeekly` to mean "has a habit not due today".

- [ ] **Step 3: Verify the build**

Run: `npx tsc -b && npm test`
Expected: exit 0, 94 existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/hooks/useHabits.ts
git commit -m "feat: habits are due by cadence, not a Monday hardcode"
```

---

### Task 4: Cadence control in the habit form

**Files:**
- Modify: `src/components/HabitForm.tsx:20-21,172-190`

**Interfaces:**
- Consumes: `Cadence`, `cadenceLabel` from Task 1; `HabitInput.cadence` from Task 3.

- [ ] **Step 1: Replace the two-button daily/weekly control** with four options — Every day, Every 2 days, Every 3 days, Certain weekdays — following the existing `aria-pressed` button pattern already in that block.

- [ ] **Step 2: Reveal a start-date field** when an interval option is selected, defaulting to today, and a seven-toggle weekday row when Certain weekdays is selected. The date input needs the placeholder overlay described in Global Constraints.

- [ ] **Step 3: Verify on the device**

Run: `npm run dev -- --host`, then create one habit of each cadence on the phone and confirm each appears on the right days.
Expected: every-2-days appears today and not tomorrow; a Mon/Wed/Fri habit is absent on Saturday.

- [ ] **Step 4: Commit**

```bash
git add src/components/HabitForm.tsx
git commit -m "feat: pick a cadence and start date when creating a habit"
```

---

### Task 5: Tasks carry a date and a completion time

**Files:**
- Modify: `src/hooks/useTasks.ts`
- Modify: `src/components/AddTaskSheet.tsx`
- Test: `tests/taskDay.test.mts`

**Interfaces:**
- Produces: `Task = { id: string; label: string; done: boolean; dueDate: string | null; completedDateKey: string | null; createdAt: string }`.
- Produces: `addTask(label: string, dueDate: string | null)`.
- Produces: `src/lib/dateKey.ts` exporting `toDateKey(d: Date): string` and `completedDateKey(iso: string | null): string | null`, so the local-day conversion is testable. `useHabits.ts:7` has a private copy of `toDateKey`; move it here and import it in both.

- [ ] **Step 1: Write the failing tests** in `tests/taskDay.test.mts`

```ts
test("a completion just before local midnight belongs to that day", () => {
  const iso = new Date(2026, 9, 16, 23, 59).toISOString();
  assert.equal(completedDateKey(iso), "2026-10-16");
});

test("a task with no completion has no key", () => {
  assert.equal(completedDateKey(null), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot find module `../src/lib/dateKey.ts`

- [ ] **Step 3: Implement `src/lib/dateKey.ts`**, then widen `Task` and the fetch mapping in `useTasks`, and give `addTask` its second parameter.

- [ ] **Step 4: Set and clear `completed_at` in `toggleTask`** — set it to `new Date().toISOString()` when ticking, and to `null` when un-ticking. This is Review Focus item 1: leaving it set keeps the task in today's numerator permanently. Keep the existing `expectRows("tasks.update", data)` check and add `.eq("user_id", user.id)` to the filter per Global Constraints.

- [ ] **Step 5: Add an optional date field to `AddTaskSheet`**, with the placeholder overlay, passing `null` when left empty.

- [ ] **Step 6: Run the tests and the build**

Run: `npm test && npx tsc -b`
Expected: PASS, exit 0

- [ ] **Step 7: Verify the un-tick path on the device**

Tick a dated task, then un-tick it, then reload the page. Expected: it comes back open. If
`completed_at` was not cleared it will return as done — Review Focus item 1, and the one
failure in this plan that no automated test can reach.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dateKey.ts tests/taskDay.test.mts src/hooks/useTasks.ts src/hooks/useHabits.ts src/components/AddTaskSheet.tsx
git commit -m "feat: tasks carry a due date and a completion time"
```

---

### Task 6: Today's plan

**Files:**
- Create: `src/lib/progress.ts`
- Test: `tests/progress.test.mts`

**Interfaces:**
- Consumes: `Cadence`, `isDueOn` from Task 1.
- Produces:
  - `interface PlannedHabit { id: string; name: string; cadence: Cadence; reminderTime: string | null; done: boolean }`
  - `interface PlannedTask { id: string; label: string; dueDate: string | null; done: boolean; completedDateKey: string | null; createdAt: string }`
  - `interface PlannedItem { id: string; name: string; done: boolean }`
  - `plannedToday(habits: PlannedHabit[], tasks: PlannedTask[], todayKey: string): PlannedItem[]` — returned in "next" order: habits with a reminder time, earliest first; then everything else by `createdAt`.
  - `progressOf(items: PlannedItem[]): { done: number; total: number; pct: number }` — `pct` is rounded, and `0` when `total` is `0`.

- [ ] **Step 1: Write the failing tests** in `tests/progress.test.mts`

```ts
test("habits due today and tasks dated today both count", () => {
  const items = plannedToday([habit("Gym", true)], [task("Invoice", "2026-10-16", false)], "2026-10-16");
  assert.deepEqual(items.map((i) => i.name), ["Gym", "Invoice"]);
});

test("an undated task never counts", () => {
  assert.equal(plannedToday([], [task("Someday", null, false)], "2026-10-16").length, 0);
});

test("an overdue task rolls forward and is still incomplete", () => {
  const items = plannedToday([], [task("Invoice", "2026-10-14", false)], "2026-10-16");
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Invoice");
  assert.equal(items[0].done, false);
});

test("an overdue task completed today counts as done today", () => {
  const t = { ...task("Invoice", "2026-10-14", true), completedDateKey: "2026-10-16" };
  assert.equal(progressOf(plannedToday([], [t], "2026-10-16")).pct, 100);
});

test("a task completed on an earlier day has left today entirely", () => {
  const t = { ...task("Invoice", "2026-10-14", true), completedDateKey: "2026-10-14" };
  assert.equal(plannedToday([], [t], "2026-10-16").length, 0);
});

test("a habit not due today is absent, not incomplete", () => {
  const h = { ...habit("Creatine", false), cadence: { kind: "interval", days: 2, startDate: "2026-10-15" } };
  assert.equal(plannedToday([h], [], "2026-10-16").length, 0);
});

test("un-completing a habit takes the percentage back down", () => {
  const done = progressOf(plannedToday([habit("Gym", true)], [], "2026-10-16"));
  const undone = progressOf(plannedToday([habit("Gym", false)], [], "2026-10-16"));
  assert.equal(done.pct, 100);
  assert.equal(undone.pct, 0);
});

test("nothing planned is zero, not complete", () => {
  assert.deepEqual(progressOf([]), { done: 0, total: 0, pct: 0 });
});

test("next order puts the earliest reminder first", () => {
  const items = plannedToday(
    [{ ...habit("Evening", false), reminderTime: "20:00" }, { ...habit("Morning", false), reminderTime: "07:00" }],
    [task("Invoice", "2026-10-16", false)],
    "2026-10-16",
  );
  assert.deepEqual(items.map((i) => i.name), ["Morning", "Evening", "Invoice"]);
});
```

Define `habit(name, done)` and `task(label, dueDate, done)` as local helpers at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot find module `../src/lib/progress.ts`

- [ ] **Step 3: Implement `src/lib/progress.ts`**

The task membership rule is: include when `dueDate !== null && dueDate <= todayKey && !done`, or when `completedDateKey === todayKey`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/progress.ts tests/progress.test.mts
git commit -m "feat: today's plan from habits and tasks"
```

---

### Task 7: The line inside the dome

**Files:**
- Create: `src/lib/progressCopy.ts`
- Test: `tests/progressCopy.test.mts`

**Interfaces:**
- Consumes: `PlannedItem` from Task 6.
- Produces: `progressLine(items: PlannedItem[]): string` and `NAME_CAP = 20`.

Branch precedence, in this order — the order is what resolves "nothing done yet" against "one left":

| Condition | Line |
|---|---|
| `total === 0` | `Nothing planned today` |
| no items remain | `Everything done` |
| none done | `Nothing yet today` |
| 1 remains | `Last one: {name}` |
| 2 or 3 remain | `{name} and 2 more` |
| 4 or more remain | `6 left today` |

- [ ] **Step 1: Write the failing tests** in `tests/progressCopy.test.mts`

```ts
test("the ladder", () => {
  assert.equal(progressLine([]), "Nothing planned today");
  assert.equal(progressLine([done("Gym")]), "Everything done");
  assert.equal(progressLine([open("Gym"), open("Invoice")]), "Nothing yet today");
  assert.equal(progressLine([done("A"), open("Gym")]), "Last one: Gym");
  assert.equal(progressLine([done("A"), open("Gym"), open("B"), open("C")]), "Gym and 2 more");
  assert.equal(progressLine([done("A"), open("B"), open("C"), open("D"), open("E"), open("F"), open("G")]), "6 left today");
});

test("a name is never transformed, whatever its grammar", () => {
  assert.equal(progressLine([done("A"), open("Go to gym")]), "Last one: Go to gym");
  assert.equal(progressLine([done("A"), open("Work on Pulse"), open("B"), open("C")]), "Work on Pulse and 2 more");
});

test("a long name is capped", () => {
  assert.equal(progressLine([done("A"), open("Call mum about the thing")]), "Last one: Call mum about the…");
});

test("a blank name does not produce a dangling line", () => {
  assert.equal(progressLine([done("A"), open("   ")]), "Last one: Untitled");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot find module `../src/lib/progressCopy.ts`

- [ ] **Step 3: Implement `src/lib/progressCopy.ts`**

Keep every string literal in this one function; that is what confines the Czech rework later. Truncation trims to `NAME_CAP` characters and appends `…`. A name that is empty or whitespace becomes `Untitled`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/progressCopy.ts tests/progressCopy.test.mts
git commit -m "feat: the progress line"
```

---

### Task 8: Rewire the hero

**Files:**
- Modify: `src/pages/Home.tsx` — `praiseFor` at 324, the fake-data wiring at 536-543 and 590-600, the hero block at 1010-1125

**Interfaces:**
- Consumes: `plannedToday`, `progressOf` from Task 6; `progressLine` from Task 7.

- [ ] **Step 1: Build the arc's value from the real plan.** Replace `displayDone`/`displayTotal`/`progressPct` with `progressOf(plannedToday(...))`, assembled from `useHabitsContext` and the tasks context. The arc must never read `FAKE_HABITS` or `FAKE_TASKS` — that is what makes the nothing-planned state reachable at all. Leave the fake data feeding the lists below the hero for now; only the gauge is in scope.

- [ ] **Step 2: Delete `praiseFor`** and render `progressLine(items)` inside the dome in its place.

- [ ] **Step 3: Remove the percentage, the streak number and the "Best: N days" line.** With `heroV2` no longer distinguishing anything, delete the flag, `useHeroV2`, and the `heroV2 ?` branches at 1014, 1022, 1028-1031 and 1046.

- [ ] **Step 4: Keep Next Up and the date block** exactly as they are (`src/pages/Home.tsx:1125`).

- [ ] **Step 5: Verify**

Run: `npm run build && npm test`
Expected: exit 0, all tests pass.

- [ ] **Step 6: Verify on the device** — tick a habit and watch the arc rise and the line change; un-tick it and watch both reverse; delete everything due today and confirm the line reads `Nothing planned today` with an empty arc.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: the arc measures today's plan"
```

---

### Task 9: Notifications respect the cadence

**Files:**
- Modify: `supabase/migrations/013_plan_completion.sql` (extend, it is not yet applied)
- Modify: `supabase/tests/pending_notifications.test.sql`

**Interfaces:**
- Consumes: `habit_due_on` from Task 2.

- [ ] **Step 1: Redefine `pending_notifications(p_now)`** so the habit reminder branch and the morning summary count only habits where `habit_due_on(...)` is true for the local date. Without this, an every-2-days supplement sends a reminder on its off day and the summary's count disagrees with the arc.

- [ ] **Step 2: Add cases to `supabase/tests/pending_notifications.test.sql`** using the fake clock `p_now`: an every-2-days habit produces a reminder on its due day and none on its off day; a Mon/Wed/Fri habit produces none on a Sunday.

- [ ] **Step 3: Verify** — the user runs the test file in the Supabase SQL Editor and reports the result. This cannot be run from here.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_plan_completion.sql supabase/tests/pending_notifications.test.sql
git commit -m "feat: habit reminders follow the cadence"
```

---

## Out of scope

- Bringing dated tasks into the push notification copy. The morning summary will keep saying "N habits left today" while the arc counts tasks too. Log this in `handoff.md`.
- Removing the demo data from the lists below the hero.
- Czech localisation.
