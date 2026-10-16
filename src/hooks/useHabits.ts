import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { expectRows } from "../lib/monitoring";
import { useAuth } from "../context/AuthContext";
import { cadenceFromRow, cadenceToRow, isDueOn } from "../lib/cadence";
import type { Habit, HabitInput, Completion, HabitColor } from "../types";

function toDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function useHabits() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function fetchAll() {
      const [habitsRes, completionsRes] = await Promise.all([
        supabase.from("habits").select("*").eq("user_id", user!.id).order("created_at"),
        supabase.from("completions").select("*").eq("user_id", user!.id),
      ]);

      if (cancelled) return;

      if (habitsRes.data) {
        setHabits(habitsRes.data.map((h) => ({
          id: h.id,
          name: h.name,
          icon: h.icon,
          color: h.color as HabitColor,
          cadence: cadenceFromRow(h),
          reminderTime: h.reminder_time ? h.reminder_time.slice(0, 5) : null,
          createdAt: h.created_at.slice(0, 10),
        })));
      }

      if (completionsRes.data) {
        setCompletions(completionsRes.data.map((c) => ({
          id: c.id,
          habitId: c.habit_id,
          date: c.date,
        })));
      }

      setLoading(false);
    }

    fetchAll();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  const addHabit = useCallback(
    async (data: Omit<HabitInput, "reminderTime"> & { reminderTime?: string | null }) => {
      if (!user) return;

      const tempId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const optimistic: Habit = {
        id: tempId,
        name: data.name,
        icon: data.icon,
        color: data.color,
        cadence: data.cadence,
        reminderTime: data.reminderTime ?? null,
        createdAt: toDateKey(),
      };
      setHabits((prev) => [...prev, optimistic]);

      const { data: inserted, error } = await supabase
        .from("habits")
        .insert({
          user_id: user.id,
          name: data.name,
          icon: data.icon,
          color: data.color,
          ...cadenceToRow(data.cadence),
          reminder_time: data.reminderTime ?? null,
        })
        .select()
        .single();

      if (inserted) {
        setHabits((prev) =>
          prev.map((h) => h.id === tempId
            ? { ...h, id: inserted.id, createdAt: inserted.created_at.slice(0, 10) }
            : h
          )
        );
      } else if (error) {
        setHabits((prev) => prev.filter((h) => h.id !== tempId));
      }

      return optimistic;
    },
    [user]
  );

  const updateHabit = useCallback(
    async (id: string, data: Partial<Omit<Habit, "id" | "createdAt">>) => {
      setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...data } : h)));

      const updateData: {
        name?: string;
        icon?: string;
        color?: string;
        frequency?: string;
        interval_days?: number | null;
        start_date?: string | null;
        weekdays?: number[] | null;
        reminder_time?: string | null;
      } = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.icon !== undefined) updateData.icon = data.icon;
      if (data.color !== undefined) updateData.color = data.color;
      // All four cadence columns move together; writing one without the others would
      // leave a row the CHECK constraint in 013 rejects.
      if (data.cadence !== undefined) Object.assign(updateData, cadenceToRow(data.cadence));
      if (data.reminderTime !== undefined) updateData.reminder_time = data.reminderTime;

      const { data: updated, error } = await supabase.from("habits").update(updateData).eq("id", id).select("id");
      if (!error) expectRows("habits.update", updated);
    },
    []
  );

  const deleteHabit = useCallback(
    async (id: string) => {
      setHabits((prev) => prev.filter((h) => h.id !== id));
      setCompletions((prev) => prev.filter((c) => c.habitId !== id));
      const { data: removed, error } = await supabase.from("habits").delete().eq("id", id).select("id");
      if (!error) expectRows("habits.delete", removed);
    },
    []
  );

  const toggleCompletion = useCallback(
    async (habitId: string, date: string = toDateKey()) => {
      if (!user) return;

      let exists = false;
      setCompletions((prev) => {
        exists = prev.some((c) => c.habitId === habitId && c.date === date);
        if (exists) {
          return prev.filter((c) => !(c.habitId === habitId && c.date === date));
        }
        return [...prev, { habitId, date } as Completion];
      });

      if (exists) {
        await supabase
          .from("completions")
          .delete()
          .eq("user_id", user.id)
          .eq("habit_id", habitId)
          .eq("date", date);
      } else {
        const { error } = await supabase
          .from("completions")
          .insert({ user_id: user.id, habit_id: habitId, date });

        if (error && error.code !== "23505") {
          setCompletions((prev) =>
            prev.filter((c) => !(c.habitId === habitId && c.date === date))
          );
        }
      }
    },
    [user]
  );

  const isCompleted = useCallback(
    (habitId: string, date: string = toDateKey()) => {
      return completions.some(
        (c) => c.habitId === habitId && c.date === date
      );
    },
    [completions]
  );

  const getCompletionsForHabit = useCallback(
    (habitId: string): Completion[] => {
      return completions.filter((c) => c.habitId === habitId);
    },
    [completions]
  );

  const getStreak = useCallback(
    (habitId: string): number => {
      const habitCompletions = completions
        .filter((c) => c.habitId === habitId)
        .map((c) => c.date)
        .sort()
        .reverse();

      if (habitCompletions.length === 0) return 0;

      let streak = 0;
      const today = new Date();

      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const key = toDateKey(checkDate);

        if (habitCompletions.includes(key)) {
          streak++;
        } else if (i === 0) {
          continue;
        } else {
          break;
        }
      }

      return streak;
    },
    [completions]
  );

  const getWeeklyData = useCallback(
    (habitId: string, weeks: number = 4): { date: string; completed: boolean }[][] => {
      const result: { date: string; completed: boolean }[][] = [];
      const today = new Date();
      const dayOfWeek = today.getDay();

      for (let w = weeks - 1; w >= 0; w--) {
        const week: { date: string; completed: boolean }[] = [];
        for (let d = 0; d < 7; d++) {
          const offset = w * 7 + (dayOfWeek - d);
          const date = new Date(today);
          date.setDate(today.getDate() - offset);
          const key = toDateKey(date);
          week.push({
            date: key,
            completed: completions.some(
              (c) => c.habitId === habitId && c.date === key
            ),
          });
        }
        result.push(week.reverse());
      }

      return result;
    },
    [completions]
  );

  const [todayKey, setTodayKey] = useState(() => toDateKey());

  useEffect(() => {
    const check = () => {
      const now = toDateKey();
      if (now !== todayKey) setTodayKey(now);
    };
    document.addEventListener("visibilitychange", check);
    const interval = setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      clearInterval(interval);
    };
  }, [todayKey]);

  const todaysHabits = useMemo(() => {
    return habits.filter((h) => isDueOn(h.cadence, todayKey));
  }, [habits, todayKey]);

  const todaysProgress = useMemo(() => {
    if (todaysHabits.length === 0) return { done: 0, total: 0 };
    const done = todaysHabits.filter((h) =>
      completions.some((c) => c.habitId === h.id && c.date === todayKey)
    ).length;
    return { done, total: todaysHabits.length };
  }, [todaysHabits, completions, todayKey]);

  // "There are habits, just none due today" — the Home empty state reads differently
  // from "you have no habits at all".
  const hasHiddenWeekly = useMemo(() => {
    return habits.some((h) => !isDueOn(h.cadence, todayKey));
  }, [habits, todayKey]);

  const bestStreak = useMemo(() => {
    if (habits.length === 0) return 0;
    return Math.max(...habits.map((h) => getStreak(h.id)), 0);
  }, [habits, getStreak]);

  const weeklyPerfectDays = useMemo(() => {
    if (todaysHabits.length === 0) return { perfect: 0, total: 7 };
    const today = new Date();
    const dayOfWeek = today.getDay();
    let perfect = 0;

    for (let i = 0; i <= dayOfWeek; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (dayOfWeek - i));
      const key = toDateKey(d);
      const allDone = todaysHabits.every((h) =>
        completions.some((c) => c.habitId === h.id && c.date === key)
      );
      if (allDone) perfect++;
    }

    return { perfect, total: dayOfWeek + 1 };
  }, [todaysHabits, completions, todayKey]);

  const recentActivity = useMemo(() => {
    const today = new Date();
    return habits.map((h) => {
      const days: { date: string; done: boolean }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = toDateKey(d);
        days.push({
          date: key,
          done: completions.some((c) => c.habitId === h.id && c.date === key),
        });
      }
      return { habit: h, days };
    });
  }, [habits, completions, todayKey]);

  return {
    habits,
    completions,
    loading,
    addHabit,
    updateHabit,
    deleteHabit,
    toggleCompletion,
    isCompleted,
    getCompletionsForHabit,
    getStreak,
    getWeeklyData,
    todaysHabits,
    todaysProgress,
    todayKey,
    hasHiddenWeekly,
    bestStreak,
    weeklyPerfectDays,
    recentActivity,
  };
}
