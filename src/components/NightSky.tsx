import { useEffect, useId, useState } from "react";
import { STARS } from "../data/stars";
import { projectStars, rareNight, type ProjectedStar, type RareNight } from "../lib/sky";
import { rareCandidates } from "../lib/skyBodies";
import type { Observer } from "../lib/observer";

const RECOMPUTE_MS = 5 * 60 * 1000;
const GROUP_CLASSES = ["sky-twinkle-a", "sky-twinkle-b", "sky-twinkle-c"] as const;

type SkyState = { stars: ProjectedStar[]; rare: RareNight };

function compute(observer: Observer, width: number, height: number): SkyState {
  // One instant for everything: candidates and the rare-night verdict must agree on it,
  // and candidates are re-sampled on every recompute (never cached across ticks).
  const now = new Date();
  const stars = projectStars(STARS, observer, now, width, height);
  // A null here is not "tonight is not rare": the body may simply be off the panel at
  // this instant. Nothing is cached as a negative; every tick asks again.
  let rare: RareNight = null;
  try {
    rare = rareNight(rareCandidates(now, observer), observer, now, width, height);
  } catch {
    rare = null; // decorative; a failure in the rare night must not take the stars down
  }
  return { stars, rare };
}

/** Night sky: real star positions for the observer, grouped twinkle, optional rare body. */
export default function NightSky({
  observer,
  width,
  height,
  active,
}: {
  observer: Observer;
  width: number;
  height: number;
  active: boolean;
}) {
  const [sky, setSky] = useState<SkyState>({ stars: [], rare: null });
  const gradientId = useId();

  useEffect(() => {
    if (!active) return;
    setSky(compute(observer, width, height));
    const timer = setInterval(() => setSky(compute(observer, width, height)), RECOMPUTE_MS);
    return () => clearInterval(timer);
  }, [active, observer.latitude, observer.longitude, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups: ProjectedStar[][] = [[], [], []];
  sky.stars.forEach((star, i) => groups[i % 3].push(star));
  const { rare } = sky;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none" }}
    >
      {groups.map((group, g) => (
        <g key={g} className={GROUP_CLASSES[g]}>
          {group.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.opacity} />
          ))}
        </g>
      ))}
      {rare?.kind === "galaxy" && (
        <g transform={`translate(${rare.x} ${rare.y}) rotate(${rare.angle})`}>
          <defs>
            <radialGradient id={gradientId}>
              <stop offset="0%" stopColor="#c9d3ff" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#c9d3ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse rx={rare.length / 2} ry={Math.min(48, rare.length / 6)} fill={`url(#${gradientId})`} />
        </g>
      )}
      {rare?.kind === "planet" && (
        <g>
          <circle cx={rare.x} cy={rare.y} r={rare.r * 3} fill={rare.colour} opacity="0.18" />
          <circle cx={rare.x} cy={rare.y} r={rare.r} fill={rare.colour} />
        </g>
      )}
    </svg>
  );
}
