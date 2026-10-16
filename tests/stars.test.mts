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
