import { useState, useEffect, useCallback } from "react";
import { X } from "@phosphor-icons/react";
import { HABIT_COLORS, HABIT_ICONS } from "../types";
import type { Habit, HabitColor } from "../types";
import { IconPicker } from "./IconPicker";

interface HabitFormProps {
  habit?: Habit;
  onSave: (data: {
    name: string;
    icon: string;
    color: HabitColor;
    frequency: "daily" | "weekly";
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function HabitForm({ habit, onSave, onDelete, onClose }: HabitFormProps) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? HABIT_ICONS[0]);
  const [color, setColor] = useState<HabitColor>(habit?.color ?? "green");
  const [frequency, setFrequency] = useState<"daily" | "weekly">(
    habit?.frequency ?? "daily"
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const colorSet = HABIT_COLORS[color];
  const isEditing = !!habit;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon, color, frequency });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete?.();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-label={isEditing ? "Edit habit" : "New habit"}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 430,
          maxHeight: "85dvh",
          overflow: "auto",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          padding: "var(--space-6)",
          paddingBottom: "calc(var(--space-8) + env(safe-area-inset-bottom, 0px))",
          animation: "slideUp 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-6)",
          }}
        >
          <h2
            style={{
              fontSize: "var(--text-xl)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {isEditing ? "Edit habit" : "New habit"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--color-surface-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

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
              Frequency
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-2)",
              }}
            >
              {(["daily", "weekly"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={frequency === f}
                  onClick={() => setFrequency(f)}
                  style={{
                    height: 44,
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    background:
                      frequency === f
                        ? "var(--color-surface-dim)"
                        : "transparent",
                    fontWeight: frequency === f ? 600 : 400,
                    fontSize: "var(--text-base)",
                    textTransform: "capitalize",
                    transition: "all 150ms ease",
                    cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
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
    </div>
  );
}
