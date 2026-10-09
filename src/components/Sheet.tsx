import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { XIcon } from "@phosphor-icons/react";
import { animateSpring, project, rubberband } from "../lib/spring";

interface SheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Sheet({ title, onClose, children, maxHeight = "85dvh" }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const y = useRef(0);
  const height = useRef(0);
  const cancelSpring = useRef<(() => void) | null>(null);
  const closing = useRef(false);
  const drag = useRef<{ offset: number; samples: { t: number; y: number }[] } | null>(null);

  const render = useCallback((value: number) => {
    y.current = value;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (panel) panel.style.transform = `translateY(${value}px)`;
    if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - value / (height.current || 1))));
  }, []);

  const springTo = useCallback(
    (to: number, velocity: number, damping: number, onDone?: () => void) => {
      cancelSpring.current?.();
      cancelSpring.current = animateSpring({
        from: y.current,
        to,
        velocity,
        damping,
        response: 0.35,
        onUpdate: render,
        onDone,
      });
    },
    [render],
  );

  const dismiss = useCallback(
    (velocity = 0) => {
      if (closing.current) return;
      closing.current = true;
      if (prefersReducedMotion()) {
        const panel = panelRef.current;
        if (panel) panel.style.opacity = "0";
        setTimeout(onClose, 150);
        return;
      }
      springTo(height.current, velocity, 1, onClose);
    },
    [onClose, springTo],
  );

  useLayoutEffect(() => {
    height.current = panelRef.current?.offsetHeight ?? 0;
    if (prefersReducedMotion()) {
      render(0);
      return;
    }
    render(height.current);
    springTo(0, 0, 1);
    return () => cancelSpring.current?.();
  }, [render, springTo]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [dismiss]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button") || closing.current) return;
    cancelSpring.current?.(); // grab the sheet mid-flight
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { offset: e.clientY - y.current, samples: [{ t: performance.now(), y: y.current }] };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const raw = e.clientY - d.offset;
    render(raw < 0 ? -rubberband(-raw, height.current) : raw);
    const now = performance.now();
    d.samples.push({ t: now, y: y.current });
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const first = d.samples[0];
    const lastSample = d.samples[d.samples.length - 1];
    const dt = Math.max((lastSample.t - first.t) / 1000, 0.001);
    const velocity = (lastSample.y - first.y) / dt;
    const projected = y.current + project(velocity);
    if (projected > height.current * 0.4) dismiss(velocity);
    else springTo(0, velocity, 0.8);
  };

  const reduced = prefersReducedMotion();

  return (
    <>
      <div
        ref={scrimRef}
        onClick={() => dismiss()}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          zIndex: 60,
          opacity: reduced ? 1 : 0,
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: 430,
          margin: "0 auto",
          maxHeight,
          display: "flex",
          flexDirection: "column",
          zIndex: 61,
          background: "rgba(20, 20, 30, 0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 -8px 24px rgba(0, 0, 0, 0.4)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          transition: reduced ? "opacity 150ms ease" : undefined,
        }}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: "none", cursor: "grab" }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 5,
              borderRadius: 3,
              background: "rgba(255, 255, 255, 0.2)",
              margin: "var(--space-2) auto 0",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-1) var(--space-2) var(--space-1) var(--space-4)",
            }}
          >
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.02em" }}>
              {title}
            </h2>
            <button
              className="press"
              onClick={() => dismiss()}
              aria-label="Close"
              style={{
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "var(--color-surface-dim)",
                  color: "var(--color-text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <XIcon size={16} weight="bold" />
              </span>
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 var(--space-4) var(--space-4)" }}>
          {children}
        </div>
      </div>
    </>
  );
}
