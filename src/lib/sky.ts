// Equatorial-to-screen star projection. Pure module: type-only imports, no browser APIs,
// no dependencies, so `node --test` can load it directly.
//
// Nothing here may let a non-finite number escape. A NaN reaching an SVG `cx` attribute
// fails silently - no error, no warning, just a star that never renders - so every public
// function either returns a finite result or drops the body entirely.

import type { Observer } from "./observer.ts";
import type { CatalogueStar } from "../data/stars.ts";

/**
 * Anything that can be placed on the sky from equatorial coordinates:
 * `ra` in hours (0-24, J2000), `dec` in degrees, `mag` as visual magnitude.
 *
 * This is the same shape as a catalogue entry, deliberately aliased rather than
 * redeclared so the two cannot drift apart.
 */
export type SkyBody = CatalogueStar;

/** A star placed on the panel: pixel position, pixel radius, and alpha. */
export type ProjectedStar = { x: number; y: number; r: number; opacity: number };

/**
 * Bodies that make a night "rare" and are worth drawing specially. Declared here, in the
 * pure module, so the adapter that assembles it and the predicate that consumes it can
 * both import the type without either depending on the other.
 */
export type RareCandidates = {
  galacticCentre: SkyBody;
  planets: ReadonlyArray<SkyBody & { name: string; colour: string }>;
};

const DEG = Math.PI / 180;

const J2000_JD = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;

/** Magnitude span the catalogue covers (brightest star is Sirius at -1.46). */
const MAG_BRIGHTEST = -1.5;
const MAG_FAINTEST = 4.5;

/** Pixel radius and alpha at each end of that span. Brighter = bigger and more opaque. */
const RADIUS_BRIGHTEST = 1.7;
const RADIUS_FAINTEST = 0.5;
const OPACITY_BRIGHTEST = 1;
const OPACITY_FAINTEST = 0.35;

function julianDay(date: Date): number {
  return date.getTime() / 86400000 + UNIX_EPOCH_JD;
}

/**
 * Greenwich mean sidereal time in degrees (IAU 1982 expression, as given by Meeus).
 * At JD 2451545.0 this returns 280.46061837 deg = 18h 41m 50.55s, the published value.
 */
function greenwichSiderealDegrees(jd: number): number {
  const d = jd - J2000_JD;
  const t = d / 36525;
  return 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Equatorial (RA/Dec) to horizontal (altitude/azimuth) for one observer and instant.
 *
 * Altitude is degrees above the horizon (negative below it). Azimuth is degrees measured
 * from due north, increasing eastward: 0 = N, 90 = E, 180 = S, 270 = W. Precession,
 * nutation and refraction are ignored - a decorative sky does not need arcseconds.
 *
 * Returns NaN components for a non-finite input; callers must check. `projectStars` does.
 */
export function horizontal(body: SkyBody, observer: Observer, date: Date): { altitude: number; azimuth: number } {
  const localSiderealDegrees = greenwichSiderealDegrees(julianDay(date)) + observer.longitude;
  const hourAngle = (localSiderealDegrees - body.ra * 15) * DEG;
  const dec = body.dec * DEG;
  const latitude = observer.latitude * DEG;

  const sinDec = Math.sin(dec);
  const cosDec = Math.cos(dec);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinHour = Math.sin(hourAngle);
  const cosHour = Math.cos(hourAngle);

  const sinAltitude = sinDec * sinLat + cosDec * cosLat * cosHour;
  const altitude = Math.asin(clamp(sinAltitude, -1, 1)) / DEG;

  // atan2 form: no division by cos(altitude), so the poles and the zenith stay finite.
  // The result is measured from due south westward, hence the +180 to reach north-based.
  const south = Math.atan2(cosDec * sinHour, cosDec * cosHour * sinLat - sinDec * cosLat) / DEG;
  const azimuth = ((south + 180) % 360 + 360) % 360;

  return { altitude, azimuth };
}

/**
 * Zenith-centred stereographic projection onto a `width` x `height` panel.
 *
 * The zenith lands at the panel centre and the horizon on a circle of radius
 * `max(width, height) / 2`, so the overhead sky fills the panel. North is up and east is
 * to the left, which is how a sky looks when you lie back and face north.
 *
 * Returns `null` for anything on or below the horizon, anything that falls outside the
 * panel, and anything non-finite.
 */
export function project(
  altitude: number,
  azimuth: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (!Number.isFinite(altitude) || !Number.isFinite(azimuth)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (altitude <= 0) return null;

  const centreX = width / 2;
  const centreY = height / 2;
  const horizonRadius = Math.max(width, height) / 2;

  // tan(zenithDistance / 2) is 0 at the zenith and exactly 1 on the horizon.
  const radius = horizonRadius * Math.tan(((90 - altitude) * DEG) / 2);
  const bearing = azimuth * DEG;

  const x = centreX - radius * Math.sin(bearing);
  const y = centreY - radius * Math.cos(bearing);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > width || y < 0 || y > height) return null;

  return { x, y };
}

/**
 * Project a catalogue onto the panel, keeping input order for the stars that survive.
 *
 * A star is dropped - never emitted with a bad value - if it is below the horizon, off the
 * panel, or if any input or intermediate is non-finite. An invalid `date`, a non-finite
 * observer, or a degenerate panel yields an empty array.
 */
export function projectStars(
  stars: readonly CatalogueStar[],
  observer: Observer,
  date: Date,
  width: number,
  height: number,
): ProjectedStar[] {
  const projected: ProjectedStar[] = [];

  if (!date || !Number.isFinite(date.getTime())) return projected;
  if (!observer || !Number.isFinite(observer.latitude) || !Number.isFinite(observer.longitude)) return projected;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return projected;

  const magSpan = MAG_FAINTEST - MAG_BRIGHTEST;

  for (const star of stars) {
    if (!star) continue;
    if (!Number.isFinite(star.ra) || !Number.isFinite(star.dec) || !Number.isFinite(star.mag)) continue;

    const { altitude, azimuth } = horizontal(star, observer, date);
    const point = project(altitude, azimuth, width, height);
    if (!point) continue;

    const faintness = clamp((star.mag - MAG_BRIGHTEST) / magSpan, 0, 1);
    const r = RADIUS_BRIGHTEST + (RADIUS_FAINTEST - RADIUS_BRIGHTEST) * faintness;
    const opacity = OPACITY_BRIGHTEST + (OPACITY_FAINTEST - OPACITY_BRIGHTEST) * faintness;

    if (!Number.isFinite(r) || r <= 0) continue;
    if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) continue;

    projected.push({ x: point.x, y: point.y, r, opacity });
  }

  return projected;
}
