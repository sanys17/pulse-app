import { useState } from "react";
import { Sheet } from "./Sheet";

interface ConfirmSheetProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmSheet({ title, message, confirmLabel, onConfirm, onClose }: ConfirmSheetProps) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm();
    onClose();
  };

  return (
    <Sheet title={title} onClose={onClose} maxHeight="60dvh">
      <p style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>{message}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
        <button
          className="press"
          onClick={handleConfirm}
          disabled={busy}
          style={{
            height: 48,
            borderRadius: "var(--radius-md)",
            background: "var(--color-danger)",
            border: "none",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Deleting..." : confirmLabel}
        </button>
        <button
          className="press"
          onClick={onClose}
          disabled={busy}
          style={{
            height: 48,
            borderRadius: "var(--radius-md)",
            background: "transparent",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
