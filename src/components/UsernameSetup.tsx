import { useState, useCallback, useEffect, useRef } from "react";
import { At, CheckCircle, XCircle, SpinnerGap } from "@phosphor-icons/react";

interface UsernameSetupProps {
  onClaim: (username: string) => Promise<{ error?: string }>;
  checkAvailability: (username: string) => Promise<boolean>;
}

export function UsernameSetup({ onClaim, checkAvailability }: UsernameSetupProps) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = useCallback(
    (raw: string) => {
      const v = raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
      setValue(v);
      setError(null);

      if (v.length < 3) {
        setStatus("idle");
        return;
      }

      if (!/^[a-z0-9_]{3,24}$/.test(v)) {
        setStatus("invalid");
        return;
      }

      setStatus("checking");
      checkAvailability(v).then((available) => {
        setStatus(available ? "available" : "taken");
      });
    },
    [checkAvailability],
  );

  const handleSubmit = useCallback(async () => {
    if (status !== "available" || submitting) return;
    setSubmitting(true);
    const result = await onClaim(value);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }, [value, status, submitting, onClaim]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "var(--space-10) var(--space-4)",
        minHeight: "50vh",
        gap: "var(--space-6)",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--radius-lg)",
          background: "rgba(142, 155, 196, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <At size={28} weight="regular" color="var(--p-accent)" />
      </div>

      <div>
        <h2
          style={{
            fontSize: "var(--text-xl)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Pick a username
        </h2>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            marginTop: "var(--space-2)",
            lineHeight: 1.4,
          }}
        >
          This is how friends will find you on Pulse
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 280 }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 14,
              fontSize: 16,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              pointerEvents: "none",
            }}
          >
            @
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: "100%",
              height: 48,
              paddingLeft: 32,
              paddingRight: 40,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: 16,
              fontWeight: 500,
              color: "var(--color-text)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <div style={{ position: "absolute", right: 14 }}>
            {status === "checking" && (
              <SpinnerGap size={18} weight="bold" color="var(--color-text-secondary)" className="spin" />
            )}
            {status === "available" && (
              <CheckCircle size={18} weight="fill" color="#57AB5A" />
            )}
            {status === "taken" && (
              <XCircle size={18} weight="fill" color="#E5534B" />
            )}
          </div>
        </div>

        {status === "taken" && (
          <p style={{ fontSize: "var(--text-xs)", color: "#E5534B", marginTop: "var(--space-2)" }}>
            Already taken
          </p>
        )}
        {error && (
          <p style={{ fontSize: "var(--text-xs)", color: "#E5534B", marginTop: "var(--space-2)" }}>
            {error}
          </p>
        )}
        {value.length > 0 && value.length < 3 && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", marginTop: "var(--space-2)" }}>
            At least 3 characters
          </p>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={status !== "available" || submitting}
        style={{
          width: "100%",
          maxWidth: 280,
          height: 48,
          borderRadius: "var(--radius-md)",
          background: status === "available" ? "var(--p-accent)" : "var(--color-surface-dim)",
          border: "none",
          color: status === "available" ? "#07070C" : "var(--color-text-secondary)",
          fontSize: 15,
          fontWeight: 600,
          cursor: status === "available" ? "pointer" : "default",
          fontFamily: "inherit",
          opacity: submitting ? 0.6 : 1,
          transition: "background 200ms ease, opacity 200ms ease",
        }}
      >
        {submitting ? "Claiming..." : "Claim Username"}
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 800ms linear infinite; }
      `}</style>
    </div>
  );
}
