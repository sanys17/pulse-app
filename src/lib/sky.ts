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
// Three things have to be true at once, and they pull against each other.
//
// 1. RARITY, NOT VISIBILITY. Plain astronomical visibility fires on most nights
//    from a mid-latitude, which turns the rare night into ordinary scenery. So
//    qualifying is not enough on its own: see (3).
//
// 2. ONE VERDICT PER NIGHT. Whether tonight is rare, and which body it is, are
//    keyed to the local night and never to the instant, because a refresh must
//    not be able to spoil it. Both are decided from night-level facts only:
//    whether the body reaches its highest point *inside* that night's dark
//    window, how high it gets, and when in the window that moment falls. Where
//    the body is drawn does track the instant - see `rareNight`.
//
// 3. AN OCCASION LADDER, NOT A RUN AND NOT A NARROW WINDOW. A body that
//    qualifies at all tends to qualify for weeks, because its culmination
//    creeps earlier through the dark window by one sidereal drift - about four
//    minutes - every night. So the night is rare only when that culmination
//    lands on one rung of a ladder of target times, the rungs spaced a
//    fortnight's worth of drift apart and anchored on the middle of the dark
//    window. A body sweeping the window therefore gets an occasion roughly
//    every fortnight, with one of them exactly on the darkest hour, and an
//    eighty-night apparition collapses to about five occasions.
//
// Why a ladder rather than "the best night of each calendar block": the block
// version had to score every night of the block, and it could only score them
// from the one set of positions the caller handed in. Positions up to a
// fortnight stale then decided which night won, so different nights of the same
// block nominated different winners and a block could go dark with no night
// ever agreeing it was the one. The ladder asks each night only about itself,
// using only its own positions, so there is nothing to disagree about. It also
// drops the arbitrary epoch-anchored block grid: the rungs are anchored to the
// sky - the darkest hour of the night - not to the Unix epoch.
// ---------------------------------------------------------------------------

/** The Milky Way, as a band: anchor position, on-screen orientation and span. */
export type GalaxyBand = { kind: "galaxy"; x: number; y: number; angle: number; length: number };

/** One bright planet, as a dot. */
export type PlanetDot = { kind: "planet"; x: number; y: number; r: number; colour: string };

/**
 * The Milky Way band, or a single bright planet, or nothing. Never both: when
 * both qualify on a night the galaxy wins, because the band is a whole-sky
 * feature that would wash out a single dot.
 *
 * The galaxy is a geometry rather than a flag because the galactic plane's
 * orientation on screen changes with the hour and the observer's latitude:
 * `angle` is degrees clockwise from the panel's +x axis and `length` is the
 * band's on-panel span in pixels, both centred on `x`/`y`.
 */
export type RareNight = GalaxyBand | PlanetDot | null;

/**
 * The dark window, in hours after local solar midnight of the night's evening
 * date: 19:00 to 01:00 the next morning. Local solar time is used rather than
 * the device clock so the same instant means the same thing everywhere. Writing
 * the window as hours past midnight rather than as two clock times keeps it
 * monotone, so there is no midnight wrap to get wrong.
 */
const NIGHT_FROM_HOUR = 19;
const NIGHT_UNTIL_HOUR = 25;
const NIGHT_STEP_MINUTES = 5;

/**
 * How much earlier a fixed star culminates each night: one solar day minus one
 * sidereal day, 3m 55.91s. This is the natural step of the problem - the
 * spacing of the rungs is measured in it, and it is the width of the rung, so
 * a culmination drifting through the window cannot step over one.
 */
const SIDEREAL_DRIFT_MINUTES = 3.93182;

/** Rung spacing, in nights of drift: one occasion per fortnight of a season. */
const OCCASION_SPACING_NIGHTS = 14;

/** The Milky Way must pass high overhead, not skirt the horizon. */
const GALAXY_MIN_ALTITUDE = 72;

/** A planet must be properly overhead, not merely up. */
const PLANET_MIN_ALTITUDE = 45;

/** Brighter than any fixed star by a clear margin (Sirius is -1.46). */
const PLANET_MAX_MAGNITUDE = -2;

/**
 * Half-width, in degrees of galactic longitude, of the bright inner Milky Way.
 * Beyond about 100 degrees from the core the band fades into the anticentre and
 * is not what anyone means by "the Milky Way", so the anchor is never placed
 * there. From 50 N this stretch reaches the zenith near galactic longitude 92
 * (Cygnus), which is exactly the part that is overhead on a summer evening.
 */
const BRIGHT_STRETCH = 100;

/** Galactic-plane sampling: tangent half-span for the angle, step for the span. */
const BAND_TANGENT_SPAN = 4;
const BAND_STEP = 5;

/** Brightest magnitude the planet radius ramp accounts for (Venus at its best). */
const PLANET_MAG_BRIGHTEST = -4.9;
const PLANET_RADIUS_BRIGHTEST = 3.6;
const PLANET_RADIUS_DIMMEST = 2.4;

/** North galactic pole, J2000: RA 12h 51m 26s, Dec +27 07' 42". */
const NGP_RA_HOURS = 192.85948 / 15;
const NGP_DEC_DEGREES = 27.12825;

/** How far off the galactic plane the supplied core may sit, in degrees. */
const CORE_PLANE_TOLERANCE = 1;

const MS_PER_DAY = 86400000;
const MS_PER_MINUTE = 60000;

type Vec3 = readonly [number, number, number];

function unitFromEquatorial(ra: number, dec: number): Vec3 {
  const hourAngle = ra * 15 * DEG;
  const declination = dec * DEG;
  const cosDec = Math.cos(declination);
  return [cosDec * Math.cos(hourAngle), cosDec * Math.sin(hourAngle), Math.sin(declination)];
}

function equatorialFromUnit(v: Vec3): { ra: number; dec: number } {
  const ra = (((Math.atan2(v[1], v[0]) / DEG) / 15) % 24 + 24) % 24;
  return { ra, dec: Math.asin(clamp(v[2], -1, 1)) / DEG };
}

const NGP = unitFromEquatorial(NGP_RA_HOURS, NGP_DEC_DEGREES);

type PlaneBasis = { towardCore: Vec3; towardRising: Vec3 };

/**
 * The galactic plane as two perpendicular directions in the equatorial frame:
 * `towardCore` is galactic longitude 0 and `towardRising` is galactic longitude
 * 90, so a point at longitude `l` is `towardCore * cos(l) + towardRising * sin(l)`.
 *
 * The core comes from the caller, so the plane is pinned to the same point the
 * adapter reports rather than to a second hard-coded copy of it; only the pole
 * is a constant here. `towardRising` is the pole crossed into the core, which is
 * the direction of increasing galactic longitude - from Sagittarius towards
 * Cygnus, not away from it.
 */
function planeBasis(core: SkyBody): PlaneBasis | null {
  const towardCore = unitFromEquatorial(core.ra, core.dec);

  // The core has to lie on the galactic plane, or it does not define it: any
  // other point, crossed with the pole, spans some unrelated great circle that
  // would be drawn as "the Milky Way". Sgr A* is at galactic latitude -0.05
  // degrees, so a degree of slack is generous.
  const offPlane = Math.abs(
    NGP[0] * towardCore[0] + NGP[1] * towardCore[1] + NGP[2] * towardCore[2],
  );
  if (!Number.isFinite(offPlane) || offPlane > Math.sin(CORE_PLANE_TOLERANCE * DEG)) return null;

  const cross: Vec3 = [
    NGP[1] * towardCore[2] - NGP[2] * towardCore[1],
    NGP[2] * towardCore[0] - NGP[0] * towardCore[2],
    NGP[0] * towardCore[1] - NGP[1] * towardCore[0],
  ];
  const norm = Math.hypot(cross[0], cross[1], cross[2]);
  if (!Number.isFinite(norm) || norm < 1e-6) return null;
  const towardRising: Vec3 = [cross[0] / norm, cross[1] / norm, cross[2] / norm];
  for (const n of [...towardCore, ...towardRising]) if (!Number.isFinite(n)) return null;
  return { towardCore, towardRising };
}

/** The point on the galactic plane at galactic longitude `l` degrees. */
function planePoint(basis: PlaneBasis, l: number): SkyBody {
  const c = Math.cos(l * DEG);
  const s = Math.sin(l * DEG);
  const v: Vec3 = [
    basis.towardCore[0] * c + basis.towardRising[0] * s,
    basis.towardCore[1] * c + basis.towardRising[1] * s,
    basis.towardCore[2] * c + basis.towardRising[2] * s,
  ];
  return { ...equatorialFromUnit(v), mag: 0 };
}

/**
 * The highest point of the bright Milky Way at one instant: its altitude and its
 * galactic longitude.
 *
 * Solved rather than searched. For a point at longitude `l`,
 * `sin(altitude) = sin(alt of longitude 0) * cos(l) + sin(alt of longitude 90) * sin(l)`,
 * because altitude is the dot product with the zenith and the plane is spanned
 * by those two directions. That is a single sinusoid in `l`, so its peak is at
 * `l0 = atan2(a90, a0)` with `sin(altitude) = hypot(a0, a90)`, and restricting
 * the search to the bright stretch is a clamp. Two altitude evaluations, exact.
 *
 * Returns `null` if anything is non-finite.
 */
function brightestPlanePoint(
  basis: PlaneBasis,
  observer: Observer,
  date: Date,
): { altitude: number; longitude: number } | null {
  const a0 = horizontal(planePoint(basis, 0), observer, date).altitude;
  const a90 = horizontal(planePoint(basis, 90), observer, date).altitude;
  if (!Number.isFinite(a0) || !Number.isFinite(a90)) return null;

  const s0 = Math.sin(a0 * DEG);
  const s90 = Math.sin(a90 * DEG);
  const amplitude = Math.hypot(s0, s90);
  if (!Number.isFinite(amplitude) || amplitude === 0) return null;

  const peak = Math.atan2(s90, s0) / DEG; // already in (-180, 180]
  const longitude = clamp(peak, -BRIGHT_STRETCH, BRIGHT_STRETCH);
  const altitude = Math.asin(clamp(amplitude * Math.cos((longitude - peak) * DEG), -1, 1)) / DEG;
  if (!Number.isFinite(altitude) || !Number.isFinite(longitude)) return null;

  return { altitude, longitude };
}

/** Milliseconds between UTC and the observer's local solar time. */
function localOffsetMs(observer: Observer): number {
  return (observer.longitude / 15) * 3600000;
}

/**
 * Which local night an instant belongs to, as a day count. Nights run from local
 * solar noon to local solar noon, so 23:00 and 01:00 either side of midnight are
 * the same night - which is the whole point of keying on this rather than on the
 * calendar date.
 */
function nightOf(date: Date, observer: Observer): number {
  const local = date.getTime() + localOffsetMs(observer);
  return Math.floor((local - 12 * 3600000) / MS_PER_DAY);
}

/** UTC milliseconds of local solar `hour` on night `night`. */
function nightInstantMs(night: number, observer: Observer, hour: number): number {
  return night * MS_PER_DAY + hour * 3600000 - localOffsetMs(observer);
}

const NIGHT_SAMPLES = Math.round(((NIGHT_UNTIL_HOUR - NIGHT_FROM_HOUR) * 60) / NIGHT_STEP_MINUTES) + 1;

/**
 * The best moment of one night for whatever `altitudeAt` measures, as how many
 * minutes it falls after the middle of the dark window (negative before).
 *
 * Returns `null` unless the maximum falls strictly inside the window: a body
 * still climbing at 01:00, or already past its best at 19:00, did not have its
 * night. The offset is refined by fitting a parabola to the three samples around
 * the peak, which is what makes consecutive nights distinguishable - they are
 * only one sidereal drift apart.
 */
function bestMomentOfNight(
  night: number,
  observer: Observer,
  altitudeAt: (date: Date) => number,
): { altitude: number; offsetMinutes: number } | null {
  const values: number[] = [];
  let bestIndex = -1;
  let bestValue = -Infinity;

  for (let i = 0; i < NIGHT_SAMPLES; i++) {
    const hour = NIGHT_FROM_HOUR + (i * NIGHT_STEP_MINUTES) / 60;
    const value = altitudeAt(new Date(nightInstantMs(night, observer, hour)));
    values.push(value);
    if (Number.isFinite(value) && value > bestValue) {
      bestValue = value;
      bestIndex = i;
    }
  }

  if (bestIndex <= 0 || bestIndex >= NIGHT_SAMPLES - 1) return null;

  const before = values[bestIndex - 1];
  const after = values[bestIndex + 1];
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;

  const curvature = before - 2 * bestValue + after;
  const shift = curvature < 0 ? clamp((before - after) / (2 * curvature), -1, 1) : 0;
  if (!Number.isFinite(shift)) return null;

  const hour = NIGHT_FROM_HOUR + (bestIndex * NIGHT_STEP_MINUTES) / 60;
  const centreMs = nightInstantMs(night, observer, (NIGHT_FROM_HOUR + NIGHT_UNTIL_HOUR) / 2);
  const peakMs = nightInstantMs(night, observer, hour) + shift * NIGHT_STEP_MINUTES * MS_PER_MINUTE;
  const offsetMinutes = (peakMs - centreMs) / MS_PER_MINUTE;
  if (!Number.isFinite(offsetMinutes)) return null;

  return { altitude: bestValue, offsetMinutes };
}

/**
 * Is this night's culmination on a rung of the occasion ladder?
 *
 * The rungs sit `OCCASION_SPACING_NIGHTS` sidereal drifts apart, centred on the
 * middle of the dark window, and each rung is one sidereal drift wide. A
 * culmination walking earlier by one drift a night therefore lands on a rung
 * exactly once per spacing and cannot step over one. A body with its own motion
 * walks a little slower or faster than that, which can give two consecutive
 * occasions, or - only for something retrograding faster than the sidereal
 * drift, which among the planets means Mars near opposition - skip a rung and
 * wait for the next.
 *
 * This asks nothing about any other night, which is the point: there is no
 * cross-night comparison to be made inconsistent by stale positions.
 */
function isOnLadder(offsetMinutes: number): boolean {
  if (!Number.isFinite(offsetMinutes)) return false;
  const spacing = OCCASION_SPACING_NIGHTS * SIDEREAL_DRIFT_MINUTES;
  const centred = offsetMinutes + SIDEREAL_DRIFT_MINUTES / 2;
  const phase = ((centred % spacing) + spacing) % spacing;
  return phase < SIDEREAL_DRIFT_MINUTES;
}

/** The highest altitude a body at this declination can ever reach from this latitude. */
function culminationAltitude(dec: number, latitude: number): number {
  return 90 - Math.abs(latitude - dec);
}

type NightVerdict =
  | { kind: "galaxy"; offsetMinutes: number }
  | { kind: "planet"; offsetMinutes: number; planet: SkyBody & { colour: string } };

/**
 * What one night offers, before the ladder is applied. The galaxy wins a night
 * it shares with a planet; among planets the brightest wins, with the name as a
 * tie-break so the answer cannot depend on array order.
 */
function nightVerdict(
  candidates: RareCandidates,
  basis: PlaneBasis | null,
  observer: Observer,
  night: number,
): NightVerdict | null {
  if (basis) {
    const best = bestMomentOfNight(night, observer, (date) => {
      const found = brightestPlanePoint(basis, observer, date);
      return found ? found.altitude : NaN;
    });
    if (best && best.altitude >= GALAXY_MIN_ALTITUDE) {
      return { kind: "galaxy", offsetMinutes: best.offsetMinutes };
    }
  }

  let chosen: NightVerdict | null = null;
  let chosenMag = Infinity;
  let chosenName = "";

  for (const planet of candidates.planets ?? []) {
    if (!planet) continue;
    if (!Number.isFinite(planet.ra) || !Number.isFinite(planet.dec) || !Number.isFinite(planet.mag)) continue;
    if (typeof planet.colour !== "string" || planet.colour.length === 0) continue;
    if (planet.mag > PLANET_MAX_MAGNITUDE) continue;
    // Cheap rejection: a body whose culmination altitude cannot clear the floor
    // never will, whatever the hour, so there is nothing to scan.
    if (culminationAltitude(planet.dec, observer.latitude) < PLANET_MIN_ALTITUDE) continue;

    const best = bestMomentOfNight(night, observer, (date) => horizontal(planet, observer, date).altitude);
    if (!best || best.altitude < PLANET_MIN_ALTITUDE) continue;

    const name = typeof planet.name === "string" ? planet.name : "";
    if (chosen && !(planet.mag < chosenMag || (planet.mag === chosenMag && name < chosenName))) continue;

    chosen = { kind: "planet", offsetMinutes: best.offsetMinutes, planet };
    chosenMag = planet.mag;
    chosenName = name;
  }

  return chosen;
}

/**
 * The band's screen geometry at one instant, anchored on the highest point of
 * the bright Milky Way rather than on the core.
 *
 * Anchoring on the best-placed point is what makes this work at any latitude:
 * from the southern hemisphere it picks Sagittarius, and from 50 N it picks the
 * Cygnus-Aquila stretch, which is the part of the Milky Way that is actually
 * overhead on a summer evening. Anchoring on the core instead would be dead
 * code north of about 40 N, where the core never rises clear of the horizon.
 *
 * `angle` is the plane's screen tangent at the anchor, and `length` is the span
 * of the bright stretch measured along that tangent, so the panel's own clipping
 * shortens the band near the horizon.
 */
function buildBand(
  basis: PlaneBasis,
  observer: Observer,
  date: Date,
  width: number,
  height: number,
): GalaxyBand | null {
  const found = brightestPlanePoint(basis, observer, date);
  if (!found) return null;
  const anchorLongitude = found.longitude;

  const place = (l: number): { x: number; y: number } | null => {
    const point = planePoint(basis, l);
    if (!Number.isFinite(point.ra) || !Number.isFinite(point.dec)) return null;
    const { altitude, azimuth } = horizontal(point, observer, date);
    return project(altitude, azimuth, width, height);
  };

  const anchor = place(anchorLongitude);
  if (!anchor) return null;

  const before = place(anchorLongitude - BAND_TANGENT_SPAN);
  const after = place(anchorLongitude + BAND_TANGENT_SPAN);
  if (!before || !after) return null;

  const angle = Math.atan2(after.y - before.y, after.x - before.x) / DEG;
  if (!Number.isFinite(angle)) return null;
  // A band has no head or tail, so fold the direction into (-90, 90].
  const folded = ((((angle + 90) % 180) + 180) % 180) - 90;

  const ux = Math.cos(folded * DEG);
  const uy = Math.sin(folded * DEG);
  let nearest = 0;
  let farthest = 0;
  for (let l = -BRIGHT_STRETCH; l <= BRIGHT_STRETCH; l += BAND_STEP) {
    const point = place(l);
    if (!point) continue;
    const along = (point.x - anchor.x) * ux + (point.y - anchor.y) * uy;
    if (!Number.isFinite(along)) continue;
    nearest = Math.min(nearest, along);
    farthest = Math.max(farthest, along);
  }

  const length = farthest - nearest;
  if (!Number.isFinite(length) || length <= 0) return null;

  return { kind: "galaxy", x: anchor.x, y: anchor.y, angle: folded, length };
}

function buildDot(
  planet: SkyBody & { colour: string },
  observer: Observer,
  date: Date,
  width: number,
  height: number,
): PlanetDot | null {
  const { altitude, azimuth } = horizontal(planet, observer, date);
  const point = project(altitude, azimuth, width, height);
  if (!point) return null;

  const magSpan = PLANET_MAX_MAGNITUDE - PLANET_MAG_BRIGHTEST;
  const faintness = clamp((planet.mag - PLANET_MAG_BRIGHTEST) / magSpan, 0, 1);
  const r = PLANET_RADIUS_BRIGHTEST + (PLANET_RADIUS_DIMMEST - PLANET_RADIUS_BRIGHTEST) * faintness;
  if (!Number.isFinite(r) || r <= 0) return null;

  return { kind: "planet", x: point.x, y: point.y, r, colour: planet.colour };
}

/**
 * What, if anything, makes tonight's sky worth more than a star field.
 *
 * Returns the Milky Way band, or one bright planet, or `null`. **Never both.**
 *
 * The verdict - whether tonight is rare and which body it is - is a property of
 * the local night, not of the moment. Every instant of the same night gets the
 * same answer, so a refresh cannot change or spoil it, and the night runs noon
 * to noon so it does not flip at midnight either.
 *
 * The geometry, on the other hand, is built at the caller's `date`: the band's
 * orientation and the planet's position are where they are *now*, so they move
 * with the star field drawn around them instead of sitting frozen at some other
 * hour's position. One consequence: a body that is below the horizon or off the
 * panel at this instant cannot be drawn, so a rare night returns `null` until it
 * rises. The verdict has not changed; there is simply nothing there yet.
 *
 * `horizontal()` returns NaN for malformed input by design, so every path here
 * checks finiteness before anything reaches the returned geometry: a NaN in an
 * SVG coordinate fails silently, with no error and nothing drawn.
 *
 * The galaxy is judged on altitude and on when it peaks, never on `mag`. The
 * core's magnitude in the adapter is an invented placeholder - the Milky Way is
 * a surface-brightness feature, not a point source - so comparing it to anything
 * would be meaningless.
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

  const core = candidates.galacticCentre;
  const basis =
    core && Number.isFinite(core.ra) && Number.isFinite(core.dec) ? planeBasis(core) : null;

  const tonight = nightOf(date, observer);
  if (!Number.isFinite(tonight)) return null;

  const verdict = nightVerdict(candidates, basis, observer, tonight);
  if (!verdict) return null;
  if (!isOnLadder(verdict.offsetMinutes)) return null;

  if (verdict.kind === "galaxy") {
    return basis ? buildBand(basis, observer, date, width, height) : null;
  }
  return buildDot(verdict.planet, observer, date, width, height);
}
