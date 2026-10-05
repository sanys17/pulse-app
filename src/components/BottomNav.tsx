import { NavLink, useNavigate } from "react-router-dom";
import { House, CalendarBlank, Target, GearSix, Plus } from "@phosphor-icons/react";

const leftTabs = [
  { to: "/", label: "Home", Icon: House },
  { to: "/calendar", label: "Calendar", Icon: CalendarBlank },
] as const;

const rightTabs = [
  { to: "/habits", label: "Habits", Icon: Target },
  { to: "/settings", label: "Settings", Icon: GearSix },
] as const;

export function BottomNav() {
  const navigate = useNavigate();

  return (
    <nav
      role="tablist"
      aria-label="Main navigation"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 32px)",
        maxWidth: 398,
        background: "#1c1c1e",
        borderRadius: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        zIndex: 50,
        height: 56,
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      }}
    >
      {leftTabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          role="tab"
          aria-label={label}
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            textDecoration: "none",
            color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
            transition: "color 200ms ease",
            borderRadius: 16,
          })}
        >
          {({ isActive }) => (
            <Icon size={24} weight={isActive ? "fill" : "regular"} aria-hidden="true" />
          )}
        </NavLink>
      ))}

      {/* Center FAB */}
      <button
        onClick={() => navigate("/habits")}
        aria-label="Add habit"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "none",
          background: "#BE6E46",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          marginTop: -20,
          boxShadow: "0 4px 12px rgba(190,110,70,0.4)",
          transition: "transform 150ms ease",
        }}
      >
        <Plus size={26} weight="bold" color="#1c1c1e" />
      </button>

      {rightTabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          role="tab"
          aria-label={label}
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            textDecoration: "none",
            color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
            transition: "color 200ms ease",
            borderRadius: 16,
          })}
        >
          {({ isActive }) => (
            <Icon size={24} weight={isActive ? "fill" : "regular"} aria-hidden="true" />
          )}
        </NavLink>
      ))}
    </nav>
  );
}
