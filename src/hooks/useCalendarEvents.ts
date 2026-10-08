import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
}

export function useCalendarEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", user!.id)
        .order("date")
        .order("time");

      if (cancelled) return;
      if (data) {
        setEvents(data.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          time: e.time ?? "",
          location: e.location ?? "",
        })));
      }
      setLoading(false);
    }

    fetch();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  const addEvent = useCallback(async (data: { title: string; date: string; time: string; location: string }) => {
    if (!user) return;
    const tempId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const optimistic: CalendarEvent = { id: tempId, ...data };
    setEvents((prev) => [...prev, optimistic]);

    const { data: inserted } = await supabase
      .from("calendar_events")
      .insert({
        user_id: user.id,
        title: data.title,
        date: data.date,
        time: data.time || null,
        location: data.location || null,
      })
      .select()
      .single();

    if (inserted) {
      setEvents((prev) => prev.map((e) => e.id === tempId ? { ...e, id: inserted.id } : e));
    }
  }, [user]);

  const removeEvent = useCallback(async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("calendar_events").delete().eq("id", id);
  }, []);

  return { events, loading, addEvent, removeEvent };
}
