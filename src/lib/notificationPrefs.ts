// Settings only holds on/off switches (plus the morning summary time, which has no item to hang it on).
// Alerts and reminder times are chosen per event, plan and habit when they are created.
export interface NotificationPrefs {
  calendarReminders: boolean;
  planReminders: boolean;
  planInvites: boolean;
  friendRequests: boolean;
  habitReminders: boolean;
  morningSummary: boolean;
  morningSummaryTime: string; // "HH:MM"
}

export interface PrefsRow {
  calendar_reminders: boolean;
  plan_reminders: boolean;
  plan_invites: boolean;
  friend_requests: boolean;
  habit_reminders: boolean;
  morning_summary: boolean;
  morning_summary_time: string;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  calendarReminders: true,
  planReminders: true,
  planInvites: true,
  friendRequests: true,
  habitReminders: true,
  morningSummary: true,
  morningSummaryTime: "07:00",
};

export function rowToPrefs(row: PrefsRow): NotificationPrefs {
  return {
    calendarReminders: row.calendar_reminders,
    planReminders: row.plan_reminders,
    planInvites: row.plan_invites,
    friendRequests: row.friend_requests,
    habitReminders: row.habit_reminders,
    morningSummary: row.morning_summary,
    morningSummaryTime: row.morning_summary_time.slice(0, 5),
  };
}

const COLUMN: Record<keyof NotificationPrefs, keyof PrefsRow> = {
  calendarReminders: "calendar_reminders",
  planReminders: "plan_reminders",
  planInvites: "plan_invites",
  friendRequests: "friend_requests",
  habitReminders: "habit_reminders",
  morningSummary: "morning_summary",
  morningSummaryTime: "morning_summary_time",
};

export function patchToRow(patch: Partial<NotificationPrefs>): Partial<PrefsRow> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof NotificationPrefs)[]) {
    out[COLUMN[key]] = patch[key];
  }
  return out as Partial<PrefsRow>;
}

export function formatTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function timeOptions(stepMinutes = 15): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    options.push({ value, label: formatTime(value) });
  }
  return options;
}
