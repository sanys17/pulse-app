import { createContext, useContext } from "react";
import { useCalendarEvents } from "../hooks/useCalendarEvents";

type CalendarEventsContextValue = ReturnType<typeof useCalendarEvents>;

const CalendarEventsContext = createContext<CalendarEventsContextValue | null>(null);

export function CalendarEventsProvider({ children }: { children: React.ReactNode }) {
  const cal = useCalendarEvents();
  return <CalendarEventsContext.Provider value={cal}>{children}</CalendarEventsContext.Provider>;
}

export function useCalendarEventsContext(): CalendarEventsContextValue {
  const ctx = useContext(CalendarEventsContext);
  if (!ctx) throw new Error("useCalendarEventsContext must be used within CalendarEventsProvider");
  return ctx;
}
