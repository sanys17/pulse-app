import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertLabel,
  alertOffsets,
  alertSummary,
  applyPrimary,
  applySecondary,
  normalizeAlerts,
  primaryChoice,
  secondaryChoice,
} from "../src/lib/alerts.ts";

test("timed labels follow Apple Calendar wording", () => {
  assert.equal(alertLabel(0, true), "At time of event");
  assert.equal(alertLabel(5, true), "5 minutes before");
  assert.equal(alertLabel(60, true), "1 hour before");
  assert.equal(alertLabel(120, true), "2 hours before");
  assert.equal(alertLabel(1440, true), "1 day before");
  assert.equal(alertLabel(10080, true), "1 week before");
});

test("date-only labels are anchored at 9:00 AM", () => {
  assert.equal(alertLabel(0, false), "On the day (9:00 AM)");
  assert.equal(alertLabel(1440, false), "1 day before (9:00 AM)");
  assert.equal(alertLabel(10080, false), "1 week before (9:00 AM)");
});

test("offset lists", () => {
  assert.deepEqual([...alertOffsets(true)], [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]);
  assert.deepEqual([...alertOffsets(false)], [0, 1440, 2880, 10080]);
});

test("summary joins alerts", () => {
  assert.equal(alertSummary([], true), "None");
  assert.equal(alertSummary([15], true), "15 minutes before");
  assert.equal(alertSummary([1440, 15], true), "1 day before and 15 minutes before");
});

test("primaryChoice / secondaryChoice distinguish default, none and values", () => {
  assert.equal(primaryChoice(null), "default");
  assert.equal(primaryChoice([]), "none");
  assert.equal(primaryChoice([30, 60]), 30);
  assert.equal(secondaryChoice([30, 60]), 60);
  assert.equal(secondaryChoice([30]), "none");
  assert.equal(secondaryChoice(null), "none");
});

test("applyPrimary", () => {
  assert.equal(applyPrimary([15], "default"), null);
  assert.deepEqual(applyPrimary([15], "none"), []);
  assert.deepEqual(applyPrimary(null, 15), [15]);
  assert.deepEqual(applyPrimary([15, 60], 30), [30, 60]);
  assert.deepEqual(applyPrimary([15, 60], 60), [60]); // second alert may not equal the first
});

test("applySecondary", () => {
  assert.deepEqual(applySecondary([15], 60), [15, 60]);
  assert.deepEqual(applySecondary([15], 15), [15]);
  assert.deepEqual(applySecondary([15, 60], "none"), [15]);
  assert.deepEqual(applySecondary(null, 60), []); // no explicit first alert, nothing to add to
  assert.deepEqual(applySecondary([], 60), []);
});

test("normalizeAlerts keeps valid unique offsets, max two", () => {
  assert.deepEqual(normalizeAlerts([15, 15, 60, 120]), [15, 60]);
  assert.deepEqual(normalizeAlerts([7, 15]), [15]); // 7 is not an Apple offset
  assert.deepEqual(normalizeAlerts("nope"), []);
  assert.deepEqual(normalizeAlerts(null), []);
});
