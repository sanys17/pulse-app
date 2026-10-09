interface SpringOptions {
  from: number;
  to: number;
  velocity?: number; // px/s, e.g. the finger's release velocity
  response?: number; // seconds; lower is snappier
  damping?: number; // 1 = no overshoot, ~0.8 = slight bounce
  onUpdate: (value: number) => void;
  onDone?: () => void;
}

// Critically/under-damped spring. Starts from the current value and inherits velocity,
// so it can interrupt and hand off from a drag. Returns a cancel function.
export function animateSpring({
  from,
  to,
  velocity = 0,
  response = 0.35,
  damping = 1,
  onUpdate,
  onDone,
}: SpringOptions): () => void {
  const omega = (2 * Math.PI) / response;
  const stiffness = omega * omega;
  const drag = 2 * damping * omega;
  let x = from;
  let v = velocity;
  let last = performance.now();
  let frame = 0;
  let cancelled = false;

  const step = (now: number) => {
    if (cancelled) return;
    let remaining = Math.min((now - last) / 1000, 0.064);
    last = now;
    const dt = 1 / 240;
    while (remaining > 0) {
      const h = Math.min(dt, remaining);
      v += (-stiffness * (x - to) - drag * v) * h;
      x += v * h;
      remaining -= h;
    }
    if (Math.abs(x - to) < 0.4 && Math.abs(v) < 8) {
      onUpdate(to);
      onDone?.();
      return;
    }
    onUpdate(x);
    frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

// Where a flick at `velocity` (px/s) would come to rest, like scroll deceleration.
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// Resistance that grows the further you pull past an edge.
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
