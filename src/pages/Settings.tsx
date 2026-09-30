import { Moon, Sun, Monitor } from "@phosphor-icons/react";
import type { Theme } from "../types";

interface SettingsProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function Settings({ theme, onThemeChange }: SettingsProps) {
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

      <section>
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
          Appearance
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--space-2)",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            padding: "var(--space-1)",
          }}
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => onThemeChange(value)}
              aria-pressed={theme === value}
              style={{
                height: 44,
                borderRadius: "var(--radius-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                fontWeight: theme === value ? 600 : 400,
                fontSize: "var(--text-sm)",
                background:
                  theme === value
                    ? "var(--color-surface-dim)"
                    : "transparent",
                transition: "all 150ms ease",
                cursor: "pointer",
              }}
            >
              <Icon size={16} weight={theme === value ? "fill" : "regular"} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section
        style={{
          padding: "var(--space-4)",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
        }}
      >
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
      </section>
    </div>
  );
}
