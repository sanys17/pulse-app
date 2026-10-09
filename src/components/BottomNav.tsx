import { useCallback, useEffect, useRef, useState } from "react";
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
  onAddTask?: () => void;
  onQuickLog?: () => void;
  pendingRequests?: number;
}

const ITEM_HEIGHT = 56;
const ITEM_GAP = 12;
const STAGGER_MS = 45;
// Longest exit (200ms) plus the stagger, so the menu stays mounted until the last item has folded away.
const UNMOUNT_AFTER_MS = 200 + STAGGER_MS * 2 + 60;

export function BottomNav({ onAddHabit, onAddTask, onQuickLog, pendingRequests = 0 }: BottomNavProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); // what the user asked for
  const [mounted, setMounted] = useState(false); // stays true while the exit animation plays
  const [hovered, setHovered] = useState<number | null>(null); // item under the finger while sliding
  const fabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const unmountTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gesture = useRef<{ x: number; y: number; wasOpen: boolean; sliding: boolean } | null>(null);

  const openMenu = useCallback(() => {
    clearTimeout(unmountTimer.current);
    setMounted(true);
    setOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setHovered(null);
    clearTimeout(unmountTimer.current);
    unmountTimer.current = setTimeout(() => setMounted(false), UNMOUNT_AFTER_MS);
  }, []);

  useEffect(() => () => clearTimeout(unmountTimer.current), []);

  // Any press outside the menu closes it; Escape closes it and returns focus to the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        fabRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeMenu]);

  const actions = [
    {
      label: "Add Habit",
      Icon: Target,
      run: () => (onAddHabit ? onAddHabit() : navigate("/habits")),
    },
    {
      label: "Add Task",
      Icon: ListChecks,
      run: () => (onAddTask ? onAddTask() : navigate("/tasks")),
    },
    {
      label: "Quick Log",
      Icon: CheckCircle,
      run: () => (onQuickLog ? onQuickLog() : navigate("/")),
    },
  ];

  const choose = (index: number) => {
    closeMenu();
    actions[index].run();
  };

  // Press the plus and slide onto an item, or just tap. The menu opens on press (not release).
  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { x: e.clientX, y: e.clientY, wasOpen: open, sliding: false };
    if (!open) openMenu();
  };

  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.sliding && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) g.sliding = true;
    if (!g.sliding) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-menu-index]");
    setHovered(target ? Number(target.dataset.menuIndex) : null);
  };

  const onFabPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.sliding) {
      if (hovered !== null) choose(hovered);
      else closeMenu();
      return;
    }
    if (g.wasOpen) closeMenu(); // a second tap on the plus closes it
  };

  const onFabPointerCancel = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.sliding) closeMenu();
  };

  // Keyboard and screen-reader activation (pointer clicks are handled above; they report detail >= 1).
  const onFabClick = (e: React.MouseEvent) => {
    if (e.detail !== 0) return;
    if (open) {
      closeMenu();
    } else {
      openMenu();
      setTimeout(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 0);
    }
  };

  return (
    <>
      {/* Soft fade where content scrolls under the floating controls (instead of a hard edge) */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: "calc(var(--nav-bottom) + 76px)",
          pointerEvents: "none",
          zIndex: 40,
          background: "linear-gradient(to top, rgba(7, 7, 12, 0.85), rgba(7, 7, 12, 0))",
        }}
      />

      {mounted && (
        <div
          aria-hidden="true"
          className={`scrim ${open ? "in" : "out"}`}
          style={{ position: "fixed", inset: 0, zIndex: 49, pointerEvents: open ? "auto" : "none" }}
        />
      )}

      {mounted && (
        <div
          ref={menuRef}
          id="quick-actions"
          role="menu"
          aria-label="Quick actions"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            bottom: "calc(var(--nav-bottom) + 60px)",
            right: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: ITEM_GAP,
            zIndex: 51,
            // While folding away, taps go to the page underneath.
            pointerEvents: open ? "auto" : "none",
          }}
        >
          {actions.map((item, i) => {
            const fromFab = actions.length - 1 - i; // 0 = nearest the plus button
            // Opens nearest-first, folds back farthest-first: the mirror of the way in.
            const delay = open ? fromFab * STAGGER_MS : (actions.length - 1 - fromFab) * STAGGER_MS;
            const isHovered = hovered === i;
            return (
              <button
                key={item.label}
                role="menuitem"
                data-menu-index={i}
                onClick={() => choose(i)}
                className={`glass menu-item press ${open ? "in" : "out"}`}
                style={
                  {
                    "--d": `${(fromFab + 1) * (ITEM_HEIGHT + ITEM_GAP)}px`,
                    "--delay": `${delay}ms`,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    minHeight: ITEM_HEIGHT,
                    padding: "10px 20px 10px 14px",
                    borderRadius: 28,
                    cursor: "pointer",
                    color: "#EAECF4",
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    filter: isHovered ? "brightness(1.35)" : undefined,
                    transform: isHovered ? "scale(1.04)" : undefined,
                    transition: "filter 120ms ease-out, transform 120ms ease-out",
                  } as React.CSSProperties
                }
              >
                <span
                  aria-hidden="true"
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
                  <item.Icon size={20} weight="regular" color="#EAECF4" />
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      <nav
        aria-label="Main navigation"
        className="glass"
        style={{
          position: "fixed",
          bottom: "var(--nav-bottom)",
          left: "50%",
          transform: "translateX(-50%)",
          width: 196,
          height: 50,
          borderRadius: 25,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "0 6px",
          zIndex: 50,
        }}
      >
        {navTabs.map(({ to, label, Icon }) => {
          const badge = to === "/social" ? pendingRequests : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className="press"
              aria-label={badge > 0 ? `${label}, ${badge} pending ${badge === 1 ? "request" : "requests"}` : label}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 14,
                background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                textDecoration: "none",
                color: isActive ? "#EAECF4" : "rgba(234,236,244,0.4)",
                transition: "color 200ms ease, background 200ms ease, transform 120ms ease-out",
              })}
            >
              {({ isActive }) => (
                <div style={{ position: "relative" }}>
                  <Icon size={24} weight={isActive ? "fill" : "regular"} aria-hidden="true" />
                  {badge > 0 && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -8,
                        minWidth: 18,
                        height: 18,
                        padding: "0 4px",
                        borderRadius: 9,
                        background: "var(--color-danger)",
                        border: "2px solid rgba(20, 20, 30, 0.9)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        lineHeight: 1,
                        boxSizing: "content-box",
                      }}
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>

      <button
        ref={fabRef}
        aria-label={open ? "Close quick actions" : "Quick actions"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="quick-actions"
        className="glass press"
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        onPointerCancel={onFabPointerCancel}
        onClick={onFabClick}
        style={{
          position: "fixed",
          bottom: "calc(var(--nav-bottom) + 1px)",
          right: 16,
          width: 44,
          height: 44,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 50,
          padding: 0,
          touchAction: "none",
        }}
      >
        <span className="fab-icon" style={{ display: "flex", transform: open ? "rotate(45deg)" : "rotate(0deg)" }}>
          <Plus size={20} weight="bold" color="#EAECF4" aria-hidden="true" />
        </span>
      </button>
    </>
  );
}
