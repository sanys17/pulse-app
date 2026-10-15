// One group is GROUP_W px wide. Every soft shape sits fully inside it (its gradient is
// transparent at its own edge), so nothing is clipped at the group boundary.
const GROUP_W = 1200;

// Centre x, centre y (px in the 520px panel), width, height, peak opacity.
const PUFFS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [230, 110, 300, 110, 0.2],
  [420, 140, 240, 90, 0.14],
  [700, 70, 320, 100, 0.16],
  [940, 150, 280, 110, 0.2],
  [1060, 90, 200, 80, 0.12],
  [560, 210, 260, 90, 0.1],
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
 * loop has no seam. Transform only. Renders nothing, so nothing animates, while inactive.
 */
export default function SkyClouds({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <div className="sky-clouds-track" style={{ width: GROUP_W * 2 }}>
        <Group />
        <Group />
      </div>
    </div>
  );
}
