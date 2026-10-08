import { useState, useMemo, useCallback } from "react";
import { CaretLeft, CaretRight, CheckCircle, Plus } from "@phosphor-icons/react";
import { useHabitsContext } from "../context/HabitsContext";
import { useCalendarEventsContext } from "../context/CalendarEventsContext";
import { useGoogleCalendar, type CalendarEvent } from "../hooks/useGoogleCalendar";
import { HABIT_COLORS } from "../types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: string, b: string): boolean {
  return a === b;
}

function getEventDate(event: CalendarEvent): string | null {
  const raw = event.start.dateTime || event.start.date;
  if (!raw) return null;
  return raw.slice(0, 10);
}

function formatEventTime(event: CalendarEvent): string {
  if (event.start.date) return "All day";
  if (!event.start.dateTime) return "";
  const start = new Date(event.start.dateTime);
  const end = event.end.dateTime ? new Date(event.end.dateTime) : null;
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

export function Calendar() {
  const { habits, completions } = useHabitsContext();
  const { events: localEvents, addEvent, removeEvent } = useCalendarEventsContext();
  const gcal = useGoogleCalendar();

  const todayKey = toDateKey(new Date());
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = useCallback(() => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);

  const nextMonth = useCallback(() => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  const goToday = useCallback(() => {
    const now = new Date();
    setViewDate(now);
    setSelectedDate(toDateKey(now));
  }, []);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { key: string; day: number; inMonth: boolean }[] = [];

    for (let i = 0; i < startDow; i++) {
      const d = new Date(year, month, -startDow + i + 1);
      days.push({ key: toDateKey(d), day: d.getDate(), inMonth: false });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ key: toDateKey(date), day: d, inMonth: true });
    }

    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ key: toDateKey(d), day: d.getDate(), inMonth: false });
      }
    }

    return days;
  }, [year, month]);

  const completionsByDate = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const c of completions) {
      if (!map[c.date]) map[c.date] = new Set();
      map[c.date].add(c.habitId);
    }
    return map;
  }, [completions]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of gcal.events) {
      const d = getEventDate(e);
      if (d) {
        if (!map[d]) map[d] = [];
        map[d].push(e);
      }
    }
    return map;
  }, [gcal.events]);

  const dailyHabitCount = useMemo(() => {
    return habits.filter((h) => h.frequency === "daily").length;
  }, [habits]);

  const selectedHabitCompletions = useMemo(() => {
    const done = completionsByDate[selectedDate];
    if (!done) return [];
    return habits.filter((h) => done.has(h.id));
  }, [selectedDate, completionsByDate, habits]);

  const selectedEvents = eventsByDate[selectedDate] || [];
  const selectedLocalEvents = useMemo(
    () => localEvents.filter((e) => e.date === selectedDate),
    [localEvents, selectedDate],
  );

  const localEventsByDate = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const e of localEvents) map[e.date] = true;
    return map;
  }, [localEvents]);

  const selectedDateLabel = useMemo(() => {
    const d = new Date(selectedDate + "T12:00:00");
    if (isSameDay(selectedDate, todayKey)) return "Today";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }, [selectedDate, todayKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {/* Month header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            margin: 0,
          }}
        >
          {monthLabel}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button onClick={goToday} style={pillBtnStyle}>
            Today
          </button>
          <button onClick={prevMonth} style={arrowBtnStyle} aria-label="Previous month">
            <CaretLeft size={18} weight="bold" />
          </button>
          <button onClick={nextMonth} style={arrowBtnStyle} aria-label="Next month">
            <CaretRight size={18} weight="bold" />
          </button>
        </div>
      </div>

      {/* Day labels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center",
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              padding: "0 0 var(--space-2)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 2,
          textAlign: "center",
          marginTop: -12,
        }}
      >
        {calendarDays.map((day) => {
          const isToday = isSameDay(day.key, todayKey);
          const isSelected = isSameDay(day.key, selectedDate);
          const doneSet = completionsByDate[day.key];
          const doneCount = doneSet ? doneSet.size : 0;
          const allDone = dailyHabitCount > 0 && doneCount >= dailyHabitCount;
          const hasEvents = !!eventsByDate[day.key]?.length || !!localEventsByDate[day.key];
          const hasActivity = doneCount > 0 || hasEvents;

          return (
            <button
              key={day.key}
              onClick={() => setSelectedDate(day.key)}
              style={{
                position: "relative",
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                fontSize: 14,
                fontWeight: isToday || isSelected ? 700 : 400,
                color: !day.inMonth
                  ? "var(--color-text-secondary)"
                  : isSelected
                    ? "#fff"
                    : isToday
                      ? "#A78BFA"
                      : "var(--color-text)",
                background: isSelected
                  ? "rgba(167, 139, 250, 0.3)"
                  : "transparent",
                border: isToday && !isSelected
                  ? "1px solid rgba(167, 139, 250, 0.3)"
                  : "1px solid transparent",
                opacity: day.inMonth ? 1 : 0.3,
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              {day.day}
              {hasActivity && day.inMonth && !isSelected && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 3,
                    width: allDone ? 6 : 4,
                    height: allDone ? 6 : 4,
                    borderRadius: "50%",
                    background: allDone ? "#66BB6A" : hasEvents ? "#64B5F6" : "#A78BFA",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
          padding: "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {selectedDateLabel}
          </h2>
          <button
            onPointerUp={() => { setShowAddForm((v) => !v); setNewEventTitle(""); setNewEventTime(""); setNewEventLocation(""); }}
            aria-label="Add event"
            style={{
              position: "relative",
              zIndex: 1,
              width: 44,
              height: 44,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-surface-dim)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              transition: "transform 200ms ease",
              transform: showAddForm ? "rotate(45deg)" : "rotate(0deg)",
            }}
          >
            <Plus size={20} weight="bold" />
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newEventTitle.trim()) return;
              addEvent({ title: newEventTitle.trim(), date: selectedDate, time: newEventTime, location: newEventLocation.trim() });
              setNewEventTitle(""); setNewEventTime(""); setNewEventLocation(""); setShowAddForm(false);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              marginBottom: "var(--space-3)",
              padding: "var(--space-3)",
              background: "var(--color-surface-dim)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <input
              type="text"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              placeholder="Event title"
              autoFocus
              required
              style={{
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--color-border)",
                padding: "var(--space-1) 0",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-text)",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <div style={{ position: "relative" }}>
              <input
                type="time"
                value={newEventTime}
                onChange={(e) => setNewEventTime(e.target.value)}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  padding: "var(--space-1) 0",
                  fontSize: 14,
                  color: newEventTime ? "var(--color-text)" : "transparent",
                  outline: "none",
                  fontFamily: "inherit",
                  colorScheme: "dark",
                }}
              />
              {!newEventTime && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 14,
                    color: "var(--color-text-secondary)",
                    pointerEvents: "none",
                  }}
                >
                  Time (optional)
                </span>
              )}
            </div>
            <input
              type="text"
              value={newEventLocation}
              onChange={(e) => setNewEventLocation(e.target.value)}
              placeholder="Location (optional)"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--color-border)",
                padding: "var(--space-1) 0",
                fontSize: 14,
                color: "var(--color-text)",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              style={{
                height: 44,
                borderRadius: "var(--radius-sm)",
                background: newEventTitle.trim() ? "rgba(167, 139, 250, 0.25)" : "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: newEventTitle.trim() ? "#A78BFA" : "var(--color-text-secondary)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                marginTop: "var(--space-1)",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}
            >
              Add Event
            </button>
          </form>
        )}

        {selectedEvents.length === 0 && selectedLocalEvents.length === 0 && selectedHabitCompletions.length === 0 ? (
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
            }}
          >
            Nothing scheduled
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {/* Google Calendar events */}
            {selectedEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--space-3)",
                }}
              >
                <div
                  style={{
                    width: 3,
                    minHeight: 32,
                    borderRadius: 2,
                    background: "#64B5F6",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {event.summary}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                      marginTop: 2,
                    }}
                  >
                    {formatEventTime(event)}
                  </div>
                </div>
              </div>
            ))}

            {/* Local events */}
            {selectedLocalEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--space-3)",
                }}
              >
                <div
                  style={{
                    width: 3,
                    minHeight: 32,
                    borderRadius: 2,
                    background: "#A78BFA",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {event.title}
                  </div>
                  {(event.time || event.location) && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      {[
                        event.time && new Date(`2000-01-01T${event.time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
                        event.location,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeEvent(event.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                    padding: 4,
                    fontSize: 16,
                    lineHeight: 1,
                    fontFamily: "inherit",
                  }}
                  aria-label="Remove event"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Completed habits */}
            {selectedHabitCompletions.map((habit) => {
              const color = HABIT_COLORS[habit.color];
              return (
                <div
                  key={habit.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                  }}
                >
                  <CheckCircle size={18} weight="fill" color={color.fill} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {habit.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const arrowBtnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  cursor: "pointer",
  fontFamily: "inherit",
  padding: 0,
};

const pillBtnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: 9999,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
