import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export function useUsername() {
  const { user } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      const { data } = await supabase
        .from("usernames")
        .select("username")
        .eq("user_id", user!.id)
        .single();

      if (cancelled) return;
      setUsername(data?.username ?? null);
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

  const claimUsername = useCallback(
    async (value: string): Promise<{ error?: string }> => {
      if (!user) return { error: "Not signed in" };

      const trimmed = value.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(trimmed)) {
        return { error: "3-24 characters, lowercase letters, numbers, underscores" };
      }

      const { error } = await supabase
        .from("usernames")
        .insert({ user_id: user.id, username: trimmed });

      if (error) {
        if (error.code === "23505") return { error: "Username already taken" };
        return { error: error.message };
      }

      setUsername(trimmed);
      return {};
    },
    [user],
  );

  const checkAvailability = useCallback(
    (value: string): Promise<boolean> => {
      return new Promise((resolve) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
          const trimmed = value.trim().toLowerCase();
          if (!/^[a-z0-9_]{3,24}$/.test(trimmed)) {
            resolve(false);
            return;
          }

          const { data } = await supabase
            .from("usernames")
            .select("id")
            .eq("username", trimmed)
            .maybeSingle();

          resolve(!data);
        }, 300);
      });
    },
    [],
  );

  return { username, loading, claimUsername, checkAvailability };
}
