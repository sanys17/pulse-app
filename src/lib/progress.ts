// What counts towards today's arc.
//
// The arc answers one question: how much of what I planned for today have I actually
// done. Not a score of the day, not a measure of effort. Plan versus done.
//
// Pure module: imports only other pure modules, with a .ts extension, so node --test can
// load it. Everything is date keys; no Date objects, no timestamps, no timezones.
//
// Spec: docs/superpowers/specs/2026-10-16-progress-arc-design.md

import { isDueOn, type Cadence } from "./cadence.ts";

export interface PlannedHabit {
  id: string;
  name: string;
  cadence: Cadence;
  reminderTime: string | null;
  done: boolean;
  createdAt: string;
}

export interface PlannedTask {
  id: string;
  label: string;
  dueDate: string | null;
  done: boolean;
  completedDateKey: string | null;
  createdAt: string;
}

export interface PlannedItem {
  id: string;
  name: string;
  done: boolean;
}

// Sorted so the first open item is the one to name in the line under the arc. Habits
// with a reminder time come first in clock order; everything else falls back to when it
// was created, which is the only ordering tasks have.
interface Sortable extends PlannedItem {
  rank: number;
  at: string;
}

export function plannedToday(
  habits: PlannedHabit[],
  tasks: PlannedTask[],
  todayKey: string,
): PlannedItem[] {
  const out: Sortable[] = [];

  for (const h of habits) {
    // A habit is about its day. Miss it and it is gone at midnight — you cannot do
    // yesterday's push-ups, so there is nothing to roll forward.
    if (!isDueOn(h.cadence, todayKey)) continue;
    out.push({
      id: h.id,
      name: h.name,
      done: h.done,
      rank: h.reminderTime ? 0 : 1,
      at: h.reminderTime ?? h.createdAt,
    });
  }

  for (const t of tasks) {
    // A task you dated and missed is still a plan you made, so it stays until it is
    // done. One finished today stays too, otherwise completing an overdue task would
    // drop it out of the denominator and hold the arc flat instead of raising it.
    const open = t.dueDate !== null && t.dueDate <= todayKey && !t.done;
    const finishedToday = t.completedDateKey === todayKey;
    if (!open && !finishedToday) continue;
    out.push({ id: t.id, name: t.label, done: t.done, rank: 1, at: t.createdAt });
  }

  out.sort((a, b) => (a.rank - b.rank) || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return out.map(({ id, name, done }) => ({ id, name, done }));
}

export function progressOf(items: PlannedItem[]): { done: number; total: number; pct: number } {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  // Nothing planned is not the same as everything done. Zero, and the line under the
  // arc says which of the two it is.
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}
