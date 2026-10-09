import {
  DEFAULT_DATE_ONLY_ALERTS,
  DEFAULT_EVENT_ALERTS,
  DEFAULT_PLAN_ALERTS,
  normalizeAlerts,
} from "./alerts.ts";

export interface NotificationPrefs {
  calendarReminders: boolean;
  eventAlerts: number[];
  planReminders: boolean;
  planAlerts: number[];
  planInvites: boolean;
  friendRequests: boolean;
  alldayAlerts: number[];
  habitReminders: boolean;
  habitReminderTime: string; // "HH:MM"
  morningSummary: boolean;
  morningSummaryTime: string; // "HH:MM"
}

export interface PrefsRow {
  calendar_reminders: boolean;
  event_alerts: number[];
  plan_reminders: boolean;
  plan_alerts: number[];
  plan_invites: boolean;
  friend_requests: boolean;
  allday_alerts: number[];
  habit_reminders: boolean;
  habit_reminder_time: string;
  morning_summary: boolean;
  morning_summary_time: string;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  calendarReminders: true,
  eventAlerts: [...DEFAULT_EVENT_ALERTS],
  planReminders: true,
  planAlerts: [...DEFAULT_PLAN_ALERTS],
  planInvites: true,
  friendRequests: true,
  alldayAlerts: [...DEFAULT_DATE_ONLY_ALERTS],
  habitReminders: true,
  habitReminderTime: "20:00",
  morningSummary: true,
  morningSummaryTime: "07:00",
};

export function rowToPrefs(row: PrefsRow): NotificationPrefs {
  return {
    calendarReminders: row.calendar_reminders,
    eventAlerts: normalizeAlerts(row.event_alerts),
    planReminders: row.plan_reminders,
    planAlerts: normalizeAlerts(row.plan_alerts),
    planInvites: row.plan_invites,
    friendRequests: row.friend_requests,
    alldayAlerts: normalizeAlerts(row.allday_alerts),
    habitReminders: row.habit_reminders,
    habitReminderTime: row.habit_reminder_time.slice(0, 5),
    morningSummary: row.morning_summary,
    morningSummaryTime: row.morning_summary_time.slice(0, 5),
  };
}

const COLUMN: Record<keyof NotificationPrefs, keyof PrefsRow> = {
  calendarReminders: "calendar_reminders",
  eventAlerts: "event_alerts",
  planReminders: "plan_reminders",
  planAlerts: "plan_alerts",
  planInvites: "plan_invites",
  friendRequests: "friend_requests",
  alldayAlerts: "allday_alerts",
  habitReminders: "habit_reminders",
  habitReminderTime: "habit_reminder_time",
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
