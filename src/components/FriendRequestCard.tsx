import { useState, useCallback } from "react";
import type { FriendRequest } from "../types";

interface FriendRequestCardProps {
  request: FriendRequest;
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function FriendRequestCard({ request, onAccept, onDecline }: FriendRequestCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [acting, setActing] = useState(false);

  const handleAccept = useCallback(async () => {
    setActing(true);
    await onAccept(request.friendshipId);
    setCollapsed(true);
  }, [request.friendshipId, onAccept]);

  const handleDecline = useCallback(async () => {
    setActing(true);
    await onDecline(request.friendshipId);
    setCollapsed(true);
  }, [request.friendshipId, onDecline]);

  return (
    <div
      style={{
        overflow: "hidden",
        maxHeight: collapsed ? 0 : 120,
        opacity: collapsed ? 0 : 1,
        transition: "max-height 350ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms ease",
      }}
    >
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--color-surface-dim)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {request.avatarUrl ? (
            <img
              src={request.avatarUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
                color: "var(--p-accent)",
              }}
            >
              {(request.name || request.username).charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
            {request.name || request.username}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
            @{request.username} · {timeAgo(request.createdAt)}
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
          <button
            onClick={handleAccept}
            disabled={acting}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--p-accent)",
              border: "none",
              color: "#07070C",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: acting ? 0.5 : 1,
            }}
          >
            Accept
          </button>
          <button
            onClick={handleDecline}
            disabled={acting}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface-dim)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: acting ? 0.5 : 1,
            }}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
