import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { subscribeToTables } from "../lib/realtime";
import type { FeedEntry } from "../types";

const PAGE_SIZE = 20;

export function useActivityFeed() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const loadedCount = useRef(0);

  const fetchPage = useCallback(
    async (offset: number = 0, append: boolean = false, limit: number = PAGE_SIZE) => {
      if (!user) return;

      const { data: rows } = await supabase
        .from("activity_feed")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!rows) {
        setLoading(false);
        return;
      }

      if (rows.length < limit) setHasMore(false);

      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const profileMap = new Map<string, { name: string; avatarUrl: string | null }>();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name, avatar_url")
          .in("user_id", userIds);

        for (const p of profiles ?? []) {
          profileMap.set(p.user_id, { name: p.name ?? "", avatarUrl: p.avatar_url });
        }
      }

      const mapped: FeedEntry[] = rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        type: r.type as FeedEntry["type"],
        payload: (r.payload as Record<string, unknown>) ?? {},
        createdAt: r.created_at,
        userName: profileMap.get(r.user_id)?.name ?? "",
        userAvatar: profileMap.get(r.user_id)?.avatarUrl ?? null,
      }));

      loadedCount.current = append ? loadedCount.current + mapped.length : mapped.length;
      setEntries((prev) => (append ? [...prev, ...mapped] : mapped));
      setLoading(false);
    },
    [user],
  );

  useEffect(() => {
    fetchPage(0, false);

    // Refresh everything already loaded so "load more" pages are not collapsed.
    const refresh = () => fetchPage(0, false, Math.max(PAGE_SIZE, loadedCount.current));
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    const unsubscribe = subscribeToTables(["activity_feed"], refresh);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    await fetchPage(entries.length, true);
  }, [entries.length, hasMore, fetchPage]);

  return { entries, loading, hasMore, loadMore };
}
