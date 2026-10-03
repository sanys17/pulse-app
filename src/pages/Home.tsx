import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Heartbeat, Moon, Footprints, WaveTriangle, Lightning, Check } from "@phosphor-icons/react";
import { useHabitsContext } from "../context/HabitsContext";
import { useUltrahuman } from "../hooks/useUltrahuman";
import { HabitIcon } from "../components/HabitIcon";
import { HABIT_COLORS } from "../types";
import type { Habit } from "../types";

interface HomeProps {
  onEditHabit: (habit: Habit) => void;
}

function CircularProgress({ percent }: { percent: number }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="6"
        />
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke="var(--color-complete)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>{percent}%</span>
        <span style={{ fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 500 }}>
          Overall
        </span>
      </div>
    </div>
  );
}

export function Home(_props: HomeProps) {
  const navigate = useNavigate();
  const {
    habits,
    todaysHabits,
    todaysProgress,
    isCompleted,
    toggleCompletion,
    getStreak,
    hasHiddenWeekly,
  } = useHabitsContext();
  const { vitals, loading: vitalsLoading } = useUltrahuman();

  const today = new Date();

  const dateStrip = useMemo(() => {
    const days: { date: Date; label: string; isToday: boolean }[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push({
        date: d,
        label: i === 0
          ? `Today ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : String(d.getDate()),
        isToday: i === 0,
      });
    }
    return days;
  }, [today.toDateString()]);

  const progressPercent = todaysProgress.total > 0
    ? Math.round((todaysProgress.done / todaysProgress.total) * 100)
    : 0;

  const nextHabit = todaysHabits.find((h) => !isCompleted(h.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          Hello Matyas
        </h1>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bell size={20} weight="regular" color="var(--color-text-secondary)" />
        </div>
      </div>

      {/* Date Strip */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          overflowX: "auto",
          paddingBottom: 4,
          margin: "0 -16px",
          padding: "0 16px 4px",
          scrollbarWidth: "none",
        }}
      >
        {dateStrip.map((day) => (
          <div
            key={day.date.toISOString()}
            style={{
              padding: "var(--space-2) var(--space-3)",
              borderRadius: 20,
              background: day.isToday ? "var(--color-text)" : "transparent",
              color: day.isToday ? "var(--color-canvas)" : "var(--color-text-secondary)",
              fontSize: day.isToday ? "var(--text-sm)" : "var(--text-base)",
              fontWeight: day.isToday ? 600 : 500,
              whiteSpace: "nowrap",
              flexShrink: 0,
              minWidth: day.isToday ? "auto" : 40,
              textAlign: "center",
              transition: "all 200ms ease",
            }}
          >
            {day.label}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {habits.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "var(--space-10) var(--space-4)",
            color: "var(--color-text-secondary)",
          }}
        >
          <p style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>No habits yet</p>
          <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
            Start building your daily routine
          </p>
          <button
            onClick={() => navigate("/habits")}
            style={{
              marginTop: "var(--space-4)",
              padding: "var(--space-3) var(--space-6)",
              background: "var(--color-text)",
              color: "var(--color-canvas)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Add your first habit
          </button>
        </div>
      ) : (
        <>
          {/* Vitals - fills the blank space */}
          {!vitalsLoading && vitals && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3)",
              }}
            >
              {vitals.sleep && (
                <VitalCard
                  icon={<Moon size={18} weight="bold" color="var(--color-habit-purple-text)" />}
                  bg="var(--color-habit-purple-bg)"
                  value={`${Math.floor(vitals.sleep.totalMinutes / 60)}h ${vitals.sleep.totalMinutes % 60}m`}
                  label="Sleep"
                />
              )}
              {vitals.hr && (
                <VitalCard
                  icon={<Heartbeat size={18} weight="bold" color="var(--color-habit-red-text)" />}
                  bg="var(--color-habit-red-bg)"
                  value={`${vitals.hr.avg} bpm`}
                  label="Heart Rate"
                />
              )}
              {vitals.hrv && (
                <VitalCard
                  icon={<WaveTriangle size={18} weight="bold" color="var(--color-habit-blue-text)" />}
                  bg="var(--color-habit-blue-bg)"
                  value={`${vitals.hrv.avg} ms`}
                  label="HRV"
                />
              )}
              {vitals.recovery ? (
                <VitalCard
                  icon={<Lightning size={18} weight="bold" color="var(--color-habit-yellow-text)" />}
                  bg="var(--color-habit-yellow-bg)"
                  value={String(vitals.recovery.score)}
                  label="Recovery"
                />
              ) : vitals.steps ? (
                <VitalCard
                  icon={<Footprints size={18} weight="bold" color="var(--color-habit-green-text)" />}
                  bg="var(--color-habit-green-bg)"
                  value={vitals.steps.total.toLocaleString()}
                  label="Steps"
                />
              ) : null}
            </div>
          )}

          {/* Next Habit + Progress Ring */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-4)",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                }}
              >
                {nextHabit ? "Next Habit" : "All done!"}
              </span>
              {nextHabit && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    marginTop: "var(--space-2)",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "var(--radius-sm)",
                      background: HABIT_COLORS[nextHabit.color].bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <HabitIcon
                      name={nextHabit.icon}
                      size={22}
                      color={HABIT_COLORS[nextHabit.color].fill}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
                      {nextHabit.name}
                    </div>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                      {getStreak(nextHabit.id) > 0
                        ? `${getStreak(nextHabit.id)} day streak`
                        : nextHabit.frequency}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <CircularProgress percent={progressPercent} />
          </div>

          {/* Today's Habits - 2x2 grid */}
          <section>
            <h2
              style={{
                fontSize: "var(--text-lg)",
                fontWeight: 700,
                marginBottom: "var(--space-3)",
              }}
            >
              Today's Habits
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3)",
              }}
            >
              {todaysHabits.map((habit) => {
                const color = HABIT_COLORS[habit.color];
                const completed = isCompleted(habit.id);
                const streak = getStreak(habit.id);

                return (
                  <div
                    key={habit.id}
                    onClick={() => toggleCompletion(habit.id)}
                    style={{
                      padding: "var(--space-4)",
                      background: color.bg,
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      position: "relative",
                      minHeight: 100,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      opacity: completed ? 0.7 : 1,
                      transition: "all 200ms ease",
                    }}
                  >
                    {/* Check indicator */}
                    <div
                      style={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: completed
                          ? `2px solid ${color.fill}`
                          : `2px solid ${color.text}40`,
                        background: completed ? color.fill : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                      }}
                    >
                      {completed && <Check size={14} weight="bold" color="white" />}
                    </div>

                    {/* Icon */}
                    <div style={{ marginBottom: "var(--space-3)" }}>
                      <HabitIcon name={habit.icon} size={28} color={color.fill} />
                    </div>

                    {/* Label */}
                    <div>
                      <div
                        style={{
                          fontSize: "var(--text-base)",
                          fontWeight: 600,
                          color: color.text,
                        }}
                      >
                        {habit.name}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--text-sm)",
                          color: `${color.text}99`,
                          marginTop: 2,
                        }}
                      >
                        {streak > 0 ? `${streak} day streak` : habit.frequency}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasHiddenWeekly && (
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-secondary)",
                  textAlign: "center",
                  marginTop: "var(--space-3)",
                }}
              >
                Weekly habits appear on Mondays
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function VitalCard({
  icon,
  bg,
  value,
  label,
}: {
  icon: React.ReactNode;
  bg: string;
  value: string;
  label: string;
}) {
  return (
    <div
      style={{
        padding: "var(--space-4)",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "var(--text-base)", fontWeight: 700 }}>{value}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
