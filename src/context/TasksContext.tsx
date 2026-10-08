import { createContext, useContext } from "react";
import { useTasks } from "../hooks/useTasks";

type TasksContextValue = ReturnType<typeof useTasks>;

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const tasks = useTasks();
  return <TasksContext.Provider value={tasks}>{children}</TasksContext.Provider>;
}

export function useTasksContext(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasksContext must be used within TasksProvider");
  return ctx;
}
