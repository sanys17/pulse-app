import { useState, useCallback } from "react";
import type { FriendRequest } from "../types";

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
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--color-surface-dim)",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--p-accent)",
        }}
      >
        {request.avatarUrl ? (
          <img
            src={request.avatarUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          label.charAt(0).toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
          @{request.username} · Waiting for response
        </div>
      </div>
      <button
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
