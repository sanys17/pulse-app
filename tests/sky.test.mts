import { test } from "node:test";
import assert from "node:assert/strict";
import { horizontal, project, projectStars } from "../src/lib/sky.ts";

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
