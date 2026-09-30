import { useState, useCallback, useMemo } from "react";
import type { Habit, Completion, HabitColor } from "../types";

const HABITS_KEY = "pulse-habits";
const COMPLETIONS_KEY = "pulse-completions";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function toDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>(() => load(HABITS_KEY, []));
  const [completions, setCompletions] = useState<Completion[]>(() =>
    load(COMPLETIONS_KEY, [])
  );

  const persist = useCallback(
    (h: Habit[], c: Completion[]) => {
      save(HABITS_KEY, h);
      save(COMPLETIONS_KEY, c);
    },
    []
  );

  const addHabit = useCallback(
    (data: { name: string; icon: string; color: HabitColor; frequency: "daily" | "weekly" }) => {
      const habit: Habit = {
        id: generateId(),
        ...data,
        createdAt: toDateKey(),
      };
      setHabits((prev) => {
        const next = [...prev, habit];
        save(HABITS_KEY, next);
        return next;
      });
      return habit;
    },
    []
  );

  const updateHabit = useCallback(
    (id: string, data: Partial<Omit<Habit, "id" | "createdAt">>) => {
      setHabits((prev) => {
        const next = prev.map((h) => (h.id === id ? { ...h, ...data } : h));
        save(HABITS_KEY, next);
        return next;
      });
    },
    []
  );

  const deleteHabit = useCallback(
    (id: string) => {
      setHabits((prev) => {
        const next = prev.filter((h) => h.id !== id);
        save(HABITS_KEY, next);
        return next;
      });
      setCompletions((prev) => {
        const next = prev.filter((c) => c.habitId !== id);
        save(COMPLETIONS_KEY, next);
        return next;
      });
    },
    []
  );

  const toggleCompletion = useCallback(
    (habitId: string, date: string = toDateKey()) => {
      setCompletions((prev) => {
        const exists = prev.some(
          (c) => c.habitId === habitId && c.date === date
        );
        const next = exists
          ? prev.filter((c) => !(c.habitId === habitId && c.date === date))
          : [...prev, { habitId, date }];
        save(COMPLETIONS_KEY, next);
        return next;
      });
    },
    []
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

  const todayKey = useMemo(() => toDateKey(), []);

  const todaysHabits = useMemo(() => {
    const day = new Date().getDay();
    return habits.filter((h) => {
      if (h.frequency === "daily") return true;
      return day === 1;
    });
  }, [habits]);

  const todaysProgress = useMemo(() => {
    if (todaysHabits.length === 0) return { done: 0, total: 0 };
    const done = todaysHabits.filter((h) =>
      completions.some((c) => c.habitId === h.id && c.date === todayKey)
    ).length;
    return { done, total: todaysHabits.length };
  }, [todaysHabits, completions, todayKey]);

  return {
    habits,
    completions,
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
  };
}
