export const MAX_ALERTS = 2;

export const TIMED_OFFSETS: readonly number[] = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
export const DATE_ONLY_OFFSETS: readonly number[] = [0, 1440, 2880, 10080];

export const DEFAULT_EVENT_ALERTS: number[] = [15];
export const DEFAULT_PLAN_ALERTS: number[] = [60];
export const DEFAULT_DATE_ONLY_ALERTS: number[] = [0];

const TIMED_LABELS: Record<number, string> = {
  0: "At time of event",
  5: "5 minutes before",
  10: "10 minutes before",
  15: "15 minutes before",
  30: "30 minutes before",
  60: "1 hour before",
  120: "2 hours before",
  1440: "1 day before",
  2880: "2 days before",
  10080: "1 week before",
};

const DATE_ONLY_LABELS: Record<number, string> = {
  0: "On the day (9:00 AM)",
  1440: "1 day before (9:00 AM)",
  2880: "2 days before (9:00 AM)",
  10080: "1 week before (9:00 AM)",
};

export function alertLabel(minutes: number, timed: boolean): string {
  const labels = timed ? TIMED_LABELS : DATE_ONLY_LABELS;
  return labels[minutes] ?? TIMED_LABELS[minutes] ?? `${minutes} minutes before`;
}

export function alertOffsets(timed: boolean): readonly number[] {
  return timed ? TIMED_OFFSETS : DATE_ONLY_OFFSETS;
}

export function alertSummary(alerts: readonly number[], timed: boolean): string {
  if (alerts.length === 0) return "None";
  return alerts.map((m) => alertLabel(m, timed)).join(" and ");
}

// "default" = null on the item (use the user's default), "none" = empty array.
export type AlertChoice = "default" | "none" | number;

export function primaryChoice(value: number[] | null): AlertChoice {
  if (value === null) return "default";
  if (value.length === 0) return "none";
  return value[0];
}

export function secondaryChoice(value: number[] | null): "none" | number {
  return value !== null && value.length > 1 ? value[1] : "none";
}

export function applyPrimary(current: number[] | null, choice: AlertChoice): number[] | null {
  if (choice === "default") return null;
  if (choice === "none") return [];
  const second = current !== null && current.length > 1 ? current[1] : undefined;
  return second !== undefined && second !== choice ? [choice, second] : [choice];
}

export function applySecondary(current: number[] | null, choice: "none" | number): number[] {
  const first = current !== null && current.length > 0 ? current[0] : undefined;
  if (first === undefined) return [];
  if (choice === "none" || choice === first) return [first];
  return [first, choice];
}

// For values read from the database or user input.
export function normalizeAlerts(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out: number[] = [];
  for (const value of input) {
    if (typeof value === "number" && TIMED_OFFSETS.includes(value) && !out.includes(value)) out.push(value);
    if (out.length === MAX_ALERTS) break;
  }
  return out;
}
