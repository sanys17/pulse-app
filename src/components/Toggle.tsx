interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

// iOS-style switch with a 44px-tall hit area.
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="press"
      onClick={() => onChange(!checked)}
      style={{
        width: 56,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          width: 51,
          height: 31,
          borderRadius: 9999,
          background: checked ? "var(--color-accent)" : "var(--color-surface-dim)",
          border: `1px solid ${checked ? "transparent" : "var(--color-border)"}`,
          transition: "background 200ms ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: checked ? 21 : 1,
            width: 27,
            height: 27,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
            transition: "left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      </span>
    </button>
  );
}
