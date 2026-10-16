// Normalized 0-1 positions of the sun ON THE PHOTOGRAPH (not the panel) — Home's
// imagePointToPanel() maps these through the object-fit: cover crop.
//
// Both are now MEASURED from the delivered art (brightest point of the solar disc), which is
// the contract: image first, then measure. Re-measure either one if its photograph is
// replaced — a sun anchor that no longer matches its sky puts the beams in the wrong place,
// and nothing will fail loudly if it does.
//   morning:   public/assets/morning_sky.webp
//   afternoon: public/assets/afternoon_sky.webp
export const PROVISIONAL_SUN = {
  morning: { x: 0.744, y: 0.28 },
  afternoon: { x: 0.698, y: 0.305 },
} as const;

/**
 * Daylight: a breathing glow and beams that grow out of the sun and dissolve.
 * Pure CSS (opacity/transform only). Fills its positioned parent; sunX/sunY are normalized
 * 0-1 positions on the photograph.
 *
 * While inactive the layer stays mounted and is paused rather than unmounted, so the glow and
 * the beams resume mid-cycle instead of every cycle restarting together on an app resume.
 */
export default function SkyLight({
  phase,
  sunX,
  sunY,
  active,
}: {
  phase: "morning" | "afternoon";
  sunX: number;
  sunY: number;
  active: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={active ? undefined : "sky-paused"}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <div
        className={`sky-sun sky-${phase}`}
        style={{ left: `${sunX * 100}%`, top: `${sunY * 100}%` }}
      >
        <div className="sky-glow" />
        <div className="sky-beam sky-beam-a" />
        <div className="sky-beam sky-beam-b" />
        {phase === "afternoon" && <div className="sky-beam sky-beam-c" />}
      </div>
    </div>
  );
}
