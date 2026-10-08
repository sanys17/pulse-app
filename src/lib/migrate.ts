import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const MIGRATED_FLAG = "pulse-migrated";

let inFlight: Promise<void> | null = null;

export function migrateLocalData(user: User): Promise<void> {
  if (!inFlight) inFlight = doMigrate(user).finally(() => { inFlight = null; });
  return inFlight;
}

async function doMigrate(user: User): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === "true") return;
  } catch {
    return;
  }

  const { count } = await supabase
    .from("habits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count && count > 0) {
    try { localStorage.setItem(MIGRATED_FLAG, "true"); } catch {}
    return;
  }

  let habits: { id: string; name: string; icon: string; color: string; frequency: string; createdAt: string }[] = [];
  let completions: { habitId: string; date: string }[] = [];
  let tasks: { id: string; label: string; done: boolean }[] = [];
  let events: { id: string; title: string; date: string; time: string; location: string }[] = [];
  let profileName = "";

  try {
    const h = localStorage.getItem("pulse-habits");
    if (h) habits = JSON.parse(h);
  } catch {}
  try {
    const c = localStorage.getItem("pulse-completions");
    if (c) completions = JSON.parse(c);
  } catch {}
  try {
    const t = localStorage.getItem("pulse-tasks");
    if (t) tasks = JSON.parse(t);
  } catch {}
  try {
    const e = localStorage.getItem("pulse-calendar-events");
    if (e) events = JSON.parse(e);
  } catch {}
  try {
    profileName = localStorage.getItem("pulse-profile-name") || "";
  } catch {}

  if (habits.length === 0 && tasks.length === 0 && events.length === 0 && !profileName) {
    try { localStorage.setItem(MIGRATED_FLAG, "true"); } catch {}
    return;
  }

  try {
    const idMap = new Map<string, string>();

    if (habits.length > 0) {
      const { data: insertedHabits } = await supabase
        .from("habits")
        .insert(
          habits.map((h) => ({
            user_id: user.id,
            name: h.name,
            icon: h.icon,
            color: h.color,
            frequency: h.frequency,
          }))
        )
        .select();

      if (insertedHabits) {
        habits.forEach((h, i) => {
          if (insertedHabits[i]) {
            idMap.set(h.id, insertedHabits[i].id);
          }
        });
      }
    }

    if (completions.length > 0) {
      const mapped = completions
        .map((c) => {
          const newHabitId = idMap.get(c.habitId);
          if (!newHabitId) return null;
          return { user_id: user.id, habit_id: newHabitId, date: c.date };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      if (mapped.length > 0) {
        await supabase.from("completions").insert(mapped);
      }
    }

    if (tasks.length > 0) {
      await supabase.from("tasks").insert(
        tasks.map((t) => ({ user_id: user.id, label: t.label, done: t.done }))
      );
    }

    if (events.length > 0) {
      await supabase.from("calendar_events").insert(
        events.map((e) => ({
          user_id: user.id,
          title: e.title,
          date: e.date,
          time: e.time || null,
          location: e.location || null,
        }))
      );
    }

    if (profileName) {
      await supabase
        .from("profiles")
        .update({ name: profileName })
        .eq("user_id", user.id);
    }

    localStorage.setItem(MIGRATED_FLAG, "true");
    localStorage.removeItem("pulse-habits");
    localStorage.removeItem("pulse-completions");
    localStorage.removeItem("pulse-tasks");
    localStorage.removeItem("pulse-calendar-events");
    localStorage.removeItem("pulse-profile-name");
  } catch {
    try { localStorage.setItem("pulse-migration-pending", "true"); } catch {}
  }
}
