import { useState, useCallback } from "react";
import type { FriendRequest } from "../types";
import { timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";

interface FriendRequestCardProps {
  request: FriendRequest;
  onAccept: (request: FriendRequest) => Promise<void>;
  onDecline: (request: FriendRequest) => Promise<void>;
}

export function FriendRequestCard({ request, onAccept, onDecline }: FriendRequestCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [acting, setActing] = useState(false);

  const handleAccept = useCallback(async () => {
    setActing(true);
    await onAccept(request);
    setCollapsed(true);
  }, [request, onAccept]);

  const handleDecline = useCallback(async () => {
    setActing(true);
    await onDecline(request);
    setCollapsed(true);
  }, [request, onDecline]);

  const label = request.name || request.username;
  const buttonStyle = {
    flex: 1,
    height: 44,
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    opacity: acting ? 0.5 : 1,
  } as const;

  return (
    <div
      style={{
        overflow: "hidden",
        maxHeight: collapsed ? 0 : 200,
        opacity: collapsed ? 0 : 1,
        transition: "max-height 350ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms ease",
      }}
    >
      <div
        style={{
          padding: "var(--space-4)",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Avatar name={label} src={request.avatarUrl} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{label}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
              @{request.username} · wants to be friends · {timeAgo(request.createdAt)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            className="press"
            onClick={handleAccept}
            disabled={acting}
            style={{ ...buttonStyle, background: "var(--color-accent)", border: "none", color: "#07070C" }}
          >
            Accept
          </button>
          <button
            className="press"
            onClick={handleDecline}
            disabled={acting}
            style={{
              ...buttonStyle,
              background: "transparent",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
