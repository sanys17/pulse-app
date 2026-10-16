import { test } from "node:test";
import assert from "node:assert/strict";
import { cadenceLabel, dayNumber, isDueOn, type Cadence } from "../src/lib/cadence.ts";

test("daily is due every day", () => {
  assert.equal(isDueOn({ kind: "daily" }, "2026-10-16"), true);
  assert.equal(isDueOn({ kind: "daily" }, "2026-12-25"), true);
});

test("every 2 days counts from the start date", () => {
  const c: Cadence = { kind: "interval", days: 2, startDate: "2026-10-16" };
  assert.equal(isDueOn(c, "2026-10-16"), true);
  assert.equal(isDueOn(c, "2026-10-17"), false);
  assert.equal(isDueOn(c, "2026-10-18"), true);
});

test("every 3 days counts from the start date", () => {
  const c: Cadence = { kind: "interval", days: 3, startDate: "2026-10-16" };
  assert.equal(isDueOn(c, "2026-10-17"), false);
  assert.equal(isDueOn(c, "2026-10-18"), false);
  assert.equal(isDueOn(c, "2026-10-19"), true);
});

test("an interval habit is not due before its start date", () => {
  const c: Cadence = { kind: "interval", days: 2, startDate: "2026-10-20" };
  assert.equal(isDueOn(c, "2026-10-16"), false);
  assert.equal(isDueOn(c, "2026-10-18"), false);
});

test("an interval spanning a DST change keeps its parity", () => {
  // Europe/Prague turns the clocks back on 2026-10-25.
  const c: Cadence = { kind: "interval", days: 2, startDate: "2026-10-23" };
  assert.equal(isDueOn(c, "2026-10-26"), false);
  assert.equal(isDueOn(c, "2026-10-27"), true);
});

test("weekdays is due only on its own days", () => {
  const c: Cadence = { kind: "weekdays", days: [1, 3, 5] }; // Mon, Wed, Fri
  assert.equal(isDueOn(c, "2026-10-16"), true); // Friday
  assert.equal(isDueOn(c, "2026-10-17"), false); // Saturday
  assert.equal(isDueOn(c, "2026-10-19"), true); // Monday
});

test("an empty weekday set is never due", () => {
  assert.equal(isDueOn({ kind: "weekdays", days: [] }, "2026-10-16"), false);
});

test("dayNumber is whole days and ignores the local clock", () => {
  assert.equal(dayNumber("2026-10-17") - dayNumber("2026-10-16"), 1);
  assert.equal(dayNumber("2026-10-27") - dayNumber("2026-10-23"), 4);
});

test("labels name the cadence", () => {
  assert.equal(cadenceLabel({ kind: "daily" }), "Every day");
  assert.equal(cadenceLabel({ kind: "interval", days: 2, startDate: "2026-10-16" }), "Every 2 days");
  assert.equal(cadenceLabel({ kind: "interval", days: 3, startDate: "2026-10-16" }), "Every 3 days");
  assert.equal(cadenceLabel({ kind: "weekdays", days: [1, 3, 5] }), "Mon, Wed, Fri");
  assert.equal(cadenceLabel({ kind: "weekdays", days: [0] }), "Sun");
});

test("weekday labels read in week order however they are stored", () => {
  assert.equal(cadenceLabel({ kind: "weekdays", days: [5, 1, 3] }), "Mon, Wed, Fri");
});
