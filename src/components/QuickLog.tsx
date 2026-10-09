import { Check } from "@phosphor-icons/react";
import { useHabitsContext } from "../context/HabitsContext";
import { HabitIcon } from "./HabitIcon";
import { Sheet } from "./Sheet";
import { HABIT_COLORS } from "../types";

interface QuickLogProps {
  onClose: () => void;
}

export function QuickLog({ onClose }: QuickLogProps) {
  const { todaysHabits, isCompleted, toggleCompletion } = useHabitsContext();

  return (
    <Sheet title="Quick Log" onClose={onClose} maxHeight="70dvh">
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
    </Sheet>
  );
}
