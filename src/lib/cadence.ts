// How often a habit comes round. Two models, because an interval and a weekday set are
// different ideas and neither expresses the other: supplements want "every 2 days",
// training wants "Mon, Wed, Fri".
//
// Pure module: no imports, so node --test can load it directly. Everything here works on
// "YYYY-MM-DD" date keys in the device's local day, never on Date objects or timestamps,
// which is what keeps timezone and DST out of the tested code.
//
// Mirrored in SQL by public.habit_due_on() in supabase/migrations/013_plan_completion.sql.
// Change one and you must change the other.

export type Cadence =
  | { kind: "daily" }
  | { kind: "interval"; days: number; startDate: string }
  | { kind: "weekdays"; days: number[] };

const DAY_MS = 86_400_000;

// JS getDay() numbering: 0 is Sunday.
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Whole days since the epoch. Parsed as UTC on purpose: a local parse would make the
// difference between two keys 23 or 25 hours across a DST boundary, and an every-2-days
// habit would silently change parity twice a year.
export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isDueOn(cadence: Cadence, dateKey: string): boolean {
  switch (cadence.kind) {
    case "daily":
      return true;
    case "interval": {
      const delta = dayNumber(dateKey) - dayNumber(cadence.startDate);
      return delta >= 0 && delta % cadence.days === 0;
    }
    case "weekdays":
      return cadence.days.includes(weekdayOf(dateKey));
  }
}

export function cadenceLabel(cadence: Cadence): string {
  switch (cadence.kind) {
    case "daily":
      return "Every day";
    case "interval":
      return `Every ${cadence.days} days`;
    case "weekdays":
      return [...cadence.days].sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]).join(", ");
  }
}

// The shape the habits table stores a cadence in. Kept here rather than in the hook so the
// mapping is covered by the same tests as the rules it feeds.
export interface CadenceRow {
  frequency: string;
  interval_days: number | null;
  start_date: string | null;
  weekdays: number[] | null;
}

export function cadenceToRow(cadence: Cadence): CadenceRow {
  switch (cadence.kind) {
    case "daily":
      return { frequency: "daily", interval_days: null, start_date: null, weekdays: null };
    case "interval":
      return { frequency: "interval", interval_days: cadence.days, start_date: cadence.startDate, weekdays: null };
    case "weekdays":
      return { frequency: "weekdays", interval_days: null, start_date: null, weekdays: [...cadence.days] };
  }
}

// Deliberately forgiving. Until the user runs migration 013 the cadence columns do not
// exist, so `select *` returns rows without them, and rows still say "weekly". Falling back
// to daily keeps a habit visible; the alternative — a cadence that matches nothing — would
// make habits silently vanish from the day.
export function cadenceFromRow(row: CadenceRow): Cadence {
  if (row.frequency === "interval" && row.interval_days != null && row.start_date != null) {
    return { kind: "interval", days: row.interval_days, startDate: row.start_date };
  }
  if (row.frequency === "weekdays" && row.weekdays != null && row.weekdays.length > 0) {
    return { kind: "weekdays", days: [...row.weekdays] };
  }
  // Pre-013 rows: "weekly" meant Monday, which is exactly what useHabits hardcoded.
  if (row.frequency === "weekly") return { kind: "weekdays", days: [1] };
  return { kind: "daily" };
}
