import { useState, useCallback, useEffect } from "react";
import {
  GoogleChromeLogo,
  Heart,
  Trash,
  CaretRight,
  CheckCircle,
  XCircle,
  Warning,
} from "@phosphor-icons/react";
import { useHabitsContext } from "../context/HabitsContext";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { useProfile } from "../hooks/useProfile";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function SectionLabel({ children }: { children: string }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        color: "var(--color-text-secondary)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        marginBottom: "var(--space-3)",
      }}
    >
      {children}
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  padding: "var(--space-4)",
  background: "var(--color-surface)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
};

export function Settings() {
  const { habits, bestStreak, todaysProgress } = useHabitsContext();
  const gcal = useGoogleCalendar();
  const profile = useProfile();
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [showReset, setShowReset] = useState(false);

  useEffect(() => { setName(profile.name); }, [profile.name]);

  const saveName = useCallback((value: string) => {
    setName(value);
    profile.updateName(value);
  }, [profile.updateName]);

  const handleReset = useCallback(async () => {
    if (!user) return;
    await Promise.all([
      supabase.from("completions").delete().eq("user_id", user.id),
      supabase.from("habits").delete().eq("user_id", user.id),
      supabase.from("tasks").delete().eq("user_id", user.id),
      supabase.from("calendar_events").delete().eq("user_id", user.id),
    ]);
    setShowReset(false);
    window.location.reload();
  }, [user]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <h1
        style={{
          fontSize: "var(--text-2xl)",
          fontWeight: 700,
          letterSpacing: "-0.03em",
        }}
      >
        Settings
      </h1>

      {/* Profile */}
      <section>
        <SectionLabel>Profile</SectionLabel>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                border: "1px solid #8E9BC4",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <img
                src={profile.avatarUrl || "/assets/profile-avatar.png"}
                alt="Profile"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="text"
                value={name}
                onChange={(e) => saveName(e.target.value)}
                placeholder="Your name"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  padding: "var(--space-1) 0",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--color-text)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "var(--space-2)",
              marginTop: "var(--space-4)",
              textAlign: "center",
            }}
          >
            <StatBox label="Habits" value={habits.length} />
            <StatBox label="Best Streak" value={bestStreak} />
            <StatBox label="Done Today" value={`${todaysProgress.done}/${todaysProgress.total}`} />
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section>
        <SectionLabel>Integrations</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <IntegrationRow
            icon={<GoogleChromeLogo size={20} weight="regular" />}
            label="Google Calendar"
            connected={gcal.connected}
            available={gcal.available}
            onToggle={gcal.connected ? gcal.disconnect : gcal.connect}
          />
          <IntegrationRow
            icon={<Heart size={20} weight="regular" />}
            label="Ultrahuman"
            connected={true}
            available={true}
            detail="Via API"
          />
        </div>
      </section>

      {/* Data */}
      <section>
        <SectionLabel>Data</SectionLabel>
        <div style={cardStyle}>
          {!showReset ? (
            <button
              onClick={() => setShowReset(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                width: "100%",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "#E5484D",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              <Trash size={20} weight="regular" />
              Reset All Data
              <CaretRight size={16} weight="bold" style={{ marginLeft: "auto" }} />
            </button>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  color: "#E5484D",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  marginBottom: "var(--space-3)",
                }}
              >
                <Warning size={16} weight="fill" />
                This will delete all habits, completions, and tasks.
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button
                  onClick={() => setShowReset(false)}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-surface-dim)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: "var(--radius-sm)",
                    background: "#E5484D",
                    border: "none",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Delete Everything
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* About */}
      <section>
        <SectionLabel>About</SectionLabel>
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600 }}>Pulse</span>
            <span
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
              }}
            >
              v1.0.0
            </span>
          </div>
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
              marginTop: "var(--space-2)",
            }}
          >
            Personal dashboard & habit tracker
          </p>
          <button
            onClick={signOut}
            style={{
              width: "100%",
              height: 44,
              borderRadius: "var(--radius-sm)",
              background: "transparent",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              marginTop: "var(--space-3)",
            }}
          >
            Sign Out
          </button>
        </div>
      </section>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: "var(--space-2) 0",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-surface-dim)",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)" }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--color-text-secondary)",
          marginTop: 2,
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function IntegrationRow({
  icon,
  label,
  connected,
  available,
  detail,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  connected: boolean;
  available: boolean;
  detail?: string;
  onToggle?: () => void;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ color: "var(--color-text-secondary)" }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
            {detail}
          </div>
        )}
      </div>
      {available ? (
        connected ? (
          <button
            onClick={onToggle}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 9999,
              background: "rgba(76, 175, 80, 0.12)",
              border: "none",
              color: "#66BB6A",
              fontSize: 12,
              fontWeight: 600,
              cursor: onToggle ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            <CheckCircle size={14} weight="fill" />
            Connected
          </button>
        ) : (
          <button
            onClick={onToggle}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 9999,
              background: "var(--color-surface-dim)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <XCircle size={14} weight="regular" />
            Connect
          </button>
        )
      ) : (
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
          Unavailable
        </span>
      )}
    </div>
  );
}
