import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export function useProfile() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      const { data } = await supabase
        .from("profiles")
        .select("name, avatar_url")
        .eq("user_id", user!.id)
        .single();

      if (cancelled) return;
      if (data) {
        setName(data.name ?? "");
        setAvatarUrl(data.avatar_url);
      }
      setLoading(false);
    }

    fetch();
    return () => { cancelled = true; };
  }, [user]);

  const updateName = useCallback(async (newName: string) => {
    if (!user) return;
    setName(newName);
    await supabase
      .from("profiles")
      .update({ name: newName })
      .eq("user_id", user.id);
  }, [user]);

  return { name, avatarUrl, loading, updateName };
}
