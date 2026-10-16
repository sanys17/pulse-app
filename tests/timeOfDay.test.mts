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

test("delay to next boundary is positive across a DST-style clock jump", () => {
  // 2026-03-29 is the European spring-forward date; 02:00 local does not exist.
  const at = new Date(2026, 2, 29, 1, 30);
  const delay = nextBoundary(at).getTime() - at.getTime();
  assert.ok(delay > 0, "delay must never be zero or negative");
  assert.ok(delay <= 24 * 60 * 60 * 1000, "delay must never exceed a day");
});
