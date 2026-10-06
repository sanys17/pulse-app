import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Lightning, Moon, Footprints, Check, CalendarBlank } from "@phosphor-icons/react";
import { useHabitsContext } from "../context/HabitsContext";
import { useUltrahuman } from "../hooks/useUltrahuman";
import { useGoogleCalendar, formatRelativeTime } from "../hooks/useGoogleCalendar";
import { HabitIcon } from "../components/HabitIcon";
import { HABIT_COLORS } from "../types";
import type { Habit } from "../types";

interface HomeProps {
  onEditHabit: (habit: Habit) => void;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getArcFillPath(percent: number): string {
  if (percent <= 0) return "";
  const p = Math.min(percent, 99.7);
  const cx = 117.314;
  const cy = 117.313;
  const R = 117.313;
  const r = 113.313;
  const startAngle = Math.PI;
  const sweepAngle = (p / 100) * Math.PI;
  const endAngle = startAngle - sweepAngle;
  const ox1 = cx + R * Math.cos(startAngle);
  const oy1 = cy - R * Math.sin(startAngle);
  const ox2 = cx + R * Math.cos(endAngle);
  const oy2 = cy - R * Math.sin(endAngle);
  const ix1 = cx + r * Math.cos(endAngle);
  const iy1 = cy - r * Math.sin(endAngle);
  const ix2 = cx + r * Math.cos(startAngle);
  const iy2 = cy - r * Math.sin(startAngle);
  const largeArc = sweepAngle > Math.PI ? 1 : 0;
  return [
    `M ${ox1.toFixed(3)} ${oy1.toFixed(3)}`,
    `A ${R} ${R} 0 ${largeArc} 1 ${ox2.toFixed(3)} ${oy2.toFixed(3)}`,
    `L ${ix1.toFixed(3)} ${iy1.toFixed(3)}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${ix2.toFixed(3)} ${iy2.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function PulseScoreArc({ score }: { score: number }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: 200,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      overflow: "visible",
    }}>
      <div style={{
        position: "absolute",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        width: 234.628,
        height: 118,
      }}>
        <img
          alt=""
          src="/assets/arc-track.svg"
          style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", maxWidth: "none" }}
        />
      </div>

      {score > 0 && (
        <div style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          width: 234.628,
          height: 118,
        }}>
          <svg
            width="233.641"
            height="118"
            viewBox="0 0 234.628 118"
            fill="none"
            style={{ display: "block", width: "100%", height: "100%" }}
          >
            <defs>
              <linearGradient id="arcFillGrad" x1="234" y1="100" x2="0" y2="118" gradientUnits="userSpaceOnUse">
                <stop stopColor="#846EE9" />
                <stop offset="1" stopColor="#0B0B1F" />
              </linearGradient>
            </defs>
            <path d={getArcFillPath(score)} fill="url(#arcFillGrad)" />
          </svg>
        </div>
      )}

      <p style={{
        position: "absolute",
        top: 54,
        left: "50%",
        transform: "translateX(-50%)",
        fontFamily: "Geist, Inter, system-ui, sans-serif",
        fontWeight: 700,
        fontSize: 64,
        lineHeight: "normal",
        color: "#EAECF4",
        whiteSpace: "nowrap",
        margin: 0,
      }}>
        {score}
      </p>

      <p style={{
        position: "absolute",
        top: 128,
        left: "50%",
        transform: "translateX(-50%)",
        fontFamily: "Geist, Inter, system-ui, sans-serif",
        fontWeight: 500,
        fontSize: 16,
        lineHeight: "normal",
        color: "#EAECF4",
        whiteSpace: "nowrap",
        margin: 0,
      }}>
        Pulse Score
      </p>
    </div>
  );
}

export function Home(_props: HomeProps) {
  const navigate = useNavigate();
  const { habits, completions, isCompleted, toggleCompletion, getStreak } =
    useHabitsContext();
  const { vitals, loading: vitalsLoading, refetch: refetchVitals } =
    useUltrahuman();
  const calendar = useGoogleCalendar();

  const today = new Date();
  const todayKey = toDateKey(today);
  const [selectedDate, setSelectedDate] = useState(todayKey);

  useEffect(() => {
    refetchVitals(selectedDate);
  }, [selectedDate, refetchVitals]);

  const dateStrip = useMemo(() => {
    const days: {
      dateKey: string;
      label: string;
      todayLabel: string;
      isToday: boolean;
    }[] = [];
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

  const selectedDateObj = useMemo(
    () => new Date(selectedDate + "T12:00:00"),
    [selectedDate],
  );
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
      completions.some((c) => c.habitId === h.id && c.date === selectedDate),
    ).length;
    return { done, total: dayHabits.length };
  }, [dayHabits, completions, selectedDate]);

  const progressPercent =
    dayProgress.total > 0
      ? Math.round((dayProgress.done / dayProgress.total) * 100)
      : 0;

  const allCompletedDates = useMemo(() => {
    const dateSet = new Set<string>();
    const dateHabitCount = new Map<string, number>();
    const dateDoneCount = new Map<string, number>();
    for (const h of habits) {
      for (let i = -7; i <= 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const key = toDateKey(d);
        const dow = d.getDay();
        if (h.frequency === "daily" || dow === 1) {
          dateHabitCount.set(key, (dateHabitCount.get(key) || 0) + 1);
        }
      }
    }
    for (const c of completions) {
      dateDoneCount.set(c.date, (dateDoneCount.get(c.date) || 0) + 1);
    }
    for (const [key, total] of dateHabitCount) {
      const done = dateDoneCount.get(key) || 0;
      if (done >= total && total > 0) dateSet.add(key);
    }
    return dateSet;
  }, [habits, completions, todayKey]);

  const nextHabits = useMemo(
    () => dayHabits.filter((h) => !isCompleted(h.id, selectedDate)).slice(0, 2),
    [dayHabits, isCompleted, selectedDate],
  );

  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem("pulse-tasks");
      if (saved) return JSON.parse(saved) as { id: string; label: string; done: boolean }[];
    } catch { /* ignore */ }
    return [
      { id: "t1", label: "Review App Design", done: false },
      { id: "t2", label: "Call Marc", done: false },
      { id: "t3", label: "Schedule a Meeting", done: false },
    ];
  });

  useEffect(() => {
    try { localStorage.setItem("pulse-tasks", JSON.stringify(tasks)); } catch { /* ignore */ }
  }, [tasks]);

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  };

  const geist = "Geist, Inter, system-ui, sans-serif";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, overflow: "visible", position: "relative" }}>
      {/* Fixed glow — stays locked behind content */}
      <div style={{
        position: "fixed",
        top: -100,
        left: "50%",
        transform: "translateX(-50%)",
        width: 302,
        height: 302,
        pointerEvents: "none",
        zIndex: 0,
      }}>
        <div style={{ position: "absolute", inset: "-32.95%" }}>
          <img
            alt=""
            src="/assets/glow-ellipse.svg"
            style={{ display: "block", width: "100%", height: "100%", maxWidth: "none" }}
          />
        </div>
      </div>

      {/* Profile avatar — Figma: 32×32 circle, border 1px #8E9BC4, top-right */}
      <div
        onClick={() => navigate("/settings")}
        style={{
          position: "absolute",
          top: -4,
          right: 0,
          width: 32,
          height: 32,
          borderRadius: 100,
          border: "1px solid #8E9BC4",
          overflow: "hidden",
          cursor: "pointer",
          zIndex: 10,
        }}
      >
        <img
          src="/assets/profile-avatar.png"
          alt="Profile"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      <PulseScoreArc score={progressPercent} />

      {/* Backdrop — gradually covers the fixed glow as user scrolls */}
      <div style={{
        background: "linear-gradient(to bottom, transparent 0%, #07070C 40px)",
        margin: "0 -16px",
        padding: "0 16px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>

      <DateStrip
        days={dateStrip}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        completedDates={allCompletedDates}
      />

      {!isToday && (
        <p style={{
          fontSize: 13,
          color: "var(--color-text-secondary)",
          textAlign: "center",
          margin: "-8px 0",
        }}>
          {selectedDateObj.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      )}

      {/* Vitals pills — Figma: compact row, bg rgba(28,28,42,0.2), rounded-full, gap 16 */}
      {!vitalsLoading && vitals && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
          {vitals.recovery && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 100,
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <Lightning size={14} weight="fill" color="white" />
              <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 13, color: "white" }}>
                {vitals.recovery.score}
              </span>
            </div>
          )}
          {vitals.sleep && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 100,
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <Moon size={13} weight="fill" color="white" />
              <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 13, color: "white" }}>
                {Math.floor(vitals.sleep.totalMinutes / 60)}h {vitals.sleep.totalMinutes % 60}m
              </span>
            </div>
          )}
          {vitals.steps && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 100,
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <Footprints size={14} weight="fill" color="white" />
              <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 13, color: "white" }}>
                {vitals.steps.total >= 1000 ? `${(vitals.steps.total / 1000).toFixed(1)}k` : vitals.steps.total}
              </span>
            </div>
          )}
          {!vitals.steps && vitals.hrv && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 100,
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <Footprints size={14} weight="fill" color="white" />
              <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 13, color: "white" }}>
                {vitals.hrv.avg}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Next Up — Figma: Geist Bold 18px header + dark card (rgba(28,28,42,0.65), rx=20) */}
      <section style={{ marginTop: 8 }}>
        <h2 style={{
          fontFamily: geist, fontWeight: 700, fontSize: 18,
          color: "#EAECF4", margin: "0 0 12px 0",
        }}>
          Next Up
        </h2>
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16,
          padding: "14px 16px",
        }}>
          {calendar.connected && calendar.events.length > 0 ? (
            calendar.events.map((event, i) => {
              const startStr = event.start.dateTime || event.start.date || "";
              return (
                <div key={event.id}>
                  {i > 0 && (
                    <div style={{ height: 1, background: "rgba(234,236,244,0.08)", margin: "10px 0" }} />
                  )}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "5px 0",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CalendarBlank size={15} weight="regular" color="white" />
                      <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 16, color: "white" }}>
                        {event.summary || "No title"}
                      </span>
                    </div>
                    <span style={{ fontFamily: geist, fontWeight: 300, fontSize: 14, color: "white" }}>
                      {startStr ? formatRelativeTime(startStr) : ""}
                    </span>
                  </div>
                </div>
              );
            })
          ) : calendar.connected && !calendar.loading ? (
            <p style={{
              fontFamily: geist, fontWeight: 500, fontSize: 16,
              color: "rgba(234,236,244,0.5)", textAlign: "center", margin: 0, padding: "8px 0",
            }}>
              No upcoming events
            </p>
          ) : calendar.available && !calendar.connected ? (
            <div
              onClick={calendar.connect}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 8, cursor: "pointer", padding: "8px 0",
              }}
            >
              <CalendarBlank size={16} weight="regular" color="rgba(142,155,196,0.8)" />
              <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 16, color: "rgba(142,155,196,0.8)" }}>
                Connect Calendar
              </span>
            </div>
          ) : nextHabits.length > 0 ? (
            nextHabits.map((habit, i) => (
              <div key={habit.id}>
                {i > 0 && (
                  <div style={{ height: 1, background: "rgba(234,236,244,0.08)", margin: "10px 0" }} />
                )}
                <div
                  onClick={() => toggleCompletion(habit.id, selectedDate)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer", padding: "5px 0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <HabitIcon name={habit.icon} size={15} color="white" />
                    <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 16, color: "white" }}>
                      {habit.name}
                    </span>
                  </div>
                  <span style={{ fontFamily: geist, fontWeight: 300, fontSize: 14, color: "white" }}>
                    {getStreak(habit.id) > 0 ? `${getStreak(habit.id)} day streak` : habit.frequency}
                  </span>
                </div>
              </div>
            ))
          ) : habits.length > 0 ? (
            <p style={{
              fontFamily: geist, fontWeight: 500, fontSize: 16,
              color: "rgba(234,236,244,0.5)", textAlign: "center", margin: 0, padding: "8px 0",
            }}>
              All done for today
            </p>
          ) : (
            <div
              onClick={() => navigate("/habits")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", padding: "8px 0",
              }}
            >
              <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 16, color: "rgba(234,236,244,0.5)" }}>
                Add your first habit
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Today's Tasks — Figma: Geist Bold 18px header + task list with 17×17 checkboxes */}
      <section>
        <h2 style={{
          fontFamily: geist, fontWeight: 700, fontSize: 18,
          color: "#EAECF4", margin: "0 0 16px 0",
        }}>
          Today's Tasks
        </h2>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {tasks.map((task, i) => (
            <div key={task.id}>
              <div
                onClick={() => toggleTask(task.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  cursor: "pointer", padding: "8px 0",
                }}
              >
                <div style={{
                  width: 17, height: 17, flexShrink: 0,
                  border: "1px solid #8E9BC4",
                  background: task.done ? "#8E9BC4" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 200ms ease",
                }}>
                  {task.done && <Check size={11} weight="bold" color="#07070C" />}
                </div>
                <span style={{
                  fontFamily: geist, fontWeight: 500, fontSize: 18, color: "white",
                  textDecoration: task.done ? "line-through" : "none",
                  opacity: task.done ? 0.5 : 1,
                  transition: "all 200ms ease",
                }}>
                  {task.label}
                </span>
              </div>
              {i < tasks.length - 1 && (
                <div style={{ height: 1, background: "rgba(234,236,244,0.08)", width: 201 }} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Today's Habits — below fold, existing grid */}
      {habits.length > 0 && dayHabits.length > 0 && (
        <section>
          <h2 style={{
            fontFamily: geist, fontWeight: 700, fontSize: 18,
            color: "#EAECF4", margin: "0 0 12px 0",
          }}>
            {isToday ? "Today's Habits" : "Habits"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {dayHabits.map((habit) => {
              const color = HABIT_COLORS[habit.color];
              const completed = isCompleted(habit.id, selectedDate);
              const streak = getStreak(habit.id);
              return (
                <div
                  key={habit.id}
                  onClick={() => toggleCompletion(habit.id, selectedDate)}
                  style={{
                    padding: 16,
                    background: color.bg,
                    borderRadius: 12,
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
                  <div style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: completed ? `2px solid ${color.fill}` : `2px solid ${color.text}40`,
                    background: completed ? color.fill : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}>
                    {completed && <Check size={14} weight="bold" color="white" />}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <HabitIcon name={habit.icon} size={28} color={color.fill} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: color.text }}>{habit.name}</div>
                    <div style={{ fontSize: 13, color: `${color.text}99`, marginTop: 2 }}>
                      {streak > 0 ? `${streak} day streak` : habit.frequency}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasHiddenWeekly && (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", marginTop: 12 }}>
              Weekly habits appear on Mondays
            </p>
          )}
        </section>
      )}

      </div>{/* end opaque backdrop */}
    </div>
  );
}

function DateStrip({
  days,
  selectedDate,
  onSelect,
  completedDates,
}: {
  days: { dateKey: string; label: string; todayLabel: string; isToday: boolean }[];
  selectedDate: string;
  onSelect: (key: string) => void;
  completedDates: Set<string>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });

  useEffect(() => {
    const container = scrollRef.current;
    const el = todayRef.current;
    if (!container || !el) return;
    container.scrollLeft = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = { isDown: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.isDown) return;
    const dx = e.clientX - dragState.current.startX;
    if (Math.abs(dx) > 3) dragState.current.moved = true;
    scrollRef.current!.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current.isDown = false;
  }, []);

  const handleClick = useCallback(
    (key: string) => { if (!dragState.current.moved) onSelect(key); },
    [onSelect],
  );

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
        gap: 8,
        overflowX: "auto",
        margin: "0 -16px",
        padding: "4px 16px",
        scrollbarWidth: "none",
        cursor: "grab",
        userSelect: "none",
        touchAction: "pan-x",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {days.map((day) => {
        const isSelected = day.dateKey === selectedDate;
        const isDayCompleted = completedDates.has(day.dateKey) && !day.isToday && !isSelected;

        return (
          <button
            key={day.dateKey}
            ref={day.isToday ? todayRef : undefined}
            onClick={() => handleClick(day.dateKey)}
            style={{
              height: 40,
              minWidth: day.isToday ? 118 : 40,
              padding: day.isToday ? "0 12px" : "0",
              borderRadius: 9999,
              border: "none",
              background: isSelected
                ? "rgba(18,18,28,0.84)"
                : isDayCompleted
                  ? "#FFFFFF"
                  : "rgba(98,104,128,0)",
              color: isSelected
                ? "#EAECF4"
                : isDayCompleted
                  ? "#282828"
                  : "#EAECF4",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "Inter, system-ui, sans-serif",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              flexShrink: 0,
              textAlign: "center",
              cursor: "pointer",
              boxShadow: isSelected || isDayCompleted
                ? "0px 2px 2px 0px rgba(0,0,0,0.1)"
                : "0px 2px 1px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {day.isToday ? day.todayLabel : day.label}
          </button>
        );
      })}
    </div>
  );
}
