import { createContext, useContext } from "react";
import { useHabits } from "../hooks/useHabits";

type HabitsContextValue = ReturnType<typeof useHabits>;

const HabitsContext = createContext<HabitsContextValue | null>(null);

export function HabitsProvider({ children }: { children: React.ReactNode }) {
  const habits = useHabits();
  return (
    <HabitsContext.Provider value={habits}>{children}</HabitsContext.Provider>
  );
}

export function useHabitsContext(): HabitsContextValue {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error("useHabitsContext must be used within HabitsProvider");
  return ctx;
}
