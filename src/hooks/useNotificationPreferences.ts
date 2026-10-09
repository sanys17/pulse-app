import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { expectRows, reportError } from "../lib/monitoring";
import { patchToRow, rowToPrefs, type NotificationPrefs } from "../lib/notificationPrefs.ts";

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        reportError(error, { area: "notification-prefs", target: "load" });
        setLoading(false);
        return;
      }
      if (data) {
        setPrefs(rowToPrefs(data));
      } else {
        // Defensive: the migration backfills a row, but never let a missing row block Settings.
        const { data: created, error: insertError } = await supabase
          .from("notification_preferences")
          .insert({ user_id: user.id })
          .select("*")
          .single();
        if (cancelled) return;
        if (insertError) reportError(insertError, { area: "notification-prefs", target: "create" });
        else setPrefs(rowToPrefs(created));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Optimistic; returns false (and reverts only the touched keys) when the write fails or changes nothing.
  const update = useCallback(
    async (patch: Partial<NotificationPrefs>): Promise<boolean> => {
      if (!user || !prefs) return false;
      const before: Partial<NotificationPrefs> = {};
      for (const key of Object.keys(patch) as (keyof NotificationPrefs)[]) {
        (before as Record<string, unknown>)[key] = prefs[key];
      }
      setPrefs((current) => (current ? { ...current, ...patch } : current));

      const { data, error } = await supabase
        .from("notification_preferences")
        .update(patchToRow(patch))
        .eq("user_id", user.id)
        .select("user_id");
      if (error || !expectRows("notification_preferences.update", data)) {
        setPrefs((current) => (current ? { ...current, ...before } : current));
        return false;
      }
      return true;
    },
    [user, prefs],
  );

  return { prefs, loading, update };
}
