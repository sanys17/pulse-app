// "YYYY-MM-DD" in the device's local day. Every date key in the app comes from here.
//
// Pure module: no imports, so node --test can load it directly.
//
// This replaces a toISOString().slice(0, 10) that lived in useHabits. That version
// returned the UTC day, so east of UTC a completion after local midnight was filed
// against the previous day, and west of UTC a late-evening one was filed against the
// next. The whole progress model compares these keys, so they have to be local.

export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// A stored completion timestamp is a point in time; which day it belongs to is a local
// question. Converting here keeps timezone handling out of the pure progress rules,
// which only ever see date keys.
export function completedDateKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toDateKey(d);
}
