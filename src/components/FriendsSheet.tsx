import { useState, useCallback } from "react";
import { X, Link as LinkIcon, Trash } from "@phosphor-icons/react";
import type { Friend } from "../types";

interface FriendsSheetProps {
  friends: Friend[];
  username: string;
  onRemove: (friendshipId: string) => Promise<void>;
  onClose: () => void;
}

export function FriendsSheet({ friends, username, onRemove, onClose }: FriendsSheetProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyInviteLink = useCallback(() => {
    const link = `${window.location.origin}/social?add=${username}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [username]);

  const handleRemove = useCallback(
    async (friendshipId: string) => {
      await onRemove(friendshipId);
      setConfirmId(null);
    },
    [onRemove],
  );

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 60,
          animation: "fadeIn 200ms ease both",
        }}
      />

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "75dvh",
          background: "var(--p-surface)",
          borderRadius: "20px 20px 0 0",
          zIndex: 61,
          display: "flex",
          flexDirection: "column",
          animation: "sheetUp 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--space-4) var(--space-4) var(--space-3)",
          }}
        >
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Friends ({friends.length})
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--color-surface-dim)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
            }}
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <button
          onClick={copyInviteLink}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            margin: "0 var(--space-4)",
            marginBottom: "var(--space-3)",
            padding: "var(--space-3)",
            background: "rgba(142, 155, 196, 0.12)",
            borderRadius: "var(--radius-sm)",
            border: "none",
            color: "var(--p-accent)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            width: "calc(100% - var(--space-4) * 2)",
          }}
        >
          <LinkIcon size={16} weight="bold" />
          {copied ? "Link copied!" : "Copy invite link"}
        </button>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 var(--space-4) var(--space-4)",
          }}
        >
          {friends.length === 0 ? (
            <p
              style={{
                textAlign: "center",
                padding: "var(--space-8) 0",
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
              }}
            >
              No friends yet. Share your invite link!
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              {friends.map((friend) => (
                <div
                  key={friend.friendshipId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) 0",
                    borderBottom: "1px solid var(--color-border)",
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
                    {friend.avatarUrl ? (
                      <img
                        src={friend.avatarUrl}
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
                        {(friend.name || friend.username).charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {friend.name || friend.username}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                      @{friend.username}
                    </div>
                  </div>

                  {confirmId === friend.friendshipId ? (
                    <div style={{ display: "flex", gap: "var(--space-2)" }}>
                      <button
                        onClick={() => handleRemove(friend.friendshipId)}
                        style={{
                          height: 30,
                          padding: "0 10px",
                          borderRadius: "var(--radius-sm)",
                          background: "#E5534B",
                          border: "none",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        style={{
                          height: 30,
                          padding: "0 10px",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--color-surface-dim)",
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
                  ) : (
                    <button
                      onClick={() => setConfirmId(friend.friendshipId)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <Trash size={16} weight="regular" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
