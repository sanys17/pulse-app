import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  House,
  CalendarBlank,
  UsersThree,
  Plus,
  Target,
  ListChecks,
  CheckCircle,
} from "@phosphor-icons/react";

const navTabs = [
  { to: "/calendar", label: "Calendar", Icon: CalendarBlank },
  { to: "/", label: "Home", Icon: House },
  { to: "/social", label: "Social", Icon: UsersThree },
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
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 49,
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        />
      )}

      {open && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            bottom: 80,
            right: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
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
                background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.12) 0%, transparent 50%), rgba(98,104,128,0.20)",
                backdropFilter: "blur(4px) saturate(120%)",
                WebkitBackdropFilter: "blur(4px) saturate(120%)",
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.10)",
                cursor: "pointer",
                color: "#EAECF4",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                boxShadow: "inset 1px 1px 3px 0 rgba(255,255,255,0.10), 0 4px 16px rgba(0,0,0,0.3)",
                animation: `fabIn 250ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 60}ms both`,
              }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <item.Icon size={20} weight="regular" color="#EAECF4" />
              </div>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Glass nav — Figma: 186×46, rgba(98,104,128,0.2), rounded-[23px] */}
      <nav
        role="tablist"
        aria-label="Main navigation"
        style={{
          position: "fixed",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          width: 186,
          height: 46,
          background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.12) 0%, transparent 50%), rgba(98,104,128,0.20)",
          backdropFilter: "blur(4px) saturate(120%)",
          WebkitBackdropFilter: "blur(4px) saturate(120%)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "inset 1px 1px 3px 0 rgba(255,255,255,0.10)",
          borderRadius: 23,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-evenly",
          zIndex: 50,
        }}
      >
        {navTabs.map(({ to, label, Icon }) => (
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
              width: isActive ? 42 : 30,
              height: isActive ? 44 : 30,
              borderRadius: isActive ? 13 : 0,
              background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
              textDecoration: "none",
              color: isActive ? "#EAECF4" : "rgba(234,236,244,0.4)",
              transition: "all 200ms ease",
            })}
          >
            {({ isActive }) => (
              <Icon size={22} weight={isActive ? "fill" : "regular"} aria-hidden="true" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* FAB — Figma: separate, bottom-right, 44×44 circle, rgba(142,155,196,0.34) */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Quick actions"}
        style={{
          position: "fixed",
          bottom: 21,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.12) 0%, transparent 50%), rgba(98,104,128,0.20)",
          backdropFilter: "blur(4px) saturate(120%)",
          WebkitBackdropFilter: "blur(4px) saturate(120%)",
          boxShadow: "inset 1px 1px 3px 0 rgba(255,255,255,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 50,
          transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          transform: open ? "rotate(45deg)" : "rotate(0deg)",
        }}
      >
        <Plus size={20} weight="bold" color="#EAECF4" />
      </button>

      <style>{`
        @keyframes fabIn {
          from { opacity: 0; transform: translateY(16px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
