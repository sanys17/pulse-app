export function ErrorFallback() {
  return (
    <div
      role="alert"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-3)",
        padding: "var(--space-6)",
        textAlign: "center",
        background: "var(--color-canvas)",
        color: "var(--color-text)",
      }}
    >
      <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 15, color: "var(--color-text-tertiary)", maxWidth: 320 }}>
        We've been notified. Reloading usually fixes it.
      </p>
      <button
        className="press"
        onClick={() => window.location.reload()}
        style={{
          height: 48,
          padding: "0 var(--space-6)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-accent)",
          border: "none",
          color: "#07070C",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Reload
      </button>
    </div>
  );
}
