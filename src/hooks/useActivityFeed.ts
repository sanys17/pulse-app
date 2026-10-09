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
  const rawLoaded = useRef(0);
  const pendingDeletes = useRef(new Map<string, { entry: FeedEntry; timer: ReturnType<typeof setTimeout> }>());
  const ownCheerCounts = useRef<Map<string, number> | null>(null);
  const [incomingCheer, setIncomingCheer] = useState<{ key: number; text: string } | null>(null);

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

      // Reactions first, so reactor names can be fetched with the authors' profiles.
      const reactorsByEntry = new Map<string, string[]>();
      const myCheers = new Set<string>();
      if (rows.length > 0) {
        const { data: reactions } = await supabase
          .from("feed_reactions")
          .select("entry_id, user_id, created_at")
          .in("entry_id", rows.map((r) => r.id))
          .order("created_at");
        for (const c of reactions ?? []) {
          if (c.user_id === user.id) myCheers.add(c.entry_id);
          else reactorsByEntry.set(c.entry_id, [...(reactorsByEntry.get(c.entry_id) ?? []), c.user_id]);
        }
      }

      const profileIds = new Set(rows.map((r) => r.user_id));
      for (const ids of reactorsByEntry.values()) for (const id of ids) profileIds.add(id);
      const profileMap = new Map<string, { name: string; avatarUrl: string | null }>();
      const usernameMap = new Map<string, string>();
      if (profileIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name, avatar_url")
          .in("user_id", [...profileIds]);
        for (const p of profiles ?? []) {
          profileMap.set(p.user_id, { name: p.name ?? "", avatarUrl: p.avatar_url });
        }
        const { data: handles } = await supabase
          .from("usernames")
          .select("user_id, username")
          .in("user_id", [...profileIds]);
        for (const u of handles ?? []) usernameMap.set(u.user_id, u.username);
      }

      const all: FeedEntry[] = rows.map((r) => {
        const others = reactorsByEntry.get(r.id) ?? [];
        const mine = myCheers.has(r.id);
        return {
          id: r.id,
          userId: r.user_id,
          type: r.type as FeedEntry["type"],
          payload: (r.payload as Record<string, unknown>) ?? {},
          createdAt: r.created_at,
          userName: profileMap.get(r.user_id)?.name ?? "",
          userUsername: usernameMap.get(r.user_id) ?? "",
          userAvatar: profileMap.get(r.user_id)?.avatarUrl ?? null,
          mine: r.user_id === user.id,
          cheers: others.length + (mine ? 1 : 0),
          cheeredByMe: mine,
          cheeredBy: others.map((id) => profileMap.get(id)?.name || "Someone"),
        };
      });

      // Announce a cheer on one of your own entries that arrived since the last fetch.
      const ownNow = new Map(all.filter((e) => e.mine).map((e) => [e.id, e]));
      if (!append && ownCheerCounts.current) {
        for (const [id, entry] of ownNow) {
          if (entry.cheers > (ownCheerCounts.current.get(id) ?? 0)) {
            const who = entry.cheeredBy[entry.cheeredBy.length - 1] ?? "Someone";
            setIncomingCheer((prev) => ({ key: (prev?.key ?? 0) + 1, text: `${who} cheered you` }));
            break;
          }
        }
      }
      if (!append) ownCheerCounts.current = new Map([...ownNow].map(([id, e]) => [id, e.cheers]));

      const visible = all.filter((e) => !pendingDeletes.current.has(e.id));

      rawLoaded.current = append ? rawLoaded.current + rows.length : rows.length;
      setEntries((prev) => (append ? [...prev, ...visible] : visible));
      setLoading(false);
    },
    [user],
  );

  useEffect(() => {
    fetchPage(0, false);

    // Refresh everything already loaded so "load more" pages are not collapsed.
    const refresh = () => fetchPage(0, false, Math.max(PAGE_SIZE, rawLoaded.current));
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
    await fetchPage(rawLoaded.current, true);
  }, [hasMore, fetchPage]);

  // Hides the entry now and deletes it for real after 5s, so Undo can cancel the
  // delete without losing the entry's cheers. Returns the undo function.
  const commitDelete = useCallback(
    async (entryId: string) => {
      pendingDeletes.current.delete(entryId);
      if (!user) return;
      const { error } = await supabase.from("activity_feed").delete().eq("id", entryId).eq("user_id", user.id);
      if (error) fetchPage(0, false, Math.max(PAGE_SIZE, rawLoaded.current));
    },
    [user, fetchPage],
  );

  const deleteEntry = useCallback(
    (entryId: string): (() => void) | null => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry || !entry.mine) return null;
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      const timer = setTimeout(() => commitDelete(entryId), 5000);
      pendingDeletes.current.set(entryId, { entry, timer });
      return () => {
        const pending = pendingDeletes.current.get(entryId);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingDeletes.current.delete(entryId);
        setEntries((prev) =>
          [...prev, pending.entry].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      };
    },
    [entries, commitDelete],
  );

  // Don't lose a pending delete if the user leaves the tab or the app is backgrounded.
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  useEffect(() => {
    const pending = pendingDeletes.current;
    const flush = () => {
      for (const [id, p] of [...pending]) {
        clearTimeout(p.timer);
        commitRef.current(id);
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);

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

  return { entries, loading, hasMore, loadMore, toggleCheer, deleteEntry, incomingCheer };
}
