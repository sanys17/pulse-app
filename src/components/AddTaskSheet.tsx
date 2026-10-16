import { useState } from "react";
import { Sheet } from "./Sheet";
import { toDateKey } from "../lib/dateKey";

interface AddTaskSheetProps {
  onAdd: (label: string, dueDate: string | null) => void | Promise<void>;
  onClose: () => void;
}

export function AddTaskSheet({ onAdd, onClose }: AddTaskSheetProps) {
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const canAdd = label.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    void onAdd(label.trim(), dueDate || null);
    onClose();
  };

  // 50dvh was sized for a single text field. With the date row, the shortcut and the
  // helper line, the submit button fell below the fold once the keyboard opened.
  return (
    <Sheet title="New task" onClose={onClose} maxHeight="85dvh">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What needs doing?"
          aria-label="Task"
          autoFocus
          style={{
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
          }}
        />
        {/* iOS renders an empty type="date" blank, so the placeholder is an overlay
            and the input's own text is transparent until it has a value. */}
        <div style={{ position: "relative" }}>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Day"
            style={{
              width: "100%",
              height: 44,
              padding: "0 var(--space-3)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 16,
              color: dueDate ? "var(--color-text)" : "transparent",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          {!dueDate && (
            <span
              style={{
                position: "absolute",
                left: "var(--space-3)",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                fontSize: 16,
                color: "var(--color-text-tertiary)",
              }}
            >
              Day (optional)
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDueDate(toDateKey())}
          style={{
            alignSelf: "flex-start",
            minHeight: 44,
            padding: "0 var(--space-3)",
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text-tertiary)",
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Today
        </button>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", margin: 0 }}>
          Without a day it stays in your backlog and won't count towards today.
        </p>
        <button
          type="submit"
          className="press"
          disabled={!canAdd}
          style={{
            height: 48,
            borderRadius: "var(--radius-md)",
            background: canAdd ? "var(--color-accent)" : "var(--color-surface-dim)",
            border: "none",
            color: canAdd ? "#07070C" : "var(--color-text-tertiary)",
            fontSize: 15,
            fontWeight: 600,
            cursor: canAdd ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          Add task
        </button>
      </form>
    </Sheet>
  );
}
