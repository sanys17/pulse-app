import { useState, useCallback } from "react";
import { X, Check } from "@phosphor-icons/react";
import type { Friend } from "../types";

interface CreatePlanSheetProps {
  friends: Friend[];
  onCreate: (data: {
    title: string;
    description?: string;
    date?: string;
    time?: string;
    location?: string;
    memberIds: string[];
  }) => Promise<string | undefined>;
  onClose: () => void;
}

export function CreatePlanSheet({ friends, onCreate, onClose }: CreatePlanSheetProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const toggleFriend = useCallback((userId: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      date: date || undefined,
      time: time || undefined,
      location: location.trim() || undefined,
      memberIds: [...selectedFriends],
    });
    onClose();
  }, [title, description, date, time, location, selectedFriends, submitting, onCreate, onClose]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    padding: "0 var(--space-3)",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 15,
    color: "var(--color-text)",
    outline: "none",
    fontFamily: "inherit",
  };

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
          maxHeight: "85dvh",
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
            New Plan
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

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 var(--space-4) var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Plan title *"
            autoFocus
            style={inputStyle}
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            style={{
              ...inputStyle,
              height: "auto",
              padding: "var(--space-3)",
              resize: "none",
            }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
            {([
              { type: "date", label: "Date", value: date, set: setDate },
              { type: "time", label: "Time", value: time, set: setTime },
            ] as const).map((f) => (
              <div key={f.type} style={{ position: "relative" }}>
                <input
                  type={f.type}
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  aria-label={f.label}
                  style={{
                    ...inputStyle,
                    width: "100%",
                    colorScheme: "dark",
                    color: f.value ? "var(--color-text)" : "transparent",
                  }}
                />
                {!f.value && (
                  <span
                    style={{
                      position: "absolute",
                      left: "var(--space-3)",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 14,
                      color: "var(--color-text-secondary)",
                      pointerEvents: "none",
                    }}
                  >
                    {f.label} (optional)
                  </span>
                )}
              </div>
            ))}
          </div>

          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
            style={inputStyle}
          />

          {friends.length > 0 && (
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Invite friends
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {friends.map((f) => (
                  <button
                    key={f.userId}
                    onClick={() => toggleFriend(f.userId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                      padding: "var(--space-2) var(--space-3)",
                      background: selectedFriends.has(f.userId)
                        ? "rgba(142, 155, 196, 0.12)"
                        : "transparent",
                      border: "1px solid",
                      borderColor: selectedFriends.has(f.userId)
                        ? "var(--p-accent)"
                        : "var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "var(--color-text)",
                      fontSize: 14,
                      fontWeight: 500,
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--color-surface-dim)",
                        overflow: "hidden",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--p-accent)",
                      }}
                    >
                      {f.avatarUrl ? (
                        <img src={f.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        (f.name || f.username).charAt(0).toUpperCase()
                      )}
                    </div>
                    <span style={{ flex: 1 }}>{f.name || f.username}</span>
                    {selectedFriends.has(f.userId) && (
                      <Check size={16} weight="bold" color="var(--p-accent)" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!title.trim() || submitting}
            style={{
              width: "100%",
              height: 48,
              borderRadius: "var(--radius-md)",
              background: title.trim() ? "var(--p-accent)" : "var(--color-surface-dim)",
              border: "none",
              color: title.trim() ? "#07070C" : "var(--color-text-secondary)",
              fontSize: 15,
              fontWeight: 600,
              cursor: title.trim() ? "pointer" : "default",
              fontFamily: "inherit",
              opacity: submitting ? 0.6 : 1,
              marginTop: "var(--space-2)",
            }}
          >
            {submitting ? "Creating..." : "Create Plan"}
          </button>
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
