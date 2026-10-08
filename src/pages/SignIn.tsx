import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export function SignIn() {
  const { signInWithGoogle, signInWithEmail, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const geist = "Geist, Inter, system-ui, sans-serif";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUp(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100dvh",
      padding: "0 24px",
      fontFamily: geist,
    }}>
      <h1 style={{
        fontSize: 48,
        fontWeight: 700,
        letterSpacing: "-0.04em",
        color: "#EAECF4",
        marginBottom: 8,
      }}>
        Pulse
      </h1>
      <p style={{
        fontSize: 16,
        color: "rgba(234,236,244,0.5)",
        marginBottom: 40,
      }}>
        Personal dashboard & habit tracker
      </p>

      <button
        onClick={signInWithGoogle}
        style={{
          width: "100%",
          maxWidth: 320,
          height: 48,
          borderRadius: 12,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#EAECF4",
          fontSize: 16,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        width: "100%",
        maxWidth: 320,
        margin: "24px 0",
      }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        <span style={{ fontSize: 13, color: "rgba(234,236,244,0.3)" }}>or</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
      </div>

      <form onSubmit={handleSubmit} style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        maxWidth: 320,
      }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={{
            height: 48,
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            padding: "0 16px",
            fontSize: 16,
            color: "#EAECF4",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={6}
          style={{
            height: 48,
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            padding: "0 16px",
            fontSize: 16,
            color: "#EAECF4",
            outline: "none",
            fontFamily: "inherit",
          }}
        />

        {error && (
          <p style={{ fontSize: 14, color: "#E5484D", margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            height: 48,
            borderRadius: 12,
            background: "rgba(167, 139, 250, 0.25)",
            border: "1px solid rgba(167, 139, 250, 0.3)",
            color: "#A78BFA",
            fontSize: 16,
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
            fontFamily: "inherit",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "..." : mode === "signup" ? "Create Account" : "Sign In"}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
        style={{
          marginTop: 16,
          background: "transparent",
          border: "none",
          color: "rgba(234,236,244,0.4)",
          fontSize: 14,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
