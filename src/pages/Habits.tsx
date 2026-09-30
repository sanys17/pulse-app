import { useState, useEffect } from "react";
import { Plus, PencilSimple } from "@phosphor-icons/react";
import { useHabitsContext } from "../context/HabitsContext";
import { HabitCard } from "../components/HabitCard";
import { HabitForm } from "../components/HabitForm";
import { WeeklyHeatmap } from "../components/WeeklyHeatmap";
import { HABIT_COLORS } from "../types";
import type { Habit, HabitColor } from "../types";

export function Habits() {
  const {
    habits,
    isCompleted,
    toggleCompletion,
    getStreak,
    getWeeklyData,
    addHabit,
    updateHabit,
    deleteHabit,
  } = useHabitsContext();

  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (savedId) {
      const timer = setTimeout(() => setSavedId(null), 600);
      return () => clearTimeout(timer);
    }
  }, [savedId]);

  const handleSave = (data: {
    name: string;
    icon: string;
    color: HabitColor;
    frequency: "daily" | "weekly";
  }) => {
    if (editingHabit) {
      updateHabit(editingHabit.id, data);
      setSavedId(editingHabit.id);
    } else {
      const habit = addHabit(data);
      setSavedId(habit.id);
    }
    setShowForm(false);
    setEditingHabit(undefined);
  };

  const handleDelete = () => {
    if (editingHabit) {
      deleteHabit(editingHabit.id);
      setShowForm(false);
      setEditingHabit(undefined);
      setExpandedId(null);
    }
  };

  const handleEdit = (habit: Habit) => {
    setEditingHabit(habit);
    setShowForm(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          Habits
        </h1>
        <button
          onClick={() => {
            setEditingHabit(undefined);
            setShowForm(true);
          }}
          aria-label="Add habit"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--color-text)",
            color: "var(--color-canvas)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 150ms ease",
            cursor: "pointer",
          }}
        >
          <Plus size={20} weight="bold" />
        </button>
      </div>

      {habits.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "var(--space-10) var(--space-4)",
            color: "var(--color-text-secondary)",
          }}
        >
          <p style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
            Start building habits
          </p>
          <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
            Tap the + button to add your first habit
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {habits.map((habit) => (
            <div
              key={habit.id}
              style={{
                animation: savedId === habit.id ? "cardPulse 600ms ease" : "none",
              }}
            >
              <HabitCard
                habit={habit}
                completed={isCompleted(habit.id)}
                streak={getStreak(habit.id)}
                onToggle={() => toggleCompletion(habit.id)}
                onEdit={() => toggleExpand(habit.id)}
              />

              {expandedId === habit.id && (
                <div
                  style={{
                    padding: "var(--space-4)",
                    background: "var(--color-surface)",
                    borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                    borderLeft: "1px solid var(--color-border)",
                    borderRight: "1px solid var(--color-border)",
                    borderBottom: "1px solid var(--color-border)",
                    marginTop: -1,
                    animation: "fadeIn 200ms ease",
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
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: 600,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      Last 4 weeks
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {getStreak(habit.id)} day streak
                      </span>
                      <button
                        onClick={() => handleEdit(habit)}
                        aria-label={`Edit ${habit.name}`}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "var(--radius-sm)",
                          background: "var(--color-surface-dim)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <PencilSimple size={14} weight="bold" color="var(--color-text-secondary)" />
                      </button>
                    </div>
                  </div>
                  <WeeklyHeatmap
                    data={getWeeklyData(habit.id)}
                    color={HABIT_COLORS[habit.color].fill}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <HabitForm
          habit={editingHabit}
          onSave={handleSave}
          onDelete={editingHabit ? handleDelete : undefined}
          onClose={() => {
            setShowForm(false);
            setEditingHabit(undefined);
          }}
        />
      )}
    </div>
  );
}
