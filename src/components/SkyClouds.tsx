// One group is GROUP_W px wide - about the width of the panel, so the track stays small next
// to the hero's WebGL context (see .sky-clouds-track). CSS widens a group to the viewport if
// that is wider, which only ever adds clear sky on the right; the puffs below are laid out in
// the first GROUP_W px. Every soft shape sits fully inside that span (its gradient is
// transparent at its own edge), so nothing is clipped at the group boundary.
const GROUP_W = 440;

// Centre x, centre y (px in the 520px panel), width, height, peak opacity.
const PUFFS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [140, 108, 260, 100, 0.2],
  [330, 150, 210, 86, 0.14],
  [232, 232, 200, 78, 0.1],
];

function Group() {
  return (
    <div className="sky-clouds-group" style={{ width: GROUP_W }}>
      {PUFFS.map(([cx, cy, w, h, o], i) => (
        <div
          key={i}
          className="sky-puff"
          style={{ left: cx - w / 2, top: cy - h / 2, width: w, height: h, opacity: o }}
        />
      ))}
    </div>
  );
}

/**
 * Afternoon clouds: a few large soft shapes drifting very slowly. The group is rendered
 * twice end to end and the track moves exactly one group width (50% of the track), so the
 * loop has no seam. Transform only.
 *
 * While inactive the layer stays mounted and is paused rather than unmounted: a traverse is
 * resumed where it stopped instead of snapping back to the start, which would move the whole
 * track by up to a group width in one frame.
 */
export default function SkyClouds({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={active ? undefined : "sky-paused"}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <div className="sky-clouds-track">
        <Group />
        <Group />
      </div>
    </div>
  );
}
