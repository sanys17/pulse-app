import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, formatTime, patchToRow, rowToPrefs, timeOptions } from "../src/lib/notificationPrefs.ts";

const row = {
  calendar_reminders: true,
  event_alerts: [15],
  plan_reminders: false,
  plan_alerts: [60, 5],
  plan_invites: true,
  friend_requests: false,
  allday_alerts: [0],
  habit_reminders: true,
  habit_reminder_time: "20:00:00",
  morning_summary: false,
  morning_summary_time: "07:30:00",
};

test("rowToPrefs maps columns and trims seconds from times", () => {
  const prefs = rowToPrefs(row);
  assert.equal(prefs.planReminders, false);
  assert.deepEqual(prefs.planAlerts, [60, 5]);
  assert.equal(prefs.habitReminderTime, "20:00");
  assert.equal(prefs.morningSummaryTime, "07:30");
  assert.equal(prefs.friendRequests, false);
});

test("rowToPrefs drops invalid alert values from the database", () => {
  assert.deepEqual(rowToPrefs({ ...row, event_alerts: [15, 7, 15, 60, 120] }).eventAlerts, [15, 60]);
});

test("patchToRow only emits the provided keys, in column names", () => {
  assert.deepEqual(patchToRow({ eventAlerts: [30], habitReminderTime: "21:15" }), {
    event_alerts: [30],
    habit_reminder_time: "21:15",
  });
  assert.deepEqual(patchToRow({}), {});
  assert.deepEqual(patchToRow({ planInvites: false }), { plan_invites: false });
});

test("defaults match the spec", () => {
  assert.deepEqual(DEFAULT_PREFS.eventAlerts, [15]);
  assert.deepEqual(DEFAULT_PREFS.planAlerts, [60]);
  assert.deepEqual(DEFAULT_PREFS.alldayAlerts, [0]);
  assert.equal(DEFAULT_PREFS.habitReminderTime, "20:00");
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
