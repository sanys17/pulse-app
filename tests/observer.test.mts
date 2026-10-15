import { test } from "node:test";
import assert from "node:assert/strict";
import { observerFromTimeZone, DEFAULT_OBSERVER } from "../src/lib/observer.ts";
import { TIMEZONE_COORDS } from "../src/data/timezoneCoords.ts";

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

test("every coordinate in the table is finite and within valid bounds", () => {
  const entries = Object.entries(TIMEZONE_COORDS);
  assert.ok(entries.length > 400, "table should hold the full zone.tab set");
  for (const [zone, [lat, lon]] of entries) {
    assert.ok(Number.isFinite(lat) && Number.isFinite(lon), `${zone} not finite`);
    assert.ok(lat >= -90 && lat <= 90, `${zone} latitude out of range`);
    assert.ok(lon >= -180 && lon <= 180, `${zone} longitude out of range`);
  }
});
