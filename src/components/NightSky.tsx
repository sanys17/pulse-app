import { useEffect, useId, useState, type CSSProperties } from "react";
import { STARS } from "../data/stars";
import { projectStars, rareNight, type ProjectedStar, type RareNight } from "../lib/sky";
import { rareCandidates } from "../lib/skyBodies";
import type { Observer } from "../lib/observer";
import { reportError } from "../lib/monitoring";

const RECOMPUTE_MS = 5 * 60 * 1000;

// Fetched only on a galaxy night — roughly seven times a year — so its weight never touches
// an ordinary load. 2048px wide against a band that spans ~978 CSS px: adequate for a diffuse
// texture at reduced opacity, and the file is the one asset where softness is forgiving.
const GALAXY_SRC = "/assets/galaxy.webp";
const GALAXY_ASPECT = 2912 / 1440;
const BAND_FADE = "linear-gradient(to right, transparent 0%, #000 17%, #000 83%, transparent 100%)";
const GROUP_CLASSES = ["sky-twinkle-a", "sky-twinkle-b", "sky-twinkle-c"] as const;

// Every <svg> below is the same size, at the same origin, with the same viewBox, so the three
// star groups and the rare body all share one coordinate space: a projected (x, y) means the
// same point in all of them.
const LAYER: CSSProperties = { position: "absolute", left: 0, top: 0, display: "block" };

type SkyState = { stars: ProjectedStar[]; rare: RareNight };

/**
 * Dev-only: ?rare=galaxy|planet|any previews a rare night without waiting months for one.
 *
 * It does NOT fake the geometry. It scans forward from today for the next night that genuinely
 * qualifies, then returns that night's instant so the whole sky — stars included — is rendered
 * for it. What you see is a real rare night from this observer's own sky, just not tonight.
 * Returns null if none is found within a year, or outside dev.
 */
function forcedRareInstant(observer: Observer, width: number, height: number): Date | null {
  if (!import.meta.env.DEV) return null;
  const want = new URLSearchParams(window.location.search).get("rare");
  if (want !== "galaxy" && want !== "planet" && want !== "any") return null;
  const start = new Date();
  for (let i = 0; i < 400; i++) {
    const at = new Date(start);
    at.setDate(start.getDate() + i);
    at.setHours(22, 0, 0, 0);
    try {
      const hit = rareNight(rareCandidates(at, observer), observer, at, width, height);
      if (hit && (want === "any" || hit.kind === want)) {
        console.info(`[sky] previewing a real ${hit.kind} night: ${at.toDateString()}`);
        return at;
      }
    } catch {
      // Scanning is best-effort; a bad day just moves to the next.
    }
  }
  console.warn(`[sky] no ${want} night found within 400 days from here`);
  return null;
}

function compute(observer: Observer, width: number, height: number): SkyState {
  // One instant for everything: candidates and the rare-night verdict must agree on it,
  // and candidates are re-sampled on every recompute (never cached across ticks).
  const now = forcedRareInstant(observer, width, height) ?? new Date();
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
  const starId = `sky-star-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    if (!active) return;
    setSky(compute(observer, width, height));
    const timer = setInterval(() => setSky(compute(observer, width, height)), RECOMPUTE_MS);
    return () => clearInterval(timer);
  }, [active, observer.latitude, observer.longitude, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups: ProjectedStar[][] = [[], [], []];
  sky.stars.forEach((star, i) => groups[i % 3].push(star));
  const { rare } = sky;

  // The computed span is the plane's reach, which can be shorter than the panel (209px on a
  // 430x520 panel is typical). A band that ends inside the frame reads as an oval sitting in
  // the sky, so always draw it long enough to leave through both edges.
  const band =
    rare?.kind === "galaxy"
      ? { span: Math.max(rare.length, Math.hypot(width, height) * 1.45) }
      : null;

  return (
    <div
      aria-hidden="true"
      className={active ? undefined : "sky-paused"}
      style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none" }}
    >
      {/* One shared star profile, referenced by every circle in every group. A real star is a
          bright core inside a soft scattered halo — a hard-edged disc is what makes a star
          field read as dots. objectBoundingBox units mean this one gradient scales itself to
          each star's radius, so brighter stars bloom proportionally more. */}
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <radialGradient id={starId}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="33%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="48%" stopColor="#dce6ff" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#c9d3ff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#c9d3ff" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      {/* Stars are assigned to a group by index, never by brightness: a cycle must not be able
          to dim a recognisable part of the sky as a unit. */}
      {groups.map((group, g) => (
        <div key={g} className={`sky-stars-group ${GROUP_CLASSES[g]}`}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={LAYER}>
            {group.map((s, i) => (
              // r * 3 so the solid core (the gradient's first 33%) stays exactly the old disc
              // size and the halo is added around it, rather than the star shrinking.
              <circle key={i} cx={s.x} cy={s.y} r={s.r * 3} fill={`url(#${starId})`} opacity={s.opacity} />
            ))}
          </svg>
        </div>
      ))}
      {/* The Milky Way is a photograph, not drawn geometry. It is unresolved starlight with
          fractal clumping and dust lanes; every attempt to build that from gradients and
          ellipses read as a painted shape, because that is what it was. The astronomy stays
          computed — position, angle and span all come from sky.ts — and only the texture
          comes from the image.
          The source is shot on pure black (corners measure 0), so `screen` drops the
          rectangle entirely and leaves just the band. The mask fades both ends so it leaves
          the frame rather than stopping at a visible cut. */}
      {rare?.kind === "galaxy" && band && (
        <img
          src={GALAXY_SRC}
          alt=""
          aria-hidden="true"
          onError={() => reportError(new Error("galaxy image failed to load"), { area: "night-sky", target: "galaxy" })}
          style={{
            position: "absolute",
            left: rare.x,
            top: rare.y,
            width: band.span,
            height: band.span / GALAXY_ASPECT,
            // Tailwind preflight sets `img { max-width: 100% }`, which would clamp the band to
            // the panel's width while the explicit height stayed — squashing it to roughly a
            // 2.3x vertical stretch. The band is meant to overflow the panel on both sides.
            maxWidth: "none",
            transform: `translate(-50%, -50%) rotate(${rare.angle}deg)`,
            mixBlendMode: "screen",
            // The source band peaks at luminance 251 against a sky sitting at 5-29, so it
            // needs holding well back. This is the one knob: raise toward 1 for a brighter
            // Milky Way, lower for a fainter one.
            opacity: 0.4,
            pointerEvents: "none",
            maskImage: BAND_FADE,
            WebkitMaskImage: BAND_FADE,
          }}
        />
      )}
      {/* The rare body never twinkles, so it sits in its own un-animated layer, above the
          stars exactly as it was when it was the last child of a single <svg>. */}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={LAYER}>
        {rare?.kind === "planet" && (
          <g>
            {/* A planet shows a disc and does not twinkle; a star is a point that does. So it
                needs a solid, saturated core clearly larger than any star's, inside its own
                coloured bloom — the stars' halos are white and faint by comparison. */}
            <circle cx={rare.x} cy={rare.y} r={rare.r * 5} fill={rare.colour} opacity="0.1" />
            <circle cx={rare.x} cy={rare.y} r={rare.r * 2.4} fill={rare.colour} opacity="0.3" />
            <circle cx={rare.x} cy={rare.y} r={rare.r * 1.5} fill={rare.colour} />
            <circle cx={rare.x} cy={rare.y} r={rare.r * 0.7} fill="#ffffff" opacity="0.85" />
          </g>
        )}
      </svg>
    </div>
  );
}
