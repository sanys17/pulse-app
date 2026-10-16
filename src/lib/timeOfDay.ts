export type SkyPhase = "morning" | "afternoon" | "night";

// Local hours at which the sky changes, ascending, paired with the phase each one starts:
// morning from 05:00, afternoon from 11:00, night from 18:00. `skyPhase` derives its answer
// from this table, so the two can never drift apart.
const BOUNDARIES: ReadonlyArray<readonly [hour: number, phase: SkyPhase]> = [
  [5, "morning"],
  [11, "afternoon"],
  [18, "night"],
];

export const SKY_BOUNDARY_HOURS: readonly number[] = BOUNDARIES.map(([hour]) => hour);

export function skyPhase(date: Date): SkyPhase {
  const hour = date.getHours();
  // Before the first boundary of the day the previous day's last phase is still running.
  let phase = BOUNDARIES[BOUNDARIES.length - 1][1];
  for (const [boundaryHour, boundaryPhase] of BOUNDARIES) {
    if (hour >= boundaryHour) phase = boundaryPhase;
  }
  return phase;
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
