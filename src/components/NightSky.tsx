import { useEffect, useId, useState, type CSSProperties } from "react";
import { STARS } from "../data/stars";
import { projectStars, rareNight, type ProjectedStar, type RareNight } from "../lib/sky";
import { rareCandidates } from "../lib/skyBodies";
import type { Observer } from "../lib/observer";
import { reportError } from "../lib/monitoring";

const RECOMPUTE_MS = 5 * 60 * 1000;
const GROUP_CLASSES = ["sky-twinkle-a", "sky-twinkle-b", "sky-twinkle-c"] as const;

// Every <svg> below is the same size, at the same origin, with the same viewBox, so the three
// star groups and the rare body all share one coordinate space: a projected (x, y) means the
// same point in all of them.
const LAYER: CSSProperties = { position: "absolute", left: 0, top: 0, display: "block" };

type SkyState = { stars: ProjectedStar[]; rare: RareNight };

function compute(observer: Observer, width: number, height: number): SkyState {
  // One instant for everything: candidates and the rare-night verdict must agree on it,
  // and candidates are re-sampled on every recompute (never cached across ticks).
  const now = new Date();
  const stars = projectStars(STARS, observer, now, width, height);
  // rareNight keys its verdict to the local night internally; do not add a cache here.
  // A null here is not "tonight is not rare": the body may simply be off the panel at
  // this instant. Nothing is cached as a negative; every tick asks again.
  let rare: RareNight = null;
  try {
    rare = rareNight(rareCandidates(now, observer), observer, now, width, height);
  } catch (err) {
    // Decorative: stars stay drawn and the rare body is skipped, but the failure is reported.
    reportError(err, { area: "night-sky", target: "rareNight" });
    rare = null;
  }
  return { stars, rare };
}

/**
 * Night sky: real star positions for the observer, grouped twinkle, optional rare body.
 *
 * The twinkle is three cycles, never per-star, and each cycle animates one HTML box holding
 * its own <svg> rather than an SVG <g>: WebKit layer-backs the box, so a cycle is a composited
 * opacity change instead of a repaint of ~120 circles over the hero's WebGL context. That
 * grouping is a performance requirement, not a stylistic one.
 *
 * While inactive the CSS animations are paused rather than unmounted (so a resume continues
 * mid-cycle), but the 5-minute recompute below is skipped entirely - that is the real battery
 * saving.
 */
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
  const gradientId = `sky-band-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

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
    <div
      aria-hidden="true"
      className={active ? undefined : "sky-paused"}
      style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none" }}
    >
      {/* Stars are assigned to a group by index, never by brightness: a cycle must not be able
          to dim a recognisable part of the sky as a unit. */}
      {groups.map((group, g) => (
        <div key={g} className={`sky-stars-group ${GROUP_CLASSES[g]}`}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={LAYER}>
            {group.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.opacity} />
            ))}
          </svg>
        </div>
      ))}
      {/* The rare body never twinkles, so it sits in its own un-animated layer, above the
          stars exactly as it was when it was the last child of a single <svg>. */}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={LAYER}>
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor="#c9d3ff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#c9d3ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {rare?.kind === "galaxy" && (
          <g transform={`translate(${rare.x} ${rare.y}) rotate(${rare.angle})`}>
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
    </div>
  );
}
