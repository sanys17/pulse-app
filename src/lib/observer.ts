import { TIMEZONE_COORDS } from "../data/timezoneCoords.ts";

export type Observer = { latitude: number; longitude: number };

const [PRAGUE_LAT, PRAGUE_LON] = TIMEZONE_COORDS["Europe/Prague"];

/** Fallback when the zone is missing or unknown. */
export const DEFAULT_OBSERVER: Observer = { latitude: PRAGUE_LAT, longitude: PRAGUE_LON };

/** Approximate observer position from an IANA timezone name (a degree or two of error is fine for a sky). */
export function observerFromTimeZone(tz: string | undefined): Observer {
  const key = tz?.trim();
  if (!key || !Object.hasOwn(TIMEZONE_COORDS, key)) return DEFAULT_OBSERVER;
  const [latitude, longitude] = TIMEZONE_COORDS[key];
  return { latitude, longitude };
}
