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

// ---------------------------------------------------------------------------
// The rare night
//
// Rarity, not visibility, is the requirement. The product decision was "rarely,
// maybe once a month", and plain astronomical visibility does not deliver that:
// from a mid-latitude a bright planet sits above a modest altitude on most
// nights, and the Milky Way core is up during evening hours for months at a
// stretch. So both tests ask for a body at its best rather than merely present:
// above an absolute floor AND within 1% of the highest altitude it can ever
// reach from this latitude - which is to say, crossing the meridian right now,
// within roughly half an hour either side.
//
// Expressing "high" as a fraction of the body's own culmination altitude, rather
// than as a fixed number of degrees, is what makes the rule portable: 60 deg is
// unreachable from Reykjavik and trivial from Quito, whereas "at its highest" is
// the same event everywhere.
//
// Measured against the 2026 planet fixture in tests/sky.test.mts, sampled at
// 21:00 UTC from Prague, these thresholds fire on 14 of 365 nights.
// ---------------------------------------------------------------------------

/**
 * The Milky Way band, or a single bright planet, or nothing. Never both: see
 * `rareNight` for which one wins.
 *
 * The galaxy is a geometry rather than a flag because the galactic plane's
 * orientation on screen changes with the hour and the observer's latitude:
 * `x`/`y` is the core, `angle` is degrees clockwise from the panel's +x axis,
 * `length` is the on-panel span of the band in pixels.
 */
export type RareNight =
  | { kind: "galaxy"; x: number; y: number; angle: number; length: number }
  | { kind: "planet"; x: number; y: number; r: number; colour: string }
  | null;

/** The core must clear the horizon murk before the band is worth drawing at all. */
const GALAXY_MIN_ALTITUDE = 20;
/** Local solar hours during which a galaxy night may be shown (wraps past midnight). */
const GALAXY_EVENING_FROM = 20;
const GALAXY_EVENING_UNTIL = 1;

/** A planet must be properly overhead, not just up. */
const PLANET_MIN_ALTITUDE = 45;
/** Brighter than any fixed star by a clear margin (Sirius is -1.46). */
const PLANET_MAX_MAGNITUDE = -2;

/**
 * Fraction of its own culmination altitude a body must reach: 0.99 means
 * "within 1% of the highest it ever gets from here", about half an hour either
 * side of the meridian. This is the threshold that creates the rarity.
 */
const CULMINATION_FRACTION = 0.99;

/** Brightest magnitude the planet radius ramp accounts for (Venus at its best). */
const PLANET_MAG_BRIGHTEST = -4.9;
const PLANET_RADIUS_BRIGHTEST = 3.6;
const PLANET_RADIUS_DIMMEST = 2.4;

/** Galactic-plane sampling: tangent half-span for the angle, and the band's reach. */
const BAND_TANGENT_SPAN = 4;
const BAND_REACH = 60;
const BAND_STEP = 5;

/** Galactic-to-equatorial rotation (J2000): north galactic pole, and the NCP's galactic longitude. */
const NGP_RA_DEGREES = 192.85948;
const NGP_DEC_DEGREES = 27.12825;
const NCP_GALACTIC_LONGITUDE = 122.93192;

/**
 * A point on the galactic plane (galactic latitude 0) at galactic longitude
 * `l` degrees, as equatorial RA (hours) and Dec (degrees), J2000.
 *
 * Standard rotation, specialised to b = 0:
 *   sin(dec) = cos(decNGP) * cos(lNCP - l)
 *   ra = raNGP + atan2(sin(lNCP - l), -sin(decNGP) * cos(lNCP - l))
 * At l = 0 this returns RA 17.7603 h, Dec -28.92 deg, the published position of
 * Sgr A*, which is the check that the rotation is the right way round.
 */
function galacticPlanePoint(l: number): { ra: number; dec: number } {
  const delta = (NCP_GALACTIC_LONGITUDE - l) * DEG;
  const cosDelta = Math.cos(delta);
  const dec = Math.asin(clamp(Math.cos(NGP_DEC_DEGREES * DEG) * cosDelta, -1, 1)) / DEG;
  const raDegrees =
    NGP_RA_DEGREES + Math.atan2(Math.sin(delta), -Math.sin(NGP_DEC_DEGREES * DEG) * cosDelta) / DEG;
  return { ra: (((raDegrees / 15) % 24) + 24) % 24, dec };
}

/**
 * Local solar hour (0-24) from UTC and longitude. Deliberately derived from the
 * longitude rather than from `Date.getHours()`, which would read the machine's
 * timezone and make the same instant mean different things on different devices.
 */
function localSolarHour(date: Date, observer: Observer): number {
  const utcHours = (date.getTime() / 3600000) % 24;
  return (((utcHours + observer.longitude / 15) % 24) + 24) % 24;
}

function isEvening(hour: number): boolean {
  return hour >= GALAXY_EVENING_FROM || hour < GALAXY_EVENING_UNTIL;
}

/** The highest altitude a body at this declination can ever reach from this latitude. */
function culminationAltitude(dec: number, latitude: number): number {
  return 90 - Math.abs(latitude - dec);
}

/** Above `floor`, and within `CULMINATION_FRACTION` of its own best possible altitude. */
function atItsHighest(altitude: number, dec: number, observer: Observer, floor: number): boolean {
  if (!Number.isFinite(altitude) || altitude < floor) return false;
  const peak = culminationAltitude(dec, observer.latitude);
  if (!Number.isFinite(peak) || peak <= 0) return false;
  return altitude >= peak * CULMINATION_FRACTION;
}

/**
 * The band's screen geometry, or `null` if it cannot be placed with finite
 * numbers. The core's `x`/`y` comes from the caller's galactic-centre body, so
 * the band sits exactly where that body projects; the `angle` and `length` come
 * from `galacticPlanePoint`, because the plane's run across the sky is not
 * something a single point can tell us.
 */
function buildBand(
  centre: { x: number; y: number },
  observer: Observer,
  date: Date,
  width: number,
  height: number,
): RareNight {
  const place = (l: number): { x: number; y: number } | null => {
    const { ra, dec } = galacticPlanePoint(l);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
    const { altitude, azimuth } = horizontal({ ra, dec, mag: 0 }, observer, date);
    return project(altitude, azimuth, width, height);
  };

  const before = place(-BAND_TANGENT_SPAN);
  const after = place(BAND_TANGENT_SPAN);
  if (!before || !after) return null;

  const angle = Math.atan2(after.y - before.y, after.x - before.x) / DEG;
  if (!Number.isFinite(angle)) return null;
  // A band has no head or tail, so fold the direction into (-90, 90].
  const folded = ((((angle + 90) % 180) + 180) % 180) - 90;

  // Reach along the plane in both directions, as far as the panel allows. A
  // sample that falls below the horizon or off the panel simply does not extend
  // the band; the farthest surviving one on each side sets that side's length.
  let back = 0;
  let forward = 0;
  for (let l = BAND_STEP; l <= BAND_REACH; l += BAND_STEP) {
    const negative = place(-l);
    if (negative) back = Math.max(back, Math.hypot(negative.x - centre.x, negative.y - centre.y));
    const positive = place(l);
    if (positive) forward = Math.max(forward, Math.hypot(positive.x - centre.x, positive.y - centre.y));
  }

  const length = back + forward;
  if (!Number.isFinite(length) || length <= 0) return null;

  return { kind: "galaxy", x: centre.x, y: centre.y, angle: folded, length };
}

/**
 * What, if anything, makes tonight's sky worth more than a star field.
 *
 * Returns the Milky Way band, or one bright planet, or `null`. **Never both.**
 * When both qualify the galaxy wins: it is a whole-sky feature that would wash
 * out a single dot, and for most observers it is the rarer of the two. When
 * several planets qualify, the brightest wins, with the name as a tie-break so
 * the same night always gives the same answer.
 *
 * `horizontal()` returns NaN for malformed input by design, so every path here
 * checks finiteness before anything reaches the returned geometry: a NaN in an
 * SVG coordinate fails silently, with no error and nothing drawn.
 *
 * Note on the galaxy: it is judged on altitude and the evening window only,
 * never on `mag`. The galactic centre's magnitude in the adapter is an invented
 * placeholder - the core is a surface-brightness feature, not a point source -
 * so comparing it to anything would be meaningless.
 */
export function rareNight(
  candidates: RareCandidates,
  observer: Observer,
  date: Date,
  width: number,
  height: number,
): RareNight {
  if (!candidates) return null;
  if (!date || !Number.isFinite(date.getTime())) return null;
  if (!observer || !Number.isFinite(observer.latitude) || !Number.isFinite(observer.longitude)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const centre = candidates.galacticCentre;
  if (
    centre &&
    Number.isFinite(centre.ra) &&
    Number.isFinite(centre.dec) &&
    isEvening(localSolarHour(date, observer))
  ) {
    const { altitude, azimuth } = horizontal(centre, observer, date);
    if (atItsHighest(altitude, centre.dec, observer, GALAXY_MIN_ALTITUDE)) {
      const point = project(altitude, azimuth, width, height);
      // A band that cannot be placed with finite numbers falls through to the
      // planets rather than being returned half-formed.
      if (point) {
        const band = buildBand(point, observer, date, width, height);
        if (band) return band;
      }
    }
  }

  let best: { x: number; y: number; mag: number; colour: string; name: string } | null = null;
  for (const planet of candidates.planets ?? []) {
    if (!planet) continue;
    if (!Number.isFinite(planet.ra) || !Number.isFinite(planet.dec) || !Number.isFinite(planet.mag)) continue;
    if (typeof planet.colour !== "string" || planet.colour.length === 0) continue;
    if (planet.mag > PLANET_MAX_MAGNITUDE) continue;

    const { altitude, azimuth } = horizontal(planet, observer, date);
    if (!atItsHighest(altitude, planet.dec, observer, PLANET_MIN_ALTITUDE)) continue;

    const point = project(altitude, azimuth, width, height);
    if (!point) continue;

    const name = typeof planet.name === "string" ? planet.name : "";
    if (!best || planet.mag < best.mag || (planet.mag === best.mag && name < best.name)) {
      best = { x: point.x, y: point.y, mag: planet.mag, colour: planet.colour, name };
    }
  }

  if (!best) return null;

  const magSpan = PLANET_MAX_MAGNITUDE - PLANET_MAG_BRIGHTEST;
  const faintness = clamp((best.mag - PLANET_MAG_BRIGHTEST) / magSpan, 0, 1);
  const r = PLANET_RADIUS_BRIGHTEST + (PLANET_RADIUS_DIMMEST - PLANET_RADIUS_BRIGHTEST) * faintness;
  if (!Number.isFinite(r) || r <= 0) return null;

  return { kind: "planet", x: best.x, y: best.y, r, colour: best.colour };
}
