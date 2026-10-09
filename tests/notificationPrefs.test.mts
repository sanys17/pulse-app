import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, formatTime, patchToRow, rowToPrefs, timeOptions } from "../src/lib/notificationPrefs.ts";

const row = {
  calendar_reminders: true,
  plan_reminders: false,
  plan_invites: true,
  friend_requests: false,
  habit_reminders: true,
  morning_summary: false,
  morning_summary_time: "07:30:00",
};

test("rowToPrefs maps columns and trims seconds from the morning time", () => {
  const prefs = rowToPrefs(row);
  assert.equal(prefs.calendarReminders, true);
  assert.equal(prefs.planReminders, false);
  assert.equal(prefs.friendRequests, false);
  assert.equal(prefs.habitReminders, true);
  assert.equal(prefs.morningSummary, false);
  assert.equal(prefs.morningSummaryTime, "07:30");
});

test("rowToPrefs ignores columns the database no longer has", () => {
  const prefs = rowToPrefs({ ...row, event_alerts: [15], habit_reminder_time: "20:00:00" } as typeof row);
  assert.deepEqual(Object.keys(prefs).sort(), [
    "calendarReminders",
    "friendRequests",
    "habitReminders",
    "morningSummary",
    "morningSummaryTime",
    "planInvites",
    "planReminders",
  ]);
});

test("patchToRow only emits the provided keys, in column names", () => {
  assert.deepEqual(patchToRow({ morningSummaryTime: "08:15", planInvites: false }), {
    morning_summary_time: "08:15",
    plan_invites: false,
  });
  assert.deepEqual(patchToRow({}), {});
});

test("defaults: everything on, morning summary at 07:00", () => {
  assert.equal(DEFAULT_PREFS.calendarReminders, true);
  assert.equal(DEFAULT_PREFS.habitReminders, true);
  assert.equal(DEFAULT_PREFS.morningSummaryTime, "07:00");
});

test("time options step by 15 minutes with 12-hour labels", () => {
  const options = timeOptions();
  assert.equal(options.length, 96);
  assert.deepEqual(options[0], { value: "00:00", label: "12:00 AM" });
  assert.equal(formatTime("20:00"), "8:00 PM");
  assert.equal(formatTime("07:15"), "7:15 AM");
  assert.equal(formatTime("12:30"), "12:30 PM");
  assert.equal(options.at(-1)?.value, "23:45");
});
