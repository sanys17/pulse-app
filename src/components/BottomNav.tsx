import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { House, CalendarBlank, UsersThree, GearSix, Plus, Target, ListChecks, CheckCircle } from "@phosphor-icons/react";

const leftTabs = [
  { to: "/", label: "Home", Icon: House },
  { to: "/calendar", label: "Calendar", Icon: CalendarBlank },
] as const;

const rightTabs = [
  { to: "/social", label: "Social", Icon: UsersThree },
  { to: "/settings", label: "Settings", Icon: GearSix },
] as const;

interface BottomNavProps {
  onAddHabit?: () => void;
  onQuickLog?: () => void;
}

export function BottomNav({ onAddHabit, onQuickLog }: BottomNavProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const actions = [
    {
      label: "Add Habit",
      Icon: Target,
      action: () => {
        setOpen(false);
        if (onAddHabit) onAddHabit();
        else navigate("/habits");
      },
    },
    {
      label: "Add Task",
      Icon: ListChecks,
      action: () => {
        setOpen(false);
        navigate("/tasks");
      },
    },
    {
      label: "Quick Log",
      Icon: CheckCircle,
      action: () => {
        setOpen(false);
        if (onQuickLog) onQuickLog();
        else navigate("/");
      },
    },
  ];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 49,
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            transition: "opacity 200ms ease",
          }}
        />
      )}

      {/* Fan menu */}
      {open && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            bottom: 90,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            zIndex: 51,
          }}
        >
          {actions.map((item, i) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 20px 10px 14px",
                background: "#1c1c1e",
                borderRadius: 20,
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                animation: `fabIn 250ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 60}ms both`,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <item.Icon size={20} weight="regular" color="#fff" />
              </div>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Nav bar */}
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
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Quick actions"}
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
            transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          <Plus size={26} weight="bold" color="#1c1c1e" />
        </button>

        {rightTabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
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

      <style>{`
        @keyframes fabIn {
          from { opacity: 0; transform: translateY(16px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
