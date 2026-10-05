import { UsersThree } from "@phosphor-icons/react";

export function Social() {
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
        gap: "var(--space-4)",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <UsersThree size={28} weight="regular" color="var(--color-text-secondary)" />
      </div>
      <div>
        <h1
          style={{
            fontSize: "var(--text-xl)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Social
        </h1>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            marginTop: "var(--space-2)",
          }}
        >
          Coming soon
        </p>
      </div>
    </div>
  );
}
