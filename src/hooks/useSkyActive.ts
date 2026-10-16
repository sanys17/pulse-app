import { useEffect, useState } from "react";

/**
 * Whether the sky layers should animate.
 *
 * False while the document is hidden, so the breathing glow, the beams, the cloud drift and
 * the star twinkle all stop when nobody can see them (the battery rule in the sky design doc).
 * The hero panel is `position: fixed` and effectively never leaves the viewport, so the
 * hidden-document case is the only one worth handling; an IntersectionObserver would add a
 * second source of truth for no gain.
 */
export function useSkyActive(): boolean {
  const [active, setActive] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden"
  );

  useEffect(() => {
    const sync = () => setActive(document.visibilityState !== "hidden");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return active;
}
