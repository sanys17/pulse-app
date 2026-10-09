import { useState } from "react";
import { Fire, Plant, CheckCircle, MapPin, HandsClapping } from "@phosphor-icons/react";
import type { FeedEntry } from "../types";
import { timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";

const feedConfig: Record<
  FeedEntry["type"],
  { icon: typeof Fire; color: string; label: (p: Record<string, unknown>) => string }
> = {
  streak_milestone: {
    icon: Fire,
    color: "var(--color-danger)",
    label: (p) => `hit a ${p.streakCount ?? "?"}-day streak on ${p.habitName ?? "a habit"}`,
  },
  habit_started: {
    icon: Plant,
    color: "var(--color-success)",
    label: (p) => `started a new habit: ${p.habitName ?? ""}`,
  },
  daily_complete: {
    icon: CheckCircle,
    color: "var(--color-accent)",
    label: () => "completed all habits today",
  },
  plan_created: {
    icon: MapPin,
    color: "var(--color-info)",
    label: (p) => `created a plan: ${p.planTitle ?? ""}`,
  },
};

interface FeedRowProps {
  entry: FeedEntry;
  onCheer: (entryId: string) => Promise<boolean>;
}

export function FeedRow({ entry, onCheer }: FeedRowProps) {
  const config = feedConfig[entry.type];
  const Icon = config.icon;
  const [popKey, setPopKey] = useState(0);
  const name = entry.userName || "A friend";

  const handleCheer = () => {
    if (!entry.cheeredByMe) setPopKey((k) => k + 1);
    void onCheer(entry.id);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-2) var(--space-1) var(--space-2) var(--space-4)",
        minHeight: 64,
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar name={name} src={entry.userAvatar} size={40} />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -3,
            bottom: -3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "var(--color-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={12} weight="fill" color={config.color} />
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.35, color: "var(--color-text-tertiary)" }}>
          <span style={{ fontWeight: 600, color: "var(--color-text)" }}>{name}</span> {config.label(entry.payload)}
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>
          {timeAgo(entry.createdAt)}
        </div>
      </div>

      <button
        className="press"
        onClick={handleCheer}
        aria-pressed={entry.cheeredByMe}
        aria-label={entry.cheeredByMe ? `Remove your cheer for ${name}` : `Cheer for ${name}`}
        style={{
          minWidth: 44,
          height: 44,
          padding: "0 var(--space-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          color: entry.cheeredByMe ? "var(--color-accent)" : "var(--color-text-tertiary)",
        }}
      >
        <span key={popKey} className={popKey > 0 ? "pop" : undefined} style={{ display: "flex" }}>
          <HandsClapping size={22} weight={entry.cheeredByMe ? "fill" : "regular"} />
        </span>
        {entry.cheers > 0 && <span>{entry.cheers}</span>}
      </button>
    </div>
  );
}
