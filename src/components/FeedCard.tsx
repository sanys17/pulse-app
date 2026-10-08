import { Fire, Plant, CheckCircle, MapPin } from "@phosphor-icons/react";
import type { FeedEntry } from "../types";

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

const feedConfig: Record<
  FeedEntry["type"],
  { icon: typeof Fire; color: string; label: (p: Record<string, unknown>) => string }
> = {
  streak_milestone: {
    icon: Fire,
    color: "#E5534B",
    label: (p) => `${p.streakCount ?? "?"}-day streak on ${p.habitName ?? "a habit"}`,
  },
  habit_started: {
    icon: Plant,
    color: "#57AB5A",
    label: (p) => `Started a new habit: ${p.habitName ?? ""}`,
  },
  daily_complete: {
    icon: CheckCircle,
    color: "#8E9BC4",
    label: () => "Completed all habits today",
  },
  plan_created: {
    icon: MapPin,
    color: "#539BF5",
    label: (p) => `Created a plan: ${p.planTitle ?? ""}`,
  },
};

interface FeedCardProps {
  entry: FeedEntry;
  index: number;
}

export function FeedCard({ entry, index }: FeedCardProps) {
  const config = feedConfig[entry.type];
  const Icon = config.icon;

  return (
    <div
      style={{
        padding: "var(--space-4)",
        background: "rgba(20, 20, 30, 0.75)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), 0 4px 16px rgba(0, 0, 0, 0.3)",
        display: "flex",
        gap: "var(--space-3)",
        animation: `feedIn 500ms cubic-bezier(0.4, 0, 0.2, 1) ${index * 60}ms both`,
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
        {entry.userAvatar ? (
          <img
            src={entry.userAvatar}
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
            {entry.userName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Icon size={16} weight="fill" color={config.color} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {entry.userName}
          </span>
        </div>
        <div
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {config.label(entry.payload)}
        </div>
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--p-muted)",
            marginTop: "var(--space-1)",
          }}
        >
          {timeAgo(entry.createdAt)}
        </div>
      </div>
    </div>
  );
}
