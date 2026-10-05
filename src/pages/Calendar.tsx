import { useMemo } from "react";
import { useHabitsContext } from "../context/HabitsContext";
import { HABIT_COLORS } from "../types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Calendar() {
  const { habits, completions, getWeeklyData } = useHabitsContext();

  const today = new Date();
  const monthLabel = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const calendarDays = useMemo(() => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { date: string; day: number; isToday: boolean; inMonth: boolean }[] = [];

    for (let i = 0; i < startDow; i++) {
      const d = new Date(year, month, -startDow + i + 1);
      days.push({
        date: d.toISOString().slice(0, 10),
        day: d.getDate(),
        isToday: false,
        inMonth: false,
      });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const key = date.toISOString().slice(0, 10);
      days.push({
        date: key,
        day: d,
        isToday: key === today.toISOString().slice(0, 10),
        inMonth: true,
      });
    }

    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push({
          date: d.toISOString().slice(0, 10),
          day: d.getDate(),
          isToday: false,
          inMonth: false,
        });
      }
    }

    return days;
  }, [today.toDateString()]);

  const completionsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of completions) {
      map[c.date] = (map[c.date] || 0) + 1;
    }
    return map;
  }, [completions]);

  const dailyHabitCount = useMemo(() => {
    return habits.filter((h) => h.frequency === "daily").length;
  }, [habits]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <h1
        style={{
          fontSize: "var(--text-2xl)",
          fontWeight: 700,
          letterSpacing: "-0.03em",
        }}
      >
        {monthLabel}
      </h1>

      {/* Calendar grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 2,
          textAlign: "center",
        }}
      >
        {DAYS.map((d) => (
          <div
            key={d}
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              padding: "var(--space-2) 0",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {d}
          </div>
        ))}

        {calendarDays.map((day) => {
          const done = completionsByDate[day.date] || 0;
          const allDone = dailyHabitCount > 0 && done >= dailyHabitCount;
          const partial = done > 0 && !allDone;

          return (
            <div
              key={day.date}
              style={{
                position: "relative",
                aspectRatio: "1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                fontSize: "var(--text-sm)",
                fontWeight: day.isToday ? 700 : 400,
                color: !day.inMonth
                  ? "var(--color-text-secondary)"
                  : day.isToday
                    ? "var(--color-canvas)"
                    : "var(--color-text)",
                background: day.isToday
                  ? "var(--color-text)"
                  : allDone
                    ? "var(--color-complete-bg)"
                    : "transparent",
                opacity: day.inMonth ? 1 : 0.3,
              }}
            >
              {day.day}
              {partial && day.inMonth && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 4,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--color-complete)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Habit streaks */}
      {habits.length > 0 && (
        <section>
          <h2
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              marginBottom: "var(--space-3)",
            }}
          >
            This Month
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {habits.map((habit) => {
              const weeks = getWeeklyData(habit.id, 4);
              const color = HABIT_COLORS[habit.color];
              const totalDone = weeks.flat().filter((d) => d.completed).length;

              return (
                <div
                  key={habit.id}
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
                      alignItems: "center",
                      marginBottom: "var(--space-3)",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                      {habit.name}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {totalDone}/{weeks.flat().length} days
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7, 1fr)",
                      gap: 3,
                    }}
                  >
                    {weeks.flat().map((day) => (
                      <div
                        key={day.date}
                        style={{
                          aspectRatio: "1",
                          borderRadius: 4,
                          background: day.completed ? color.fill : "var(--color-border)",
                          opacity: day.completed ? 1 : 0.3,
                          transition: "background 200ms ease",
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
