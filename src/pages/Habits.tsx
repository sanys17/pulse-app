import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
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

  const handleSave = (data: {
    name: string;
    icon: string;
    color: HabitColor;
    frequency: "daily" | "weekly";
  }) => {
    if (editingHabit) {
      updateHabit(editingHabit.id, data);
    } else {
      addHabit(data);
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
            <div key={habit.id}>
              <div
                onClick={() =>
                  setExpandedId(expandedId === habit.id ? null : habit.id)
                }
                style={{ cursor: "pointer" }}
              >
                <HabitCard
                  habit={habit}
                  completed={isCompleted(habit.id)}
                  streak={getStreak(habit.id)}
                  onToggle={() => toggleCompletion(habit.id)}
                  onEdit={() => handleEdit(habit)}
                />
              </div>

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
                  <style>{`
                    @keyframes fadeIn {
                      from { opacity: 0; transform: translateY(-4px); }
                      to { opacity: 1; transform: translateY(0); }
                    }
                  `}</style>
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
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {getStreak(habit.id)} day streak
                    </span>
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
