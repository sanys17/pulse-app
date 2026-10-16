import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedToday, progressOf, type PlannedHabit, type PlannedTask } from "../src/lib/progress.ts";

let seq = 0;
const habit = (name: string, done: boolean): PlannedHabit => ({
  id: `h${++seq}`,
  name,
  cadence: { kind: "daily" },
  reminderTime: null,
  done,
  createdAt: `2026-10-01T00:00:${String(seq).padStart(2, "0")}Z`,
});
const task = (label: string, dueDate: string | null, done: boolean): PlannedTask => ({
  id: `t${++seq}`,
  label,
  dueDate,
  done,
  completedDateKey: null,
  createdAt: `2026-10-01T00:00:${String(seq).padStart(2, "0")}Z`,
});

const names = (xs: { name: string }[]) => xs.map((x) => x.name);

test("habits due today and tasks dated today both count", () => {
  const items = plannedToday([habit("Gym", true)], [task("Invoice", "2026-10-16", false)], "2026-10-16");
  assert.deepEqual(names(items), ["Gym", "Invoice"]);
});

test("an undated task never counts", () => {
  assert.equal(plannedToday([], [task("Someday", null, false)], "2026-10-16").length, 0);
});

test("an undated task that is done still never counts", () => {
  // The helper leaves completedDateKey null, which is not what this name claims. Tick
  // a backlog task today and it must still stay out of today's plan: it was never
  // planned for any day, so finishing it cannot change today's denominator.
  const t = { ...task("Someday", null, true), completedDateKey: "2026-10-16" };
  assert.equal(plannedToday([], [t], "2026-10-16").length, 0);
});

test("a future-dated task finished early does not enter today's plan", () => {
  const t = { ...task("Later", "2026-10-20", true), completedDateKey: "2026-10-16" };
  assert.equal(plannedToday([], [t], "2026-10-16").length, 0);
});

test("a task dated in the future does not count yet", () => {
  assert.equal(plannedToday([], [task("Later", "2026-10-20", false)], "2026-10-16").length, 0);
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
  const h: PlannedHabit = {
    ...habit("Creatine", false),
    cadence: { kind: "interval", days: 2, startDate: "2026-10-15" },
  };
  assert.equal(plannedToday([h], [], "2026-10-16").length, 0);
});

test("a habit missed yesterday does not roll forward the way a task does", () => {
  const h: PlannedHabit = { ...habit("Gym", false), cadence: { kind: "weekdays", days: [4] } };
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

test("the percentage is rounded", () => {
  const items = plannedToday(
    [habit("a", true), habit("b", false), habit("c", false)],
    [],
    "2026-10-16",
  );
  assert.deepEqual(progressOf(items), { done: 1, total: 3, pct: 33 });
});

test("100% is unreachable while something is overdue", () => {
  const items = plannedToday(
    [habit("Gym", true)],
    [task("Invoice", "2026-10-14", false)],
    "2026-10-16",
  );
  assert.equal(progressOf(items).pct, 50);
});

test("next order puts the earliest reminder first, then everything else", () => {
  const evening: PlannedHabit = { ...habit("Evening", false), reminderTime: "20:00" };
  const morning: PlannedHabit = { ...habit("Morning", false), reminderTime: "07:00" };
  const items = plannedToday([evening, morning], [task("Invoice", "2026-10-16", false)], "2026-10-16");
  assert.deepEqual(names(items), ["Morning", "Evening", "Invoice"]);
});

test("items without a reminder keep creation order", () => {
  const first = habit("First", false);
  const second = habit("Second", false);
  assert.deepEqual(names(plannedToday([second, first], [], "2026-10-16")), ["First", "Second"]);
});
