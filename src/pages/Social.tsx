import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { UsersThree, Plus, SpinnerGap } from "@phosphor-icons/react";
import { useSocial } from "../context/SocialContext";
import { UsernameSetup } from "../components/UsernameSetup";
import { FriendRequestCard } from "../components/FriendRequestCard";
import { FeedRow } from "../components/FeedRow";
import { PlanCard } from "../components/PlanCard";
import { FriendsSheet } from "../components/FriendsSheet";
import { CreatePlanSheet } from "../components/CreatePlanSheet";
import { SectionHeader } from "../components/SectionHeader";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { Avatar } from "../components/Avatar";
import { dayLabel, localDateKey } from "../lib/format";
import type { FeedEntry, FriendRequest } from "../types";

function groupByDay(entries: FeedEntry[]): { label: string; items: FeedEntry[] }[] {
  const groups: { label: string; items: FeedEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}

export function Social() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { username, friendships, feed, plans } = useSocial();

  const [showFriends, setShowFriends] = useState(false);
  const [friendsQuery, setFriendsQuery] = useState("");
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<{ id: string; title: string } | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    error: boolean;
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback(
    (text: string, error = false, action?: { label: string; onClick: () => void }) => {
      setToast({ text, error, action });
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      toastTimeout.current = setTimeout(() => setToast(null), action ? 5000 : 3000);
    },
    [],
  );

  // A toast handed over by another screen (e.g. "Plan deleted")
  const handoffToast = (location.state as { toast?: string } | null)?.toast;
  useEffect(() => {
    if (!handoffToast) return;
    showToast(handoffToast);
    navigate(location.pathname, { replace: true, state: null });
  }, [handoffToast, showToast, navigate, location.pathname]);

  // ?add=username deep link opens the Friends sheet with the search filled in
  const addParam = searchParams.get("add");
  useEffect(() => {
    if (addParam && username.username) {
      setFriendsQuery(addParam);
      setShowFriends(true);
    }
  }, [addParam, username.username]);

  const closeFriends = useCallback(() => {
    setShowFriends(false);
    setFriendsQuery("");
    if (searchParams.has("add")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleAccept = useCallback(
    async (req: FriendRequest) => {
      await friendships.acceptRequest(req.friendshipId);
      showToast(`You and ${req.name || req.username} are now friends`);
    },
    [friendships, showToast],
  );

  const handleDecline = useCallback(
    async (req: FriendRequest) => {
      await friendships.declineRequest(req.friendshipId);
      showToast("Request declined");
    },
    [friendships, showToast],
  );

  const handleCheer = useCallback(
    async (entryId: string) => {
      const ok = await feed.toggleCheer(entryId);
      if (!ok) showToast("Couldn't send your cheer. Try again.", true);
      return ok;
    },
    [feed, showToast],
  );

  const handleDeleteEntry = useCallback(
    (entryId: string) => {
      // A "created a plan" entry stands for the plan itself: deleting it deletes the plan.
      const entry = feed.entries.find((e) => e.id === entryId);
      const planId = entry?.type === "plan_created" ? entry.payload.planId : undefined;
      const plan = typeof planId === "string" ? plans.plans.find((p) => p.id === planId) : undefined;
      if (entry?.mine && plan && plan.creatorId === entry.userId) {
        setPlanToDelete({ id: plan.id, title: plan.title });
        return;
      }

      const undo = feed.deleteEntry(entryId);
      if (!undo) return;
      showToast("Post deleted", false, {
        label: "Undo",
        onClick: () => {
          undo();
          setToast(null);
        },
      });
    },
    [feed, plans.plans, showToast],
  );

  const handleConfirmDeletePlan = useCallback(async () => {
    if (!planToDelete) return;
    const ok = await plans.deletePlan(planToDelete.id);
    if (ok) showToast(`Plan "${planToDelete.title}" deleted`);
    else showToast("Couldn't delete the plan. Try again.", true);
  }, [planToDelete, plans, showToast]);

  const { upcoming, past } = useMemo(() => {
    const today = localDateKey();
    const isPast = (p: (typeof plans.plans)[number]) =>
      p.status === "completed" || p.status === "cancelled" || (!!p.date && p.date < today);
    const dateOf = (p: (typeof plans.plans)[number]) => p.date ?? "9999-12-31";
    return {
      upcoming: plans.plans.filter((p) => !isPast(p)).sort((a, b) => dateOf(a).localeCompare(dateOf(b))),
      past: plans.plans.filter(isPast).sort((a, b) => dateOf(b).localeCompare(dateOf(a))),
    };
  }, [plans.plans]);

  const feedGroups = useMemo(() => groupByDay(feed.entries), [feed.entries]);

  // Someone cheered one of your entries while you were here
  const cheerKey = feed.incomingCheer?.key;
  const cheerText = feed.incomingCheer?.text;
  useEffect(() => {
    if (cheerKey && cheerText) showToast(cheerText);
  }, [cheerKey, cheerText, showToast]);

  if (username.loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          color: "var(--color-text-tertiary)",
        }}
      >
        <SpinnerGap size={24} weight="bold" className="spin" />
      </div>
    );
  }

  if (!username.username) {
    return <UsernameSetup onClaim={username.claimUsername} checkAvailability={username.checkAvailability} />;
  }

  const requests = friendships.pendingIncoming;
  const shownPlans = showPast ? past : upcoming;
  const friendFaces = friendships.friends.slice(0, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "-0.03em" }}>Social</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            className="press"
            onClick={() => setShowFriends(true)}
            aria-label={`Friends, ${friendships.friends.length}`}
            style={{
              height: 44,
              padding: "0 var(--space-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              background: "var(--color-surface)",
              borderRadius: 9999,
              border: "1px solid var(--color-border)",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--color-text)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {friendFaces.length > 0 ? (
              <div style={{ display: "flex" }}>
                {friendFaces.map((f, i) => (
                  <div key={f.userId} style={{ marginLeft: i > 0 ? -8 : 0 }}>
                    <Avatar name={f.name || f.username} src={f.avatarUrl} size={24} ring="var(--color-surface)" />
                  </div>
                ))}
              </div>
            ) : (
              <UsersThree size={18} weight="regular" />
            )}
            Friends
            {friendships.friends.length > 0 && (
              <span style={{ color: "var(--color-text-tertiary)" }}>{friendships.friends.length}</span>
            )}
          </button>
          <button
            className="press"
            onClick={() => setShowCreatePlan(true)}
            aria-label="New plan"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--color-accent)",
              border: "none",
              color: "#07070C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Plus size={20} weight="bold" />
          </button>
        </div>
      </div>

      {/* Needs you */}
      {requests.length > 0 && (
        <section>
          <SectionHeader title="Needs you" count={requests.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {requests.map((req) => (
              <FriendRequestCard key={req.friendshipId} request={req} onAccept={handleAccept} onDecline={handleDecline} />
            ))}
          </div>
        </section>
      )}

      {/* Plans */}
      <section>
        <SectionHeader
          title={showPast ? "Past plans" : "Upcoming"}
          action={
            past.length > 0 || showPast
              ? { label: showPast ? "Upcoming" : `Past (${past.length})`, onClick: () => setShowPast((v) => !v) }
              : undefined
          }
        />
        {shownPlans.length === 0 ? (
          <div
            style={{
              padding: "var(--space-6) var(--space-4)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-md)",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 600 }}>{showPast ? "No past plans" : "Nothing planned yet"}</p>
            {!showPast && (
              <>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", marginTop: "var(--space-1)" }}>
                  Make a plan and invite your friends.
                </p>
                <button
                  className="press"
                  onClick={() => setShowCreatePlan(true)}
                  style={{
                    height: 44,
                    marginTop: "var(--space-3)",
                    padding: "0 var(--space-5)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-complete-bg)",
                    border: "none",
                    color: "var(--color-accent)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  New plan
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              overflowX: "auto",
              scrollSnapType: "x proximity",
              scrollbarWidth: "none",
              margin: "0 calc(-1 * var(--space-4))",
              padding: "0 var(--space-4)",
            }}
          >
            {shownPlans.map((plan) => (
              <div key={plan.id} style={{ scrollSnapAlign: "start", display: "flex" }}>
                <PlanCard plan={plan} onClick={() => navigate(`/social/plan/${plan.id}`)} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Activity */}
      <section>
        <SectionHeader title="Activity" />
        {feed.loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-8)" }}>
            <SpinnerGap size={20} weight="bold" className="spin" color="var(--color-text-tertiary)" />
          </div>
        ) : feed.entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)" }}>
            {friendships.friends.length === 0 ? (
              <>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "var(--radius-lg)",
                    background: "var(--color-complete-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto var(--space-3)",
                  }}
                >
                  <UsersThree size={24} weight="regular" color="var(--color-accent)" />
                </div>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Add friends to see their activity</p>
                <button
                  className="press"
                  onClick={() => setShowFriends(true)}
                  style={{
                    height: 44,
                    marginTop: "var(--space-3)",
                    padding: "0 var(--space-5)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-complete-bg)",
                    border: "none",
                    color: "var(--color-accent)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Find friends
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Your friends have been quiet</p>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", marginTop: "var(--space-1)" }}>
                  Streaks, new habits and plans show up here.
                </p>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {feedGroups.map((group) => (
              <div key={group.label}>
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    padding: "var(--space-2) var(--space-1)",
                  }}
                >
                  {group.label}
                </h3>
                <div
                  className="fade-up"
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    overflow: "hidden",
                  }}
                >
                  {group.items.map((entry, i) => (
                    <div key={entry.id} style={{ borderTop: i > 0 ? "1px solid var(--color-border)" : "none" }}>
                      <FeedRow entry={entry} onCheer={handleCheer} onDelete={handleDeleteEntry} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {feed.hasMore && (
              <button
                className="press"
                onClick={feed.loadMore}
                style={{
                  height: 44,
                  marginTop: "var(--space-2)",
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-secondary)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Show more
              </button>
            )}
          </div>
        )}
      </section>

      {showFriends && (
        <FriendsSheet
          friendships={friendships}
          username={username.username}
          initialQuery={friendsQuery}
          notify={showToast}
          onClose={closeFriends}
        />
      )}

      {showCreatePlan && (
        <CreatePlanSheet
          friends={friendships.friends}
          onCreate={plans.createPlan}
          onCreated={(title) => showToast(`Plan "${title}" created`)}
          onClose={() => setShowCreatePlan(false)}
        />
      )}

      {planToDelete && (
        <ConfirmSheet
          title="Delete plan?"
          message={`"${planToDelete.title}" will be deleted for everyone invited, along with its checklist and RSVPs. This can't be undone.`}
          confirmLabel="Delete plan"
          onConfirm={handleConfirmDeletePlan}
          onClose={() => setPlanToDelete(null)}
        />
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
            display: "flex",
            justifyContent: "center",
            padding: "0 var(--space-4)",
            pointerEvents: toast.action ? "auto" : "none",
            zIndex: 70,
          }}
        >
          <div
            role="status"
            aria-live="polite"
            className="fade-up"
            style={{
              padding: toast.action ? "0 var(--space-2) 0 var(--space-4)" : "var(--space-3) var(--space-4)",
              display: "flex",
              alignItems: "center",
              borderRadius: 9999,
              background: "rgba(20, 20, 30, 0.9)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: `1px solid ${toast.error ? "var(--color-danger)" : "rgba(255, 255, 255, 0.08)"}`,
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
              color: toast.error ? "var(--color-danger)" : "var(--color-text)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {toast.text}
            {toast.action && (
              <button
                className="press"
                onClick={toast.action.onClick}
                style={{
                  marginLeft: "var(--space-3)",
                  minHeight: 44,
                  padding: "0 var(--space-2)",
                  background: "transparent",
                  border: "none",
                  color: "var(--color-accent)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 800ms linear infinite; }
      `}</style>
    </div>
  );
}
