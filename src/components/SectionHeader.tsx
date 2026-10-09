interface SectionHeaderProps {
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void };
}

export function SectionHeader({ title, count, action }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 44,
      }}
    >
      <h2
        style={{
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          color: "var(--color-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
        {count !== undefined && count > 0 ? ` · ${count}` : ""}
      </h2>
      {action && (
        <button
          className="press"
          onClick={action.onClick}
          style={{
            minHeight: 44,
            padding: "0 var(--space-1)",
            background: "transparent",
            border: "none",
            color: "var(--color-accent)",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
