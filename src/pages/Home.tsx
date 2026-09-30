import { useHabitsContext } from "../context/HabitsContext";
import { HabitCard } from "../components/HabitCard";
import type { Habit } from "../types";

interface HomeProps {
  onEditHabit: (habit: Habit) => void;
}

export function Home({ onEditHabit }: HomeProps) {
  const {
    todaysHabits,
    todaysProgress,
    isCompleted,
    toggleCompletion,
    getStreak,
  } = useHabitsContext();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <header>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            fontWeight: 500,
          }}
        >
          {dateStr}
        </p>
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginTop: "var(--space-1)",
          }}
        >
          {greeting}
        </h1>
      </header>

      {todaysHabits.length > 0 && (
        <div
          style={{
            padding: "var(--space-4)",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "var(--space-3)",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Today
            </span>
            <span
              style={{
                fontSize: "var(--text-2xl)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {todaysProgress.done}
              <span
                style={{
                  fontSize: "var(--text-base)",
                  fontWeight: 400,
                  color: "var(--color-text-secondary)",
                }}
              >
                /{todaysProgress.total}
              </span>
            </span>
          </div>

          <div
            style={{
              width: "100%",
              height: 4,
              background: "var(--color-surface-dim)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width:
                  todaysProgress.total > 0
                    ? `${(todaysProgress.done / todaysProgress.total) * 100}%`
                    : "0%",
                background: "var(--color-complete)",
                borderRadius: 2,
                transition: "width 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            />
          </div>
        </div>
      )}

      <section>
        {todaysHabits.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "var(--space-10) var(--space-4)",
              color: "var(--color-text-secondary)",
            }}
          >
            <p style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
              No habits yet
            </p>
            <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
              Head to the Habits tab to create your first one
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {todaysHabits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                completed={isCompleted(habit.id)}
                streak={getStreak(habit.id)}
                onToggle={() => toggleCompletion(habit.id)}
                onEdit={() => onEditHabit(habit)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
