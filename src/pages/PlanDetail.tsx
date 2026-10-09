import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarBlank,
  MapPin,
  Clock,
  Plus,
  Trash,
  Check,
} from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { subscribeToTables } from "../lib/realtime";
import { AlertPicker } from "../components/AlertPicker";
import { SectionHeader } from "../components/SectionHeader";
import { builtInAlerts } from "../lib/alerts.ts";
import type { ChecklistItem, PlanMember } from "../types";
import type { PlanWithMembers } from "../hooks/useSharedPlans";

const rsvpOptions: { value: PlanMember["rsvp"]; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "declined", label: "Can't make it" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plans } = useSocial();

  const plan: PlanWithMembers | undefined = plans.plans.find((p) => p.id === id);

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [loadingChecklist, setLoadingChecklist] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadChecklistItems = plans.fetchChecklist;
  const fetchChecklist = useCallback(async () => {
    if (!id) return;
    const items = await loadChecklistItems(id);
    setChecklist(items);
    setLoadingChecklist(false);
  }, [id, loadChecklistItems]);

  useEffect(() => {
    fetchChecklist();
    return subscribeToTables(["plan_checklist"], fetchChecklist);
  }, [fetchChecklist]);

  const handleAddItem = useCallback(async () => {
    if (!id || !newItem.trim()) return;
    await plans.addChecklistItem(id, newItem.trim());
    setNewItem("");
    await fetchChecklist();
  }, [id, newItem, plans, fetchChecklist]);

  const handleToggle = useCallback(
    async (item: ChecklistItem) => {
      setChecklist((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)),
      );
      await plans.toggleChecklistItem(item.id, !item.done);
    },
    [plans],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      setChecklist((prev) => prev.filter((c) => c.id !== itemId));
      await plans.deleteChecklistItem(itemId);
    },
    [plans],
  );

  const handleRsvp = useCallback(
    (rsvp: PlanMember["rsvp"]) => {
      if (!id) return;
      plans.updateRsvp(id, rsvp);
    },
    [id, plans],
  );

  const handleDeletePlan = useCallback(async () => {
    if (!id || deleting) return;
    setDeleting(true);
    setDeleteError("");
    const ok = await plans.deletePlan(id);
    if (ok) {
      navigate("/social", { replace: true, state: { toast: "Plan deleted" } });
      return;
    }
    setDeleting(false);
    setDeleteError("Couldn't delete the plan. Check your connection and try again.");
  }, [id, deleting, plans, navigate]);

  if (!plan) {
    return (
      <div style={{ padding: "var(--space-6) var(--space-4)" }}>
        <button
          onClick={() => navigate("/social")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            background: "none",
            border: "none",
            color: "var(--p-accent)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          <ArrowLeft size={18} weight="bold" />
          Back
        </button>
        <p style={{ marginTop: "var(--space-6)", color: "var(--color-text-secondary)" }}>
          Plan not found
        </p>
      </div>
    );
  }

  const myRsvp = plan.members.find((m) => m.userId === user?.id)?.rsvp;
  const myAlerts = plan.members.find((m) => m.userId === user?.id)?.alerts ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <button
        onClick={() => navigate("/social")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          background: "none",
          border: "none",
          color: "var(--p-accent)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
        }}
      >
        <ArrowLeft size={18} weight="bold" />
        Back
      </button>

      <div>
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          {plan.title}
        </h1>
        {plan.description && (
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
              marginTop: "var(--space-2)",
              lineHeight: 1.5,
            }}
          >
            {plan.description}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          padding: "var(--space-4)",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", fontSize: 14 }}>
          <CalendarBlank size={18} weight="regular" color="var(--color-text-secondary)" />
          <span>{formatDate(plan.date)}</span>
        </div>
        {plan.time && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", fontSize: 14 }}>
            <Clock size={18} weight="regular" color="var(--color-text-secondary)" />
            <span>{formatTime(plan.time)}</span>
          </div>
        )}
        {plan.location && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", fontSize: 14 }}>
            <MapPin size={18} weight="regular" color="var(--color-text-secondary)" />
            <span>{plan.location}</span>
          </div>
        )}
      </div>

      {/* RSVP */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "var(--space-2)",
          }}
        >
          Your RSVP
        </label>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {rsvpOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleRsvp(opt.value)}
              style={{
                flex: 1,
                height: 40,
                borderRadius: "var(--radius-sm)",
                background: myRsvp === opt.value ? "rgba(142, 155, 196, 0.12)" : "var(--color-surface)",
                border: `1px solid ${myRsvp === opt.value ? "var(--p-accent)" : "var(--color-border)"}`,
                color: myRsvp === opt.value ? "var(--p-accent)" : "var(--color-text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reminder */}
      {plan.date && (
        <div>
          <SectionHeader title="Remind me" />
          <AlertPicker
            value={myAlerts}
            timed={Boolean(plan.time)}
            label="Reminder"
            defaultAlerts={plan.alerts ?? builtInAlerts("plan", Boolean(plan.time))}
            onChange={(alerts) => plans.updateMyAlerts(plan.id, alerts)}
          />
        </div>
      )}

      {/* Members */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "var(--space-2)",
          }}
        >
          Members
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {plan.members.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                background: "var(--color-surface)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
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
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  (m.name || m.username).charAt(0).toUpperCase()
                )}
              </div>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                {m.name || m.username}
              </span>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  color:
                    m.rsvp === "going"
                      ? "#57AB5A"
                      : m.rsvp === "maybe"
                        ? "#C69026"
                        : m.rsvp === "declined"
                          ? "#E5534B"
                          : "var(--color-text-secondary)",
                  textTransform: "capitalize",
                }}
              >
                {m.rsvp}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "var(--space-2)",
          }}
        >
          Checklist
        </label>

        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
            placeholder="Add an item..."
            style={{
              flex: 1,
              height: 40,
              padding: "0 var(--space-3)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              color: "var(--color-text)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleAddItem}
            disabled={!newItem.trim()}
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--radius-sm)",
              background: newItem.trim() ? "var(--p-accent)" : "var(--color-surface-dim)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: newItem.trim() ? "pointer" : "default",
              color: newItem.trim() ? "#07070C" : "var(--color-text-secondary)",
            }}
          >
            <Plus size={18} weight="bold" />
          </button>
        </div>

        {loadingChecklist ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            Loading...
          </p>
        ) : checklist.length === 0 ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", textAlign: "center", padding: "var(--space-4) 0" }}>
            No items yet
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {checklist.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--color-surface)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <button
                  onClick={() => handleToggle(item)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: `2px solid ${item.done ? "var(--p-accent)" : "var(--color-border)"}`,
                    background: item.done ? "var(--p-accent)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "all 200ms ease",
                  }}
                >
                  {item.done && <Check size={14} weight="bold" color="#07070C" />}
                </button>
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    textDecoration: item.done ? "line-through" : "none",
                    opacity: item.done ? 0.5 : 1,
                  }}
                >
                  {item.label}
                </span>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  style={{
                    width: 28,
                    height: 28,
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
                  <Trash size={14} weight="regular" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {plan.creatorId === user?.id && (
        <div style={{ paddingTop: "var(--space-2)" }}>
          {!confirmDelete ? (
            <button
              className="press"
              onClick={() => setConfirmDelete(true)}
              style={{
                width: "100%",
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                background: "transparent",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-danger)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Trash size={16} weight="regular" />
              Delete plan
            </button>
          ) : (
            <div
              style={{
                padding: "var(--space-4)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-danger)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <p style={{ fontSize: 15, fontWeight: 600 }}>Delete "{plan.title}" for everyone?</p>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", marginTop: "var(--space-1)" }}>
                The plan, its checklist and everyone's RSVPs will be removed. This can't be undone.
              </p>
              {deleteError && (
                <p role="alert" style={{ fontSize: "var(--text-sm)", color: "var(--color-danger)", marginTop: "var(--space-2)" }}>
                  {deleteError}
                </p>
              )}
              <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                <button
                  className="press"
                  onClick={handleDeletePlan}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-danger)",
                    border: "none",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    opacity: deleting ? 0.6 : 1,
                  }}
                >
                  {deleting ? "Deleting..." : "Delete plan"}
                </button>
                <button
                  className="press"
                  onClick={() => {
                    setConfirmDelete(false);
                    setDeleteError("");
                  }}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: "var(--radius-sm)",
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
