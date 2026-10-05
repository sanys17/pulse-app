import { useEffect } from "react";
import { Check } from "@phosphor-icons/react";
import { useHabitsContext } from "../context/HabitsContext";
import { HabitIcon } from "./HabitIcon";
import { HABIT_COLORS } from "../types";

interface QuickLogProps {
  onClose: () => void;
}

export function QuickLog({ onClose }: QuickLogProps) {
  const { todaysHabits, isCompleted, toggleCompletion } = useHabitsContext();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "relative",
          background: "var(--color-surface)",
          borderRadius: "20px 20px 0 0",
          padding: "var(--space-6) var(--space-4)",
          paddingBottom: "calc(var(--space-6) + env(safe-area-inset-bottom, 0px))",
          maxHeight: "70vh",
          overflowY: "auto",
          animation: "slideUp 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "var(--color-border)",
            margin: "0 auto var(--space-5)",
          }}
        />

        <h2
          style={{
            fontSize: "var(--text-lg)",
            fontWeight: 700,
            marginBottom: "var(--space-4)",
          }}
        >
          Quick Log
        </h2>

        {todaysHabits.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
            No habits for today
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {todaysHabits.map((habit) => {
              const color = HABIT_COLORS[habit.color];
              const completed = isCompleted(habit.id);

              return (
                <button
                  key={habit.id}
                  onClick={() => toggleCompletion(habit.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    background: completed ? "var(--color-complete-bg)" : "var(--color-surface-dim)",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 200ms ease",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--radius-sm)",
                      background: color.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <HabitIcon name={habit.icon} size={20} color={color.fill} />
                  </div>

                  <span
                    style={{
                      flex: 1,
                      fontSize: "var(--text-base)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    {habit.name}
                  </span>

                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      border: completed
                        ? "2px solid var(--color-complete)"
                        : "2px solid var(--color-border)",
                      background: completed ? "var(--color-complete)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                      flexShrink: 0,
                    }}
                  >
                    {completed && <Check size={16} weight="bold" color="white" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
