import { useCallback, useEffect, useState } from "react";
import { BellRinging } from "@phosphor-icons/react";
import { supabase } from "../lib/supabase";
import { reportError } from "../lib/monitoring";
import { currentTimeZone, disablePush, enablePush, getPushStatus } from "../lib/push";
import type { PushStatus } from "../lib/pushSupport.ts";
import { timeOptions } from "../lib/notificationPrefs.ts";
import { useNotificationPreferences } from "../hooks/useNotificationPreferences";
import { Toggle } from "./Toggle";
import { AlertPicker } from "./AlertPicker";
import { SelectField } from "./SelectField";

const card: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-4)",
};

const buttonBase: React.CSSProperties = {
  height: 44,
  borderRadius: "var(--radius-sm)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const times = timeOptions(15);

function Row({
  title,
  detail,
  checked,
  onToggle,
  children,
}: {
  title: string;
  detail?: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "var(--space-2) 0", borderTop: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          {detail && <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>{detail}</div>}
        </div>
        <Toggle checked={checked} onChange={onToggle} label={title} />
      </div>
      {checked && children && <div style={{ paddingBottom: "var(--space-2)" }}>{children}</div>}
    </div>
  );
}

export function NotificationSettings() {
  const { prefs, update } = useNotificationPreferences();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const refresh = useCallback(async () => setStatus(await getPushStatus()), []);

  useEffect(() => {
    refresh();
    // Coming back from the phone's system settings should update the card.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const save = useCallback(
    async (patch: Parameters<typeof update>[0]) => {
      const ok = await update(patch);
      if (!ok) setMessage({ text: "Couldn't save that change. Try again.", error: true });
    },
    [update],
  );

  const handleEnable = async () => {
    setBusy(true);
    setMessage(null);
    const result = await enablePush();
    await refresh();
    setBusy(false);
    if (!result.ok) {
      const text =
        result.reason === "denied"
          ? "Notifications were not allowed. You can turn them on in your phone's settings."
          : result.reason === "not-configured"
            ? "Notifications aren't set up on the server yet."
            : result.reason === "unsupported"
              ? "This browser can't receive notifications."
              : "Something went wrong turning notifications on. Try again.";
      setMessage({ text, error: true });
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await disablePush();
    } catch {
      setMessage({ text: "Couldn't turn notifications off. Try again.", error: true });
    }
    await refresh();
    setBusy(false);
  };

  const handleTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("not signed in");
      const response = await fetch("/api/send-test-notification", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setMessage({ text: "Test sent. It should arrive in a few seconds.", error: false });
      else if (response.status === 404)
        setMessage({ text: "No device is registered yet. Turn notifications off and on again.", error: true });
      else {
        setMessage({ text: "The test couldn't be delivered. Try again in a moment.", error: true });
        reportError(new Error(`send-test-notification -> ${response.status}`), { area: "push", target: "test" });
      }
    } catch (error) {
      reportError(error, { area: "push", target: "test" });
      setMessage({ text: "Couldn't reach the server. Try again.", error: true });
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <BellRinging size={22} weight="regular" color="var(--color-text-secondary)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Push notifications</div>
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
              {status === "on"
                ? "On for this device"
                : status === "blocked"
                  ? "Blocked in your phone's settings"
                  : status === "unsupported"
                    ? "Not supported in this browser"
                    : status === "needs-install"
                      ? "Add Pulse to your Home Screen first"
                      : "Reminders and updates, even when Pulse is closed"}
            </div>
          </div>
          {status === "off" && (
            <button
              className="press"
              onClick={handleEnable}
              disabled={busy}
              style={{
                ...buttonBase,
                padding: "0 var(--space-4)",
                background: "var(--color-accent)",
                border: "none",
                color: "#07070C",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Enable
            </button>
          )}
        </div>

        {status === "needs-install" && (
          <ol style={{ margin: "var(--space-3) 0 0", paddingLeft: "var(--space-5)", fontSize: 14, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
            <li>Tap the Share button in Safari.</li>
            <li>Choose "Add to Home Screen".</li>
            <li>Open Pulse from your Home Screen and come back to Settings.</li>
          </ol>
        )}
        {status === "blocked" && (
          <p style={{ margin: "var(--space-3) 0 0", fontSize: 14, color: "var(--color-text-secondary)" }}>
            Open your phone's Settings, find Pulse, and allow notifications. Then return here.
          </p>
        )}
        {message && (
          <p
            role="status"
            aria-live="polite"
            style={{ margin: "var(--space-3) 0 0", fontSize: 14, color: message.error ? "var(--color-danger)" : "var(--color-success)" }}
          >
            {message.text}
          </p>
        )}
      </div>

      {status === "on" && prefs && (
        <div style={card}>
          <Row
            title="Calendar events"
            detail="Reminders for your own events"
            checked={prefs.calendarReminders}
            onToggle={(v) => save({ calendarReminders: v })}
          >
            <AlertPicker value={prefs.eventAlerts} timed onChange={(v) => save({ eventAlerts: v ?? [] })} />
          </Row>
          <Row
            title="Plans"
            detail="Reminders for plans you're in"
            checked={prefs.planReminders}
            onToggle={(v) => save({ planReminders: v })}
          >
            <AlertPicker value={prefs.planAlerts} timed onChange={(v) => save({ planAlerts: v ?? [] })} />
          </Row>
          <Row
            title="Plan invitations"
            detail="When someone invites you to a plan"
            checked={prefs.planInvites}
            onToggle={(v) => save({ planInvites: v })}
          />
          <Row
            title="Friend requests"
            detail="When someone wants to be friends"
            checked={prefs.friendRequests}
            onToggle={(v) => save({ friendRequests: v })}
          />
          <div style={{ padding: "var(--space-2) 0", borderTop: "1px solid var(--color-border)" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Items without a time</div>
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: "var(--space-2)" }}>
              Events and plans that only have a date
            </div>
            <AlertPicker
              value={prefs.alldayAlerts}
              timed={false}
              label="Alert for items without a time"
              onChange={(v) => save({ alldayAlerts: v ?? [] })}
            />
          </div>
          <Row
            title="Habit reminders"
            detail="Unfinished habits for today"
            checked={prefs.habitReminders}
            onToggle={(v) => save({ habitReminders: v })}
          >
            <SelectField
              label="Habit reminder time"
              value={prefs.habitReminderTime}
              options={times}
              onChange={(v) => save({ habitReminderTime: v })}
            />
          </Row>
          <Row
            title="Morning summary"
            detail="Today's events and habits"
            checked={prefs.morningSummary}
            onToggle={(v) => save({ morningSummary: v })}
          >
            <SelectField
              label="Morning summary time"
              value={prefs.morningSummaryTime}
              options={times}
              onChange={(v) => save({ morningSummaryTime: v })}
            />
          </Row>

          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
            <button
              className="press"
              onClick={handleTest}
              disabled={busy}
              style={{
                ...buttonBase,
                flex: 1,
                background: "var(--color-complete-bg)",
                border: "none",
                color: "var(--color-accent)",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Send a test
            </button>
            <button
              className="press"
              onClick={handleDisable}
              disabled={busy}
              style={{
                ...buttonBase,
                flex: 1,
                background: "transparent",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Turn off
            </button>
          </div>
          <p style={{ margin: "var(--space-3) 0 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>
            Times use your time zone: {currentTimeZone()}
          </p>
        </div>
      )}
    </div>
  );
}
