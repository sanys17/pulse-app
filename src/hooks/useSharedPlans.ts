import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { subscribeToTables } from "../lib/realtime";
import { expectRows, reportError } from "../lib/monitoring";
import type { SharedPlan, PlanMember, ChecklistItem } from "../types";

export interface PlanWithMembers extends SharedPlan {
  members: PlanMember[];
}

/** An open plan from a friend that the user has not joined yet. */
export interface OpenPlan {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  creatorName: string;
  goingCount: number;
}

export function useSharedPlans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanWithMembers[]>([]);
  const [openPlans, setOpenPlans] = useState<OpenPlan[]>([]);
  const [loading, setLoading] = useState(true);
  // Only the newest fetch may write state; a delete also bumps it so a response
  // that was already in flight cannot bring a deleted plan back.
  const fetchSeq = useRef(0);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const seq = ++fetchSeq.current;

    const { data: memberRows } = await supabase
      .from("plan_members")
      .select("plan_id")
      .eq("user_id", user.id);

    // Friends' open plans I could still join (RLS only shows friends' plans).
    const joined = new Set((memberRows ?? []).map((m) => m.plan_id));
    const loadOpen = async () => {
      const { data: open } = await supabase.from("shared_plans").select("*").eq("open", true).neq("creator_id", user.id);
      const candidates = (open ?? []).filter((p) => !joined.has(p.id) && p.status !== "cancelled" && p.status !== "completed");
      if (candidates.length === 0) return [] as OpenPlan[];
      const [{ data: mems }, { data: profs }] = await Promise.all([
        supabase.from("plan_members").select("plan_id, rsvp").in("plan_id", candidates.map((p) => p.id)),
        supabase.from("profiles").select("user_id, name").in("user_id", [...new Set(candidates.map((p) => p.creator_id))]),
      ]);
      const names = new Map((profs ?? []).map((p) => [p.user_id, p.name ?? ""]));
      return candidates.map((p) => ({
        id: p.id,
        title: p.title,
        date: p.date,
        time: p.time,
        location: p.location,
        creatorName: names.get(p.creator_id) || "A friend",
        goingCount: (mems ?? []).filter((m) => m.plan_id === p.id && m.rsvp === "going").length,
      }));
    };

    if (seq !== fetchSeq.current) return;
    if (!memberRows || memberRows.length === 0) {
      const openNow = await loadOpen();
      if (seq !== fetchSeq.current) return;
      setOpenPlans(openNow);
      setPlans([]);
      setLoading(false);
      return;
    }

    const planIds = memberRows.map((m) => m.plan_id);

    const [openNow, plansRes, allMembersRes] = await Promise.all([
      loadOpen(),
      supabase
        .from("shared_plans")
        .select("*")
        .in("id", planIds)
        .order("created_at", { ascending: false }),
      supabase.from("plan_members").select("*").in("plan_id", planIds),
    ]);

    if (seq !== fetchSeq.current) return;
    const allMembers = allMembersRes.data ?? [];
    const memberUserIds = [...new Set(allMembers.map((m) => m.user_id))];

    const profileMap = new Map<string, { name: string; avatarUrl: string | null; username: string }>();
    if (memberUserIds.length > 0) {
      const [profilesRes, usernamesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, name, avatar_url").in("user_id", memberUserIds),
        supabase.from("usernames").select("user_id, username").in("user_id", memberUserIds),
      ]);

      const unMap = new Map<string, string>();
      for (const u of usernamesRes.data ?? []) unMap.set(u.user_id, u.username);

      for (const p of profilesRes.data ?? []) {
        profileMap.set(p.user_id, {
          name: p.name ?? "",
          avatarUrl: p.avatar_url,
          username: unMap.get(p.user_id) ?? "",
        });
      }
    }

    if (seq !== fetchSeq.current) return;
    const result: PlanWithMembers[] = (plansRes.data ?? []).map((p) => ({
      id: p.id,
      creatorId: p.creator_id,
      title: p.title,
      description: p.description,
      date: p.date,
      time: p.time,
      location: p.location,
      status: p.status as SharedPlan["status"],
      alerts: p.alerts ?? null,
      open: p.open,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      members: allMembers
        .filter((m) => m.plan_id === p.id)
        .map((m) => ({
          id: m.id,
          planId: m.plan_id,
          userId: m.user_id,
          rsvp: m.rsvp as PlanMember["rsvp"],
          alerts: m.alerts ?? null,
          joinedAt: m.joined_at,
          name: profileMap.get(m.user_id)?.name ?? "",
          avatarUrl: profileMap.get(m.user_id)?.avatarUrl ?? null,
          username: profileMap.get(m.user_id)?.username ?? "",
        })),
    }));

    setPlans(result);
    setOpenPlans(openNow);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAll();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    const unsubscribe = subscribeToTables(["shared_plans", "plan_members"], fetchAll);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
    };
  }, [fetchAll]);

  const createPlan = useCallback(
    async (data: {
      title: string;
      description?: string;
      date?: string;
      time?: string;
      location?: string;
      alerts?: number[] | null;
      open?: boolean;
      memberIds: string[];
    }) => {
      if (!user) return;

      const { data: plan, error } = await supabase
        .from("shared_plans")
        .insert({
          creator_id: user.id,
          title: data.title,
          description: data.description ?? null,
          date: data.date ?? null,
          time: data.time ?? null,
          location: data.location ?? null,
          alerts: data.alerts ?? null,
          open: data.open ?? false,
        })
        .select()
        .single();

      if (error || !plan) return;

      const memberInserts = [user.id, ...data.memberIds].map((uid) => ({
        plan_id: plan.id,
        user_id: uid,
        rsvp: uid === user.id ? "going" : "pending",
      }));

      const { error: membersError } = await supabase.from("plan_members").insert(memberInserts);
      if (membersError) {
        // Don't leave a plan nobody (not even the creator) is a member of.
        reportError(membersError, { area: "create-plan", target: "plan_members" });
        await supabase.from("shared_plans").delete().eq("id", plan.id);
        return undefined;
      }

      await supabase.from("activity_feed").insert({
        user_id: user.id,
        type: "plan_created",
        payload: { planTitle: data.title, planId: plan.id },
      });

      await fetchAll();
      return plan.id as string;
    },
    [user, fetchAll],
  );

  // Creator only (RLS). Cascades to members and checklist; also removes the
  // "created a plan" feed entry so it doesn't point at a plan that no longer exists.
  const deletePlan = useCallback(
    async (planId: string): Promise<boolean> => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("shared_plans")
        .delete()
        .eq("id", planId)
        .eq("creator_id", user.id)
        .select("id");
      if (error || !data || data.length === 0) return false;

      fetchSeq.current++;
      setPlans((prev) => prev.filter((p) => p.id !== planId));

      await supabase
        .from("activity_feed")
        .delete()
        .eq("user_id", user.id)
        .eq("type", "plan_created")
        .eq("payload->>planId", planId);

      return true;
    },
    [user],
  );

  const joinPlan = useCallback(
    async (planId: string): Promise<boolean> => {
      if (!user) return false;
      const { error } = await supabase
        .from("plan_members")
        .insert({ plan_id: planId, user_id: user.id, rsvp: "going" });
      if (error) {
        if (error.code !== "42501") reportError(error, { area: "join-plan", target: planId });
        return false;
      }
      await fetchAll();
      return true;
    },
    [user, fetchAll],
  );

  // A member (not the creator) removes themselves from a plan.
  const leavePlan = useCallback(
    async (planId: string): Promise<boolean> => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("plan_members")
        .delete()
        .eq("plan_id", planId)
        .eq("user_id", user.id)
        .select("id");
      if (error || !data || data.length === 0) return false;
      fetchSeq.current++;
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      return true;
    },
    [user],
  );

  // Each member has their own alert for a plan (like shared events in Apple Calendar).
  const updateMyAlerts = useCallback(
    async (planId: string, alerts: number[] | null): Promise<boolean> => {
      if (!user) return false;
      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId
            ? { ...p, members: p.members.map((m) => (m.userId === user.id ? { ...m, alerts } : m)) }
            : p,
        ),
      );
      const { data, error } = await supabase
        .from("plan_members")
        .update({ alerts })
        .eq("plan_id", planId)
        .eq("user_id", user.id)
        .select("id");
      if (error || !expectRows("plan_members.alerts", data)) {
        await fetchAll();
        return false;
      }
      return true;
    },
    [user, fetchAll],
  );

  const updateRsvp = useCallback(
    async (planId: string, rsvp: PlanMember["rsvp"]) => {
      if (!user) return;

      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId
            ? {
                ...p,
                members: p.members.map((m) =>
                  m.userId === user.id ? { ...m, rsvp } : m,
                ),
              }
            : p,
        ),
      );

      const { data, error } = await supabase
        .from("plan_members")
        .update({ rsvp })
        .eq("plan_id", planId)
        .eq("user_id", user.id)
        .select("id");
      if (error || !expectRows("plan_members.rsvp", data)) await fetchAll();
    },
    [user, fetchAll],
  );

  const fetchChecklist = useCallback(async (planId: string): Promise<ChecklistItem[]> => {
    const { data } = await supabase
      .from("plan_checklist")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at");

    return (data ?? []).map((c) => ({
      id: c.id,
      planId: c.plan_id,
      label: c.label,
      done: c.done,
      assignedTo: c.assigned_to,
      createdBy: c.created_by,
      createdAt: c.created_at,
    }));
  }, []);

  const addChecklistItem = useCallback(
    async (planId: string, label: string) => {
      if (!user) return;
      await supabase.from("plan_checklist").insert({
        plan_id: planId,
        label,
        created_by: user.id,
      });
    },
    [user],
  );

  const toggleChecklistItem = useCallback(async (itemId: string, done: boolean) => {
    await supabase.from("plan_checklist").update({ done }).eq("id", itemId);
  }, []);

  const deleteChecklistItem = useCallback(async (itemId: string) => {
    await supabase.from("plan_checklist").delete().eq("id", itemId);
  }, []);

  return {
    plans,
    openPlans,
    loading,
    createPlan,
    deletePlan,
    leavePlan,
    joinPlan,
    updateRsvp,
    updateMyAlerts,
    fetchChecklist,
    addChecklistItem,
    toggleChecklistItem,
    deleteChecklistItem,
    refetch: fetchAll,
  };
}
