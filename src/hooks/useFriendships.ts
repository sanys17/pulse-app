import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { subscribeToTables } from "../lib/realtime";
import { expectRows } from "../lib/monitoring";
import type { Friend, FriendRequest } from "../types";

interface UserSearchResult {
  userId: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

async function fetchProfiles(
  userIds: string[],
): Promise<Map<string, { name: string; avatarUrl: string | null; username: string }>> {
  const map = new Map<string, { name: string; avatarUrl: string | null; username: string }>();
  if (userIds.length === 0) return map;

  const [profilesRes, usernamesRes] = await Promise.all([
    supabase.from("profiles").select("user_id, name, avatar_url").in("user_id", userIds),
    supabase.from("usernames").select("user_id, username").in("user_id", userIds),
  ]);

  const usernameMap = new Map<string, string>();
  for (const u of usernamesRes.data ?? []) {
    usernameMap.set(u.user_id, u.username);
  }

  for (const p of profilesRes.data ?? []) {
    map.set(p.user_id, {
      name: p.name ?? "",
      avatarUrl: p.avatar_url,
      username: usernameMap.get(p.user_id) ?? "",
    });
  }

  return map;
}

export function useFriendships() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<FriendRequest[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;

    const { data: rows } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!rows) return;

    const otherIds = rows.map((r) =>
      r.requester_id === user.id ? r.addressee_id : r.requester_id,
    );
    const profiles = await fetchProfiles(otherIds);

    const accepted: Friend[] = [];
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];

    for (const row of rows) {
      const isRequester = row.requester_id === user.id;
      const otherId = isRequester ? row.addressee_id : row.requester_id;
      const profile = profiles.get(otherId);

      if (row.status === "accepted") {
        accepted.push({
          friendshipId: row.id,
          userId: otherId,
          name: profile?.name ?? "",
          avatarUrl: profile?.avatarUrl ?? null,
          username: profile?.username ?? "",
        });
      } else if (row.status === "pending") {
        const request: FriendRequest = {
          friendshipId: row.id,
          userId: otherId,
          name: profile?.name ?? "",
          avatarUrl: profile?.avatarUrl ?? null,
          username: profile?.username ?? "",
          createdAt: row.created_at,
        };
        if (isRequester) outgoing.push(request);
        else incoming.push(request);
      }
    }

    setFriends(accepted);
    setPendingIncoming(incoming);
    setPendingOutgoing(outgoing);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchAll();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Realtime needs migration 006; the poll keeps requests fresh without it.
    const unsubscribe = subscribeToTables(["friendships"], fetchAll);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") fetchAll();
    }, 20000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(poll);
      unsubscribe();
    };
  }, [user, fetchAll]);

  const sendRequest = useCallback(
    async (targetUsername: string): Promise<{ error?: string }> => {
      if (!user) return { error: "Not signed in" };

      const { data: target } = await supabase
        .from("usernames")
        .select("user_id")
        .eq("username", targetUsername.toLowerCase().trim())
        .single();

      if (!target) return { error: "User not found" };
      if (target.user_id === user.id) return { error: "That's you!" };

      const { error } = await supabase.from("friendships").insert({
        requester_id: user.id,
        addressee_id: target.user_id,
        status: "pending",
      });

      if (error) {
        if (error.code === "23505") return { error: "Request already sent" };
        return { error: error.message };
      }

      await fetchAll();
      return {};
    },
    [user, fetchAll],
  );

  const acceptRequest = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from("friendships")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", friendshipId)
        .select("id");
      const ok = !error && expectRows("friendships.accept", data);
      await fetchAll();
      return ok;
    },
    [fetchAll],
  );

  const declineRequest = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from("friendships")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", friendshipId)
        .select("id");
      const ok = !error && expectRows("friendships.decline", data);
      if (ok) setPendingIncoming((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
      else await fetchAll();
      return ok;
    },
    [fetchAll],
  );

  const cancelRequest = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      setPendingOutgoing((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
      const { data, error } = await supabase.from("friendships").delete().eq("id", friendshipId).select("id");
      const ok = !error && expectRows("friendships.cancel", data);
      if (!ok) await fetchAll();
      return ok;
    },
    [fetchAll],
  );

  const removeFriend = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
      const { data, error } = await supabase.from("friendships").delete().eq("id", friendshipId).select("id");
      const ok = !error && expectRows("friendships.remove", data);
      if (!ok) await fetchAll();
      return ok;
    },
    [fetchAll],
  );

  const searchUsers = useCallback(
    async (query: string): Promise<UserSearchResult[]> => {
      if (!user || query.trim().length < 2) return [];

      const { data } = await supabase
        .from("usernames")
        .select("user_id, username")
        .ilike("username", `%${query.trim().toLowerCase()}%`)
        .neq("user_id", user.id)
        .limit(10);

      if (!data || data.length === 0) return [];

      const profiles = await fetchProfiles(data.map((d) => d.user_id));

      return data.map((d) => ({
        userId: d.user_id,
        username: d.username,
        name: profiles.get(d.user_id)?.name ?? "",
        avatarUrl: profiles.get(d.user_id)?.avatarUrl ?? null,
      }));
    },
    [user],
  );

  return {
    friends,
    pendingIncoming,
    pendingOutgoing,
    loading,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    searchUsers,
    refetch: fetchAll,
  };
}
