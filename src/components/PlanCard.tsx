import { CalendarBlank, MapPin } from "@phosphor-icons/react";
import type { PlanWithMembers } from "../hooks/useSharedPlans";
import { useAuth } from "../context/AuthContext";
import { planWhen } from "../lib/format";
import { Avatar } from "./Avatar";

interface PlanCardProps {
  plan: PlanWithMembers;
  onClick: () => void;
}

export function PlanCard({ plan, onClick }: PlanCardProps) {
  const { user } = useAuth();
  const when = planWhen(plan.date, plan.time);
  const going = plan.members.filter((m) => m.rsvp === "going");
  const mine = plan.members.find((m) => m.userId === user?.id);
  const needsReply = mine?.rsvp === "pending";
  const whenLine = [when.relative, when.time].filter(Boolean).join(" · ");

  return (
    <button
      className="press"
      onClick={onClick}
      aria-label={`${plan.title}, ${whenLine}, ${going.length} going`}
      style={{
        width: 224,
        minWidth: 224,
        minHeight: 140,
        padding: "var(--space-4)",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        color: "var(--color-text)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 48,
            borderRadius: 10,
            background: "var(--color-complete-bg)",
            color: "var(--color-accent)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {when.dated ? (
            <>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                {when.weekday}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{when.day}</span>
            </>
          ) : (
            <CalendarBlank size={22} weight="regular" />
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {plan.title}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 2 }}>{whenLine}</div>
          {plan.location && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                color: "var(--color-text-tertiary)",
                marginTop: 2,
              }}
            >
              <MapPin size={13} weight="regular" style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {plan.location}
              </span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <div style={{ display: "flex" }}>
            {going.slice(0, 3).map((m, i) => (
              <div key={m.id} style={{ marginLeft: i > 0 ? -8 : 0 }}>
                <Avatar name={m.name || m.username} src={m.avatarUrl} size={24} ring="var(--color-surface)" />
              </div>
            ))}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-tertiary)" }}>
            {going.length} going
          </span>
        </div>
        {needsReply && (
          <span
            style={{
              height: 24,
              padding: "0 var(--space-2)",
              display: "flex",
              alignItems: "center",
              borderRadius: 9999,
              background: "var(--color-complete-bg)",
              color: "var(--color-accent)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Respond
          </span>
        )}
      </div>
    </button>
  );
}
