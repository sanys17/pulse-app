import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { expectRows } from "../lib/monitoring";
import { useAuth } from "../context/AuthContext";
import { completedDateKey } from "../lib/dateKey";

export interface Task {
  id: string;
  label: string;
  done: boolean;
  /** "YYYY-MM-DD" in the device's local day. null means backlog: never planned for a
   *  day, so it can never be incomplete on one, and the Home arc ignores it. */
  dueDate: string | null;
  /** The local day the task was ticked, derived from completed_at. Needed because a
   *  task dated earlier that is finished today has to move into today's numerator
   *  rather than just leave the denominator. */
  completedDateKey: string | null;
  createdAt: string;
}

export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at");

      if (cancelled) return;
      if (data) {
        setTasks(data.map((t) => ({
          id: t.id,
          label: t.label,
          done: t.done,
          dueDate: t.due_date ?? null,
          completedDateKey: completedDateKey(t.completed_at ?? null),
          createdAt: t.created_at,
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

  const addTask = useCallback(async (label: string, dueDate: string | null = null) => {
    if (!user) return;
    const tempId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    setTasks((prev) => [...prev, {
      id: tempId,
      label,
      done: false,
      dueDate,
      completedDateKey: null,
      createdAt: new Date().toISOString(),
    }]);

    const { data, error } = await supabase
      .from("tasks")
      .insert({ user_id: user.id, label, due_date: dueDate })
      .select()
      .single();

    if (data) {
      setTasks((prev) => prev.map((t) => t.id === tempId ? { ...t, id: data.id } : t));
    } else if (error) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    }
  }, [user]);

  const toggleTask = useCallback(async (id: string) => {
    if (!user) return;
    // completed_at must be cleared on un-tick. Left set, the task would stay in today's
    // numerator for good and the arc could never fall back.
    const now = new Date().toISOString();
    let newDone = false;
    setTasks((prev) => prev.map((t) => {
      if (t.id === id) {
        newDone = !t.done;
        return {
          ...t,
          done: newDone,
          completedDateKey: newDone ? completedDateKey(now) : null,
        };
      }
      return t;
    }));

    const { data, error } = await supabase
      .from("tasks")
      .update({ done: newDone, completed_at: newDone ? now : null })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (!error) expectRows("tasks.update", data);
  }, [user]);

  const deleteTask = useCallback(async (id: string) => {
    if (!user) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { data, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (!error) expectRows("tasks.delete", data);
  }, [user]);

  return { tasks, loading, addTask, toggleTask, deleteTask };
}
