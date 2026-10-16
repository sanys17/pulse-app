import { useState } from "react";
import { HABIT_COLORS, HABIT_ICONS } from "../types";
import type { Habit, HabitColor, HabitInput, Cadence } from "../types";
import { toDateKey } from "../lib/dateKey";
import { SelectField } from "./SelectField";
import { timeOptions } from "../lib/notificationPrefs.ts";
import { IconPicker } from "./IconPicker";
import { Sheet } from "./Sheet";

interface HabitFormProps {
  habit?: Habit;
  onSave: (data: HabitInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

// Monday first: this is read by a European user, and JS getDay() numbering puts
// Sunday at 0, so the display order is not the storage order.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_INITIALS: Record<number, string> = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S" };
const WEEKDAY_FULL: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday",
};

// Four options, no open number field: every extra choice is a decision the user pays
// for at every habit they create, and "every 11 days" is a need nobody has.
const CADENCE_OPTIONS: { id: string; label: string; make: () => Cadence }[] = [
  { id: "daily", label: "Every day", make: () => ({ kind: "daily" }) },
  { id: "i2", label: "Every 2 days", make: () => ({ kind: "interval", days: 2, startDate: toDateKey() }) },
  { id: "i3", label: "Every 3 days", make: () => ({ kind: "interval", days: 3, startDate: toDateKey() }) },
  { id: "weekdays", label: "Certain days", make: () => ({ kind: "weekdays", days: [1] }) },
];

function optionIdOf(cadence: Cadence): string {
  if (cadence.kind === "daily") return "daily";
  if (cadence.kind === "weekdays") return "weekdays";
  return cadence.days === 3 ? "i3" : "i2";
}

// Never leaves the set empty: a weekday habit with no days would be due on no day at
// all, and migration 013's CHECK constraint rejects it outright.
function toggleWeekday(days: number[], d: number): number[] {
  if (days.includes(d)) {
    const next = days.filter((x) => x !== d);
    return next.length > 0 ? next : days;
  }
  return [...days, d].sort((a, b) => a - b);
}

export function HabitForm({ habit, onSave, onDelete, onClose }: HabitFormProps) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? HABIT_ICONS[0]);
  const [color, setColor] = useState<HabitColor>(habit?.color ?? "green");
  const [cadence, setCadence] = useState<Cadence>(habit?.cadence ?? { kind: "daily" });
  const [reminderTime, setReminderTime] = useState(habit?.reminderTime ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const colorSet = HABIT_COLORS[color];
  const isEditing = !!habit;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon, color, cadence, reminderTime: reminderTime || null });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete?.();
  };

  return (
    <Sheet title={isEditing ? "Edit habit" : "New habit"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <div>
            <label
              htmlFor="habit-name"
              style={{
                display: "block",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                marginBottom: "var(--space-2)",
              }}
            >
              Name
            </label>
            <input
              id="habit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Morning run"
              required
              maxLength={40}
              style={{
                width: "100%",
                height: 48,
                padding: "0 var(--space-4)",
                background: "var(--color-surface-dim)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 16,
                outline: "none",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                marginBottom: "var(--space-2)",
              }}
            >
              Color
            </label>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {(Object.keys(HABIT_COLORS) as HabitColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={HABIT_COLORS[c].label}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: HABIT_COLORS[c].fill,
                      display: "block",
                      border:
                        color === c
                          ? "3px solid var(--color-text)"
                          : "3px solid transparent",
                      outline:
                        color === c ? "2px solid var(--color-surface)" : "none",
                      transition: "all 150ms ease",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                marginBottom: "var(--space-2)",
              }}
            >
              Icon
            </label>
            <IconPicker
              selected={icon}
              color={HABIT_COLORS[color].fill}
              onSelect={setIcon}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                marginBottom: "var(--space-2)",
              }}
            >
              Repeats
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-2)",
              }}
            >
              {CADENCE_OPTIONS.map((opt) => {
                const active = optionIdOf(cadence) === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    // Rebuilding an already-selected option would reset startDate to
                    // today and flip an interval habit's parity. Tapping the current
                    // choice is a no-op.
                    onClick={() => { if (!active) setCadence(opt.make()); }}
                    style={{
                      height: 44,
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: active ? "var(--color-surface-dim)" : "transparent",
                      color: "var(--color-text)",
                      fontWeight: active ? 600 : 400,
                      fontSize: "var(--text-base)",
                      transition: "background 150ms ease, border-color 150ms ease",
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {cadence.kind === "interval" && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <label
                  htmlFor="cadence-start"
                  style={{
                    display: "block",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    color: "var(--color-text-secondary)",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  Starting
                </label>
                {/* Always carries a value, so it never hits the blank-date-input problem
                    iOS has with an empty type="date". */}
                <input
                  id="cadence-start"
                  type="date"
                  value={cadence.startDate}
                  onChange={(e) =>
                    setCadence({ ...cadence, startDate: e.target.value || toDateKey() })
                  }
                  style={{
                    width: "100%",
                    height: 44,
                    padding: "0 var(--space-3)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                  }}
                />
                <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-1)" }}>
                  The count runs from this day.
                </p>
              </div>
            )}

            {cadence.kind === "weekdays" && (
              <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-3)" }}>
                {WEEKDAY_ORDER.map((d) => {
                  const on = cadence.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={WEEKDAY_FULL[d]}
                      onClick={() => setCadence({ kind: "weekdays", days: toggleWeekday(cadence.days, d) })}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        border: "1px solid var(--color-border)",
                        background: on ? "var(--color-complete-bg)" : "transparent",
                        color: on ? "var(--color-complete)" : "var(--color-text-tertiary)",
                        fontWeight: on ? 600 : 400,
                        fontSize: "var(--text-sm)",
                        transition: "background 150ms ease, color 150ms ease",
                        cursor: "pointer",
                      }}
                    >
                      {WEEKDAY_INITIALS[d]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                marginBottom: "var(--space-2)",
              }}
            >
              Reminder
            </label>
            <SelectField
              label="Reminder time"
              value={reminderTime}
              options={[{ value: "", label: "No reminder" }, ...timeOptions(15)]}
              onChange={setReminderTime}
            />
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-1)" }}>
              We'll remind you at this time if it isn't done yet.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            marginTop: "var(--space-6)",
          }}
        >
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              style={{
                height: 48,
                padding: "0 var(--space-5)",
                borderRadius: "var(--radius-sm)",
                border: confirmDelete
                  ? "1px solid #E5534B"
                  : "1px solid var(--color-border)",
                background: confirmDelete
                  ? "rgba(229, 83, 75, 0.1)"
                  : "transparent",
                color: "#E5534B",
                fontWeight: 600,
                fontSize: "var(--text-base)",
                transition: "all 150ms ease",
              }}
            >
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          )}
          <button
            type="submit"
            disabled={!name.trim()}
            style={{
              flex: 1,
              height: 48,
              borderRadius: "var(--radius-sm)",
              background: colorSet.fill,
              color: "white",
              fontWeight: 600,
              fontSize: "var(--text-base)",
              opacity: name.trim() ? 1 : 0.4,
              transition: "opacity 150ms ease, transform 150ms ease",
              cursor: name.trim() ? "pointer" : "default",
            }}
          >
            {isEditing ? "Save" : "Add habit"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
