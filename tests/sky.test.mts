import { test } from "node:test";
import assert from "node:assert/strict";
import { horizontal, project, projectStars, rareNight } from "../src/lib/sky.ts";
import type { RareCandidates, RareNight } from "../src/lib/sky.ts";
import type { Observer } from "../src/lib/observer.ts";

// ---------------------------------------------------------------------------
// FIXTURE PROVENANCE
//
// None of the expected numbers below were produced by src/lib/sky.ts. Each one
// comes from one of four outside sources, named per test. Where no genuinely
// independent fixture could be obtained, the comment says so plainly.
//
// (A) Geometric identities of the celestial sphere. Textbook facts, true for
//     every observer and every instant, so they cannot be satisfied by a
//     self-consistent-but-wrong transform:
//       - Polaris (0.736 deg from the north celestial pole) sits at an
//         altitude equal to the observer's latitude, +/- that 0.736 deg, due
//         north, at all times.
//       - A body's maximum altitude (upper culmination) is 90 - |lat - dec|.
//       - Upper culmination happens due south when dec < lat and due north
//         when dec > lat.
//       - A body is circumpolar (never sets) when dec > 90 - lat, and never
//         rises when dec < -(90 - lat).
//     These pin the sign of the latitude/declination terms, which is the
//     error this task exists to catch.
//
// (B) Published worked example of the equatorial -> horizontal conversion:
//     P. Duffett-Smith, "Practical Astronomy with your Calculator", section on
//     equatorial-to-horizon conversion. Hour angle H = 5h 51m 44s,
//     declination +23 deg 13' 10", latitude +52 deg gives
//     altitude +19 deg 20' 04" and azimuth 283 deg 16' 16" (azimuth from north,
//     eastward). HONESTY NOTE: this example is quoted from memory of the
//     standard literature, not read off a page in this session. It was
//     therefore re-derived here by hand from the spherical-trig identities
//     before being used:
//       sin(alt) = sin(d)sin(p) + cos(d)cos(p)cos(H)
//                = 0.394264*0.788011 + 0.918977*0.615661*0.036070
//                = 0.310686 + 0.020405 = 0.331091  ->  alt = 19.3353 deg
//       az = atan2(cos(d)sin(H), cos(d)cos(H)sin(p) - sin(d)cos(p)) + 180
//          = atan2(0.918379, 0.026120 - 0.242713) + 180
//          = 103.2697 + 180 = 283.2697 deg
//     The hand derivation agrees with the remembered printed figures to under
//     0.002 deg, which is what makes it usable; the tolerance below is 0.05 deg.
//
// (C) Published sidereal-time constant: Greenwich mean sidereal time at
//     2000-01-01 00:00 UT is 6h 39m 52.27s (= 6.6645196 h), the standard
//     almanac value for that epoch. Used only to convert the hour angle of
//     fixture (B) into a right ascension at a real UTC instant:
//     RA = LST - H = 6.6645196 - 5.8622222 = 0.8022974 h at longitude 0.
//     HONESTY NOTE: this constant is the same one that the IAU GMST
//     polynomial is built around, so the sidereal part of that test is a
//     consistency check against a published constant rather than a blind
//     independent measurement. Test (D) exists to cover sidereal time blindly.
//
// (D) Independent sidereal-time anchor from solar-time first principles, using
//     no sidereal constant at all: on the date of the March equinox the Sun's
//     apparent right ascension is 0h, and mean solar time at longitude 0 is
//     UTC, so at 12:00 UTC that day the Sun - and therefore the RA = 0h point -
//     is on the Greenwich meridian to within the equation of time (under 8
//     minutes of time, i.e. under 2 deg, in late March). The March 2026
//     equinox falls on 20 March. This catches a wrong epoch, hours-vs-degrees
//     confusion, and a flipped longitude sign, none of which (A) can see.
//
// NOT INDEPENDENTLY SOURCED, and not claimed to be: the panel projection and
// the magnitude -> radius/opacity mapping. A zenith-centred stereographic
// projection's one externally checkable property is that the zenith lands at
// the centre, which is asserted. Everything else about those two (panel
// orientation, horizon radius, the exact radii and opacities) is this
// feature's own design choice, so the assertions on them are specification
// assertions, not astronomical verification.
// ---------------------------------------------------------------------------

const PRAGUE = { latitude: 50.08, longitude: 14.44 };

// --- (A) identities -------------------------------------------------------

test("Polaris sits at an altitude equal to the observer's latitude", () => {
  const polaris = { ra: 2.53, dec: 89.264, mag: 1.98 };
  const { altitude } = horizontal(polaris, PRAGUE, new Date(Date.UTC(2026, 0, 15, 22, 0)));
  assert.ok(Math.abs(altitude - PRAGUE.latitude) < 1.0, `got ${altitude}`);
});

test("Polaris stays at latitude altitude, due north, at every hour of the day", () => {
  // Source (A): Polaris is 90 - 89.264 = 0.736 deg from the pole, so its
  // altitude never leaves latitude +/- 0.736 deg and its azimuth never leaves
  // due north by more than about 0.736 / cos(latitude) = 1.15 deg.
  const polaris = { ra: 2.53, dec: 89.264, mag: 1.98 };
  for (let hour = 0; hour < 24; hour++) {
    const { altitude, azimuth } = horizontal(polaris, PRAGUE, new Date(Date.UTC(2026, 0, 15, hour, 0)));
    assert.ok(Math.abs(altitude - PRAGUE.latitude) < 0.8, `hour ${hour}: altitude ${altitude}`);
    const offNorth = Math.min(Math.abs(azimuth), Math.abs(azimuth - 360));
    assert.ok(offNorth < 1.5, `hour ${hour}: azimuth ${azimuth}`);
  }
});

test("a star below the horizon reports negative altitude", () => {
  const southern = { ra: 6.752, dec: -60, mag: 2 };
  const { altitude } = horizontal(southern, PRAGUE, new Date(Date.UTC(2026, 5, 1, 12, 0)));
  assert.ok(altitude < 0, `got ${altitude}`);
});

test("a star south of the never-rises limit stays below the horizon all day", () => {
  // Source (A): dec < -(90 - latitude) = -39.92 deg from Prague never rises.
  const southern = { ra: 6.752, dec: -60, mag: 2 };
  for (let minute = 0; minute < 24 * 60; minute += 7) {
    const { altitude } = horizontal(southern, PRAGUE, new Date(Date.UTC(2026, 5, 1, 0, minute)));
    assert.ok(altitude < 0, `minute ${minute}: altitude ${altitude}`);
  }
});

test("upper culmination altitude is 90 - |latitude - dec| and happens on the right side of the zenith", () => {
  // Source (A). Sampled over a full day; the sampling step is fine enough that
  // the peak is found to well inside the tolerance.
  const cases = [
    { body: { ra: 6.752, dec: -16.716, mag: -1.46 }, label: "Sirius (dec below latitude: culminates due south)", south: true },
    { body: { ra: 18.616, dec: 38.784, mag: 0.03 }, label: "Vega (dec below latitude: culminates due south)", south: true },
    { body: { ra: 11.0, dec: 61.75, mag: 2 }, label: "circumpolar body (dec above latitude: culminates due north)", south: false },
  ];
  for (const { body, label, south } of cases) {
    const expected = 90 - Math.abs(PRAGUE.latitude - body.dec);
    let peak = -Infinity;
    let peakAzimuth = NaN;
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const { altitude, azimuth } = horizontal(body, PRAGUE, new Date(Date.UTC(2026, 2, 1, 0, minute)));
      if (altitude > peak) {
        peak = altitude;
        peakAzimuth = azimuth;
      }
    }
    assert.ok(Math.abs(peak - expected) < 0.05, `${label}: peak ${peak}, expected ${expected}`);
    const offMeridian = south
      ? Math.abs(peakAzimuth - 180)
      : Math.min(Math.abs(peakAzimuth), Math.abs(peakAzimuth - 360));
    assert.ok(offMeridian < 1.0, `${label}: culminated at azimuth ${peakAzimuth}`);
  }
});

test("a circumpolar star never sets and its minimum altitude is latitude + dec - 90", () => {
  // Source (A): dec > 90 - latitude = 39.92 deg from Prague is circumpolar,
  // with lower culmination at latitude + dec - 90.
  const body = { ra: 11.0, dec: 61.75, mag: 2 };
  const expectedMin = PRAGUE.latitude + body.dec - 90;
  let lowest = Infinity;
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const { altitude } = horizontal(body, PRAGUE, new Date(Date.UTC(2026, 2, 1, 0, minute)));
    lowest = Math.min(lowest, altitude);
  }
  assert.ok(lowest > 0, `a circumpolar star dipped below the horizon: ${lowest}`);
  assert.ok(Math.abs(lowest - expectedMin) < 0.05, `lowest ${lowest}, expected ${expectedMin}`);
});

// --- (B) + (C) published worked example -----------------------------------

test("matches the published equatorial-to-horizontal worked example", () => {
  // Source (B) for the expected altitude and azimuth, source (C) for the
  // right ascension that puts the example's hour angle on the sky at a real
  // UTC instant. Expected values are the printed figures:
  //   altitude 19 deg 20' 04" = 19.33444 deg
  //   azimuth 283 deg 16' 16" = 283.27111 deg
  const instant = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
  const observer = { latitude: 52, longitude: 0 };
  const body = { ra: 0.8022974, dec: 23 + 13 / 60 + 10 / 3600, mag: 2 };
  const { altitude, azimuth } = horizontal(body, observer, instant);
  assert.ok(Math.abs(altitude - 19.33444) < 0.05, `altitude ${altitude}, expected 19.33444`);
  assert.ok(Math.abs(azimuth - 283.27111) < 0.05, `azimuth ${azimuth}, expected 283.27111`);
});

// --- (D) independent sidereal-time anchor ---------------------------------

test("at noon UTC on the March equinox the RA 0h point is on the Greenwich meridian", () => {
  // Source (D). No sidereal constant used: the expectation comes from the
  // Sun's RA being 0h at the equinox and mean solar noon at longitude 0 being
  // 12:00 UTC. Tolerances allow the full equation of time (under 2 deg).
  const equinoxNoon = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
  const vernalPoint = { ra: 0, dec: 0, mag: 2 };
  const { altitude, azimuth } = horizontal(vernalPoint, { latitude: 45, longitude: 0 }, equinoxNoon);
  // Due south at upper culmination because dec (0) < latitude (45), at an
  // altitude of 90 - |45 - 0| = 45 deg (source A).
  assert.ok(Math.abs(altitude - 45) < 2, `altitude ${altitude}, expected about 45`);
  assert.ok(Math.abs(azimuth - 180) < 6, `azimuth ${azimuth}, expected about 180`);
});

test("longitude runs east-positive and azimuth runs 0 = north, 90 = east", () => {
  // Source (D) again. At that same instant the RA 0h point is on the Greenwich
  // meridian, so an observer 15 deg WEST of Greenwich must still see it rising
  // in the east, and an observer 15 deg EAST must already see it in the west.
  // A flipped longitude sign or a south-based azimuth swaps these.
  const equinoxNoon = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
  const vernalPoint = { ra: 0, dec: 0, mag: 2 };
  const west = horizontal(vernalPoint, { latitude: 10, longitude: -15 }, equinoxNoon);
  const east = horizontal(vernalPoint, { latitude: 10, longitude: 15 }, equinoxNoon);
  assert.ok(west.azimuth > 5 && west.azimuth < 175, `west of Greenwich should see it east: ${west.azimuth}`);
  assert.ok(east.azimuth > 185 && east.azimuth < 355, `east of Greenwich should see it west: ${east.azimuth}`);
});

// --- projection and magnitude mapping (specification assertions) ----------

test("project returns null below the horizon and finite coordinates above it", () => {
  assert.equal(project(-5, 180, 430, 520), null);
  const p = project(80, 180, 430, 520);
  assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y));
});

test("the zenith projects to the centre of the panel", () => {
  const p = project(90, 0, 430, 520);
  assert.ok(p);
  assert.ok(Math.abs(p.x - 215) < 1 && Math.abs(p.y - 260) < 1);
});

test("project is monotonic in altitude: lower stars land further from the centre", () => {
  // Specification assertion, not an external fixture: a zenith-centred
  // projection must push a lower star further out along the same bearing.
  let previous = -1;
  for (const altitude of [89, 70, 50, 30, 15, 5]) {
    const p = project(altitude, 180, 430, 520);
    assert.ok(p, `altitude ${altitude} should project`);
    const distance = Math.hypot(p.x - 215, p.y - 260);
    assert.ok(distance > previous, `altitude ${altitude} landed at ${distance}, not beyond ${previous}`);
    previous = distance;
  }
});

test("project rejects non-finite inputs", () => {
  assert.equal(project(NaN, 180, 430, 520), null);
  assert.equal(project(45, NaN, 430, 520), null);
  assert.equal(project(45, 180, NaN, 520), null);
  assert.equal(project(45, 180, 430, NaN), null);
  assert.equal(project(Infinity, 180, 430, 520), null);
});

test("no projected star ever carries a non-finite coordinate", () => {
  const stars = [
    { ra: 0, dec: 90, mag: 2 },
    { ra: 12, dec: -90, mag: 2 },
    { ra: 23.999, dec: 0, mag: 4 },
  ];
  for (const out of projectStars(stars, PRAGUE, new Date(Date.UTC(2026, 3, 9, 21, 0)), 430, 520)) {
    assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y));
    assert.ok(Number.isFinite(out.r) && out.r > 0);
    assert.ok(out.opacity > 0 && out.opacity <= 1);
  }
});

test("extreme latitudes and an invalid date never produce NaN or throw", () => {
  const poles = [{ latitude: 89.9, longitude: 0 }, { latitude: -89.9, longitude: 0 }];
  for (const observer of poles) {
    const out = projectStars([{ ra: 6, dec: 45, mag: 2 }], observer, new Date(Date.UTC(2026, 6, 1, 0, 0)), 430, 520);
    for (const s of out) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
  }
  const fromBadDate = projectStars([{ ra: 6, dec: 45, mag: 2 }], PRAGUE, new Date(NaN), 430, 520);
  assert.deepEqual(fromBadDate, [], "an invalid date yields no stars rather than NaN coordinates");
});

test("the non-finite guard drops bad stars, observers and panels rather than emitting NaN", () => {
  // The guard this exercises is the one that keeps cx="NaN" out of the SVG,
  // where it fails silently.
  const good = { ra: 6, dec: 50, mag: 1 };
  const instant = new Date(Date.UTC(2026, 0, 15, 22, 0));
  const bad = [
    { ra: NaN, dec: 50, mag: 1 },
    { ra: 6, dec: NaN, mag: 1 },
    { ra: 6, dec: 50, mag: NaN },
    { ra: Infinity, dec: 50, mag: 1 },
  ];
  const mixed = projectStars([good, ...bad], PRAGUE, instant, 430, 520);
  assert.equal(mixed.length, 1, "only the finite star should survive");
  for (const s of mixed) {
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.r) && Number.isFinite(s.opacity));
  }
  assert.deepEqual(projectStars([good], { latitude: NaN, longitude: 0 }, instant, 430, 520), []);
  assert.deepEqual(projectStars([good], { latitude: 50, longitude: NaN }, instant, 430, 520), []);
  assert.deepEqual(projectStars([good], PRAGUE, instant, NaN, 520), []);
  assert.deepEqual(projectStars([good], PRAGUE, instant, 430, 0), []);
  assert.deepEqual(projectStars([], PRAGUE, instant, 430, 520), []);
});

test("every projected star lands inside the panel", () => {
  // Specification assertion: project clips off-panel points, so a full
  // catalogue-sized sweep must never emit anything outside the box.
  const stars = [];
  for (let ra = 0; ra < 24; ra += 0.5) {
    for (let dec = -85; dec <= 85; dec += 5) stars.push({ ra, dec, mag: 3 });
  }
  for (const hour of [0, 4, 8, 12, 16, 20]) {
    const out = projectStars(stars, PRAGUE, new Date(Date.UTC(2026, 7, 11, hour, 0)), 430, 520);
    assert.ok(out.length > 0, `hour ${hour} produced nothing at all`);
    for (const s of out) {
      assert.ok(s.x >= 0 && s.x <= 430, `x ${s.x} outside the panel`);
      assert.ok(s.y >= 0 && s.y <= 520, `y ${s.y} outside the panel`);
    }
  }
});

test("brighter stars are larger and more opaque than dimmer ones", () => {
  const [bright, dim] = projectStars(
    [{ ra: 6, dec: 50, mag: 0 }, { ra: 6.01, dec: 50, mag: 4.4 }],
    PRAGUE, new Date(Date.UTC(2026, 0, 15, 22, 0)), 430, 520,
  );
  assert.ok(bright.r > dim.r && bright.opacity > dim.opacity);
});

test("magnitude mapping is monotonic and stays in range across the catalogue's span", () => {
  // Specification assertion. Catalogue magnitudes run from -1.46 to 4.5.
  const mags = [-1.46, -0.7, 0, 1, 2, 3, 4, 4.5];
  const out = projectStars(
    mags.map((mag, i) => ({ ra: 6 + i * 0.002, dec: 50, mag })),
    PRAGUE, new Date(Date.UTC(2026, 0, 15, 22, 0)), 430, 520,
  );
  assert.equal(out.length, mags.length, "all of these should be above the horizon");
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].r < out[i - 1].r, `radius not decreasing at index ${i}`);
    assert.ok(out[i].opacity < out[i - 1].opacity, `opacity not decreasing at index ${i}`);
  }
  for (const s of out) {
    assert.ok(s.r > 0 && s.r < 10, `radius ${s.r} out of range`);
    assert.ok(s.opacity > 0 && s.opacity <= 1, `opacity ${s.opacity} out of range`);
  }
});

test("projectStars preserves input order for the stars it keeps", () => {
  const instant = new Date(Date.UTC(2026, 0, 15, 22, 0));
  const stars = [
    { ra: 6, dec: 50, mag: 1 },
    { ra: 12, dec: -90, mag: 1 }, // never rises from Prague, dropped
    { ra: 6.02, dec: 50, mag: 4 },
  ];
  const out = projectStars(stars, PRAGUE, instant, 430, 520);
  assert.equal(out.length, 2);
  assert.ok(out[0].r > out[1].r, "the first kept star is the bright one");
});

// ===========================================================================
// THE RARE NIGHT
//
// FIXTURE PROVENANCE (E): every planet position below was GENERATED, not
// invented. On 2026-10-15 a throwaway script called `rareCandidates(date,
// PRAGUE)` from src/lib/skyBodies.ts - the impure astronomy-engine adapter -
// and printed the resulting [ra (hours), dec (degrees), mag] triples in the
// adapter's own planet order (Venus, Mars, Jupiter, Saturn). The script was
// then deleted. The numbers are inlined here as plain data so this test file
// stays a pure module: importing skyBodies.ts, and through it
// astronomy-engine, breaks `npm test`, which runs node's type-stripping
// loader over tests/*.test.mts.
//
// Two fixtures are generated that way:
//
//   YEAR_FIXTURE_PLANETS   one snapshot per night for 365 nights, taken at
//                          Date.UTC(2026, 0, 1 + day, 21, 0), used for the
//                          per-night count across a simulated year.
//
//   HOURLY_FIXTURE         nine snapshots spread across each of three whole
//                          nights, taken at local solar hours 13, 15, 17, 19,
//                          21, 23, 25, 27 and 33 (i.e. from the afternoon
//                          before to the morning after). These exist to test
//                          night-stability honestly: the positions genuinely
//                          differ from one instant to the next, exactly as
//                          they would if the app recomputed them on every
//                          open, so a verdict that depended on the clock
//                          could not survive them.
//
// Consequence worth stating: this is a 2026-specific fixture. It pins the
// behaviour of a real sky, not a synthetic one, but the counts below are the
// counts for 2026 from Prague. A different year gives different numbers
// inside the same band.
// ===========================================================================

const PLANET_NAMES = ["Venus", "Mars", "Jupiter", "Saturn"] as const;
const PLANET_COLOURS = ["#F4E3B1", "#E0805A", "#F2E6CF", "#E6D3A3"] as const;

/** Galactic centre (Sgr A*), J2000. Fixed point; `mag` is the adapter's placeholder. */
const GALACTIC_CENTRE = { ra: 17.761, dec: -28.94, mag: 2 };

/** Milliseconds between UTC and Prague's local solar time. */
const PRAGUE_OFFSET_MS = (14.44 / 15) * 3600000;

/** The instant at local solar `hour` on the night that begins on `dayUTC`. */
function pragueInstant(dayUTC: number, hour: number): Date {
  return new Date(dayUTC + hour * 3600000 - PRAGUE_OFFSET_MS);
}

/** Local solar hours spanning one whole night, dusk to dawn. */
const DARK_HOURS = [19, 20, 21, 22, 23, 24, 25] as const;

type Triple = readonly [number, number, number];

function candidatesFrom(row: readonly Triple[]): RareCandidates {
  return {
    galacticCentre: { ...GALACTIC_CENTRE },
    planets: row.map(([ra, dec, mag], i) => ({
      ra, dec, mag, name: PLANET_NAMES[i], colour: PLANET_COLOURS[i],
    })),
  };
}

/**
 * A point that is nowhere near the galactic plane, used to switch the galaxy
 * half off in tests about the planet half. `rareNight` rejects it because a
 * core off the plane cannot define the plane.
 */
const OFF_PLANE_CORE = { ra: 0, dec: 89, mag: 2 };

const YEAR_FIXTURE_START = Date.UTC(2026, 0, 1, 21, 0);

/** [ra, dec, mag] per planet, one row per night. See fixture provenance (E). */
const YEAR_FIXTURE_PLANETS: readonly (readonly Triple[])[] = [
  [[18.7240,-23.600,-3.98],[18.9475,-23.694,1.19],[7.5075,22.053,-2.67],[23.8060,-3.719,1.04]],
  [[18.8155,-23.537,-3.98],[19.0031,-23.623,1.18],[7.4982,22.075,-2.67],[23.8096,-3.692,1.04]],
  [[18.9068,-23.461,-3.98],[19.0587,-23.548,1.18],[7.4888,22.098,-2.67],[23.8133,-3.665,1.04]],
  [[18.9980,-23.374,-3.98],[19.1142,-23.468,1.17],[7.4793,22.120,-2.67],[23.8171,-3.637,1.04]],
  [[19.0891,-23.274,-3.98],[19.1698,-23.384,1.17],[7.4698,22.143,-2.68],[23.8210,-3.608,1.04]],
  [[19.1800,-23.162,-3.98],[19.2253,-23.295,1.16],[7.4603,22.165,-2.68],[23.8250,-3.579,1.04]],
  [[19.2707,-23.038,-3.98],[19.2808,-23.202,1.16],[7.4507,22.187,-2.68],[23.8290,-3.549,1.04]],
  [[19.3613,-22.903,-3.98],[19.3362,-23.105,1.16],[7.4412,22.209,-2.68],[23.8332,-3.519,1.04]],
  [[19.4517,-22.756,-3.98],[19.3917,-23.003,1.16],[7.4316,22.231,-2.68],[23.8375,-3.488,1.04]],
  [[19.5419,-22.597,-3.97],[19.4470,-22.897,1.15],[7.4220,22.253,-2.68],[23.8418,-3.457,1.04]],
  [[19.6318,-22.427,-3.97],[19.5024,-22.786,1.15],[7.4124,22.275,-2.68],[23.8462,-3.425,1.04]],
  [[19.7215,-22.245,-3.97],[19.5577,-22.672,1.15],[7.4028,22.296,-2.68],[23.8507,-3.392,1.04]],
  [[19.8110,-22.052,-3.97],[19.6129,-22.553,1.15],[7.3932,22.318,-2.67],[23.8553,-3.359,1.04]],
  [[19.9002,-21.848,-3.96],[19.6681,-22.429,1.15],[7.3837,22.339,-2.67],[23.8600,-3.326,1.04]],
  [[19.9892,-21.633,-3.96],[19.7232,-22.302,1.15],[7.3742,22.360,-2.67],[23.8647,-3.292,1.04]],
  [[20.0778,-21.407,-3.96],[19.7783,-22.170,1.15],[7.3647,22.380,-2.67],[23.8696,-3.257,1.04]],
  [[20.1662,-21.170,-3.95],[19.8333,-22.034,1.15],[7.3552,22.401,-2.67],[23.8745,-3.222,1.04]],
  [[20.2542,-20.923,-3.95],[19.8882,-21.894,1.15],[7.3458,22.421,-2.66],[23.8795,-3.187,1.04]],
  [[20.3420,-20.666,-3.95],[19.9431,-21.750,1.15],[7.3365,22.441,-2.66],[23.8846,-3.151,1.04]],
  [[20.4294,-20.398,-3.95],[19.9979,-21.602,1.15],[7.3273,22.461,-2.66],[23.8897,-3.115,1.04]],
  [[20.5165,-20.120,-3.94],[20.0526,-21.450,1.15],[7.3181,22.480,-2.65],[23.8950,-3.078,1.04]],
  [[20.6033,-19.833,-3.94],[20.1072,-21.294,1.15],[7.3090,22.499,-2.65],[23.9003,-3.041,1.04]],
  [[20.6898,-19.536,-3.94],[20.1617,-21.134,1.15],[7.3000,22.518,-2.65],[23.9057,-3.003,1.03]],
  [[20.7758,-19.229,-3.93],[20.2162,-20.970,1.15],[7.2911,22.536,-2.64],[23.9111,-2.965,1.03]],
  [[20.8616,-18.913,-3.93],[20.2705,-20.802,1.15],[7.2823,22.555,-2.64],[23.9166,-2.926,1.03]],
  [[20.9470,-18.588,-3.93],[20.3248,-20.630,1.15],[7.2736,22.572,-2.64],[23.9222,-2.887,1.03]],
  [[21.0320,-18.254,-3.93],[20.3789,-20.454,1.15],[7.2650,22.590,-2.63],[23.9279,-2.848,1.03]],
  [[21.1167,-17.912,-3.92],[20.4330,-20.275,1.15],[7.2565,22.607,-2.63],[23.9336,-2.808,1.02]],
  [[21.2011,-17.561,-3.92],[20.4870,-20.092,1.16],[7.2482,22.624,-2.62],[23.9394,-2.768,1.02]],
  [[21.2851,-17.202,-3.92],[20.5408,-19.905,1.16],[7.2400,22.640,-2.62],[23.9453,-2.727,1.02]],
  [[21.3687,-16.835,-3.92],[20.5946,-19.714,1.16],[7.2319,22.656,-2.61],[23.9512,-2.687,1.02]],
  [[21.4520,-16.460,-3.91],[20.6483,-19.520,1.16],[7.2240,22.672,-2.61],[23.9572,-2.645,1.02]],
  [[21.5349,-16.077,-3.91],[20.7018,-19.323,1.16],[7.2162,22.687,-2.61],[23.9632,-2.604,1.01]],
  [[21.6175,-15.687,-3.91],[20.7553,-19.122,1.16],[7.2086,22.702,-2.60],[23.9694,-2.562,1.01]],
  [[21.6998,-15.290,-3.91],[20.8086,-18.917,1.16],[7.2011,22.716,-2.60],[23.9755,-2.519,1.01]],
  [[21.7817,-14.886,-3.91],[20.8619,-18.709,1.16],[7.1938,22.731,-2.59],[23.9818,-2.477,1.00]],
  [[21.8633,-14.475,-3.90],[20.9150,-18.498,1.16],[7.1867,22.744,-2.58],[23.9880,-2.434,1.00]],
  [[21.9446,-14.057,-3.90],[20.9680,-18.283,1.16],[7.1797,22.758,-2.58],[23.9944,-2.391,1.00]],
  [[22.0255,-13.633,-3.90],[21.0209,-18.065,1.16],[7.1730,22.771,-2.57],[0.0008,-2.347,1.00]],
  [[22.1062,-13.203,-3.90],[21.0737,-17.844,1.16],[7.1664,22.783,-2.57],[0.0072,-2.303,0.99]],
  [[22.1865,-12.767,-3.90],[21.1264,-17.620,1.16],[7.1599,22.795,-2.56],[0.0137,-2.259,0.99]],
  [[22.2665,-12.325,-3.89],[21.1790,-17.392,1.16],[7.1537,22.807,-2.56],[0.0203,-2.214,0.99]],
  [[22.3462,-11.878,-3.89],[21.2315,-17.162,1.16],[7.1477,22.818,-2.55],[0.0269,-2.170,0.98]],
  [[22.4257,-11.425,-3.89],[21.2838,-16.928,1.16],[7.1419,22.829,-2.55],[0.0335,-2.125,0.98]],
  [[22.5048,-10.968,-3.89],[21.3361,-16.691,1.16],[7.1362,22.840,-2.54],[0.0402,-2.079,0.97]],
  [[22.5837,-10.505,-3.89],[21.3882,-16.452,1.16],[7.1308,22.850,-2.53],[0.0470,-2.034,0.97]],
  [[22.6623,-10.038,-3.88],[21.4402,-16.209,1.16],[7.1256,22.860,-2.53],[0.0538,-1.988,0.97]],
  [[22.7407,-9.567,-3.88],[21.4921,-15.964,1.16],[7.1206,22.869,-2.52],[0.0606,-1.942,0.96]],
  [[22.8188,-9.091,-3.88],[21.5439,-15.716,1.16],[7.1158,22.878,-2.51],[0.0675,-1.896,0.96]],
  [[22.8967,-8.611,-3.88],[21.5955,-15.466,1.16],[7.1112,22.887,-2.51],[0.0744,-1.849,0.95]],
  [[22.9743,-8.128,-3.88],[21.6471,-15.212,1.16],[7.1069,22.895,-2.50],[0.0814,-1.803,0.95]],
  [[23.0518,-7.641,-3.88],[21.6985,-14.957,1.17],[7.1028,22.903,-2.49],[0.0884,-1.756,0.95]],
  [[23.1290,-7.151,-3.88],[21.7498,-14.698,1.17],[7.0989,22.910,-2.49],[0.0954,-1.709,0.94]],
  [[23.2060,-6.657,-3.87],[21.8010,-14.438,1.17],[7.0952,22.917,-2.48],[0.1025,-1.661,0.94]],
  [[23.2828,-6.161,-3.87],[21.8521,-14.174,1.17],[7.0918,22.924,-2.47],[0.1096,-1.614,0.93]],
  [[23.3595,-5.662,-3.87],[21.9030,-13.909,1.17],[7.0886,22.930,-2.47],[0.1168,-1.566,0.93]],
  [[23.4360,-5.161,-3.87],[21.9539,-13.641,1.17],[7.0856,22.936,-2.46],[0.1240,-1.519,0.92]],
  [[23.5123,-4.657,-3.87],[22.0046,-13.371,1.17],[7.0828,22.941,-2.45],[0.1312,-1.471,0.92]],
  [[23.5885,-4.151,-3.87],[22.0552,-13.098,1.17],[7.0803,22.946,-2.45],[0.1384,-1.423,0.91]],
  [[23.6645,-3.644,-3.87],[22.1058,-12.824,1.17],[7.0780,22.951,-2.44],[0.1457,-1.375,0.91]],
  [[23.7404,-3.134,-3.87],[22.1562,-12.547,1.17],[7.0760,22.955,-2.43],[0.1530,-1.326,0.90]],
  [[23.8163,-2.623,-3.86],[22.2065,-12.269,1.17],[7.0741,22.959,-2.43],[0.1603,-1.278,0.90]],
  [[23.8920,-2.111,-3.86],[22.2567,-11.988,1.17],[7.0726,22.962,-2.42],[0.1677,-1.229,0.89]],
  [[23.9676,-1.598,-3.86],[22.3068,-11.706,1.17],[7.0712,22.965,-2.41],[0.1751,-1.181,0.89]],
  [[0.0432,-1.085,-3.86],[22.3567,-11.422,1.17],[7.0701,22.968,-2.40],[0.1825,-1.132,0.88]],
  [[0.1187,-0.570,-3.86],[22.4066,-11.136,1.17],[7.0692,22.970,-2.40],[0.1899,-1.083,0.88]],
  [[0.1941,-0.055,-3.86],[22.4564,-10.848,1.17],[7.0686,22.972,-2.39],[0.1973,-1.034,0.87]],
  [[0.2695,0.460,-3.86],[22.5061,-10.558,1.18],[7.0681,22.974,-2.38],[0.2048,-0.985,0.87]],
  [[0.3449,0.975,-3.86],[22.5557,-10.267,1.18],[7.0680,22.975,-2.38],[0.2123,-0.936,0.86]],
  [[0.4203,1.491,-3.86],[22.6052,-9.974,1.18],[7.0680,22.976,-2.37],[0.2198,-0.887,0.85]],
  [[0.4957,2.005,-3.86],[22.6546,-9.680,1.18],[7.0683,22.976,-2.36],[0.2273,-0.838,0.85]],
  [[0.5711,2.519,-3.86],[22.7039,-9.384,1.18],[7.0688,22.976,-2.35],[0.2349,-0.789,0.84]],
  [[0.6465,3.033,-3.86],[22.7532,-9.087,1.18],[7.0696,22.976,-2.35],[0.2424,-0.739,0.84]],
  [[0.7219,3.545,-3.86],[22.8023,-8.788,1.18],[7.0706,22.975,-2.34],[0.2500,-0.690,0.83]],
  [[0.7974,4.056,-3.86],[22.8513,-8.489,1.18],[7.0718,22.974,-2.33],[0.2576,-0.641,0.83]],
  [[0.8730,4.566,-3.85],[22.9003,-8.188,1.18],[7.0733,22.973,-2.32],[0.2652,-0.591,0.82]],
  [[0.9486,5.074,-3.85],[22.9492,-7.885,1.18],[7.0750,22.971,-2.32],[0.2728,-0.542,0.81]],
  [[1.0243,5.581,-3.85],[22.9980,-7.582,1.18],[7.0769,22.969,-2.31],[0.2804,-0.493,0.81]],
  [[1.1001,6.085,-3.85],[23.0467,-7.278,1.18],[7.0790,22.967,-2.30],[0.2880,-0.443,0.80]],
  [[1.1760,6.587,-3.85],[23.0953,-6.972,1.18],[7.0814,22.964,-2.29],[0.2957,-0.394,0.80]],
  [[1.2520,7.087,-3.85],[23.1439,-6.666,1.19],[7.0840,22.961,-2.29],[0.3033,-0.345,0.79]],
  [[1.3281,7.584,-3.85],[23.1924,-6.359,1.19],[7.0868,22.957,-2.28],[0.3110,-0.295,0.79]],
  [[1.4044,8.078,-3.85],[23.2408,-6.051,1.19],[7.0899,22.953,-2.27],[0.3186,-0.246,0.78]],
  [[1.4808,8.569,-3.85],[23.2891,-5.742,1.19],[7.0932,22.949,-2.27],[0.3262,-0.197,0.78]],
  [[1.5574,9.057,-3.85],[23.3374,-5.433,1.19],[7.0967,22.944,-2.26],[0.3339,-0.148,0.78]],
  [[1.6341,9.541,-3.85],[23.3856,-5.122,1.19],[7.1004,22.939,-2.25],[0.3415,-0.099,0.78]],
  [[1.7109,10.022,-3.85],[23.4337,-4.812,1.19],[7.1043,22.933,-2.24],[0.3492,-0.050,0.78]],
  [[1.7880,10.499,-3.85],[23.4817,-4.500,1.19],[7.1084,22.928,-2.24],[0.3568,-0.001,0.78]],
  [[1.8653,10.972,-3.85],[23.5297,-4.189,1.19],[7.1128,22.921,-2.23],[0.3644,0.047,0.78]],
  [[1.9427,11.440,-3.85],[23.5777,-3.876,1.19],[7.1173,22.915,-2.22],[0.3721,0.096,0.78]],
  [[2.0204,11.904,-3.85],[23.6256,-3.564,1.20],[7.1221,22.908,-2.22],[0.3797,0.145,0.78]],
  [[2.0983,12.363,-3.85],[23.6734,-3.251,1.20],[7.1271,22.901,-2.21],[0.3873,0.193,0.78]],
  [[2.1764,12.817,-3.85],[23.7212,-2.938,1.20],[7.1323,22.893,-2.20],[0.3949,0.241,0.79]],
  [[2.2547,13.267,-3.85],[23.7689,-2.624,1.20],[7.1376,22.885,-2.19],[0.4025,0.290,0.79]],
  [[2.3333,13.710,-3.85],[23.8166,-2.310,1.20],[7.1432,22.876,-2.19],[0.4101,0.338,0.79]],
  [[2.4121,14.149,-3.85],[23.8643,-1.997,1.20],[7.1490,22.868,-2.18],[0.4177,0.386,0.79]],
  [[2.4912,14.581,-3.85],[23.9119,-1.683,1.20],[7.1549,22.859,-2.17],[0.4253,0.433,0.79]],
  [[2.5706,15.008,-3.86],[23.9594,-1.369,1.20],[7.1611,22.849,-2.17],[0.4328,0.481,0.79]],
  [[2.6502,15.428,-3.86],[0.0069,-1.055,1.20],[7.1675,22.839,-2.16],[0.4404,0.529,0.79]],
  [[2.7301,15.843,-3.86],[0.0544,-0.741,1.21],[7.1740,22.829,-2.15],[0.4479,0.576,0.79]],
  [[2.8103,16.250,-3.86],[0.1019,-0.427,1.21],[7.1807,22.818,-2.15],[0.4554,0.623,0.79]],
  [[2.8908,16.651,-3.86],[0.1493,-0.114,1.21],[7.1877,22.807,-2.14],[0.4629,0.670,0.79]],
  [[2.9715,17.045,-3.86],[0.1967,0.200,1.21],[7.1948,22.796,-2.13],[0.4704,0.717,0.79]],
  [[3.0526,17.432,-3.86],[0.2441,0.513,1.21],[7.2020,22.784,-2.13],[0.4779,0.763,0.79]],
  [[3.1339,17.811,-3.86],[0.2915,0.825,1.21],[7.2095,22.772,-2.12],[0.4853,0.810,0.79]],
  [[3.2156,18.183,-3.86],[0.3388,1.137,1.21],[7.2172,22.759,-2.11],[0.4927,0.856,0.80]],
  [[3.2975,18.547,-3.86],[0.3861,1.449,1.21],[7.2250,22.746,-2.11],[0.5001,0.902,0.80]],
  [[3.3797,18.903,-3.86],[0.4334,1.761,1.21],[7.2330,22.733,-2.10],[0.5075,0.948,0.80]],
  [[3.4623,19.250,-3.86],[0.4806,2.071,1.22],[7.2411,22.719,-2.09],[0.5148,0.993,0.80]],
  [[3.5451,19.590,-3.86],[0.5279,2.381,1.22],[7.2495,22.705,-2.09],[0.5221,1.039,0.80]],
  [[3.6282,19.921,-3.87],[0.5751,2.691,1.22],[7.2580,22.690,-2.08],[0.5294,1.084,0.80]],
  [[3.7116,20.243,-3.87],[0.6223,2.999,1.22],[7.2666,22.675,-2.08],[0.5367,1.128,0.80]],
  [[3.7953,20.556,-3.87],[0.6695,3.307,1.22],[7.2754,22.660,-2.07],[0.5439,1.173,0.80]],
  [[3.8793,20.860,-3.87],[0.7167,3.615,1.22],[7.2844,22.644,-2.06],[0.5511,1.217,0.80]],
  [[3.9635,21.154,-3.87],[0.7639,3.921,1.22],[7.2936,22.628,-2.06],[0.5582,1.261,0.80]],
  [[4.0480,21.440,-3.87],[0.8111,4.226,1.22],[7.3028,22.611,-2.05],[0.5654,1.305,0.80]],
  [[4.1328,21.715,-3.87],[0.8583,4.531,1.23],[7.3123,22.594,-2.04],[0.5725,1.348,0.80]],
  [[4.2178,21.981,-3.87],[0.9055,4.834,1.23],[7.3219,22.577,-2.04],[0.5795,1.391,0.80]],
  [[4.3031,22.237,-3.88],[0.9527,5.136,1.23],[7.3316,22.559,-2.03],[0.5865,1.434,0.80]],
  [[4.3887,22.482,-3.88],[0.9998,5.438,1.23],[7.3415,22.541,-2.03],[0.5935,1.476,0.80]],
  [[4.4744,22.717,-3.88],[1.0470,5.738,1.23],[7.3515,22.522,-2.02],[0.6005,1.519,0.80]],
  [[4.5604,22.942,-3.88],[1.0942,6.037,1.23],[7.3617,22.503,-2.02],[0.6074,1.560,0.79]],
  [[4.6467,23.157,-3.88],[1.1415,6.335,1.23],[7.3720,22.484,-2.01],[0.6143,1.602,0.79]],
  [[4.7331,23.360,-3.88],[1.1887,6.631,1.23],[7.3824,22.464,-2.00],[0.6211,1.643,0.79]],
  [[4.8197,23.553,-3.89],[1.2359,6.926,1.24],[7.3930,22.444,-2.00],[0.6279,1.684,0.79]],
  [[4.9065,23.735,-3.89],[1.2832,7.220,1.24],[7.4036,22.423,-1.99],[0.6346,1.725,0.79]],
  [[4.9935,23.905,-3.89],[1.3305,7.512,1.24],[7.4145,22.402,-1.99],[0.6413,1.765,0.79]],
  [[5.0807,24.065,-3.89],[1.3778,7.803,1.24],[7.4254,22.381,-1.98],[0.6480,1.805,0.79]],
  [[5.1680,24.213,-3.89],[1.4251,8.093,1.24],[7.4365,22.359,-1.98],[0.6546,1.844,0.79]],
  [[5.2554,24.350,-3.89],[1.4725,8.381,1.24],[7.4477,22.336,-1.97],[0.6611,1.883,0.79]],
  [[5.3429,24.475,-3.90],[1.5198,8.667,1.24],[7.4590,22.313,-1.97],[0.6677,1.922,0.79]],
  [[5.4306,24.589,-3.90],[1.5672,8.952,1.25],[7.4705,22.290,-1.96],[0.6741,1.960,0.79]],
  [[5.5183,24.691,-3.90],[1.6147,9.235,1.25],[7.4820,22.267,-1.96],[0.6805,1.998,0.79]],
  [[5.6061,24.782,-3.90],[1.6621,9.516,1.25],[7.4937,22.243,-1.95],[0.6869,2.036,0.78]],
  [[5.6940,24.861,-3.91],[1.7096,9.796,1.25],[7.5055,22.218,-1.95],[0.6932,2.073,0.78]],
  [[5.7819,24.928,-3.91],[1.7571,10.073,1.25],[7.5174,22.193,-1.94],[0.6995,2.110,0.78]],
  [[5.8698,24.983,-3.91],[1.8046,10.349,1.25],[7.5294,22.168,-1.94],[0.7057,2.146,0.78]],
  [[5.9577,25.026,-3.91],[1.8522,10.623,1.25],[7.5415,22.142,-1.93],[0.7118,2.182,0.78]],
  [[6.0456,25.058,-3.92],[1.8998,10.895,1.25],[7.5537,22.116,-1.93],[0.7179,2.217,0.78]],
  [[6.1335,25.077,-3.92],[1.9475,11.165,1.26],[7.5660,22.089,-1.93],[0.7239,2.252,0.78]],
  [[6.2213,25.085,-3.92],[1.9951,11.433,1.26],[7.5785,22.062,-1.92],[0.7299,2.287,0.77]],
  [[6.3090,25.081,-3.92],[2.0428,11.699,1.26],[7.5910,22.034,-1.92],[0.7358,2.321,0.77]],
  [[6.3966,25.065,-3.93],[2.0906,11.963,1.26],[7.6036,22.006,-1.91],[0.7416,2.355,0.77]],
  [[6.4841,25.037,-3.93],[2.1383,12.225,1.26],[7.6163,21.978,-1.91],[0.7474,2.388,0.77]],
  [[6.5715,24.997,-3.93],[2.1861,12.484,1.26],[7.6291,21.949,-1.90],[0.7531,2.421,0.77]],
  [[6.6587,24.946,-3.94],[2.2340,12.741,1.26],[7.6420,21.920,-1.90],[0.7588,2.453,0.77]],
  [[6.7458,24.883,-3.94],[2.2819,12.996,1.27],[7.6549,21.890,-1.90],[0.7643,2.485,0.76]],
  [[6.8327,24.808,-3.94],[2.3298,13.249,1.27],[7.6680,21.860,-1.89],[0.7699,2.516,0.76]],
  [[6.9193,24.722,-3.94],[2.3778,13.499,1.27],[7.6811,21.829,-1.89],[0.7753,2.547,0.76]],
  [[7.0058,24.624,-3.95],[2.4258,13.747,1.27],[7.6944,21.798,-1.88],[0.7807,2.577,0.76]],
  [[7.0920,24.515,-3.95],[2.4738,13.993,1.27],[7.7077,21.767,-1.88],[0.7860,2.607,0.76]],
  [[7.1779,24.394,-3.95],[2.5219,14.236,1.27],[7.7210,21.735,-1.88],[0.7913,2.637,0.75]],
  [[7.2636,24.263,-3.96],[2.5701,14.476,1.27],[7.7345,21.703,-1.87],[0.7964,2.666,0.75]],
  [[7.3490,24.120,-3.96],[2.6183,14.715,1.27],[7.7480,21.670,-1.87],[0.8016,2.694,0.75]],
  [[7.4342,23.966,-3.97],[2.6665,14.950,1.28],[7.7616,21.637,-1.87],[0.8066,2.722,0.75]],
  [[7.5190,23.801,-3.97],[2.7148,15.183,1.28],[7.7753,21.603,-1.86],[0.8115,2.749,0.74]],
  [[7.6035,23.626,-3.97],[2.7631,15.414,1.28],[7.7890,21.569,-1.86],[0.8164,2.776,0.74]],
  [[7.6876,23.440,-3.98],[2.8115,15.641,1.28],[7.8029,21.535,-1.86],[0.8212,2.802,0.74]],
  [[7.7715,23.243,-3.98],[2.8599,15.867,1.28],[7.8167,21.500,-1.85],[0.8260,2.828,0.74]],
  [[7.8549,23.037,-3.99],[2.9084,16.089,1.28],[7.8307,21.465,-1.85],[0.8306,2.854,0.73]],
  [[7.9380,22.819,-3.99],[2.9569,16.309,1.28],[7.8447,21.429,-1.85],[0.8352,2.878,0.73]],
  [[8.0208,22.592,-3.99],[3.0055,16.526,1.28],[7.8588,21.393,-1.84],[0.8397,2.902,0.73]],
  [[8.1031,22.355,-4.00],[3.0541,16.740,1.28],[7.8729,21.356,-1.84],[0.8441,2.926,0.72]],
  [[8.1851,22.109,-4.00],[3.1027,16.951,1.29],[7.8871,21.319,-1.84],[0.8484,2.949,0.72]],
  [[8.2666,21.852,-4.01],[3.1514,17.159,1.29],[7.9013,21.282,-1.84],[0.8527,2.971,0.72]],
  [[8.3477,21.587,-4.01],[3.2001,17.365,1.29],[7.9156,21.244,-1.83],[0.8569,2.993,0.71]],
  [[8.4285,21.312,-4.02],[3.2489,17.567,1.29],[7.9300,21.205,-1.83],[0.8609,3.015,0.71]],
  [[8.5088,21.028,-4.02],[3.2977,17.767,1.29],[7.9444,21.167,-1.83],[0.8649,3.035,0.71]],
  [[8.5886,20.735,-4.02],[3.3465,17.963,1.29],[7.9588,21.128,-1.83],[0.8689,3.055,0.70]],
  [[8.6680,20.434,-4.03],[3.3954,18.157,1.29],[7.9733,21.088,-1.82],[0.8727,3.075,0.70]],
  [[8.7470,20.124,-4.03],[3.4443,18.347,1.29],[7.9879,21.048,-1.82],[0.8764,3.094,0.70]],
  [[8.8256,19.806,-4.04],[3.4933,18.534,1.29],[8.0024,21.008,-1.82],[0.8801,3.112,0.69]],
  [[8.9036,19.480,-4.04],[3.5423,18.719,1.29],[8.0171,20.967,-1.82],[0.8836,3.130,0.69]],
  [[8.9812,19.146,-4.05],[3.5913,18.900,1.30],[8.0317,20.926,-1.81],[0.8871,3.147,0.69]],
  [[9.0584,18.804,-4.06],[3.6403,19.078,1.30],[8.0464,20.884,-1.81],[0.8905,3.164,0.68]],
  [[9.1351,18.455,-4.06],[3.6894,19.253,1.30],[8.0612,20.842,-1.81],[0.8937,3.180,0.68]],
  [[9.2113,18.098,-4.07],[3.7385,19.425,1.30],[8.0760,20.800,-1.81],[0.8969,3.195,0.68]],
  [[9.2871,17.735,-4.07],[3.7877,19.593,1.30],[8.0908,20.757,-1.81],[0.9000,3.210,0.67]],
  [[9.3624,17.364,-4.08],[3.8369,19.758,1.30],[8.1056,20.714,-1.81],[0.9030,3.224,0.67]],
  [[9.4373,16.987,-4.08],[3.8861,19.920,1.30],[8.1205,20.670,-1.80],[0.9060,3.237,0.66]],
  [[9.5116,16.604,-4.09],[3.9353,20.079,1.30],[8.1354,20.626,-1.80],[0.9088,3.250,0.66]],
  [[9.5856,16.214,-4.10],[3.9845,20.235,1.30],[8.1503,20.582,-1.80],[0.9115,3.263,0.66]],
  [[9.6590,15.818,-4.10],[4.0338,20.387,1.30],[8.1653,20.537,-1.80],[0.9141,3.274,0.65]],
  [[9.7320,15.416,-4.11],[4.0831,20.536,1.30],[8.1803,20.492,-1.80],[0.9166,3.285,0.65]],
  [[9.8046,15.008,-4.11],[4.1324,20.681,1.30],[8.1953,20.447,-1.80],[0.9191,3.295,0.64]],
  [[9.8767,14.595,-4.12],[4.1818,20.824,1.30],[8.2103,20.401,-1.80],[0.9214,3.305,0.64]],
  [[9.9484,14.177,-4.13],[4.2311,20.963,1.30],[8.2254,20.355,-1.79],[0.9236,3.314,0.64]],
  [[10.0196,13.753,-4.13],[4.2805,21.098,1.30],[8.2405,20.308,-1.79],[0.9258,3.323,0.63]],
  [[10.0904,13.324,-4.14],[4.3299,21.230,1.31],[8.2556,20.261,-1.79],[0.9278,3.330,0.63]],
  [[10.1607,12.891,-4.15],[4.3793,21.359,1.31],[8.2707,20.214,-1.79],[0.9297,3.338,0.62]],
  [[10.2307,12.453,-4.15],[4.4287,21.484,1.31],[8.2858,20.166,-1.79],[0.9316,3.344,0.62]],
  [[10.3002,12.011,-4.16],[4.4781,21.606,1.31],[8.3010,20.118,-1.79],[0.9333,3.350,0.61]],
  [[10.3692,11.565,-4.17],[4.5276,21.725,1.31],[8.3161,20.070,-1.79],[0.9349,3.355,0.61]],
  [[10.4379,11.115,-4.17],[4.5770,21.840,1.31],[8.3313,20.021,-1.79],[0.9365,3.360,0.60]],
  [[10.5061,10.660,-4.18],[4.6264,21.952,1.31],[8.3465,19.972,-1.79],[0.9379,3.363,0.60]],
  [[10.5740,10.203,-4.19],[4.6758,22.060,1.31],[8.3617,19.923,-1.79],[0.9392,3.367,0.59]],
  [[10.6414,9.742,-4.20],[4.7252,22.164,1.31],[8.3769,19.873,-1.79],[0.9404,3.369,0.59]],
  [[10.7084,9.277,-4.20],[4.7746,22.266,1.31],[8.3921,19.823,-1.79],[0.9415,3.371,0.59]],
  [[10.7750,8.810,-4.21],[4.8239,22.364,1.31],[8.4073,19.773,-1.79],[0.9425,3.372,0.58]],
  [[10.8412,8.340,-4.22],[4.8733,22.458,1.31],[8.4225,19.722,-1.79],[0.9434,3.373,0.58]],
  [[10.9070,7.867,-4.23],[4.9226,22.549,1.31],[8.4377,19.671,-1.79],[0.9442,3.373,0.57]],
  [[10.9724,7.392,-4.24],[4.9719,22.636,1.31],[8.4530,19.620,-1.79],[0.9449,3.372,0.57]],
  [[11.0374,6.915,-4.24],[5.0212,22.720,1.31],[8.4682,19.568,-1.79],[0.9455,3.371,0.56]],
  [[11.1020,6.436,-4.25],[5.0705,22.800,1.31],[8.4834,19.516,-1.79],[0.9460,3.368,0.56]],
  [[11.1663,5.954,-4.26],[5.1197,22.877,1.31],[8.4986,19.464,-1.79],[0.9463,3.366,0.55]],
  [[11.2301,5.472,-4.27],[5.1689,22.951,1.31],[8.5138,19.412,-1.79],[0.9466,3.362,0.55]],
  [[11.2936,4.987,-4.28],[5.2180,23.021,1.31],[8.5290,19.359,-1.79],[0.9468,3.358,0.54]],
  [[11.3566,4.502,-4.29],[5.2672,23.087,1.31],[8.5442,19.306,-1.79],[0.9468,3.354,0.53]],
  [[11.4193,4.015,-4.29],[5.3162,23.151,1.31],[8.5594,19.253,-1.79],[0.9468,3.348,0.53]],
  [[11.4817,3.527,-4.30],[5.3653,23.210,1.31],[8.5745,19.199,-1.79],[0.9466,3.342,0.52]],
  [[11.5436,3.039,-4.31],[5.4143,23.266,1.30],[8.5897,19.146,-1.79],[0.9464,3.336,0.52]],
  [[11.6052,2.549,-4.32],[5.4632,23.319,1.30],[8.6048,19.092,-1.79],[0.9460,3.329,0.51]],
  [[11.6664,2.060,-4.33],[5.5121,23.369,1.30],[8.6200,19.037,-1.78],[0.9455,3.321,0.51]],
  [[11.7272,1.570,-4.34],[5.5610,23.415,1.30],[8.6351,18.983,-1.78],[0.9450,3.312,0.50]],
  [[11.7877,1.080,-4.35],[5.6098,23.457,1.30],[8.6502,18.928,-1.78],[0.9443,3.303,0.50]],
  [[11.8478,0.590,-4.36],[5.6585,23.496,1.30],[8.6653,18.873,-1.78],[0.9435,3.293,0.49]],
  [[11.9076,0.101,-4.37],[5.7072,23.532,1.30],[8.6804,18.818,-1.78],[0.9426,3.283,0.49]],
  [[11.9669,-0.388,-4.38],[5.7558,23.565,1.30],[8.6954,18.763,-1.78],[0.9416,3.272,0.48]],
  [[12.0260,-0.877,-4.39],[5.8044,23.594,1.30],[8.7104,18.707,-1.78],[0.9406,3.260,0.48]],
  [[12.0846,-1.365,-4.40],[5.8529,23.619,1.30],[8.7255,18.652,-1.78],[0.9394,3.248,0.47]],
  [[12.1429,-1.852,-4.41],[5.9013,23.642,1.30],[8.7404,18.596,-1.78],[0.9381,3.235,0.47]],
  [[12.2008,-2.337,-4.42],[5.9496,23.661,1.30],[8.7554,18.539,-1.78],[0.9367,3.222,0.46]],
  [[12.2583,-2.822,-4.43],[5.9978,23.677,1.29],[8.7703,18.483,-1.78],[0.9352,3.207,0.45]],
  [[12.3155,-3.305,-4.44],[6.0460,23.689,1.29],[8.7852,18.427,-1.78],[0.9336,3.193,0.45]],
  [[12.3722,-3.786,-4.45],[6.0941,23.698,1.29],[8.8001,18.370,-1.78],[0.9319,3.178,0.44]],
  [[12.4286,-4.266,-4.46],[6.1421,23.704,1.29],[8.8150,18.313,-1.78],[0.9300,3.162,0.44]],
  [[12.4845,-4.744,-4.47],[6.1899,23.707,1.29],[8.8298,18.256,-1.78],[0.9281,3.145,0.43]],
  [[12.5401,-5.219,-4.48],[6.2377,23.707,1.29],[8.8446,18.199,-1.78],[0.9261,3.128,0.43]],
  [[12.5952,-5.692,-4.49],[6.2854,23.703,1.29],[8.8593,18.142,-1.78],[0.9240,3.111,0.42]],
  [[12.6499,-6.163,-4.50],[6.3330,23.696,1.28],[8.8740,18.085,-1.78],[0.9219,3.092,0.42]],
  [[12.7041,-6.631,-4.51],[6.3805,23.687,1.28],[8.8887,18.027,-1.78],[0.9196,3.074,0.41]],
  [[12.7579,-7.095,-4.52],[6.4278,23.674,1.28],[8.9033,17.970,-1.78],[0.9172,3.055,0.40]],
  [[12.8112,-7.557,-4.53],[6.4751,23.658,1.28],[8.9179,17.912,-1.79],[0.9147,3.035,0.40]],
  [[12.8640,-8.015,-4.54],[6.5222,23.639,1.28],[8.9325,17.854,-1.79],[0.9122,3.015,0.39]],
  [[12.9163,-8.470,-4.55],[6.5692,23.617,1.27],[8.9470,17.796,-1.79],[0.9095,2.994,0.39]],
  [[12.9680,-8.921,-4.56],[6.6161,23.592,1.27],[8.9615,17.739,-1.79],[0.9068,2.973,0.38]],
  [[13.0192,-9.369,-4.57],[6.6629,23.564,1.27],[8.9759,17.681,-1.79],[0.9039,2.951,0.38]],
  [[13.0699,-9.812,-4.58],[6.7096,23.533,1.27],[8.9903,17.623,-1.79],[0.9010,2.929,0.37]],
  [[13.1200,-10.251,-4.59],[6.7561,23.499,1.26],[9.0046,17.565,-1.79],[0.8980,2.906,0.37]],
  [[13.1694,-10.685,-4.60],[6.8025,23.462,1.26],[9.0189,17.506,-1.79],[0.8949,2.883,0.36]],
  [[13.2183,-11.115,-4.61],[6.8488,23.423,1.26],[9.0331,17.448,-1.79],[0.8918,2.859,0.35]],
  [[13.2665,-11.540,-4.62],[6.8949,23.380,1.26],[9.0473,17.390,-1.79],[0.8885,2.835,0.35]],
  [[13.3140,-11.959,-4.63],[6.9410,23.335,1.25],[9.0614,17.332,-1.80],[0.8852,2.810,0.34]],
  [[13.3608,-12.374,-4.64],[6.9869,23.287,1.25],[9.0755,17.274,-1.80],[0.8818,2.785,0.34]],
  [[13.4069,-12.783,-4.65],[7.0326,23.236,1.25],[9.0895,17.216,-1.80],[0.8783,2.760,0.33]],
  [[13.4522,-13.186,-4.66],[7.0782,23.183,1.25],[9.1035,17.158,-1.80],[0.8747,2.734,0.33]],
  [[13.4967,-13.584,-4.67],[7.1237,23.127,1.24],[9.1174,17.099,-1.80],[0.8711,2.708,0.32]],
  [[13.5404,-13.975,-4.68],[7.1690,23.068,1.24],[9.1312,17.041,-1.80],[0.8674,2.682,0.32]],
  [[13.5832,-14.360,-4.69],[7.2141,23.007,1.24],[9.1450,16.983,-1.81],[0.8636,2.655,0.31]],
  [[13.6252,-14.738,-4.70],[7.2592,22.943,1.23],[9.1587,16.925,-1.81],[0.8598,2.628,0.31]],
  [[13.6661,-15.109,-4.71],[7.3040,22.877,1.23],[9.1724,16.867,-1.81],[0.8559,2.600,0.30]],
  [[13.7061,-15.474,-4.71],[7.3487,22.808,1.23],[9.1860,16.809,-1.81],[0.8519,2.572,0.30]],
  [[13.7451,-15.830,-4.72],[7.3933,22.737,1.22],[9.1995,16.752,-1.81],[0.8479,2.544,0.29]],
  [[13.7829,-16.180,-4.73],[7.4376,22.664,1.22],[9.2130,16.694,-1.82],[0.8438,2.515,0.29]],
  [[13.8196,-16.521,-4.74],[7.4818,22.588,1.21],[9.2264,16.636,-1.82],[0.8397,2.487,0.28]],
  [[13.8551,-16.854,-4.74],[7.5259,22.510,1.21],[9.2397,16.579,-1.82],[0.8355,2.457,0.28]],
  [[13.8894,-17.178,-4.75],[7.5697,22.429,1.21],[9.2529,16.522,-1.82],[0.8312,2.428,0.27]],
  [[13.9224,-17.493,-4.76],[7.6134,22.347,1.20],[9.2661,16.465,-1.83],[0.8269,2.399,0.27]],
  [[13.9539,-17.799,-4.76],[7.6570,22.262,1.20],[9.2792,16.408,-1.83],[0.8225,2.369,0.26]],
  [[13.9840,-18.095,-4.77],[7.7003,22.175,1.19],[9.2922,16.351,-1.83],[0.8181,2.339,0.26]],
  [[14.0126,-18.380,-4.77],[7.7435,22.086,1.19],[9.3052,16.294,-1.83],[0.8137,2.309,0.25]],
  [[14.0397,-18.655,-4.77],[7.7864,21.994,1.18],[9.3180,16.238,-1.84],[0.8092,2.278,0.25]],
  [[14.0651,-18.919,-4.77],[7.8293,21.901,1.18],[9.3308,16.181,-1.84],[0.8047,2.248,0.24]],
  [[14.0887,-19.172,-4.78],[7.8719,21.806,1.18],[9.3435,16.125,-1.84],[0.8001,2.217,0.24]],
  [[14.1106,-19.412,-4.78],[7.9143,21.709,1.17],[9.3561,16.069,-1.85],[0.7955,2.187,0.24]],
  [[14.1306,-19.640,-4.77],[7.9566,21.610,1.17],[9.3687,16.014,-1.85],[0.7909,2.156,0.23]],
  [[14.1487,-19.855,-4.77],[7.9986,21.509,1.16],[9.3811,15.958,-1.85],[0.7862,2.125,0.23]],
  [[14.1648,-20.056,-4.77],[8.0405,21.406,1.16],[9.3935,15.903,-1.86],[0.7815,2.094,0.22]],
  [[14.1788,-20.242,-4.76],[8.0822,21.302,1.15],[9.4057,15.848,-1.86],[0.7768,2.063,0.22]],
  [[14.1907,-20.414,-4.76],[8.1237,21.195,1.14],[9.4179,15.794,-1.86],[0.7721,2.032,0.21]],
  [[14.2004,-20.570,-4.75],[8.1651,21.087,1.14],[9.4300,15.739,-1.87],[0.7673,2.000,0.21]],
  [[14.2079,-20.711,-4.74],[8.2062,20.978,1.13],[9.4419,15.685,-1.87],[0.7626,1.969,0.21]],
  [[14.2131,-20.834,-4.73],[8.2471,20.867,1.13],[9.4538,15.632,-1.87],[0.7578,1.938,0.20]],
  [[14.2159,-20.940,-4.72],[8.2879,20.754,1.12],[9.4656,15.578,-1.88],[0.7530,1.907,0.20]],
  [[14.2163,-21.027,-4.70],[8.3284,20.640,1.12],[9.4773,15.525,-1.88],[0.7482,1.876,0.20]],
  [[14.2144,-21.096,-4.69],[8.3688,20.524,1.11],[9.4889,15.473,-1.88],[0.7434,1.845,0.20]],
  [[14.2100,-21.145,-4.67],[8.4089,20.407,1.10],[9.5004,15.420,-1.89],[0.7386,1.814,0.20]],
  [[14.2031,-21.173,-4.64],[8.4488,20.289,1.10],[9.5118,15.368,-1.89],[0.7337,1.783,0.20]],
  [[14.1938,-21.181,-4.62],[8.4886,20.169,1.09],[9.5231,15.317,-1.90],[0.7289,1.752,0.21]],
  [[14.1820,-21.167,-4.59],[8.5281,20.048,1.08],[9.5342,15.265,-1.90],[0.7241,1.721,0.21]],
  [[14.1679,-21.130,-4.56],[8.5674,19.926,1.08],[9.5453,15.215,-1.90],[0.7193,1.691,0.22]],
  [[14.1513,-21.071,-4.53],[8.6065,19.802,1.07],[9.5563,15.164,-1.91],[0.7145,1.661,0.22]],
  [[14.1324,-20.988,-4.50],[8.6453,19.678,1.06],[9.5671,15.114,-1.91],[0.7097,1.630,0.23]],
  [[14.1113,-20.882,-4.46],[8.6840,19.552,1.06],[9.5778,15.065,-1.92],[0.7049,1.600,0.24]],
  [[14.0880,-20.751,-4.42],[8.7224,19.426,1.05],[9.5884,15.016,-1.92],[0.7002,1.571,0.24]],
  [[14.0627,-20.596,-4.37],[8.7606,19.298,1.04],[9.5989,14.968,-1.93],[0.6954,1.541,0.25]],
  [[14.0354,-20.417,-4.33],[8.7986,19.170,1.03],[9.6093,14.920,-1.93],[0.6907,1.512,0.26]],
  [[14.0064,-20.213,-4.28],[8.8364,19.041,1.03],[9.6195,14.872,-1.94],[0.6860,1.483,0.26]],
  [[13.9758,-19.986,-4.23],[8.8739,18.911,1.02],[9.6296,14.825,-1.94],[0.6813,1.454,0.27]],
  [[13.9437,-19.736,-4.17],[8.9112,18.780,1.01],[9.6396,14.779,-1.94],[0.6767,1.425,0.28]],
  [[13.9105,-19.462,-4.18],[8.9483,18.648,1.00],[9.6495,14.733,-1.95],[0.6721,1.397,0.28]],
  [[13.8763,-19.168,-4.21],[8.9852,18.516,0.99],[9.6592,14.688,-1.95],[0.6675,1.369,0.29]],
  [[13.8413,-18.853,-4.23],[9.0218,18.383,0.98],[9.6688,14.643,-1.96],[0.6630,1.342,0.30]],
  [[13.8059,-18.519,-4.26],[9.0582,18.250,0.98],[9.6783,14.599,-1.96],[0.6585,1.314,0.31]],
  [[13.7702,-18.168,-4.27],[9.0943,18.116,0.97],[9.6876,14.555,-1.97],[0.6541,1.288,0.31]],
  [[13.7346,-17.801,-4.28],[9.1302,17.982,0.96],[9.6968,14.512,-1.97],[0.6497,1.261,0.32]],
  [[13.6992,-17.421,-4.29],[9.1659,17.847,0.95],[9.7059,14.470,-1.98],[0.6453,1.235,0.33]],
  [[13.6644,-17.030,-4.28],[9.2013,17.712,0.94],[9.7148,14.428,-1.98],[0.6410,1.209,0.33]],
  [[13.6304,-16.629,-4.27],[9.2365,17.576,0.93],[9.7236,14.387,-1.99],[0.6368,1.184,0.34]],
  [[13.5974,-16.223,-4.25],[9.2715,17.441,0.92],[9.7322,14.347,-2.00],[0.6326,1.159,0.35]],
  [[13.5657,-15.812,-4.23],[9.3062,17.305,0.91],[9.7407,14.307,-2.00],[0.6285,1.135,0.36]],
  [[13.5355,-15.399,-4.20],[9.3406,17.169,0.90],[9.7491,14.268,-2.01],[0.6244,1.111,0.36]],
  [[13.5069,-14.987,-4.17],[9.3749,17.033,0.89],[9.7573,14.230,-2.01],[0.6204,1.088,0.37]],
  [[13.4802,-14.578,-4.23],[9.4088,16.896,0.88],[9.7653,14.193,-2.02],[0.6164,1.065,0.38]],
  [[13.4554,-14.174,-4.28],[9.4425,16.760,0.87],[9.7732,14.156,-2.02],[0.6125,1.042,0.39]],
  [[13.4328,-13.777,-4.34],[9.4760,16.624,0.86],[9.7810,14.120,-2.03],[0.6087,1.021,0.39]],
  [[13.4124,-13.389,-4.39],[9.5091,16.488,0.85],[9.7886,14.084,-2.03],[0.6049,0.999,0.40]],
  [[13.3944,-13.013,-4.44],[9.5420,16.352,0.84],[9.7960,14.050,-2.04],[0.6012,0.978,0.41]],
  [[13.3788,-12.649,-4.48],[9.5747,16.217,0.83],[9.8033,14.016,-2.05],[0.5976,0.958,0.41]],
  [[13.3656,-12.299,-4.53],[9.6070,16.082,0.81],[9.8104,13.983,-2.05],[0.5941,0.938,0.42]],
  [[13.3550,-11.964,-4.57],[9.6391,15.947,0.80],[9.8173,13.951,-2.06],[0.5906,0.919,0.43]],
  [[13.3468,-11.646,-4.60],[9.6709,15.813,0.79],[9.8241,13.920,-2.06],[0.5872,0.900,0.44]],
  [[13.3412,-11.344,-4.64],[9.7024,15.679,0.78],[9.8307,13.889,-2.07],[0.5839,0.882,0.44]],
  [[13.3381,-11.061,-4.67],[9.7336,15.546,0.77],[9.8372,13.860,-2.08],[0.5807,0.865,0.45]],
  [[13.3375,-10.796,-4.69],[9.7646,15.413,0.75],[9.8434,13.831,-2.08],[0.5776,0.848,0.46]],
  [[13.3393,-10.550,-4.72],[9.7952,15.281,0.74],[9.8495,13.803,-2.09],[0.5745,0.832,0.46]],
  [[13.3436,-10.323,-4.74],[9.8255,15.150,0.73],[9.8555,13.776,-2.09],[0.5716,0.817,0.47]],
  [[13.3503,-10.115,-4.76],[9.8555,15.020,0.72],[9.8612,13.751,-2.10],[0.5687,0.802,0.48]],
  [[13.3594,-9.927,-4.78],[9.8853,14.890,0.70],[9.8668,13.725,-2.11],[0.5659,0.787,0.49]],
  [[13.3708,-9.759,-4.80],[9.9147,14.761,0.69],[9.8722,13.701,-2.11],[0.5632,0.774,0.49]],
  [[13.3844,-9.609,-4.81],[9.9438,14.634,0.68],[9.8774,13.678,-2.12],[0.5607,0.761,0.50]],
  [[13.4002,-9.479,-4.82],[9.9725,14.507,0.66],[9.8824,13.656,-2.13],[0.5582,0.749,0.51]],
  [[13.4182,-9.367,-4.83],[10.0010,14.382,0.65],[9.8872,13.635,-2.13],[0.5558,0.737,0.51]],
  [[13.4382,-9.274,-4.84],[10.0291,14.257,0.64],[9.8919,13.614,-2.14],[0.5535,0.726,0.52]],
  [[13.4603,-9.199,-4.85],[10.0569,14.134,0.62],[9.8964,13.595,-2.15],[0.5512,0.716,0.53]],
  [[13.4843,-9.142,-4.86],[10.0844,14.013,0.61],[9.9006,13.577,-2.15],[0.5491,0.706,0.53]],
  [[13.5102,-9.102,-4.86],[10.1115,13.892,0.59],[9.9047,13.559,-2.16],[0.5471,0.698,0.54]],
  [[13.5380,-9.079,-4.86],[10.1383,13.773,0.58],[9.9086,13.543,-2.17],[0.5452,0.689,0.55]],
  [[13.5676,-9.072,-4.87],[10.1648,13.655,0.56],[9.9123,13.528,-2.17],[0.5434,0.682,0.55]],
  [[13.5988,-9.081,-4.87],[10.1908,13.539,0.55],[9.9159,13.513,-2.18],[0.5417,0.675,0.56]],
  [[13.6318,-9.105,-4.87],[10.2166,13.425,0.53],[9.9192,13.500,-2.19],[0.5401,0.669,0.56]],
  [[13.6663,-9.144,-4.86],[10.2419,13.312,0.52],[9.9223,13.488,-2.19],[0.5386,0.664,0.57]],
  [[13.7024,-9.198,-4.86],[10.2669,13.201,0.50],[9.9252,13.477,-2.20],[0.5373,0.659,0.58]],
  [[13.7400,-9.264,-4.86],[10.2915,13.092,0.48],[9.9279,13.467,-2.21],[0.5360,0.655,0.58]],
  [[13.7790,-9.344,-4.86],[10.3157,12.985,0.47],[9.9305,13.458,-2.21],[0.5348,0.652,0.59]],
  [[13.8194,-9.436,-4.85],[10.3396,12.880,0.45],[9.9328,13.450,-2.22],[0.5337,0.650,0.59]],
  [[13.8612,-9.540,-4.85],[10.3630,12.776,0.43],[9.9349,13.443,-2.23],[0.5328,0.648,0.60]],
  [[13.9042,-9.655,-4.84],[10.3860,12.675,0.42],[9.9368,13.437,-2.23],[0.5319,0.647,0.61]],
  [[13.9485,-9.781,-4.84],[10.4086,12.577,0.40],[9.9385,13.432,-2.24],[0.5312,0.647,0.61]],
  [[13.9940,-9.918,-4.83],[10.4307,12.480,0.38],[9.9400,13.429,-2.25],[0.5306,0.647,0.62]],
  [[14.0407,-10.064,-4.82],[10.4524,12.386,0.36],[9.9413,13.426,-2.25],[0.5300,0.648,0.62]],
  [[14.0884,-10.219,-4.81],[10.4737,12.295,0.34],[9.9424,13.425,-2.26],[0.5296,0.650,0.63]],
  [[14.1372,-10.382,-4.81],[10.4945,12.206,0.33],[9.9432,13.425,-2.27],[0.5293,0.653,0.63]],
  [[14.1871,-10.554,-4.80],[10.5149,12.119,0.31],[9.9439,13.426,-2.27],[0.5292,0.656,0.64]],
  [[14.2380,-10.733,-4.79],[10.5348,12.035,0.29],[9.9443,13.428,-2.28],[0.5291,0.660,0.64]],
  [[14.2899,-10.920,-4.78],[10.5542,11.955,0.27],[9.9446,13.431,-2.29],[0.5291,0.665,0.65]],
  [[14.3427,-11.113,-4.77],[10.5731,11.876,0.25],[9.9446,13.435,-2.29],[0.5293,0.671,0.65]],
  [[14.3964,-11.312,-4.76],[10.5915,11.801,0.23],[9.9444,13.441,-2.30],[0.5295,0.677,0.66]],
  [[14.4511,-11.517,-4.76],[10.6094,11.729,0.21],[9.9440,13.447,-2.31],[0.5299,0.684,0.66]],
  [[14.5066,-11.728,-4.75],[10.6268,11.660,0.19],[9.9434,13.455,-2.31],[0.5304,0.692,0.67]],
  [[14.5629,-11.943,-4.74],[10.6437,11.594,0.17],[9.9426,13.464,-2.32],[0.5310,0.701,0.67]],
  [[14.6201,-12.163,-4.73],[10.6601,11.531,0.15],[9.9415,13.474,-2.33],[0.5317,0.710,0.67]],
  [[14.6781,-12.386,-4.72],[10.6759,11.471,0.13],[9.9403,13.485,-2.33],[0.5326,0.720,0.68]],
  [[14.7369,-12.614,-4.71],[10.6912,11.415,0.11],[9.9388,13.497,-2.34],[0.5335,0.730,0.68]],
  [[14.7965,-12.844,-4.70],[10.7059,11.362,0.09],[9.9372,13.510,-2.35],[0.5345,0.742,0.69]],
  [[14.8568,-13.078,-4.69],[10.7201,11.313,0.07],[9.9353,13.524,-2.35],[0.5357,0.754,0.69]],
  [[14.9178,-13.313,-4.68],[10.7336,11.268,0.05],[9.9332,13.540,-2.36],[0.5370,0.767,0.69]],
  [[14.9797,-13.551,-4.67],[10.7466,11.226,0.02],[9.9309,13.556,-2.37],[0.5383,0.780,0.70]],
  [[15.0422,-13.791,-4.66],[10.7590,11.187,0.00],[9.9285,13.574,-2.37],[0.5398,0.794,0.70]],
  [[15.1054,-14.032,-4.65],[10.7707,11.153,-0.02],[9.9258,13.592,-2.38],[0.5414,0.809,0.70]],
  [[15.1693,-14.274,-4.64],[10.7819,11.122,-0.04],[9.9229,13.612,-2.38],[0.5431,0.825,0.71]],
  [[15.2339,-14.517,-4.63],[10.7924,11.096,-0.06],[9.9198,13.632,-2.39],[0.5449,0.841,0.71]],
  [[15.2991,-14.759,-4.62],[10.8022,11.073,-0.09],[9.9165,13.654,-2.40],[0.5469,0.858,0.71]],
  [[15.3650,-15.002,-4.61],[10.8114,11.055,-0.11],[9.9130,13.677,-2.40],[0.5489,0.876,0.72]],
  [[15.4316,-15.244,-4.60],[10.8199,11.041,-0.13],[9.9093,13.701,-2.41],[0.5510,0.894,0.72]],
];

function YEAR_FIXTURE_CANDIDATES(date: Date): RareCandidates {
  const day = Math.round((date.getTime() - YEAR_FIXTURE_START) / 86400000);
  const row = YEAR_FIXTURE_PLANETS[day];
  assert.ok(row, `no fixture row for ${date.toISOString()} (day ${day})`);
  return candidatesFrom(row);
}

/** The three whole nights the hourly fixture covers. */
const HOURLY_NIGHTS = [
  { label: "2026-02-12, a planet night", dayUTC: Date.UTC(2026, 1, 12), expected: "planet" },
  { label: "2026-09-09, a galaxy night", dayUTC: Date.UTC(2026, 8, 9), expected: "galaxy" },
  { label: "2026-03-01, an ordinary night", dayUTC: Date.UTC(2026, 2, 1), expected: null },
] as const;

/**
 * Per night, nine `[localSolarHour, Venus, Mars, Jupiter, Saturn]` snapshots.
 * See fixture provenance (E): the positions really do differ hour to hour.
 */
const HOURLY_FIXTURE: readonly (readonly (readonly [number, Triple, Triple, Triple, Triple])[])[] = [
  [
    [13, [22.3165,-12.046,-3.89],[21.2119,-17.248,1.16],[7.1499,22.814,-2.55],[0.0244,-2.186,0.98]],
    [15, [22.3231,-12.009,-3.89],[21.2162,-17.229,1.16],[7.1494,22.815,-2.55],[0.0250,-2.183,0.98]],
    [17, [22.3297,-11.971,-3.89],[21.2206,-17.210,1.16],[7.1489,22.816,-2.55],[0.0255,-2.179,0.98]],
    [19, [22.3364,-11.934,-3.89],[21.2250,-17.190,1.16],[7.1484,22.817,-2.55],[0.0261,-2.175,0.98]],
    [21, [22.3430,-11.896,-3.89],[21.2293,-17.171,1.16],[7.1479,22.818,-2.55],[0.0266,-2.172,0.98]],
    [23, [22.3497,-11.858,-3.89],[21.2337,-17.151,1.16],[7.1474,22.819,-2.55],[0.0272,-2.168,0.98]],
    [25, [22.3563,-11.821,-3.89],[21.2381,-17.132,1.16],[7.1469,22.820,-2.55],[0.0277,-2.164,0.98]],
    [27, [22.3630,-11.783,-3.89],[21.2425,-17.113,1.16],[7.1464,22.821,-2.55],[0.0283,-2.160,0.98]],
    [33, [22.3829,-11.671,-3.89],[21.2556,-17.055,1.16],[7.1450,22.823,-2.55],[0.0300,-2.149,0.98]],
  ],
  [
    [13, [13.6916,-15.340,-4.71],[7.3320,22.835,1.23],[9.1809,16.831,-1.81],[0.8534,2.583,0.30]],
    [15, [13.6948,-15.370,-4.71],[7.3357,22.829,1.23],[9.1820,16.826,-1.81],[0.8531,2.580,0.30]],
    [17, [13.6980,-15.400,-4.71],[7.3394,22.823,1.23],[9.1832,16.821,-1.81],[0.8528,2.578,0.30]],
    [19, [13.7012,-15.430,-4.71],[7.3432,22.817,1.23],[9.1843,16.817,-1.81],[0.8524,2.576,0.30]],
    [21, [13.7045,-15.459,-4.71],[7.3469,22.811,1.23],[9.1854,16.812,-1.81],[0.8521,2.573,0.30]],
    [23, [13.7078,-15.489,-4.71],[7.3507,22.805,1.23],[9.1866,16.807,-1.81],[0.8518,2.571,0.30]],
    [25, [13.7112,-15.519,-4.72],[7.3544,22.800,1.23],[9.1877,16.802,-1.81],[0.8514,2.569,0.30]],
    [27, [13.7146,-15.549,-4.72],[7.3581,22.794,1.23],[9.1889,16.797,-1.81],[0.8511,2.566,0.30]],
    [33, [13.7246,-15.639,-4.72],[7.3692,22.777,1.22],[9.1922,16.783,-1.81],[0.8501,2.559,0.29]],
  ],
  [
    [13, [23.6362,-3.833,-3.87],[22.0869,-12.927,1.17],[7.0789,22.949,-2.44],[0.1430,-1.393,0.91]],
    [15, [23.6425,-3.791,-3.87],[22.0911,-12.904,1.17],[7.0787,22.949,-2.44],[0.1436,-1.389,0.91]],
    [17, [23.6488,-3.749,-3.87],[22.0953,-12.881,1.17],[7.0785,22.950,-2.44],[0.1442,-1.385,0.91]],
    [19, [23.6551,-3.706,-3.87],[22.0995,-12.858,1.17],[7.0783,22.950,-2.44],[0.1448,-1.381,0.91]],
    [21, [23.6615,-3.664,-3.87],[22.1037,-12.835,1.17],[7.0781,22.950,-2.44],[0.1454,-1.377,0.91]],
    [23, [23.6678,-3.622,-3.87],[22.1080,-12.812,1.17],[7.0779,22.951,-2.44],[0.1460,-1.372,0.91]],
    [25, [23.6742,-3.579,-3.87],[22.1122,-12.789,1.17],[7.0777,22.951,-2.44],[0.1466,-1.368,0.91]],
    [27, [23.6805,-3.537,-3.87],[22.1164,-12.766,1.17],[7.0775,22.951,-2.44],[0.1472,-1.364,0.91]],
    [33, [23.6995,-3.410,-3.87],[22.1290,-12.697,1.17],[7.0771,22.952,-2.44],[0.1491,-1.352,0.91]],
  ],
];

// --- the brief's five ------------------------------------------------------

test("an ordinary night returns null", () => {
  // Galactic centre far below the horizon, no bright planet high up.
  const out = rareNight(
    { galacticCentre: { ra: 17.76, dec: -28.94, mag: 0 }, planets: [] },
    PRAGUE, new Date(Date.UTC(2026, 0, 15, 20, 0)), 430, 520,
  );
  assert.equal(out, null);
});

test("a qualifying galaxy night returns a band with a finite angle", () => {
  const out = rareNight(
    { galacticCentre: { ra: 17.76, dec: -28.94, mag: 0 }, planets: [] },
    { latitude: 25, longitude: 0 }, new Date(Date.UTC(2026, 6, 15, 21, 0)), 430, 520,
  );
  // Tightened from the brief's `if (out)`: on this night the band really does
  // qualify, so a null here is a regression rather than an acceptable answer.
  assert.equal(out?.kind, "galaxy");
  if (out?.kind !== "galaxy") return;
  assert.ok(Number.isFinite(out.angle) && Number.isFinite(out.x) && Number.isFinite(out.y));
  assert.ok(Number.isFinite(out.length) && out.length > 0);
});

test("galaxy and planet are never returned together", () => {
  const out = rareNight(
    {
      galacticCentre: { ra: 17.76, dec: -28.94, mag: 0 },
      planets: [{ ra: 17.8, dec: -28, mag: -2.5, name: "Jupiter", colour: "#FFD9A8" }],
    },
    { latitude: 25, longitude: 0 }, new Date(Date.UTC(2026, 6, 15, 21, 0)), 430, 520,
  );
  assert.ok(out === null || out.kind === "galaxy" || out.kind === "planet");
});

test("rare nights land near monthly across a simulated year", () => {
  // Per-NIGHT occurrence, not per-instant firing: each night's dark hours are
  // stepped through and the night is counted once if anything fires at any
  // point in it. Counting instants instead would measure how narrow the firing
  // window is rather than how often a rare night happens.
  let count = 0;
  for (let day = 0; day < 365; day++) {
    const dayUTC = Date.UTC(2026, 0, 1 + day);
    const candidates = YEAR_FIXTURE_CANDIDATES(new Date(Date.UTC(2026, 0, 1 + day, 21, 0)));
    const fired = DARK_HOURS.some(
      (hour) => rareNight(candidates, PRAGUE, pragueInstant(dayUTC, hour), 430, 520) !== null,
    );
    if (fired) count++;
  }
  assert.ok(count >= 6 && count <= 24, `expected roughly monthly, got ${count} nights`);
});

test("the same night always gives the same answer", () => {
  // The brief passed the identical Date twice, which only proves purity. The
  // requirement is night-stability, so the hour is varied right across the
  // night instead - including the afternoon before and the morning after,
  // since the verdict belongs to the whole noon-to-noon night.
  for (const { label, dayUTC } of HOURLY_NIGHTS) {
    const candidates = YEAR_FIXTURE_CANDIDATES(new Date(dayUTC + 21 * 3600000));
    const first = rareNight(candidates, PRAGUE, pragueInstant(dayUTC, 13), 430, 520);
    for (let hour = 13; hour <= 35; hour++) {
      const out = rareNight(candidates, PRAGUE, pragueInstant(dayUTC, hour), 430, 520);
      assert.deepEqual(out, first, `${label}: local hour ${hour} disagreed with the afternoon before`);
    }
  }
});

// --- night-stability, the requirement the brief's tests missed -------------

test("a rare night holds steady when the positions are re-read all night", () => {
  // The fixture's positions genuinely move from snapshot to snapshot, so this
  // is the test for "identical on every open": it is what the app does when it
  // recomputes `rareCandidates` on every render. The verdict must not budge.
  //
  // A planet's drawn position does follow the positions it is handed, by a
  // fraction of a pixel across one night, so coordinates are compared with a
  // tolerance while the verdict itself is compared exactly.
  for (let n = 0; n < HOURLY_NIGHTS.length; n++) {
    const { label, dayUTC, expected } = HOURLY_NIGHTS[n];
    const snapshots = HOURLY_FIXTURE[n];
    assert.ok(snapshots?.length === 9, `${label}: expected nine snapshots`);

    let reference: RareNight = null;
    let referenceSeen = false;
    for (const [hour, ...row] of snapshots) {
      const out = rareNight(candidatesFrom(row), PRAGUE, pragueInstant(dayUTC, hour), 430, 520);
      assert.equal(out?.kind ?? null, expected, `${label}: local hour ${hour} gave ${out?.kind ?? "null"}`);
      if (!referenceSeen) {
        reference = out;
        referenceSeen = true;
        continue;
      }
      if (reference === null || out === null) {
        assert.equal(out, reference, `${label}: local hour ${hour} appeared or vanished`);
        continue;
      }
      assert.ok(Math.abs(out.x - reference.x) < 1, `${label}: x moved ${out.x - reference.x}px`);
      assert.ok(Math.abs(out.y - reference.y) < 1, `${label}: y moved ${out.y - reference.y}px`);
      if (out.kind === "galaxy" && reference.kind === "galaxy") {
        assert.deepEqual(out, reference, `${label}: the band changed at local hour ${hour}`);
      }
    }
  }
});

test("adjacent nights are not all the same, so night-keying is not a constant", () => {
  // Guards against the obvious way to pass the stability test: always return
  // null, or always return the same thing.
  const verdicts = new Set<string>();
  for (let day = 0; day < 120; day++) {
    const dayUTC = Date.UTC(2026, 0, 1 + day);
    const candidates = YEAR_FIXTURE_CANDIDATES(new Date(dayUTC + 21 * 3600000));
    const out = rareNight(candidates, PRAGUE, pragueInstant(dayUTC, 22), 430, 520);
    verdicts.add(out?.kind ?? "null");
  }
  assert.ok(verdicts.size > 1, "every night in four months gave the same verdict");
});

// --- the per-night count, and that both halves are reachable ---------------

test("the simulated year is 12 nights from Prague: 7 galaxy and 5 planet", () => {
  // Per-night occurrence, measured as in the band test above. The exact split
  // is a change detector rather than a requirement - the requirement is the
  // 6 to 24 band and that neither half is dead code.
  let galaxy = 0;
  let planet = 0;
  for (let day = 0; day < 365; day++) {
    const dayUTC = Date.UTC(2026, 0, 1 + day);
    const candidates = YEAR_FIXTURE_CANDIDATES(new Date(Date.UTC(2026, 0, 1 + day, 21, 0)));
    const kinds = new Set<string>();
    for (const hour of DARK_HOURS) {
      const out = rareNight(candidates, PRAGUE, pragueInstant(dayUTC, hour), 430, 520);
      if (out) kinds.add(out.kind);
    }
    if (kinds.has("galaxy")) galaxy++;
    else if (kinds.has("planet")) planet++;
  }
  assert.ok(galaxy > 0, "no galaxy night anywhere in the year: the galaxy half is dead code");
  assert.ok(planet > 0, "no planet night anywhere in the year: the planet half is dead code");
  assert.equal(galaxy, 7, `galaxy nights: ${galaxy}`);
  assert.equal(planet, 5, `planet nights: ${planet}`);
});

test("the galaxy is reachable at southern and at northern latitudes alike", () => {
  // The previous rule anchored the band on the galactic core, whose culmination
  // altitude from Prague is 90 - |50.08 + 28.94| = 10.98 degrees - permanently
  // under any sensible floor, so the galaxy could never happen at the one
  // latitude that matters. Anchoring on the best-placed point of the band fixes
  // that, and this is the test that would catch it coming back.
  const summerNight = pragueInstant(Date.UTC(2026, 8, 9), 22);
  const fromPrague = rareNight({ galacticCentre: { ...GALACTIC_CENTRE }, planets: [] }, PRAGUE, summerNight, 430, 520);
  assert.equal(fromPrague?.kind, "galaxy", "Prague should get galaxy nights in late summer");

  const sydney = { latitude: -33.87, longitude: 151.21 };
  const sydneyNight = new Date(Date.UTC(2026, 6, 1) + 22 * 3600000 - (151.21 / 15) * 3600000);
  const fromSydney = rareNight({ galacticCentre: { ...GALACTIC_CENTRE }, planets: [] }, sydney, sydneyNight, 430, 520);
  assert.equal(fromSydney?.kind, "galaxy", "Sydney should get galaxy nights in July");
});

test("the band anchors on Cygnus from Prague and on Sagittarius from Sydney", () => {
  // Independent check that the anchor follows the sky rather than a constant.
  // Deneb (Cygnus, galactic longitude 84) and Shaula (by the core, galactic
  // longitude 352) are published positions; whichever of them the band's centre
  // passes closest to during the night says which stretch was chosen.
  const closestApproach = (band: RareNight, observer: Observer, dayUTC: number, ra: number, dec: number): number => {
    assert.ok(band, "expected a band");
    if (!band) return Infinity;
    let best = Infinity;
    for (let hour = 19; hour <= 25; hour += 0.5) {
      const date = new Date(dayUTC + hour * 3600000 - (observer.longitude / 15) * 3600000);
      const { altitude, azimuth } = horizontal({ ra, dec, mag: 2 }, observer, date);
      const p = project(altitude, azimuth, 430, 520);
      if (p) best = Math.min(best, Math.hypot(p.x - band.x, p.y - band.y));
    }
    return best;
  };

  const pragueDay = Date.UTC(2026, 8, 9);
  const pragueBand = rareNight(
    { galacticCentre: { ...GALACTIC_CENTRE }, planets: [] }, PRAGUE, pragueInstant(pragueDay, 22), 430, 520,
  );
  const pragueDeneb = closestApproach(pragueBand, PRAGUE, pragueDay, 20.6905, 45.2803);
  const pragueShaula = closestApproach(pragueBand, PRAGUE, pragueDay, 17.5601, -37.104);
  assert.ok(pragueDeneb < 20, `from Prague the band should sit in Cygnus, but Deneb is ${pragueDeneb.toFixed(0)}px away`);
  assert.ok(pragueShaula > 100, `from Prague the band should not be in Sagittarius (${pragueShaula.toFixed(0)}px)`);

  const sydney = { latitude: -33.87, longitude: 151.21 };
  const sydneyDay = Date.UTC(2026, 6, 1);
  const sydneyBand = rareNight(
    { galacticCentre: { ...GALACTIC_CENTRE }, planets: [] },
    sydney, new Date(sydneyDay + 22 * 3600000 - (151.21 / 15) * 3600000), 430, 520,
  );
  const sydneyShaula = closestApproach(sydneyBand, sydney, sydneyDay, 17.5601, -37.104);
  const sydneyDeneb = closestApproach(sydneyBand, sydney, sydneyDay, 20.6905, 45.2803);
  assert.ok(sydneyShaula < 20, `from Sydney the band should sit by the core, but Shaula is ${sydneyShaula.toFixed(0)}px away`);
  assert.ok(sydneyDeneb > 100, `from Sydney the band should not be in Cygnus (${sydneyDeneb.toFixed(0)}px)`);
});

// --- the geometry ----------------------------------------------------------

test("the band is oriented along the real galactic plane, not an arbitrary angle", () => {
  // Independent check on the galactic rotation inside `rareNight`, using
  // published galactic latitudes of real stars. Measured perpendicular to the
  // returned band line, a star's distance from the line must scale with how far
  // off the galactic plane it actually is. Nothing here comes from sky.ts.
  const dayUTC = Date.UTC(2026, 8, 9);
  const band = rareNight({ galacticCentre: { ...GALACTIC_CENTRE }, planets: [] }, PRAGUE, pragueInstant(dayUTC, 22), 430, 520);
  assert.equal(band?.kind, "galaxy");
  if (band?.kind !== "galaxy") return;

  const radians = Math.PI / 180;
  const ux = Math.cos(band.angle * radians);
  const uy = Math.sin(band.angle * radians);
  const offLine = (ra: number, dec: number, date: Date): number => {
    const { altitude, azimuth } = horizontal({ ra, dec, mag: 2 }, PRAGUE, date);
    const p = project(altitude, azimuth, 430, 520);
    if (!p) return Infinity;
    return Math.abs((p.x - band.x) * uy - (p.y - band.y) * ux);
  };

  // The band is drawn at the night's peak moment, which the caller is not told.
  // Find it the honest way: the moment of the night at which the returned line
  // best fits Deneb, a star 2 degrees off the galactic plane. If the band were
  // oriented wrongly, no moment of the night would fit it at all.
  let fitted = pragueInstant(dayUTC, 19);
  let fit = Infinity;
  for (let hour = 19; hour <= 25; hour += 0.5) {
    const date = pragueInstant(dayUTC, hour);
    const d = offLine(20.6905, 45.2803, date);
    if (d < fit) {
      fit = d;
      fitted = date;
    }
  }
  assert.ok(fit < 10, `the band never lines up with Deneb: best fit ${fit.toFixed(1)}px`);

  // At that moment the plate scale is about 2.4px per degree, so distance from
  // the line must rise with |galactic latitude|.
  const nearPlane = [
    { name: "Sadr", ra: 20.3705, dec: 40.2567, b: 2.2 },
    { name: "Albireo", ra: 19.5120, dec: 27.9597, b: 4.6 },
    { name: "Capella", ra: 5.2782, dec: 45.9980, b: 4.6 },
  ];
  for (const s of nearPlane) {
    const d = offLine(s.ra, s.dec, fitted);
    assert.ok(d < 25, `${s.name} is ${s.b} deg off the plane but landed ${d.toFixed(1)}px off the band`);
  }
  const vega = offLine(18.6156, 38.7837, fitted);
  assert.ok(vega > 30, `Vega is 19 deg off the plane but landed only ${vega.toFixed(1)}px off the band`);
  assert.ok(offLine(20.3705, 40.2567, fitted) < vega, "the ordering by galactic latitude is wrong");
});

test("the band's geometry depends on the observer, which is why it is not a flag", () => {
  const dayUTC = Date.UTC(2026, 6, 1);
  const bands = [
    { latitude: -33.87, longitude: 151.21 },
    { latitude: -20, longitude: 151.21 },
  ].map((observer) =>
    rareNight(
      { galacticCentre: { ...GALACTIC_CENTRE }, planets: [] },
      observer,
      new Date(dayUTC + 22 * 3600000 - (151.21 / 15) * 3600000),
      430, 520,
    ),
  );
  for (const band of bands) assert.equal(band?.kind, "galaxy");
  const [south, north] = bands;
  if (south?.kind !== "galaxy" || north?.kind !== "galaxy") return;
  assert.ok(
    Math.abs(south.angle - north.angle) > 1 || Math.abs(south.y - north.y) > 10,
    "two observers a thousand kilometres apart got the same band geometry",
  );
});

test("every number in a returned geometry is finite and on the panel", () => {
  const seen = [
    rareNight({ galacticCentre: { ...GALACTIC_CENTRE }, planets: [] }, PRAGUE, pragueInstant(Date.UTC(2026, 8, 9), 22), 430, 520),
    rareNight(YEAR_FIXTURE_CANDIDATES(new Date(Date.UTC(2026, 1, 12, 21, 0))), PRAGUE, pragueInstant(Date.UTC(2026, 1, 12), 22), 430, 520),
  ];
  assert.equal(seen[0]?.kind, "galaxy");
  assert.equal(seen[1]?.kind, "planet");
  for (const out of seen) {
    if (!out) continue;
    assert.ok(Number.isFinite(out.x) && out.x >= 0 && out.x <= 430, `x ${out.x}`);
    assert.ok(Number.isFinite(out.y) && out.y >= 0 && out.y <= 520, `y ${out.y}`);
    if (out.kind === "galaxy") {
      assert.ok(Number.isFinite(out.angle) && out.angle > -90 && out.angle <= 90, `angle ${out.angle}`);
      assert.ok(Number.isFinite(out.length) && out.length > 0, `length ${out.length}`);
    } else {
      assert.ok(Number.isFinite(out.r) && out.r > 0, `r ${out.r}`);
      assert.ok(typeof out.colour === "string" && out.colour.length > 0);
    }
  }
});

// --- selection rules -------------------------------------------------------

test("when the galaxy and a planet both qualify, the galaxy wins and the planet is dropped", () => {
  // Each half is checked on its own first, so this cannot pass by both halves
  // simply failing - which is how the brief's own "never both" test can pass.
  const night = pragueInstant(Date.UTC(2026, 8, 9), 22);
  const planet = { ra: 21.262, dec: 50, mag: -4, name: "Venus", colour: "#F4E3B1" };

  const galaxyAlone = rareNight({ galacticCentre: { ...GALACTIC_CENTRE }, planets: [] }, PRAGUE, night, 430, 520);
  assert.equal(galaxyAlone?.kind, "galaxy", "the galaxy should qualify on its own");

  // Same night, with the core replaced by a circumpolar stand-in so only the
  // planet can qualify.
  const planetAlone = rareNight(
    { galacticCentre: { ...OFF_PLANE_CORE }, planets: [planet] }, PRAGUE, night, 430, 520,
  );
  assert.equal(planetAlone?.kind, "planet", "the planet should qualify on its own");

  const both = rareNight({ galacticCentre: { ...GALACTIC_CENTRE }, planets: [planet] }, PRAGUE, night, 430, 520);
  assert.equal(both?.kind, "galaxy", "with both qualifying, the galaxy must win");
});

test("a planet must be bright as well as high", () => {
  const night = pragueInstant(Date.UTC(2026, 8, 9), 22);
  const high = (mag: number) => rareNight(
    { galacticCentre: { ...OFF_PLANE_CORE }, planets: [{ ra: 21.262, dec: 50, mag, name: "Venus", colour: "#F4E3B1" }] },
    PRAGUE, night, 430, 520,
  );
  assert.equal(high(-3)?.kind, "planet", "a bright planet overhead qualifies");
  assert.equal(high(-1.9), null, "dimmer than the threshold is not rare, however high it is");
  assert.equal(high(1.2), null, "Saturn-bright is never a rare night");
});

test("a planet must be at its highest inside the night, not merely up", () => {
  // This planet is 80 degrees up when the dark window opens and still 52
  // degrees up at midnight - plainly "visible, and high". But it crossed the
  // meridian an hour before dusk, so the night never contains its best moment
  // and it is not a rare night.
  const night = pragueInstant(Date.UTC(2026, 8, 9), 22);
  const pastItsBest = { ra: 17.262, dec: 50, mag: -4, name: "Venus", colour: "#F4E3B1" };
  const atDusk = horizontal(pastItsBest, PRAGUE, pragueInstant(Date.UTC(2026, 8, 9), 19)).altitude;
  const atMidnight = horizontal(pastItsBest, PRAGUE, night).altitude;
  assert.ok(atDusk > 70, `the planet should be high at dusk: altitude ${atDusk}`);
  assert.ok(atMidnight > 45, `and still high at midnight: altitude ${atMidnight}`);
  assert.equal(
    rareNight({ galacticCentre: { ...OFF_PLANE_CORE }, planets: [pastItsBest] }, PRAGUE, night, 430, 520),
    null,
    "high all night but already past its best is an ordinary night",
  );
});

test("the brightest qualifying planet wins, with a stable tie-break", () => {
  const night = pragueInstant(Date.UTC(2026, 8, 9), 22);
  const pick = (planets: RareCandidates["planets"]) => rareNight(
    { galacticCentre: { ra: 0, dec: 89, mag: 2 }, planets }, PRAGUE, night, 430, 520,
  );
  const dim = { ra: 21.262, dec: 50, mag: -2.4, name: "Jupiter", colour: "#F2E6CF" };
  const bright = { ra: 21.262, dec: 50, mag: -4.4, name: "Venus", colour: "#F4E3B1" };

  const forwards = pick([dim, bright]);
  const backwards = pick([bright, dim]);
  assert.equal(forwards?.kind === "planet" && forwards.colour, bright.colour);
  assert.equal(backwards?.kind === "planet" && backwards.colour, bright.colour);

  const a = pick([bright]);
  const b = pick([dim]);
  assert.ok(a?.kind === "planet" && b?.kind === "planet" && a.r > b.r, "the brighter planet should be larger");

  const tie = pick([
    { ...dim, mag: -3, name: "Zeta", colour: "#111111" },
    { ...dim, mag: -3, name: "Alpha", colour: "#222222" },
  ]);
  assert.equal(tie?.kind === "planet" && tie.colour, "#222222");
});

test("only the best night of a block is rare, so a long run collapses", () => {
  // Jupiter qualifies on most nights of its apparition; a rule that fired on
  // all of them would make the rare night ordinary scenery for months. Count
  // the nights on which the planet qualifies at all, against the nights that
  // are actually returned, over the first four months.
  let returned = 0;
  for (let day = 0; day < 120; day++) {
    const dayUTC = Date.UTC(2026, 0, 1 + day);
    const candidates = YEAR_FIXTURE_CANDIDATES(new Date(dayUTC + 21 * 3600000));
    if (DARK_HOURS.some((hour) => rareNight(candidates, PRAGUE, pragueInstant(dayUTC, hour), 430, 520))) returned++;
  }
  assert.ok(returned >= 3 && returned <= 12, `four months should hold a handful of occasions, got ${returned}`);
});

// --- guards ----------------------------------------------------------------

test("malformed input returns null rather than a geometry full of NaN", () => {
  // `horizontal` returns NaN components by design, and a NaN in an SVG
  // coordinate renders nothing at all without raising anything, so this is the
  // guard that keeps a silent blank sky from happening.
  const night = pragueInstant(Date.UTC(2026, 8, 9), 22);
  const ok = { galacticCentre: { ...GALACTIC_CENTRE }, planets: [] };
  assert.equal(rareNight({ galacticCentre: { ra: NaN, dec: -28.94, mag: 2 }, planets: [] }, PRAGUE, night, 430, 520), null);
  assert.equal(rareNight({ galacticCentre: { ra: 17.761, dec: Infinity, mag: 2 }, planets: [] }, PRAGUE, night, 430, 520), null);
  assert.equal(rareNight(ok, { latitude: NaN, longitude: 0 }, night, 430, 520), null);
  assert.equal(rareNight(ok, { latitude: 50, longitude: NaN }, night, 430, 520), null);
  assert.equal(rareNight(ok, PRAGUE, new Date(NaN), 430, 520), null);
  assert.equal(rareNight(ok, PRAGUE, night, 0, 520), null);
  assert.equal(rareNight(ok, PRAGUE, night, 430, NaN), null);

  // A bad planet is skipped, not emitted, and does not take the good one down.
  const good = { ra: 21.262, dec: 50, mag: -4, name: "Venus", colour: "#F4E3B1" };
  const mixed = rareNight(
    {
      galacticCentre: { ra: 0, dec: 89, mag: 2 },
      planets: [
        { ra: NaN, dec: 50, mag: -4, name: "Bad", colour: "#fff" },
        { ra: 21.262, dec: NaN, mag: -4, name: "Bad", colour: "#fff" },
        { ra: 21.262, dec: 50, mag: NaN, name: "Bad", colour: "#fff" },
        { ra: 21.262, dec: 50, mag: -4, name: "Bad", colour: "" },
        good,
      ],
    },
    PRAGUE, night, 430, 520,
  );
  assert.equal(mixed?.kind, "planet");
  assert.equal(mixed?.kind === "planet" && mixed.colour, good.colour);
});

test("the galactic centre's placeholder magnitude is never consulted", () => {
  // `skyBodies.ts` invents a magnitude for the core because the Milky Way is a
  // surface-brightness feature with no meaningful point magnitude. Any
  // brightness test on it would be meaningless, so a nonsense value must change
  // nothing at all.
  const night = pragueInstant(Date.UTC(2026, 8, 9), 22);
  const base = rareNight(
    { galacticCentre: { ra: 17.761, dec: -28.94, mag: 2 }, planets: [] }, PRAGUE, night, 430, 520,
  );
  assert.equal(base?.kind, "galaxy", "sanity: this night must be a galaxy night for the test to mean anything");
  for (const mag of [-30, 0, 99, NaN]) {
    const out = rareNight(
      { galacticCentre: { ra: 17.761, dec: -28.94, mag }, planets: [] }, PRAGUE, night, 430, 520,
    );
    assert.deepEqual(out, base, `mag ${mag} changed the answer`);
  }
});

test("a core that is not on the galactic plane cannot define the band", () => {
  // Guard, not a nicety: the band is built by crossing the supplied core with
  // the galactic pole, so any other point would span an unrelated great circle
  // that would then be drawn as "the Milky Way". The real core is at galactic
  // latitude -0.05 degrees; a degree of slack is allowed, ten degrees is not.
  const night = pragueInstant(Date.UTC(2026, 8, 9), 22);
  const onPlane = rareNight({ galacticCentre: { ...GALACTIC_CENTRE }, planets: [] }, PRAGUE, night, 430, 520);
  assert.equal(onPlane?.kind, "galaxy", "sanity: the real core is accepted");

  for (const core of [
    { ra: 17.761, dec: -18.94, mag: 2 },  // ten degrees north of the plane
    { ra: 0, dec: 89, mag: 2 },           // near the celestial pole
    { ra: 6, dec: 0, mag: 2 },            // the right declination, the wrong place
  ]) {
    assert.equal(
      rareNight({ galacticCentre: core, planets: [] }, PRAGUE, night, 430, 520),
      null,
      `a core at ra ${core.ra}, dec ${core.dec} should not define a galactic plane`,
    );
  }
});

test("the night runs to dawn, so the verdict does not flip at midnight", () => {
  // Local 23:00 and local 01:00 are the same night. Keying on the calendar date
  // instead would split one night in two and could change the answer at
  // midnight, which is exactly when someone is most likely to be looking.
  const dayUTC = Date.UTC(2026, 8, 9);
  const candidates = YEAR_FIXTURE_CANDIDATES(new Date(dayUTC + 21 * 3600000));
  const beforeMidnight = rareNight(candidates, PRAGUE, pragueInstant(dayUTC, 23), 430, 520);
  const afterMidnight = rareNight(candidates, PRAGUE, pragueInstant(dayUTC, 25), 430, 520);
  assert.ok(beforeMidnight, "this night should be rare, or the test proves nothing");
  assert.deepEqual(afterMidnight, beforeMidnight);

  // And the following night is a different night, decided separately.
  const nextCandidates = YEAR_FIXTURE_CANDIDATES(new Date(dayUTC + 24 * 3600000 + 21 * 3600000));
  const nextNight = rareNight(nextCandidates, PRAGUE, pragueInstant(dayUTC + 86400000, 23), 430, 520);
  assert.notDeepEqual(nextNight, beforeMidnight, "two different nights returned the identical verdict");
});
