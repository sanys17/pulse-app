import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  House,
  CalendarBlank,
  UsersThree,
  User,
  Plus,
  Target,
  ListChecks,
  CheckCircle,
} from "@phosphor-icons/react";

const leftTabs = [
  { to: "/", label: "Home", Icon: House },
  { to: "/calendar", label: "Calendar", Icon: CalendarBlank },
] as const;

const rightTabs = [
  { to: "/social", label: "Social", Icon: UsersThree },
  { to: "/settings", label: "Profile", Icon: User },
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
                background: "rgba(142,155,196,0.15)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderRadius: 20,
                border: "1px solid rgba(142,155,196,0.08)",
                cursor: "pointer",
                color: "#EAECF4",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
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

      {/* Glass nav — exact Figma: 288×47, rgba(142,155,196,0.15), rounded-100 */}
      <nav
        role="tablist"
        aria-label="Main navigation"
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          width: 288,
          height: 47,
          background: "rgba(142,155,196,0.15)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-evenly",
          zIndex: 50,
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
              width: 34,
              height: 18,
              textDecoration: "none",
              color: isActive ? "#EAECF4" : "rgba(234,236,244,0.4)",
              transition: "color 200ms ease",
            })}
          >
            {({ isActive }) => (
              <Icon size={18} weight={isActive ? "fill" : "regular"} aria-hidden="true" />
            )}
          </NavLink>
        ))}

        {/* FAB — 38×38, #8E9BC4 */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Quick actions"}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            border: "none",
            background: "#8E9BC4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(142,155,196,0.35)",
            transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          <Plus size={20} weight="bold" color="#07070C" />
        </button>

        {rightTabs.map(({ to, label, Icon }) => {
          const isProfile = to === "/settings";
          return (
            <NavLink
              key={to}
              to={to}
              role="tab"
              aria-label={label}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                transition: "color 200ms ease",
                color: isActive ? "#EAECF4" : "rgba(234,236,244,0.4)",
                ...(isProfile
                  ? {
                      width: 20,
                      height: 20,
                      borderRadius: 100,
                      border: "1px solid #8e9bc4",
                      overflow: "hidden",
                    }
                  : {
                      width: 26,
                      height: 18,
                    }),
              })}
            >
              {({ isActive }) => (
                <Icon
                  size={isProfile ? 12 : 18}
                  weight={isActive ? "fill" : "regular"}
                  aria-hidden="true"
                />
              )}
            </NavLink>
          );
        })}
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
