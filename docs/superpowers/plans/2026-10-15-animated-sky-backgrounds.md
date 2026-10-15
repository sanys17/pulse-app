# Animated Sky Backgrounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home screen's static mountain photograph with three time-of-day skies — morning, afternoon and night — each a still image carrying its own CSS motion, where night renders the real star pattern for the user's location.

**Architecture:** A still photograph sits at the back of the existing fixed 520px hero panel; all motion is composited CSS layers painted over it. Night additionally renders computed stars as SVG. All astronomical reasoning lives in one pure, testable module that takes positions as injected inputs; a thin adapter outside that boundary owns the catalogue and the `astronomy-engine` dependency.

**Tech Stack:** React 19, TypeScript, Vite, CSS animations, SVG, `astronomy-engine` (MIT, no dependencies). Tests run under `node --test` on pure modules only.

**Spec:** `docs/superpowers/specs/2026-10-15-animated-sky-backgrounds-design.md`

## Global Constraints

- Pure modules in `src/lib` import nothing but other pure modules, with `.ts` extensions — otherwise `npm test` cannot load them.
- `npm test` is `node --test tests/*.test.mts`. Test files import from `../src/lib/<name>.ts`.
- `npm run build` (`tsc -b && vite build`) is the real check. **Never** verify with `npx tsc --noEmit`; use `npx tsc -b`.
- No WebGL, no `requestAnimationFrame` loop. Animate composited layers (opacity, transform) only.
- No new `localStorage` entries.
- `prefers-reduced-motion` stops all sky motion; the sky itself remains.
- Do not use `crypto.randomUUID()`. Temp ids: `Date.now().toString(36) + Math.random().toString(36).slice(2, 7)`.
- Day boundaries: morning 05:00–11:00, afternoon 11:00–18:00, night 18:00–05:00, local time.
- The sky lives inside the existing fixed 520px panel in `src/pages/Home.tsx`. It does not become a full-viewport background.
- Keep `-webkit-` prefixes alongside `mask-image` and `backdrop-filter`.

## Review Focus

Five conditions the spec implies that no task's happy path exercises. Each has a test pinned to the task that owns the code.

1. **Unknown or malformed timezone string** (`"Mars/Olympus"`, `""`, a value absent from the table) — must fall back to a default observer, never throw. *Task 2.*
2. **Extreme latitude** (|lat| > 66°) — circumpolar stars and a sun that never sets must not produce `NaN` or an empty sky. *Task 4.*
3. **`NaN` reaching SVG coordinates** — an invalid `Date` or a bad observer silently breaks rendering, since `cx="NaN"` fails without an error. Every projected coordinate must be finite or the star is dropped. *Task 4.*
4. **Empty visible-star set** — aggressive horizon culling or a bad observer yields zero stars; the component must render an empty sky, not crash on an empty array. *Task 7.*
5. **Clock crossing a boundary while the app is open**, including a DST shift — the crossfade must fire once and settle, not thrash between two phases. *Task 1.*

---

### Task 1: Time of day and phase transitions

**Files:**
- Create: `src/lib/timeOfDay.ts`
- Create: `tests/timeOfDay.test.mts`

**Interfaces:**
- Produces: `type SkyPhase = "morning" | "afternoon" | "night"`; `skyPhase(date: Date): SkyPhase`; `nextBoundary(date: Date): Date`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { skyPhase, nextBoundary } from "../src/lib/timeOfDay.ts";

test("skyPhase maps each hour to its phase", () => {
  assert.equal(skyPhase(new Date(2026, 5, 1, 5, 0)), "morning");
  assert.equal(skyPhase(new Date(2026, 5, 1, 10, 59)), "morning");
  assert.equal(skyPhase(new Date(2026, 5, 1, 11, 0)), "afternoon");
  assert.equal(skyPhase(new Date(2026, 5, 1, 17, 59)), "afternoon");
  assert.equal(skyPhase(new Date(2026, 5, 1, 18, 0)), "night");
  assert.equal(skyPhase(new Date(2026, 5, 1, 4, 59)), "night");
  assert.equal(skyPhase(new Date(2026, 5, 1, 0, 0)), "night");
});

test("nextBoundary returns the next phase change, never the current time", () => {
  const at = new Date(2026, 5, 1, 9, 30);
  const next = nextBoundary(at);
  assert.equal(next.getHours(), 11);
  assert.ok(next.getTime() > at.getTime());
});

test("nextBoundary at 23:00 rolls to 05:00 the next day", () => {
  const next = nextBoundary(new Date(2026, 5, 1, 23, 0));
  assert.equal(next.getHours(), 5);
  assert.equal(next.getDate(), 2);
});

test("nextBoundary exactly on a boundary returns the following one, not now", () => {
  const next = nextBoundary(new Date(2026, 5, 1, 11, 0));
  assert.equal(next.getHours(), 18);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../src/lib/timeOfDay.ts`

- [ ] **Step 3: Implement `skyPhase` and `nextBoundary` in `src/lib/timeOfDay.ts`**

Boundaries at hours 5, 11 and 18 local. Export the boundary hours as a named constant so Task 10 can reuse them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Write the failing test for the scheduling hook's timer arithmetic**

The DST and double-fire concern from Review Focus #5 is arithmetic, so test it here rather than in the component:

```ts
test("delay to next boundary is positive across a DST-style clock jump", () => {
  // 2026-03-29 is the European spring-forward date; 02:00 local does not exist.
  const at = new Date(2026, 2, 29, 1, 30);
  const delay = nextBoundary(at).getTime() - at.getTime();
  assert.ok(delay > 0, "delay must never be zero or negative");
  assert.ok(delay <= 24 * 60 * 60 * 1000, "delay must never exceed a day");
});
```

- [ ] **Step 6: Run test, implement if it fails, verify it passes**

Run: `npm test`
Expected: PASS. If the delay is non-positive, clamp to the following boundary rather than returning a past time — a zero delay is what causes a timer to thrash.

- [ ] **Step 7: Commit**

```bash
git add src/lib/timeOfDay.ts tests/timeOfDay.test.mts
git commit -m "feat: time-of-day phase boundaries for the sky background"
```

---

### Task 2: Observer location from timezone

**Files:**
- Create: `src/lib/observer.ts`
- Create: `src/data/timezoneCoords.ts`
- Create: `tests/observer.test.mts`

**Interfaces:**
- Produces: `type Observer = { latitude: number; longitude: number }`; `observerFromTimeZone(tz: string | undefined): Observer`; `DEFAULT_OBSERVER: Observer`

**Data:** `src/data/timezoneCoords.ts` exports `const TIMEZONE_COORDS: Record<string, [number, number]>` — IANA zone name to `[latitude, longitude]`, derived from the tz database's `zone.tab` (public domain). Generate it once by converting `zone.tab`'s DMS coordinates to decimal degrees; commit the output, not the generator. It must be a plain `.ts` data module with no imports, so `src/lib/observer.ts` stays pure.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { observerFromTimeZone, DEFAULT_OBSERVER } from "../src/lib/observer.ts";

test("a known zone resolves to plausible coordinates", () => {
  const prague = observerFromTimeZone("Europe/Prague");
  assert.ok(Math.abs(prague.latitude - 50.08) < 1);
  assert.ok(Math.abs(prague.longitude - 14.44) < 1);
});

test("unknown, empty and undefined zones fall back without throwing", () => {
  for (const bad of ["Mars/Olympus", "", "   ", undefined, "Not/A/Zone"]) {
    const o = observerFromTimeZone(bad as string | undefined);
    assert.deepEqual(o, DEFAULT_OBSERVER);
  }
});

test("every coordinate in the table is within valid bounds", () => {
  const o = observerFromTimeZone("America/New_York");
  assert.ok(o.latitude >= -90 && o.latitude <= 90);
  assert.ok(o.longitude >= -180 && o.longitude <= 180);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../src/lib/observer.ts`

- [ ] **Step 3: Generate `src/data/timezoneCoords.ts` and implement `observerFromTimeZone` in `src/lib/observer.ts`**

`DEFAULT_OBSERVER` is a mid-latitude northern location — use `Europe/Prague`'s coordinates, since that is the user's own zone and makes the fallback invisible to them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/observer.ts src/data/timezoneCoords.ts tests/observer.test.mts
git commit -m "feat: derive observer coordinates from the browser timezone"
```

---

### Task 3: Star catalogue data

**Files:**
- Create: `scripts/build-star-catalogue.mjs`
- Create: `src/data/stars.ts`
- Create: `tests/stars.test.mts`

**Interfaces:**
- Produces: `type CatalogueStar = { ra: number; dec: number; mag: number }`; `const STARS: readonly CatalogueStar[]`

`ra` in hours (0–24), `dec` in degrees (−90 to +90), both J2000. Source: the Yale Bright Star Catalogue, which is effectively public domain — chosen over HYG specifically to avoid HYG's share-alike condition. Filter to magnitude ≤ 4.5 (roughly 500 stars). Round to three decimals.

The script is committed for reproducibility but is **not** part of the build; its output is what ships.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { STARS } from "../src/data/stars.ts";

test("catalogue is a plausible naked-eye star set", () => {
  assert.ok(STARS.length > 300 && STARS.length < 1200, `got ${STARS.length}`);
});

test("every star has in-range, finite coordinates", () => {
  for (const s of STARS) {
    assert.ok(Number.isFinite(s.ra) && s.ra >= 0 && s.ra < 24);
    assert.ok(Number.isFinite(s.dec) && s.dec >= -90 && s.dec <= 90);
    assert.ok(Number.isFinite(s.mag) && s.mag <= 4.5);
  }
});

test("catalogue contains Sirius, as a sanity check on the conversion", () => {
  const sirius = STARS.find((s) => Math.abs(s.ra - 6.752) < 0.02 && Math.abs(s.dec + 16.716) < 0.2);
  assert.ok(sirius, "Sirius (RA 6h45m, Dec -16.7) must be present");
  assert.ok(sirius.mag < -1, "Sirius is the brightest star; magnitude must be below -1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../src/data/stars.ts`

- [ ] **Step 3: Write `scripts/build-star-catalogue.mjs` and run it to produce `src/data/stars.ts`**

The script reads a downloaded Yale BSC file, converts sexagesimal RA/Dec to decimal, filters by magnitude and writes the `.ts` module. Keep the downloaded source file out of the repo.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. The Sirius assertion is the one that catches a units or sign error in the conversion.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-star-catalogue.mjs src/data/stars.ts tests/stars.test.mts
git commit -m "feat: committed naked-eye star catalogue"
```

---

### Task 4: Sky projection maths

**Files:**
- Create: `src/lib/sky.ts`
- Create: `tests/sky.test.mts`

**Interfaces:**
- Consumes: `CatalogueStar` (Task 3), `Observer` (Task 2)
- Produces:
  - `type SkyBody = { ra: number; dec: number; mag: number }`
  - `type ProjectedStar = { x: number; y: number; r: number; opacity: number }`
  - `horizontal(body: SkyBody, observer: Observer, date: Date): { altitude: number; azimuth: number }`
  - `project(altitude: number, azimuth: number, width: number, height: number): { x: number; y: number } | null`
  - `projectStars(stars: readonly CatalogueStar[], observer: Observer, date: Date, width: number, height: number): ProjectedStar[]`

`horizontal` converts equatorial to horizontal coordinates via local sidereal time — the standard transform. `project` maps a point above the horizon onto the panel using a zenith-centred stereographic projection, returning `null` for anything below the horizon or off-panel. Magnitude maps to radius and opacity: brighter stars larger and more opaque.

**Fixtures must come from outside this module.** Asserting against values this code produced would catch nothing. Use positions read from Stellarium for the named stars below, or an equivalent published worked example, and record the source in a comment at the top of the test file. If no external fixture is obtained, say so in that comment rather than letting the tests imply a verification that did not happen.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { horizontal, project, projectStars } from "../src/lib/sky.ts";

// Fixture source: <Stellarium / almanac reference — record which, and the exact settings>
const PRAGUE = { latitude: 50.08, longitude: 14.44 };

test("Polaris sits at an altitude equal to the observer's latitude", () => {
  const polaris = { ra: 2.530, dec: 89.264, mag: 1.98 };
  const { altitude } = horizontal(polaris, PRAGUE, new Date(Date.UTC(2026, 0, 15, 22, 0)));
  assert.ok(Math.abs(altitude - PRAGUE.latitude) < 1.0, `got ${altitude}`);
});

test("a star below the horizon reports negative altitude", () => {
  const southern = { ra: 6.752, dec: -60, mag: 2 };
  const { altitude } = horizontal(southern, PRAGUE, new Date(Date.UTC(2026, 5, 1, 12, 0)));
  assert.ok(altitude < 0, `got ${altitude}`);
});

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

test("brighter stars are larger and more opaque than dimmer ones", () => {
  const [bright, dim] = projectStars(
    [{ ra: 6, dec: 50, mag: 0 }, { ra: 6.01, dec: 50, mag: 4.4 }],
    PRAGUE, new Date(Date.UTC(2026, 0, 15, 22, 0)), 430, 520,
  );
  assert.ok(bright.r > dim.r && bright.opacity > dim.opacity);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../src/lib/sky.ts`

- [ ] **Step 3: Implement `horizontal`, `project` and `projectStars` in `src/lib/sky.ts`**

Guard every return: if any input or intermediate is non-finite, drop the star rather than emitting it. That guard is what Review Focus #3 depends on — `cx="NaN"` fails silently in SVG, with no error anywhere.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. The Polaris assertion is the one that catches a sign error in the transform; treat a failure there as a maths bug, not a tolerance problem.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sky.ts tests/sky.test.mts
git commit -m "feat: equatorial-to-screen star projection"
```

---

### Task 5: The rare night

**Files:**
- Modify: `src/lib/sky.ts`
- Modify: `tests/sky.test.mts`

**Interfaces:**
- Produces:
  - `type RareNight = { kind: "galaxy"; x: number; y: number; angle: number; length: number } | { kind: "planet"; x: number; y: number; r: number; colour: string } | null`
  - `rareNight(candidates: RareCandidates, observer: Observer, date: Date, width: number, height: number): RareNight`
  - `type RareCandidates = { galacticCentre: SkyBody; planets: ReadonlyArray<SkyBody & { name: string; colour: string }> }`

Rarity is the requirement, not visibility. A planet qualifies only when both high and bright; the galaxy only when its core is comfortably high during evening hours. When both qualify, return one. The galaxy's `angle` is computed from the galactic plane's orientation at that moment — it changes with hour and latitude, which is why this returns a geometry rather than a flag.

Thresholds are yours to choose. The simulated-year count is how you know they are right.

- [ ] **Step 1: Write the failing test**

```ts
import { rareNight } from "../src/lib/sky.ts";

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
  if (out) {
    assert.equal(out.kind, "galaxy");
    assert.ok(Number.isFinite(out.angle) && Number.isFinite(out.x) && Number.isFinite(out.y));
  }
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
  let count = 0;
  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2026, 0, 1 + day, 21, 0));
    const out = rareNight(YEAR_FIXTURE_CANDIDATES(date), PRAGUE, date, 430, 520);
    if (out) count++;
  }
  assert.ok(count >= 6 && count <= 24, `expected roughly monthly, got ${count} nights`);
});

test("the same night always gives the same answer", () => {
  const date = new Date(Date.UTC(2026, 6, 15, 21, 0));
  const a = rareNight(YEAR_FIXTURE_CANDIDATES(date), PRAGUE, date, 430, 520);
  const b = rareNight(YEAR_FIXTURE_CANDIDATES(date), PRAGUE, date, 430, 520);
  assert.deepEqual(a, b);
});
```

`YEAR_FIXTURE_CANDIDATES(date)` is a helper in the test file: the fixed galactic centre plus planet positions for that date. Generate those positions once from the Task 6 adapter and inline them as data, so this pure test stays free of the dependency.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `rareNight` is not exported

- [ ] **Step 3: Implement `rareNight` in `src/lib/sky.ts`**

- [ ] **Step 4: Run tests and tune the thresholds until the count lands in band**

Run: `npm test`
Expected: PASS. If the count comes out at 200, the thresholds are too loose and the feature is broken even though every other test passes — that is exactly what this test exists to catch.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sky.ts tests/sky.test.mts
git commit -m "feat: rare-night galaxy and planet selection"
```

---

### Task 6: Astronomy adapter

**Files:**
- Create: `src/lib/skyBodies.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SkyBody`, `RareCandidates` (Tasks 4–5), `STARS` (Task 3)
- Produces: `rareCandidates(date: Date, observer: Observer): RareCandidates`

This module is **deliberately outside the pure boundary** — it is the only place importing `astronomy-engine` and the catalogue, and it is not covered by `npm test`. Keep it thin: look up planet positions and the galactic centre, return plain data. All judgement stays in `sky.ts`.

Planets: Venus, Mars, Jupiter, Saturn, each with a colour. Use the library's `Equator` → `Horizon` pair. The galactic centre is a fixed point (RA 17h45.7m, Dec −28.94°) and needs no library call.

- [ ] **Step 1: Install the dependency**

```bash
npm install astronomy-engine
```

- [ ] **Step 2: Implement `rareCandidates` in `src/lib/skyBodies.ts`**

- [ ] **Step 3: Verify the build and measure the real bundle cost**

Run: `npm run build`
Expected: build passes. Note the reported chunk sizes before and after this task; if `astronomy-engine` adds more than a few hundred KB, import only the specific functions needed and re-check before moving on.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/skyBodies.ts
git commit -m "feat: planet and galactic-centre positions via astronomy-engine"
```

---

### Task 7: Night sky component

**Files:**
- Create: `src/components/NightSky.tsx`

**Interfaces:**
- Consumes: `projectStars`, `rareNight` (Tasks 4–5), `rareCandidates` (Task 6), `STARS` (Task 3), `Observer` (Task 2)
- Produces: `<NightSky observer={Observer} width={number} height={number} active={boolean} />`

One `<svg>` filling the panel. Stars split into **three `<g>` groups**, each group's opacity animated on its own cycle (≈6.5s, 9s, 12s, offset) — three animated elements regardless of star count. This is a performance requirement, not a style choice: per-star animation is what it exists to avoid.

Recompute positions every 5 minutes, and only while `active` is true. Render the rare night, when present, as an SVG band (galaxy) or a glowing circle (planet) above the star groups.

- [ ] **Step 1: Verify it renders an empty sky without crashing**

Temporarily render `<NightSky>` with an observer that yields no visible stars, confirm the page still renders, then remove the temporary usage. This is Review Focus #4 — an empty array must be a blank sky, not a crash.

- [ ] **Step 2: Implement `NightSky.tsx`**

Assign stars to groups by index (`i % 3`), not by brightness — grouping by brightness would make all the bright stars pulse together.

- [ ] **Step 3: Add the reduced-motion rule**

Under `@media (prefers-reduced-motion: reduce)`, set `animation: none` on the three star-group
classes. Stars still render in their correct positions — only the twinkle stops. The rare
night's galaxy band and planet remain visible and static.

- [ ] **Step 4: Verify the build**

Run: `npx tsc -b && npm run build`
Expected: both pass

- [ ] **Step 5: Commit**

```bash
git add src/components/NightSky.tsx src/index.css
git commit -m "feat: night sky with real star positions"
```

---

### Task 8: Daylight light layers

**Files:**
- Create: `src/components/SkyLight.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `<SkyLight phase={"morning" | "afternoon"} sunX={number} sunY={number} active={boolean} />`

`sunX`/`sunY` are normalized 0–1 positions measured from the delivered photograph — **image first**: the user generates a sky, you measure where the sun landed and pass it in. Never ask the generator for exact coordinates.

Two effects, both anchored at the sun:

- **Breathing glow** — radial gradient, scale ≈1.00→1.09, ≈11s, always running while `active`.
- **Reaching beams** — conic-gradient wedges whose point sits on the sun, masked radially so they fade with distance, animated by scaling from the element's centre so light grows outward and dissolves.

Phase sets the rhythm only: morning uses cycles of ≈23s and 31s with long quiet gaps; afternoon uses ≈13s, 17s and 21s so the sky is rarely at rest. Deliberately non-multiple durations keep the pattern from repeating audibly.

Keyframes belong in `src/index.css` next to the existing animation utilities, not inline.

- [ ] **Step 1: Implement `SkyLight.tsx` and its keyframes**

Each beam's visible pass must occupy a small fraction of its cycle — the stillness between passes is the effect, and a beam that is always visible is the failure mode.

- [ ] **Step 2: Add the reduced-motion rule**

Under `@media (prefers-reduced-motion: reduce)`, set `animation: none` on the glow and beam classes. The glow remains visible, simply static.

- [ ] **Step 3: Verify the build**

Run: `npx tsc -b && npm run build`
Expected: both pass

- [ ] **Step 4: Commit**

```bash
git add src/components/SkyLight.tsx src/index.css
git commit -m "feat: sun glow and reaching beams for day skies"
```

---

### Task 9: Afternoon cloud drift

**Files:**
- Create: `src/components/SkyClouds.tsx`

**Interfaces:**
- Produces: `<SkyClouds active={boolean} />`

A layer translating horizontally, looping seamlessly. **Minimal** motion — a full traverse takes three minutes or more; err slower.

If the transparent, horizontally tileable cloud asset proves impractical — the likeliest asset to fail — fall back to hand-authored cloud: a few large, heavily blurred soft shapes at low opacity. Do not drop the drift and do not ship a visible seam. At this speed, behind a scrim, crude shapes read acceptably; `.superpowers/brainstorm/afternoon.html` demonstrates it.

- [ ] **Step 1: Implement `SkyClouds.tsx`**

Duplicate the cloud content end to end and translate by exactly 50% so the loop has no seam.

- [ ] **Step 2: Verify the build, then watch one full loop for a visible jump**

Run: `npm run build`, then view on the dev server across a full cycle.
Expected: build passes; no discontinuity at the wrap.

- [ ] **Step 3: Commit**

```bash
git add src/components/SkyClouds.tsx public/assets/
git commit -m "feat: minimal afternoon cloud drift"
```

---

### Task 10: Wire the sky into Home

**Files:**
- Modify: `src/pages/Home.tsx:337` (the `bgImage` constant and the fixed background block at lines ~394–440)
- Create: `src/hooks/useSkyActive.ts`

**Interfaces:**
- Consumes: everything above
- Produces: `useSkyActive(): boolean` — false when the document is hidden

Replace the hardcoded `const bgImage = "/assets/mount.webp"` and its `TODO`. The phase picks the photograph; two stacked `<img>` layers crossfade on a phase change rather than cutting. Schedule the change with `nextBoundary` from Task 1.

`useSkyActive` listens to `visibilitychange` and returns false while hidden; pass it as `active` to every sky component so nothing animates unseen. The panel is `position: fixed` and effectively always in view, so the hidden-document case is the one that matters.

Reduce the **radial scrim** at `Home.tsx:510` — lower its inner `rgba(7,7,12,0.82)` stop, leaving the outer stops roughly as they are. Leave the bottom fade at `Home.tsx:434` **untouched**; it joins the panel to the page and is not part of this change.

- [ ] **Step 1: Implement `useSkyActive` and wire the sky layers into the hero panel**

Layer order back to front: photograph, motion layers, stars (night only), existing grain, scrim, hero content. The arc's geometry constants and the existing content must not move.

- [ ] **Step 2: Verify the build**

Run: `npx tsc -b && npm run build`
Expected: both pass

- [ ] **Step 3: Check contrast on the afternoon sky**

Afternoon is the brightest sky and therefore the binding case. For the streak number and each text row inside the panel, sample the **brightest** region of the composited background within that element's box and measure the ratio against `docs/design-system.md` §8. If it fails only on afternoon, keep the heavier scrim on afternoon alone rather than raising it everywhere.

- [ ] **Step 4: Verify on a real iPhone as an installed PWA**

Required for anything visual per `docs/design-system.md` §10. Confirm: all three skies read correctly on OLED; the crossfade is not a visible glitch; no motion at all with Reduce Motion enabled; the device does not warm noticeably after a few minutes on Home.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Home.tsx src/hooks/useSkyActive.ts
git commit -m "feat: time-of-day sky backgrounds on the Home screen"
```

---

## Not in this plan

Tracked in `handoff.md`, deliberately out of scope:

- Reverting the dev auth bypass at `src/App.tsx:40`.
- Removing the unused `react-circular-progressbar` dependency.
- Deleting the superseded mountain photographs from `public/assets`, which should follow once the new skies land.
