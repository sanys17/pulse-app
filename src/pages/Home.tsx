import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    completions,
    isCompleted,
    toggleCompletion,
    getStreak,
  } = useHabitsContext();
  const { vitals, loading: vitalsLoading, refetch: refetchVitals } = useUltrahuman();

  const today = new Date();
  const todayKey = toDateKey(today);
  const [selectedDate, setSelectedDate] = useState(todayKey);

  useEffect(() => {
    refetchVitals(selectedDate);
  }, [selectedDate, refetchVitals]);

  const dateStrip = useMemo(() => {
    const days: { dateKey: string; label: string; todayLabel: string; isToday: boolean }[] = [];
    for (let i = -7; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = toDateKey(d);
      days.push({
        dateKey: key,
        label: String(d.getDate()),
        todayLabel: `Today ${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`,
        isToday: key === todayKey,
      });
    }
    return days;
  }, [todayKey]);

  const selectedDateObj = useMemo(() => new Date(selectedDate + "T12:00:00"), [selectedDate]);
  const isToday = selectedDate === todayKey;

  const dayHabits = useMemo(() => {
    const dayOfWeek = selectedDateObj.getDay();
    return habits.filter((h) => {
      if (h.frequency === "daily") return true;
      return dayOfWeek === 1;
    });
  }, [habits, selectedDateObj]);

  const hasHiddenWeekly = useMemo(() => {
    const dayOfWeek = selectedDateObj.getDay();
    return dayOfWeek !== 1 && habits.some((h) => h.frequency === "weekly");
  }, [habits, selectedDateObj]);

  const dayProgress = useMemo(() => {
    if (dayHabits.length === 0) return { done: 0, total: 0 };
    const done = dayHabits.filter((h) =>
      completions.some((c) => c.habitId === h.id && c.date === selectedDate)
    ).length;
    return { done, total: dayHabits.length };
  }, [dayHabits, completions, selectedDate]);

  const progressPercent = dayProgress.total > 0
    ? Math.round((dayProgress.done / dayProgress.total) * 100)
    : 0;

  const nextHabit = dayHabits.find((h) => !isCompleted(h.id, selectedDate));

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

      {/* Date Strip — draggable, today centered on mount */}
      <DateStrip
        days={dateStrip}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
      />

      {/* Selected date label when not today */}
      {!isToday && (
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            textAlign: "center",
            margin: "calc(-1 * var(--space-3)) 0",
          }}
        >
          {selectedDateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      )}

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

          {/* Habits grid */}
          <section>
            <h2
              style={{
                fontSize: "var(--text-lg)",
                fontWeight: 700,
                marginBottom: "var(--space-3)",
              }}
            >
              {isToday ? "Today's Habits" : "Habits"}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3)",
              }}
            >
              {dayHabits.map((habit) => {
                const color = HABIT_COLORS[habit.color];
                const completed = isCompleted(habit.id, selectedDate);
                const streak = getStreak(habit.id);

                return (
                  <div
                    key={habit.id}
                    onClick={() => toggleCompletion(habit.id, selectedDate)}
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

function DateStrip({
  days,
  selectedDate,
  onSelect,
}: {
  days: { dateKey: string; label: string; todayLabel: string; isToday: boolean }[];
  selectedDate: string;
  onSelect: (key: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });

  useEffect(() => {
    const container = scrollRef.current;
    const el = todayRef.current;
    if (!container || !el) return;
    const offset = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
    container.scrollLeft = offset;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = { isDown: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.isDown) return;
    const dx = e.clientX - dragState.current.startX;
    if (Math.abs(dx) > 3) dragState.current.moved = true;
    scrollRef.current!.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragState.current.isDown = false;
    const el = scrollRef.current;
    if (el) {
      el.releasePointerCapture(e.pointerId);
      el.style.cursor = "grab";
    }
  }, []);

  const handleClick = useCallback((key: string) => {
    if (!dragState.current.moved) onSelect(key);
  }, [onSelect]);

  return (
    <div
      ref={scrollRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        overflowX: "auto",
        margin: "0 -16px",
        padding: "0 16px 4px",
        scrollbarWidth: "none",
        cursor: "grab",
        userSelect: "none",
        touchAction: "pan-x",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {days.map((day) => {
        const isSelected = day.dateKey === selectedDate;
        return (
          <button
            key={day.dateKey}
            ref={day.isToday ? todayRef : undefined}
            onClick={() => handleClick(day.dateKey)}
            style={{
              padding: day.isToday ? "8px 16px" : "8px 4px",
              borderRadius: 24,
              border: "none",
              background: isSelected ? "var(--color-complete)" : "transparent",
              color: isSelected ? "#fff" : "var(--color-text-secondary)",
              fontSize: "var(--text-base)",
              fontWeight: isSelected ? 600 : 400,
              whiteSpace: "nowrap",
              flexShrink: 0,
              minWidth: day.isToday ? "auto" : 36,
              textAlign: "center",
              cursor: "pointer",
              transition: "background 200ms ease, color 200ms ease",
              fontFamily: "inherit",
            }}
          >
            {day.isToday ? day.todayLabel : day.label}
          </button>
        );
      })}
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
