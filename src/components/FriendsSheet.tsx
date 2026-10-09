import { useState, useCallback, useEffect, useRef } from "react";
import { Link as LinkIcon, MagnifyingGlass, SpinnerGap, Trash, UserPlus } from "@phosphor-icons/react";
import type { useFriendships } from "../hooks/useFriendships";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { SentRequestRow } from "./SentRequestRow";

type Friendships = ReturnType<typeof useFriendships>;
type SearchResult = { userId: string; username: string; name: string; avatarUrl: string | null };

interface FriendsSheetProps {
  friendships: Friendships;
  username: string;
  initialQuery?: string;
  notify: (text: string, error?: boolean) => void;
  onClose: () => void;
}

const groupLabel = {
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  color: "var(--color-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  minHeight: 44,
  display: "flex",
  alignItems: "center",
} as const;

export function FriendsSheet({ friendships, username, initialQuery = "", notify, onClose }: FriendsSheetProps) {
  const { friends, pendingOutgoing, searchUsers, sendRequest, cancelRequest, removeFriend } = friendships;
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const runSearch = useCallback(
    async (value: string) => {
      if (value.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      setResults(await searchUsers(value));
      setSearching(false);
    },
    [searchUsers],
  );

  useEffect(() => {
    if (initialQuery) runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(value), 300);
  };

  const handleAdd = async (target: string) => {
    setAdding(target);
    const result = await sendRequest(target);
    setAdding(null);
    if (result.error) {
      notify(result.error, true);
    } else {
      notify(`Friend request sent to @${target}`);
      setResults((prev) => prev.filter((r) => r.username !== target));
    }
  };

  const copyInviteLink = useCallback(() => {
    const link = `${window.location.origin}/social?add=${username}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [username]);

  const handleRemove = async (friendshipId: string, name: string) => {
    const ok = await removeFriend(friendshipId);
    setConfirmId(null);
    if (ok) notify(`Removed ${name}`);
    else notify(`Couldn't remove ${name}. Try again.`, true);
  };

  return (
    <Sheet title="Friends" onClose={onClose} maxHeight="88dvh">
      <div style={{ position: "relative" }}>
        <MagnifyingGlass
          size={16}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-text-tertiary)",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add a friend by username"
          aria-label="Add a friend by username"
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
            fontSize: 16,
            color: "var(--color-text)",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        {searching && (
          <SpinnerGap
            size={16}
            className="spin"
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-tertiary)",
            }}
          />
        )}
      </div>

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: "var(--space-2)" }}>
          {results.map((r) => {
            const alreadyFriend = friends.some((f) => f.userId === r.userId);
            const alreadySent = pendingOutgoing.some((p) => p.userId === r.userId);
            return (
              <div
                key={r.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  minHeight: 56,
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <Avatar name={r.name || r.username} src={r.avatarUrl} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name || r.username}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>@{r.username}</div>
                </div>
                {alreadyFriend || alreadySent ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-tertiary)" }}>
                    {alreadyFriend ? "Friends" : "Requested"}
                  </span>
                ) : (
                  <button
                    className="press"
                    onClick={() => handleAdd(r.username)}
                    disabled={adding === r.username}
                    style={{
                      height: 44,
                      padding: "0 var(--space-4)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--color-accent)",
                      border: "none",
                      color: "#07070C",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      opacity: adding === r.username ? 0.5 : 1,
                    }}
                  >
                    <UserPlus size={16} weight="bold" />
                    Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {query.trim().length >= 2 && !searching && results.length === 0 && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", padding: "var(--space-3) 0" }}>
          No one found for "{query.trim()}".
        </p>
      )}

      <button
        className="press"
        onClick={copyInviteLink}
        style={{
          width: "100%",
          height: 44,
          marginTop: "var(--space-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          background: "var(--color-complete-bg)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          color: "var(--color-accent)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <LinkIcon size={16} weight="bold" />
        {copied ? "Link copied" : "Copy your invite link"}
      </button>

      {pendingOutgoing.length > 0 && (
        <section style={{ marginTop: "var(--space-3)" }}>
          <h3 style={groupLabel}>Waiting for response · {pendingOutgoing.length}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {pendingOutgoing.map((req) => (
              <SentRequestRow key={req.friendshipId} request={req} onCancel={cancelRequest} />
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: "var(--space-3)" }}>
        <h3 style={groupLabel}>Friends · {friends.length}</h3>
        {friends.length === 0 ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", padding: "0 0 var(--space-4)" }}>
            No friends yet. Search above or share your invite link.
          </p>
        ) : (
          friends.map((friend) => {
            const label = friend.name || friend.username;
            return (
              <div
                key={friend.friendshipId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  minHeight: 60,
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <Avatar name={label} src={friend.avatarUrl} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                    @{friend.username}
                  </div>
                </div>
                {confirmId === friend.friendshipId ? (
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <button
                      className="press"
                      onClick={() => handleRemove(friend.friendshipId, label)}
                      style={{
                        height: 44,
                        padding: "0 var(--space-3)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--color-danger)",
                        border: "none",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Remove
                    </button>
                    <button
                      className="press"
                      onClick={() => setConfirmId(null)}
                      style={{
                        height: 44,
                        padding: "0 var(--space-3)",
                        borderRadius: "var(--radius-sm)",
                        background: "transparent",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-secondary)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="press"
                    onClick={() => setConfirmId(friend.friendshipId)}
                    aria-label={`Remove ${label}`}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    <Trash size={18} weight="regular" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>
    </Sheet>
  );
}
