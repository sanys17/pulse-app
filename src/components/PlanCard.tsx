import { CalendarBlank, MapPin } from "@phosphor-icons/react";
import type { PlanWithMembers } from "../hooks/useSharedPlans";

interface PlanCardProps {
  plan: PlanWithMembers;
  onClick: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const statusColors: Record<string, string> = {
  planning: "var(--p-accent)",
  confirmed: "#57AB5A",
  completed: "var(--p-muted)",
  cancelled: "#E5534B",
};

export function PlanCard({ plan, onClick }: PlanCardProps) {
  const goingCount = plan.members.filter((m) => m.rsvp === "going").length;

  return (
    <button
      onClick={onClick}
      style={{
        width: 160,
        minWidth: 160,
        padding: "var(--space-3)",
        background: "rgba(20, 20, 30, 0.75)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), 0 4px 16px rgba(0, 0, 0, 0.3)",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        color: "var(--color-text)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {plan.title}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
        <CalendarBlank size={12} weight="regular" />
        {formatDate(plan.date)}
      </div>

      {plan.location && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
          <MapPin size={12} weight="regular" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {plan.location}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <div style={{ display: "flex" }}>
          {plan.members.slice(0, 4).map((m, i) => (
            <div
              key={m.id}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: "2px solid var(--p-base)",
                background: "var(--color-surface-dim)",
                overflow: "hidden",
                marginLeft: i > 0 ? -6 : 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--p-accent)",
              }}
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                m.name.charAt(0).toUpperCase()
              )}
            </div>
          ))}
          {plan.members.length > 4 && (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: "2px solid var(--p-base)",
                background: "var(--color-surface-dim)",
                marginLeft: -6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 600,
                color: "var(--color-text-secondary)",
              }}
            >
              +{plan.members.length - 4}
            </div>
          )}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: statusColors[plan.status] ?? "var(--p-muted)",
            textTransform: "capitalize",
          }}
        >
          {goingCount > 0 ? `${goingCount} going` : plan.status}
        </span>
      </div>
    </button>
  );
}
