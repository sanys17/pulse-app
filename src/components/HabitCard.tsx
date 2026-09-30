import { useState, useCallback } from "react";
import { Check } from "@phosphor-icons/react";
import { HABIT_COLORS } from "../types";
import type { Habit } from "../types";
import { HabitIcon } from "./HabitIcon";

interface HabitCardProps {
  habit: Habit;
  completed: boolean;
  streak: number;
  onToggle: () => void;
  onEdit: () => void;
}

export function HabitCard({ habit, completed, streak, onToggle, onEdit }: HabitCardProps) {
  const [pressing, setPressing] = useState(false);
  const [animating, setAnimating] = useState(false);
  const colorSet = HABIT_COLORS[habit.color];

  const handleToggle = useCallback(() => {
    if (!completed) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 400);
    }
    onToggle();
  }, [completed, onToggle]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        padding: "var(--space-4)",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
        transition: "transform 200ms cubic-bezier(0.2, 0, 0, 1)",
        cursor: "pointer",
      }}
      onClick={onEdit}
    >
      <button
        aria-label={`Mark ${habit.name} as ${completed ? "incomplete" : "complete"}`}
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
        onPointerDown={() => setPressing(true)}
        onPointerUp={() => setPressing(false)}
        onPointerLeave={() => setPressing(false)}
        style={{
          width: 44,
          height: 44,
          minWidth: 44,
          borderRadius: "50%",
          border: completed
            ? "2px solid transparent"
            : `2px solid ${colorSet.fill}`,
          background: completed ? colorSet.fill : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          transform: pressing
            ? "scale(0.88)"
            : animating
            ? "scale(1.1)"
            : "scale(1)",
          cursor: "pointer",
        }}
      >
        {completed && (
          <Check
            size={22}
            weight="bold"
            color="white"
            style={{
              opacity: animating ? 0 : 1,
              transform: animating ? "scale(0) rotate(-90deg)" : "scale(1) rotate(0deg)",
              transition: "all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              transitionDelay: animating ? "0ms" : "80ms",
            }}
          />
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <HabitIcon
            name={habit.icon}
            size={18}
            color={colorSet.fill}
          />
          <span
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: 600,
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
              textDecoration: completed ? "line-through" : "none",
              opacity: completed ? 0.5 : 1,
              transition: "opacity 200ms ease",
            }}
          >
            {habit.name}
          </span>
        </div>
        {streak > 0 && (
          <span
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
              marginTop: 2,
              display: "block",
            }}
          >
            {streak} day{streak !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: completed ? "var(--color-complete)" : "var(--color-border)",
          transition: "background 250ms ease",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
    </div>
  );
}
