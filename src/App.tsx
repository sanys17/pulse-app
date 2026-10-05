import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { HabitsProvider, useHabitsContext } from "./context/HabitsContext";
import { HabitForm } from "./components/HabitForm";
import { useTheme } from "./hooks/useTheme";
import { Home } from "./pages/Home";
import { Habits } from "./pages/Habits";
import { Calendar } from "./pages/Calendar";
import { Tasks } from "./pages/Tasks";
import { Settings } from "./pages/Settings";
import type { Habit, HabitColor } from "./types";

function AppContent() {
  const { theme, setTheme } = useTheme();
  const { updateHabit, deleteHabit } = useHabitsContext();
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  const handleEditFromHome = (habit: Habit) => {
    setEditingHabit(habit);
  };

  const handleSaveFromHome = (data: {
    name: string;
    icon: string;
    color: HabitColor;
    frequency: "daily" | "weekly";
  }) => {
    if (editingHabit) {
      updateHabit(editingHabit.id, data);
      setEditingHabit(null);
    }
  };

  const handleDeleteFromHome = () => {
    if (editingHabit) {
      deleteHabit(editingHabit.id);
      setEditingHabit(null);
    }
  };

  return (
    <>
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          minHeight: "100dvh",
          padding: "var(--space-6) var(--space-4)",
          paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <Routes>
          <Route path="/" element={<Home onEditHabit={handleEditFromHome} />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route
            path="/settings"
            element={<Settings theme={theme} onThemeChange={setTheme} />}
          />
        </Routes>
      </div>

      <BottomNav />

      {editingHabit && (
        <HabitForm
          habit={editingHabit}
          onSave={handleSaveFromHome}
          onDelete={handleDeleteFromHome}
          onClose={() => setEditingHabit(null)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <HabitsProvider>
      <AppContent />
    </HabitsProvider>
  );
}
