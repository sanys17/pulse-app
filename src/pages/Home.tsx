import { useNavigate } from "react-router-dom";
import { Fire, Trophy, CalendarCheck, Heartbeat, Moon, Footprints, WaveTriangle } from "@phosphor-icons/react";
import { useHabitsContext } from "../context/HabitsContext";
import { useUltrahuman } from "../hooks/useUltrahuman";
import { HabitCard } from "../components/HabitCard";
import { HabitIcon } from "../components/HabitIcon";
import { HABIT_COLORS } from "../types";
import type { Habit } from "../types";

interface HomeProps {
  onEditHabit: (habit: Habit) => void;
}

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

export function Home({ onEditHabit }: HomeProps) {
  const navigate = useNavigate();
  const {
    habits,
    todaysHabits,
    todaysProgress,
    isCompleted,
    toggleCompletion,
    getStreak,
    hasHiddenWeekly,
    bestStreak,
    weeklyPerfectDays,
    recentActivity,
  } = useHabitsContext();
  const { vitals, loading: vitalsLoading } = useUltrahuman();

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

  const allDoneToday =
    todaysHabits.length > 0 &&
    todaysProgress.done === todaysProgress.total;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Header */}
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

      {/* Empty state */}
      {habits.length === 0 ? (
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
              transition: "opacity 150ms ease",
            }}
          >
            Add your first habit
          </button>
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "var(--space-3)",
            }}
          >
            {/* Today's Progress */}
            <div
              style={{
                padding: "var(--space-4) var(--space-3)",
                background: "var(--color-surface)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--color-complete-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto var(--space-2)",
                }}
              >
                <CalendarCheck size={16} weight="bold" color="var(--color-complete)" />
              </div>
              <div
                style={{
                  fontSize: "var(--text-xl)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {todaysProgress.done}
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 400,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  /{todaysProgress.total}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                  marginTop: 2,
                }}
              >
                Today
              </div>
            </div>

            {/* Best Streak */}
            <div
              style={{
                padding: "var(--space-4) var(--space-3)",
                background: "var(--color-surface)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--color-habit-orange-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto var(--space-2)",
                }}
              >
                <Fire size={16} weight="bold" color="var(--color-habit-orange-text)" />
              </div>
              <div
                style={{
                  fontSize: "var(--text-xl)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {bestStreak}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                  marginTop: 2,
                }}
              >
                Best streak
              </div>
            </div>

            {/* Weekly Score */}
            <div
              style={{
                padding: "var(--space-4) var(--space-3)",
                background: "var(--color-surface)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--color-habit-purple-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto var(--space-2)",
                }}
              >
                <Trophy size={16} weight="bold" color="var(--color-habit-purple-text)" />
              </div>
              <div
                style={{
                  fontSize: "var(--text-xl)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {weeklyPerfectDays.perfect}
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 400,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  /{weeklyPerfectDays.total}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                  marginTop: 2,
                }}
              >
                Perfect days
              </div>
            </div>
          </div>

          {/* Vitals */}
          {!vitalsLoading && vitals && (
            <section>
              <h2
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                  marginBottom: "var(--space-3)",
                }}
              >
                Vitals
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "var(--space-3)",
                }}
              >
                {vitals.sleep && (
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
                        background: "var(--color-habit-purple-bg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Moon size={18} weight="bold" color="var(--color-habit-purple-text)" />
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
                        {Math.floor(vitals.sleep.duration / 60)}h {vitals.sleep.duration % 60}m
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                        Sleep
                      </div>
                    </div>
                  </div>
                )}

                {vitals.hr && (
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
                        background: "var(--color-habit-red-bg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Heartbeat size={18} weight="bold" color="var(--color-habit-red-text)" />
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
                        {vitals.hr.avg}
                        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--color-text-secondary)" }}> bpm</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                        Avg HR
                      </div>
                    </div>
                  </div>
                )}

                {vitals.hrv && (
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
                        background: "var(--color-habit-blue-bg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <WaveTriangle size={18} weight="bold" color="var(--color-habit-blue-text)" />
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
                        {vitals.hrv.avg}
                        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--color-text-secondary)" }}> ms</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                        HRV
                      </div>
                    </div>
                  </div>
                )}

                {vitals.steps && (
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
                        background: "var(--color-habit-green-bg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Footprints size={18} weight="bold" color="var(--color-habit-green-text)" />
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
                        {vitals.steps.total.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                        Steps
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Today's Habits */}
          <section>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "var(--space-3)",
              }}
            >
              <h2
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Today
              </h2>
              {allDoneToday && (
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 600,
                    color: "var(--color-complete)",
                  }}
                >
                  All done
                </span>
              )}
            </div>

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

          {/* Recent Activity */}
          {recentActivity.length > 0 && (
            <section>
              <h2
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                  marginBottom: "var(--space-3)",
                }}
              >
                Last 7 days
              </h2>

              <div
                style={{
                  padding: "var(--space-4)",
                  background: "var(--color-surface)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {/* Day labels */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr repeat(7, 28px)",
                    gap: 4,
                    alignItems: "center",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  <div />
                  {recentActivity[0].days.map((day) => {
                    const d = new Date(day.date + "T12:00:00");
                    return (
                      <span
                        key={day.date}
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: "var(--color-text-secondary)",
                          textAlign: "center",
                        }}
                      >
                        {DAY_NAMES[d.getDay()]}
                      </span>
                    );
                  })}
                </div>

                {/* Habit rows */}
                {recentActivity.map(({ habit, days }) => {
                  const color = HABIT_COLORS[habit.color];
                  return (
                    <div
                      key={habit.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr repeat(7, 28px)",
                        gap: 4,
                        alignItems: "center",
                        padding: "6px 0",
                        borderTop: "1px solid var(--color-border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                          overflow: "hidden",
                        }}
                      >
                        <HabitIcon name={habit.icon} size={14} color={color.fill} />
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {habit.name}
                        </span>
                      </div>
                      {days.map((day) => (
                        <div
                          key={day.date}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            background: day.done ? color.fill : "var(--color-surface-dim)",
                            opacity: day.done ? 0.85 : 1,
                            margin: "0 auto",
                            transition: "background 200ms ease",
                          }}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
