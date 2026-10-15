export type SkyPhase = "morning" | "afternoon" | "night";

// Local hours at which the sky changes: morning from 05:00, afternoon from 11:00, night from 18:00.
export const SKY_BOUNDARY_HOURS: readonly number[] = [5, 11, 18];

export function skyPhase(date: Date): SkyPhase {
  const hour = date.getHours();
  if (hour >= 18 || hour < 5) return "night";
  if (hour >= 11) return "afternoon";
  return "morning";
}

// The first boundary strictly after `date`, in local time. Searches today and tomorrow so the
// result is always in the future, even at 23:00 or on a day with a DST shift.
export function nextBoundary(date: Date): Date {
  const now = date.getTime();
  let best: Date | null = null;
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const hour of SKY_BOUNDARY_HOURS) {
      const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, hour, 0, 0, 0);
      if (candidate.getTime() > now && (best === null || candidate.getTime() < best.getTime())) {
        best = candidate;
      }
    }
  }
  if (best === null) throw new Error("no boundary found");
  return best;
}
