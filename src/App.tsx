import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { HabitsProvider, useHabitsContext } from "./context/HabitsContext";
import { HabitForm } from "./components/HabitForm";
import { QuickLog } from "./components/QuickLog";
import { useTheme } from "./hooks/useTheme";
import { Home } from "./pages/Home";
import { Habits } from "./pages/Habits";
import { Social } from "./pages/Social";
import { Calendar } from "./pages/Calendar";
import { Tasks } from "./pages/Tasks";
import { Settings } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";
import type { Habit, HabitColor } from "./types";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100dvh", color: "rgba(234,236,244,0.4)",
        fontFamily: "Geist, Inter, system-ui, sans-serif",
      }}>
        Loading...
      </div>
    );
  }

  if (!user) return <SignIn />;

  return <>{children}</>;
}

function AppContent() {
  useTheme();
  const { addHabit, updateHabit, deleteHabit } = useHabitsContext();
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [showNewHabit, setShowNewHabit] = useState(false);
  const [showQuickLog, setShowQuickLog] = useState(false);

  const handleEditFromHome = (habit: Habit) => {
    setEditingHabit(habit);
  };

  const handleSaveEdit = (data: {
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

  const handleSaveNew = (data: {
    name: string;
    icon: string;
    color: HabitColor;
    frequency: "daily" | "weekly";
  }) => {
    addHabit(data);
    setShowNewHabit(false);
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
          padding: "calc(env(safe-area-inset-top, 0px) + var(--space-6)) var(--space-4)",
          paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <Routes>
          <Route path="/" element={<Home onEditHabit={handleEditFromHome} />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/social" element={<Social />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>

      <BottomNav
        onAddHabit={() => setShowNewHabit(true)}
        onQuickLog={() => setShowQuickLog(true)}
      />

      {editingHabit && (
        <HabitForm
          habit={editingHabit}
          onSave={handleSaveEdit}
          onDelete={handleDeleteFromHome}
          onClose={() => setEditingHabit(null)}
        />
      )}

      {showNewHabit && (
        <HabitForm
          onSave={handleSaveNew}
          onClose={() => setShowNewHabit(false)}
        />
      )}

      {showQuickLog && (
        <QuickLog onClose={() => setShowQuickLog(false)} />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <HabitsProvider>
          <AppContent />
        </HabitsProvider>
      </AuthGate>
    </AuthProvider>
  );
}
