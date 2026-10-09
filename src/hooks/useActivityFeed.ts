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
        .neq("user_id", user.id)
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

      const cheerCounts = new Map<string, number>();
      const myCheers = new Set<string>();
      if (rows.length > 0) {
        const { data: reactions } = await supabase
          .from("feed_reactions")
          .select("entry_id, user_id")
          .in("entry_id", rows.map((r) => r.id));
        for (const c of reactions ?? []) {
          cheerCounts.set(c.entry_id, (cheerCounts.get(c.entry_id) ?? 0) + 1);
          if (c.user_id === user.id) myCheers.add(c.entry_id);
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
        cheers: cheerCounts.get(r.id) ?? 0,
        cheeredByMe: myCheers.has(r.id),
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
    const unsubscribe = subscribeToTables(["activity_feed", "feed_reactions"], refresh);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    await fetchPage(entries.length, true);
  }, [entries.length, hasMore, fetchPage]);

  // Optimistic: flip locally, write, and roll back (returning false) if the write fails.
  const toggleCheer = useCallback(
    async (entryId: string): Promise<boolean> => {
      if (!user) return false;
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return false;
      const adding = !entry.cheeredByMe;
      const apply = (on: boolean) =>
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, cheeredByMe: on, cheers: Math.max(0, e.cheers + (on ? 1 : -1)) }
              : e,
          ),
        );
      apply(adding);

      const { error } = adding
        ? await supabase.from("feed_reactions").insert({ entry_id: entryId, user_id: user.id })
        : await supabase
            .from("feed_reactions")
            .delete()
            .eq("entry_id", entryId)
            .eq("user_id", user.id);

      // 23505 = already cheered (another device); the end state is what we wanted.
      if (error && error.code !== "23505") {
        apply(!adding);
        return false;
      }
      return true;
    },
    [user, entries],
  );

  return { entries, loading, hasMore, loadMore, toggleCheer };
}
