import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export interface Task {
  id: string;
  label: string;
  done: boolean;
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
        setTasks(data.map((t) => ({ id: t.id, label: t.label, done: t.done })));
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

  const addTask = useCallback(async (label: string) => {
    if (!user) return;
    const tempId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    setTasks((prev) => [...prev, { id: tempId, label, done: false }]);

    const { data } = await supabase
      .from("tasks")
      .insert({ user_id: user.id, label })
      .select()
      .single();

    if (data) {
      setTasks((prev) => prev.map((t) => t.id === tempId ? { ...t, id: data.id } : t));
    }
  }, [user]);

  const toggleTask = useCallback(async (id: string) => {
    let newDone = false;
    setTasks((prev) => prev.map((t) => {
      if (t.id === id) {
        newDone = !t.done;
        return { ...t, done: newDone };
      }
      return t;
    }));

    await supabase.from("tasks").update({ done: newDone }).eq("id", id);
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  }, []);

  return { tasks, loading, addTask, toggleTask, deleteTask };
}
