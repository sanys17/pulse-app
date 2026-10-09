import { useState } from "react";
import { Sheet } from "./Sheet";

interface AddTaskSheetProps {
  onAdd: (label: string) => void | Promise<void>;
  onClose: () => void;
}

export function AddTaskSheet({ onAdd, onClose }: AddTaskSheetProps) {
  const [label, setLabel] = useState("");
  const canAdd = label.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    void onAdd(label.trim());
    onClose();
  };

  return (
    <Sheet title="New task" onClose={onClose} maxHeight="50dvh">
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
