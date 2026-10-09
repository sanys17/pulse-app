import { useState, useCallback, useEffect } from "react";
import { Check } from "@phosphor-icons/react";
import { builtInAlerts } from "../lib/alerts.ts";
import type { Friend } from "../types";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { AlertPicker } from "./AlertPicker";
import { Toggle } from "./Toggle";

interface CreatePlanSheetProps {
  friends: Friend[];
  onCreate: (data: {
    title: string;
    description?: string;
    date?: string;
    time?: string;
    location?: string;
    alerts?: number[] | null;
    open?: boolean;
    memberIds: string[];
  }) => Promise<string | undefined>;
  onClose: () => void;
  onCreated?: (title: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 var(--space-3)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 16,
  color: "var(--color-text)",
  outline: "none",
  fontFamily: "inherit",
};

export function CreatePlanSheet({ friends, onCreate, onClose, onCreated }: CreatePlanSheetProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  // Chosen here, saved on the plan; each member can still change their own in Plan Detail.
  const [alerts, setAlerts] = useState<number[]>(builtInAlerts("plan", false));
  const hasTime = time !== "";
  useEffect(() => {
    setAlerts(builtInAlerts("plan", hasTime));
  }, [hasTime]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleFriend = useCallback((userId: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    const id = await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      date: date || undefined,
      time: time || undefined,
      location: location.trim() || undefined,
      alerts: date ? alerts : null,
      open,
      memberIds: [...selectedFriends],
    });
    setSubmitting(false);
    if (!id) {
      setError("Couldn't create the plan. Check your connection and try again.");
      return;
    }
    onCreated?.(title.trim());
    onClose();
  }, [title, description, date, time, location, alerts, open, selectedFriends, submitting, onCreate, onClose, onCreated]);

  const canCreate = title.trim().length > 0 && !submitting;

  return (
    <Sheet title="New plan" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's the plan?"
          aria-label="Plan title"
          autoFocus
          style={inputStyle}
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details (optional)"
          aria-label="Details"
          rows={2}
          style={{ ...inputStyle, height: "auto", padding: "var(--space-3)", resize: "none" }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {(
            [
              { type: "date", label: "Date", value: date, set: setDate },
              { type: "time", label: "Time", value: time, set: setTime },
            ] as const
          ).map((f) => (
            <div key={f.type} style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: "var(--radius-sm)" }}>
              <input
                type={f.type}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                aria-label={f.label}
                style={{
                  ...inputStyle,
                  colorScheme: "dark",
                  display: "block",
                  minWidth: 0,
                  maxWidth: "100%",
                  WebkitAppearance: "none",
                  appearance: "none",
                  color: f.value ? "var(--color-text)" : "transparent",
                }}
              />
              {!f.value && (
                <span
                  style={{
                    position: "absolute",
                    left: "var(--space-3)",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 15,
                    color: "var(--color-text-tertiary)",
                    pointerEvents: "none",
                  }}
                >
                  {f.label} (optional)
                </span>
              )}
            </div>
          ))}
        </div>

        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (optional)"
          aria-label="Location"
          style={inputStyle}
        />

        {date && (
          <div>
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: "var(--space-1)" }}>
              Remind everyone
            </div>
            <AlertPicker value={alerts} onChange={(v) => setAlerts(v ?? [])} timed={hasTime} label="Plan alert" />
          </div>
        )}

        {friends.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              minHeight: 52,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Open to all friends</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                Any friend can join, up to 20 people.
              </div>
            </div>
            <Toggle checked={open} onChange={setOpen} label="Open to all friends" />
          </div>
        )}

        {friends.length > 0 && (
          <div>
            <h3
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                minHeight: 44,
                display: "flex",
                alignItems: "center",
              }}
            >
              {open ? "Also invite directly" : "Invite friends"}{selectedFriends.size > 0 ? ` · ${selectedFriends.size}` : ""}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              {friends.map((f) => {
                const selected = selectedFriends.has(f.userId);
                const label = f.name || f.username;
                return (
                  <button
                    key={f.userId}
                    className="press"
                    onClick={() => toggleFriend(f.userId)}
                    aria-pressed={selected}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                      minHeight: 52,
                      padding: "var(--space-2) var(--space-3)",
                      background: selected ? "var(--color-complete-bg)" : "transparent",
                      border: "1px solid",
                      borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "var(--color-text)",
                      fontSize: 14,
                      fontWeight: 500,
                      textAlign: "left",
                    }}
                  >
                    <Avatar name={label} src={f.avatarUrl} size={32} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {selected && <Check size={18} weight="bold" color="var(--color-accent)" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" style={{ fontSize: "var(--text-sm)", color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        <button
          className="press"
          onClick={handleCreate}
          disabled={!canCreate}
          style={{
            width: "100%",
            height: 48,
            borderRadius: "var(--radius-md)",
            background: canCreate ? "var(--color-accent)" : "var(--color-surface-dim)",
            border: "none",
            color: canCreate ? "#07070C" : "var(--color-text-tertiary)",
            fontSize: 15,
            fontWeight: 600,
            cursor: canCreate ? "pointer" : "default",
            fontFamily: "inherit",
            marginTop: "var(--space-2)",
          }}
        >
          {submitting ? "Creating..." : "Create plan"}
        </button>
      </div>
    </Sheet>
  );
}
