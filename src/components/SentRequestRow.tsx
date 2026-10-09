import { useState, useCallback } from "react";
import type { FriendRequest } from "../types";
import { Avatar } from "./Avatar";

interface SentRequestRowProps {
  request: FriendRequest;
  onCancel: (friendshipId: string) => Promise<void>;
}

export function SentRequestRow({ request, onCancel }: SentRequestRowProps) {
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    await onCancel(request.friendshipId);
  }, [request.friendshipId, onCancel]);

  const label = request.name || request.username;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border)",
        opacity: cancelling ? 0.5 : 1,
        transition: "opacity 150ms ease",
      }}
    >
      <Avatar name={label} src={request.avatarUrl} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
          @{request.username} · Waiting for response
        </div>
      </div>
      <button
        className="press"
        onClick={handleCancel}
        disabled={cancelling}
        aria-label={`Cancel request to ${label}`}
        style={{
          height: 44,
          padding: "0 var(--space-3)",
          borderRadius: "var(--radius-sm)",
          background: "transparent",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-secondary)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Cancel
      </button>
    </div>
  );
}
