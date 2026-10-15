// TODO: re-measure when the real sky assets land. These are provisional anchors chosen
// against the old mountain placeholders; the contract is image first (measure the sun
// from the delivered photograph, then pass it in).
export const PROVISIONAL_SUN = {
  morning: { x: 0.7, y: 0.17 },
  afternoon: { x: 0.62, y: 0.13 },
} as const;

/**
 * Daylight: a breathing glow and beams that grow out of the sun and dissolve.
 * Pure CSS (opacity/transform only). Renders nothing, so nothing animates, while inactive.
 * Fills its positioned parent; sunX/sunY are normalized 0-1 positions on the photograph.
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
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
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
