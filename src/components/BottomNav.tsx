import { NavLink } from "react-router-dom";
import { House, Target, ListChecks, GearSix } from "@phosphor-icons/react";

const tabs = [
  { to: "/", label: "Home", Icon: House },
  { to: "/habits", label: "Habits", Icon: Target },
  { to: "/tasks", label: "Tasks", Icon: ListChecks },
  { to: "/settings", label: "Settings", Icon: GearSix },
] as const;

export function BottomNav() {
  return (
    <nav
      role="tablist"
      aria-label="Main navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 430,
        background: "var(--color-nav-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--color-border)",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        zIndex: 50,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          role="tab"
          aria-label={label}
          style={({ isActive }) => ({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "8px 0 6px",
            textDecoration: "none",
            color: isActive
              ? "var(--color-nav-active)"
              : "var(--color-nav-inactive)",
            transition: "color 200ms ease",
            minHeight: 44,
            justifyContent: "center",
          })}
        >
          {({ isActive }) => (
            <>
              <Icon
                size={24}
                weight={isActive ? "fill" : "regular"}
                aria-hidden="true"
              />
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: "0.02em",
                }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
