import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  UsersThree,
  MagnifyingGlass,
  Plus,
  UserPlus,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useSocial } from "../context/SocialContext";
import { UsernameSetup } from "../components/UsernameSetup";
import { FriendRequestCard } from "../components/FriendRequestCard";
import { FeedCard } from "../components/FeedCard";
import { PlanCard } from "../components/PlanCard";
import { FriendsSheet } from "../components/FriendsSheet";
import { CreatePlanSheet } from "../components/CreatePlanSheet";

export function Social() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams({});
  const { username, friendships, feed, plans } = useSocial();

  const [showFriends, setShowFriends] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { userId: string; username: string; name: string; avatarUrl: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [addingUser, setAddingUser] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Handle ?add=username deep link
  useEffect(() => {
    const addUser = searchParams.get("add");
    if (addUser && username.username) {
      setSearchQuery(addUser);
      handleSearch(addUser);
    }
  }, [searchParams, username.username]);

  const handleSearch = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      const results = await friendships.searchUsers(query);
      setSearchResults(results);
      setSearching(false);
    },
    [friendships],
  );

  const onSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      setAddSuccess(null);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => handleSearch(value), 300);
    },
    [handleSearch],
  );

  const handleSendRequest = useCallback(
    async (targetUsername: string) => {
      setAddingUser(targetUsername);
      const result = await friendships.sendRequest(targetUsername);
      setAddingUser(null);
      if (result.error) {
        setAddSuccess(result.error);
      } else {
        setAddSuccess("Request sent!");
        setSearchResults((prev) => prev.filter((r) => r.username !== targetUsername));
      }
    },
    [friendships],
  );

  if (username.loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          color: "var(--color-text-secondary)",
        }}
      >
        <SpinnerGap size={24} weight="bold" className="spin" />
      </div>
    );
  }

  if (!username.username) {
    return (
      <UsernameSetup
        onClaim={username.claimUsername}
        checkAvailability={username.checkAvailability}
      />
    );
  }

  const hasRequests = friendships.pendingIncoming.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          Social
        </h1>
        <button
          onClick={() => setShowFriends(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border)",
            cursor: "pointer",
            fontFamily: "inherit",
            color: "var(--color-text)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <UsersThree size={16} weight="regular" />
          Friends
          {friendships.friends.length > 0 && (
            <span style={{ color: "var(--color-text-secondary)" }}>
              ({friendships.friends.length})
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <MagnifyingGlass
          size={16}
          weight="regular"
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-text-secondary)",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Find friends by username..."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: "100%",
            height: 44,
            paddingLeft: 38,
            paddingRight: "var(--space-3)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            fontSize: 14,
            color: "var(--color-text)",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        {searching && (
          <SpinnerGap
            size={16}
            weight="bold"
            className="spin"
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-secondary)",
            }}
          />
        )}
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            marginTop: "calc(-1 * var(--space-3))",
          }}
        >
          {searchResults.map((result) => {
            const alreadyFriend = friendships.friends.some((f) => f.userId === result.userId);
            const alreadySent = friendships.pendingOutgoing.some(
              (r) => r.userId === result.userId,
            );

            return (
              <div
                key={result.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-3)",
                  background: "var(--color-surface)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--color-surface-dim)",
                    overflow: "hidden",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--p-accent)",
                  }}
                >
                  {result.avatarUrl ? (
                    <img src={result.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    (result.name || result.username).charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{result.name || result.username}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                    @{result.username}
                  </div>
                </div>
                {alreadyFriend ? (
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 600 }}>
                    Friends
                  </span>
                ) : alreadySent ? (
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 600 }}>
                    Pending
                  </span>
                ) : (
                  <button
                    onClick={() => handleSendRequest(result.username)}
                    disabled={addingUser === result.username}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--p-accent)",
                      border: "none",
                      color: "#07070C",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      opacity: addingUser === result.username ? 0.5 : 1,
                    }}
                  >
                    <UserPlus size={14} weight="bold" />
                    Add
                  </button>
                )}
              </div>
            );
          })}
          {addSuccess && (
            <p
              style={{
                fontSize: "var(--text-xs)",
                color: addSuccess === "Request sent!" ? "#57AB5A" : "#E5534B",
                textAlign: "center",
              }}
            >
              {addSuccess}
            </p>
          )}
        </div>
      )}

      {/* Pending requests */}
      {hasRequests && (
        <div>
          <label
            style={{
              display: "block",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "var(--space-2)",
            }}
          >
            Pending Requests ({friendships.pendingIncoming.length})
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {friendships.pendingIncoming.map((req) => (
              <FriendRequestCard
                key={req.friendshipId}
                request={req}
                onAccept={friendships.acceptRequest}
                onDecline={friendships.declineRequest}
              />
            ))}
          </div>
        </div>
      )}

      {/* Shared Plans */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "var(--space-2)",
          }}
        >
          Shared Plans
        </label>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            overflowX: "auto",
            paddingBottom: "var(--space-2)",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            msOverflowStyle: "none",
            scrollbarWidth: "none",
          }}
        >
          {plans.plans.map((plan) => (
            <div key={plan.id} style={{ scrollSnapAlign: "start" }}>
              <PlanCard plan={plan} onClick={() => navigate(`/social/plan/${plan.id}`)} />
            </div>
          ))}
          <button
            onClick={() => setShowCreatePlan(true)}
            style={{
              width: 160,
              minWidth: 160,
              padding: "var(--space-3)",
              background: "var(--color-surface)",
              borderRadius: "var(--radius-md)",
              border: "1px dashed var(--color-border)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--color-text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              flexShrink: 0,
              minHeight: 100,
              scrollSnapAlign: "start",
            }}
          >
            <Plus size={20} weight="regular" />
            New Plan
          </button>
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "var(--space-2)",
          }}
        >
          Activity
        </label>

        {feed.loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "var(--space-8)",
            }}
          >
            <SpinnerGap size={20} weight="bold" className="spin" color="var(--color-text-secondary)" />
          </div>
        ) : feed.entries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "var(--space-8) var(--space-4)",
            }}
          >
            {friendships.friends.length === 0 ? (
              <>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "var(--radius-lg)",
                    background: "rgba(142, 155, 196, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto var(--space-3)",
                  }}
                >
                  <UsersThree size={24} weight="regular" color="var(--p-accent)" />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>Add friends to see their activity</p>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                  Search by username above
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  Your friends have been quiet
                </p>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--p-muted)", marginTop: "var(--space-1)" }}>
                  Check back later
                </p>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {feed.entries.map((entry, i) => (
              <FeedCard key={entry.id} entry={entry} index={i} />
            ))}
            {feed.hasMore && (
              <button
                onClick={feed.loadMore}
                style={{
                  height: 40,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-secondary)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>

      {showFriends && (
        <FriendsSheet
          friends={friendships.friends}
          username={username.username}
          onRemove={friendships.removeFriend}
          onClose={() => setShowFriends(false)}
        />
      )}

      {showCreatePlan && (
        <CreatePlanSheet
          friends={friendships.friends}
          onCreate={plans.createPlan}
          onClose={() => setShowCreatePlan(false)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 800ms linear infinite; }
        @keyframes feedIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
