import { test } from "node:test";
import assert from "node:assert/strict";
import { completedDateKey, toDateKey } from "../src/lib/dateKey.ts";

// These assertions hold in every timezone once the conversion is local. The old
// toISOString().slice(0, 10) fails at least one of them wherever the UTC offset is
// not zero: east of UTC the late-evening case rolls forward, west of it the
// early-morning case rolls back.
test("toDateKey uses the local calendar day, not UTC", () => {
  assert.equal(toDateKey(new Date(2026, 9, 16, 23, 30)), "2026-10-16");
  assert.equal(toDateKey(new Date(2026, 0, 5, 0, 15)), "2026-01-05");
});

test("toDateKey pads month and day", () => {
  assert.equal(toDateKey(new Date(2026, 0, 1, 12, 0)), "2026-01-01");
  assert.equal(toDateKey(new Date(2026, 11, 31, 12, 0)), "2026-12-31");
});

test("a completion just before local midnight belongs to that day", () => {
  const iso = new Date(2026, 9, 16, 23, 59).toISOString();
  assert.equal(completedDateKey(iso), "2026-10-16");
});

test("a completion just after local midnight belongs to the new day", () => {
  const iso = new Date(2026, 9, 17, 0, 1).toISOString();
  assert.equal(completedDateKey(iso), "2026-10-17");
});

test("a task with no completion has no key", () => {
  assert.equal(completedDateKey(null), null);
});
