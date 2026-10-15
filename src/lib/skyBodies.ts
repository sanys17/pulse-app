/**
 * DELIBERATELY IMPURE. This is the only module allowed to import `astronomy-engine`.
 * It must NEVER be imported by a test (or by any pure module in src/lib or api/_lib),
 * or `npm test` breaks because node cannot load it under the pure-module rules.
 *
 * Thin adapter: look up positions, return plain data. All judgement (thresholds,
 * visibility, what counts as rare) lives in the pure `sky.ts`.
 */
import { Body, Equator, Illumination, Observer as AstroObserver } from "astronomy-engine";
import type { Observer } from "./observer";
import type { RareCandidates } from "./sky";

const PLANETS = [
  { name: "Venus", body: Body.Venus, colour: "#F4E3B1" },
  { name: "Mars", body: Body.Mars, colour: "#E0805A" },
  { name: "Jupiter", body: Body.Jupiter, colour: "#F2E6CF" },
  { name: "Saturn", body: Body.Saturn, colour: "#E6D3A3" },
] as const;

/**
 * Galactic centre (Sgr A*), J2000. Fixed point, no library call.
 * `mag` is a placeholder: the centre is not a point source, and the Milky Way's
 * core glow is a surface-brightness feature. 2 is a nominal value the caller's
 * rules may treat as "visible if dark enough".
 */
const GALACTIC_CENTRE = { ra: 17.761, dec: -28.94, mag: 2 } as const;

/**
 * Planet and galactic-centre positions for `date`. RA in hours, Dec in degrees,
 * J2000 (same frame as the star catalogue), geocentric-corrected for the observer.
 * `Equator` returns RA in sidereal hours already, so no conversion is needed.
 */
export function rareCandidates(date: Date, observer: Observer): RareCandidates {
  const obs = new AstroObserver(observer.latitude, observer.longitude, 0);
  return {
    galacticCentre: { ...GALACTIC_CENTRE },
    planets: PLANETS.map(({ name, body, colour }) => {
      const eq = Equator(body, date, obs, false, true);
      return { name, colour, ra: eq.ra, dec: eq.dec, mag: Illumination(body, date).mag };
    }),
  };
}
