import { useState, useMemo, useRef, useCallback, useLayoutEffect, useEffect, lazy, Suspense, Component } from "react";
import type { ReactNode } from "react";
import { NeuroNoise } from "@paper-design/shaders-react";
import { animateSpring } from "../lib/spring";
import { useNavigate } from "react-router-dom";
import { CaretDown } from "@phosphor-icons/react";
import { skyPhase, nextBoundary, type SkyPhase } from "../lib/timeOfDay";
import { observerFromTimeZone, DEFAULT_OBSERVER, type Observer } from "../lib/observer";
import SkyLight, { PROVISIONAL_SUN } from "../components/SkyLight";
import SkyClouds from "../components/SkyClouds";
import { useSkyActive } from "../hooks/useSkyActive";
import { reportError } from "../lib/monitoring";
import { useCalendarEventsContext } from "../context/CalendarEventsContext";
import { useHabitsContext } from "../context/HabitsContext";
import { useTasksContext } from "../context/TasksContext";
import { useGoogleCalendar, formatRelativeTime } from "../hooks/useGoogleCalendar";
import { HABIT_COLORS } from "../types";
import type { Habit, HabitColor } from "../types";
import type { CalendarEvent as LocalCalendarEvent } from "../hooks/useCalendarEvents";
import { HabitIcon } from "../components/HabitIcon";
import type { Task } from "../hooks/useTasks";

interface HomeProps {
  onEditHabit: (habit: Habit) => void;
}

const EVENT_COLORS = ["#4A90D9", "#E05C5C", "#5CB85C", "#5CB85C", "#D9A04A", "#9B59B6"];

function getEventColor(index: number): string {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

function formatEventTime(dateTimeStr: string): string {
  try {
    const d = new Date(dateTimeStr);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

function formatLocalTime(time: string): string {
  if (!time) return "";
  try {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

function formatLocalRelativeTime(date: string, time: string): string {
  if (!time) return "";
  const eventDate = new Date(`${date}T${time}`);
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < -60) return "";
  if (diffMin < 0) return `${Math.abs(diffMin)} min ago`;
  if (diffMin === 0) return "now";
  if (diffMin < 60) return `in ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (mins === 0) return `in ${hours}h`;
  return `in ${hours}h ${mins}m`;
}

interface NormalizedEvent {
  id: string;
  title: string;
  time: string;
  relativeTime: string;
  sortKey: number;
}

function normalizeGcalEvent(event: { id: string; summary: string; start: { dateTime?: string; date?: string } }): NormalizedEvent {
  const startStr = event.start.dateTime || event.start.date || "";
  const sortKey = startStr ? new Date(startStr).getTime() : 0;
  return {
    id: `gcal-${event.id}`,
    title: event.summary || "No title",
    time: startStr ? formatEventTime(startStr) : "",
    relativeTime: startStr ? formatRelativeTime(startStr) : "",
    sortKey,
  };
}

function normalizeLocalEvent(event: LocalCalendarEvent): NormalizedEvent {
  const sortKey = event.time ? new Date(`${event.date}T${event.time}`).getTime() : 0;
  return {
    id: `local-${event.id}`,
    title: event.title,
    time: formatLocalTime(event.time),
    relativeTime: formatLocalRelativeTime(event.date, event.time),
    sortKey,
  };
}

function makeFakeEvents(): NormalizedEvent[] {
  const now = new Date();
  const t = (h: number, m: number) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const rel = (d: Date) => {
    const diffMin = Math.round((d.getTime() - now.getTime()) / 60000);
    if (diffMin < 0) return `${Math.abs(diffMin)} min ago`;
    if (diffMin === 0) return "now";
    if (diffMin < 60) return `in ${diffMin} min`;
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    if (mins === 0) return `in ${hours}h`;
    return `in ${hours}h ${mins}m`;
  };

  const events = [
    { h: now.getHours(), m: now.getMinutes() + 30, title: "Padel with Michael" },
    { h: 18, m: 30, title: "Dinner with Monika" },
    { h: 9, m: 0, title: "Doctor's at Parkville Ave" },
    { h: 11, m: 30, title: "Meeting with Marc" },
    { h: 13, m: 30, title: "Meeting with Clients" },
    { h: 15, m: 0, title: "Design Review" },
    { h: 17, m: 0, title: "Pick up groceries" },
  ];

  return events.map((e, i) => {
    const d = t(e.h, e.m);
    return {
      id: `fake-${i}`,
      title: e.title,
      time: fmt(d),
      relativeTime: rel(d),
      sortKey: d.getTime(),
    };
  });
}

interface FakeHabit {
  id: string;
  name: string;
  icon: string;
  color: HabitColor;
  completed: boolean;
  streak: number;
}

const FAKE_HABITS: FakeHabit[] = [
  { id: "fh1", name: "Meditate", icon: "YinYang", color: "green", completed: true, streak: 12 },
  { id: "fh2", name: "Read a Book", icon: "BookOpen", color: "blue", completed: false, streak: 10 },
  { id: "fh3", name: "Exercise", icon: "Barbell", color: "red", completed: true, streak: 8 },
  { id: "fh4", name: "Journal", icon: "Pencil", color: "purple", completed: false, streak: 5 },
  { id: "fh5", name: "Drink Water", icon: "Drop", color: "blue", completed: true, streak: 21 },
  { id: "fh6", name: "Walk 10k Steps", icon: "Footprints", color: "orange", completed: false, streak: 3 },
];

const FAKE_TASKS: Task[] = [
  { id: "ft1", label: "Review App Design", done: false },
  { id: "ft2", label: "Call Marc", done: false },
  { id: "ft3", label: "Schedule a Meeting", done: false },
];

interface FakeSupplement {
  id: string;
  name: string;
  dosage: string;
  image: string;
  taken: boolean;
}

const FAKE_SUPPLEMENTS: FakeSupplement[] = [
  { id: "fs1", name: "Magnesium", dosage: "2 pills", image: "/assets/morning_shot.webp", taken: false },
  { id: "fs2", name: "D3+K2", dosage: "1 pill", image: "/assets/morning_shot.webp", taken: false },
  { id: "fs3", name: "Omega", dosage: "1 pill", image: "/assets/morning_shot.webp", taken: false },
];

const geist = "Geist, Inter, system-ui, sans-serif";

// Progress arc: the top slice of a large circle. Endpoints sit at
// (15,85) and (325,85), so the centre is 155 left of x=170 and well below
// the box. The box height follows the stroke so thicker round caps still fit.
const ARC_R = 198;
const ARC_CX = 170;
const ARC_HALF_CHORD = 155;
const ARC_W = 11;
const ARC_BASE_Y = 85;
const ARC_BOX_W = 340;
const ARC_BOX_H = Math.ceil(ARC_BASE_Y + ARC_W / 2 + 1);
const ARC_CY = ARC_BASE_Y + Math.sqrt(ARC_R * ARC_R - ARC_HALF_CHORD * ARC_HALF_CHORD);
const ARC_HALF = Math.acos(ARC_HALF_CHORD / ARC_R);
const ARC_PATH = `M ${ARC_CX - ARC_HALF_CHORD},${ARC_BASE_Y} A ${ARC_R},${ARC_R} 0 0,1 ${ARC_CX + ARC_HALF_CHORD},${ARC_BASE_Y}`;
// Vertical focal point of the hero photo. Lower values show more sky, which
// drops the summit further down the panel. Tune this to seat the peak inside
// the arc's hollow; it is the one number that controls the composition.
// One source of truth: the CSS value and the sun-anchor crop maths below both derive
// from the fraction, so the drawn crop and the computed crop can never disagree.
const BG_FOCUS_FRACTION = 0.39;
const BG_FOCUS_Y = `${BG_FOCUS_FRACTION * 100}%`;

const ARC_A0 = Math.PI + ARC_HALF;
const ARC_A1 = 2 * Math.PI - ARC_HALF;

function arcAngle(progress: number): number {
  return ARC_A0 + (ARC_A1 - ARC_A0) * (progress / 100);
}

// Centre of the round cap at the leading edge of the fill.
function arcTip(progress: number): { x: number; y: number } {
  const a = arcAngle(progress);
  return { x: ARC_CX + ARC_R * Math.cos(a), y: ARC_CY + ARC_R * Math.sin(a) };
}

// Closed ribbon outline of the filled part of the arc, with round caps at both
// ends, in the SVG's own viewBox units. Used as the shader's clip path.
function buildArcClip(progress: number): string {
  const hw = ARC_W / 2;
  const aP = arcAngle(Math.max(progress, 0.4));
  const pts: string[] = [];
  const add = (x: number, y: number) => pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  const SEG = 80;
  const CAP = 10;
  for (let i = 0; i <= SEG; i++) {
    const a = ARC_A0 + (aP - ARC_A0) * (i / SEG);
    add(ARC_CX + (ARC_R + hw) * Math.cos(a), ARC_CY + (ARC_R + hw) * Math.sin(a));
  }
  for (let i = 1; i < CAP; i++) {
    const phi = (i / CAP) * Math.PI;
    const c = Math.cos(phi), s = Math.sin(phi);
    add(
      ARC_CX + ARC_R * Math.cos(aP) + hw * (Math.cos(aP) * c - Math.sin(aP) * s),
      ARC_CY + ARC_R * Math.sin(aP) + hw * (Math.sin(aP) * c + Math.cos(aP) * s),
    );
  }
  for (let i = SEG; i >= 0; i--) {
    const a = ARC_A0 + (aP - ARC_A0) * (i / SEG);
    add(ARC_CX + (ARC_R - hw) * Math.cos(a), ARC_CY + (ARC_R - hw) * Math.sin(a));
  }
  for (let i = 1; i < CAP; i++) {
    const phi = (i / CAP) * Math.PI;
    const c = Math.cos(phi), s = Math.sin(phi);
    add(
      ARC_CX + ARC_R * Math.cos(ARC_A0) - hw * (Math.cos(ARC_A0) * c - Math.sin(ARC_A0) * s),
      ARC_CY + ARC_R * Math.sin(ARC_A0) - hw * (Math.sin(ARC_A0) * c + Math.cos(ARC_A0) * s),
    );
  }
  return `M ${pts[0]} ${pts.slice(1).map((p) => `L ${p}`).join(" ")} Z`;
}

// ---------------------------------------------------------------------------
// Sky background
// ---------------------------------------------------------------------------

// Height of the fixed hero panel. The sky fills it exactly; NightSky is laid out in these
// raw pixels, so the panel cannot become `height: auto` without breaking the star projection.
const PANEL_H = 520;

// PLACEHOLDER ART. These are the OLD mountain photographs, wired up only so the sky stack is
// real and reviewable. The sky-only assets (no horizon, no landmass) are generated by the
// owner and do not exist in the repo yet.
// WHEN THE REAL SKIES LAND: swap these three paths AND re-measure PROVISIONAL_SUN in
// src/components/SkyLight.tsx against the delivered morning/afternoon photographs.
const SKY_IMAGES: Record<SkyPhase, string> = {
  morning: "/assets/morning.webp",
  afternoon: "/assets/afternoon.webp",
  night: "/assets/night.webp",
};

// Slow enough that crossing a boundary with the app open reads as the light changing rather
// than as a glitch. Opening fresh after a boundary is instant: there is nothing to fade from.
const CROSSFADE_MS = 6000;

// The night sky pulls in astronomy-engine and a ~900-star catalogue. Two thirds of the day
// never needs either, so it loads only when the night phase is actually on screen. The
// Suspense fallback is `null`: nothing renders while the chunk arrives, so there is no flash.
const NightSky = lazy(() => import("../components/NightSky"));

/**
 * Keeps a failed night sky local.
 *
 * `Suspense` covers the chunk *loading*; nothing covers it *failing*. The only other error
 * boundary in the app is the root Sentry one in `src/main.tsx`, so without this a rejected
 * `import("../components/NightSky")` would propagate all the way up and blank the whole app.
 * That is not an exotic trigger for an installed PWA: a stale cached shell after a deploy, or
 * simply being offline the first time the chunk is needed, is enough.
 *
 * Failing here degrades to "no stars tonight" — the photograph, the light layers, the grain,
 * the scrim and every bit of hero content carry on untouched. The boundary lives inside
 * SkyLayer, which is keyed by phase, so the next time the night phase mounts it is a fresh
 * instance and the import is retried.
 *
 * It catches a throw from inside NightSky's own render too, not just a failed import, hence
 * the `night-sky-render` target. NightSky already reports its own recoverable failures.
 */
class NightSkyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    reportError(error, { area: "sky", target: "night-sky-render" });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Map a point measured on the photograph to the same point on the panel.
 *
 * `SkyLight` positions its anchor with `left: x%` / `top: y%` of the panel, but the contract
 * for `sunX`/`sunY` is a position on the *photograph*. Those are not the same thing: the image
 * is drawn with `object-fit: cover` and `object-position: center BG_FOCUS_Y`, so part of it is
 * cropped away and a point 17% down the image is not 17% down the panel. This reproduces the
 * CSS cover geometry exactly from the image's intrinsic size, so the sun anchor lands on the
 * sun whatever aspect ratio the delivered art turns out to have.
 *
 * Returns the input unchanged if any dimension is still unknown, which only happens before the
 * image has loaded — the caller does not render SkyLight until then.
 */
function imagePointToPanel(
  point: { x: number; y: number },
  panelW: number,
  panelH: number,
  imgW: number,
  imgH: number
): { x: number; y: number } {
  if (!(panelW > 0 && panelH > 0 && imgW > 0 && imgH > 0)) return point;
  const scale = Math.max(panelW / imgW, panelH / imgH);
  const drawnW = imgW * scale;
  const drawnH = imgH * scale;
  // CSS object-position: offset = (container - drawn) * position fraction. Horizontal is
  // `center`, i.e. 0.5; vertical is BG_FOCUS_FRACTION.
  const offsetX = (panelW - drawnW) * 0.5;
  const offsetY = (panelH - drawnH) * BG_FOCUS_FRACTION;
  return {
    x: (offsetX + point.x * drawnW) / panelW,
    y: (offsetY + point.y * drawnH) / panelH,
  };
}

type ImageSize = { w: number; h: number };

/**
 * One complete sky: the photograph with its own motion painted over it, in a single layer so
 * a crossfade carries the light and the photo together. Back to front within the layer:
 * photograph, motion (light or clouds), stars.
 */
function SkyLayer({
  phase,
  panelW,
  observer,
  active,
  visible,
  animated,
  size,
  onSize,
  onLoadError,
}: {
  phase: SkyPhase;
  panelW: number;
  observer: Observer;
  active: boolean;
  /** Target opacity: the incoming layer starts hidden and fades in over the outgoing one. */
  visible: boolean;
  animated: boolean;
  size: ImageSize | undefined;
  onSize: (src: string, el: HTMLImageElement | null) => void;
  onLoadError: (src: string) => void;
}) {
  const src = SKY_IMAGES[phase];
  const day = phase === "night" ? null : phase;
  // The sun anchor needs the photograph's intrinsic size to undo the cover crop, so if the
  // image fails to load `size` never arrives, `sun` stays null and a day phase renders no sun
  // glow or beams at all. That is deliberate: a glow anchored to a guessed position on a sky
  // that is not there would be worse than no glow. The failed load is reported (onLoadError).
  const sun =
    day && size && panelW > 0
      ? imagePointToPanel(PROVISIONAL_SUN[day], panelW, PANEL_H, size.w, size.h)
      : null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        opacity: visible ? 1 : 0,
        transition: animated ? `opacity ${CROSSFADE_MS}ms linear` : undefined,
      }}
    >
      <img
        src={src}
        alt=""
        // A cached image can already be complete before onLoad would fire, so read the
        // intrinsic size from both places. The sun anchor needs it to undo the cover crop.
        ref={(el) => {
          if (el?.complete) onSize(src, el);
        }}
        onLoad={(e) => onSize(src, e.currentTarget)}
        onError={() => onLoadError(src)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `center ${BG_FOCUS_Y}`,
        }}
      />
      {day && sun && <SkyLight phase={day} sunX={sun.x} sunY={sun.y} active={active} />}
      {phase === "afternoon" && <SkyClouds active={active} />}
      {phase === "night" && panelW > 0 && (
        <NightSkyBoundary>
          <Suspense fallback={null}>
            <NightSky observer={observer} width={panelW} height={PANEL_H} active={active} />
          </Suspense>
        </NightSkyBoundary>
      )}
    </div>
  );
}

const cardBase: React.CSSProperties = {
  border: "0.3px solid rgba(142,155,196,0.24)",
  borderRadius: 20,
};

const calendarCard: React.CSSProperties = {
  ...cardBase,
  background: "linear-gradient(180deg, rgba(107,0,0,0.15) 0%, rgba(7,7,12,0.22) 37.5%, rgba(7,7,12,0.3) 52%, rgba(7,7,12,0.22) 68.75%, rgba(107,0,0,0.15) 100%)",
};

const tasksCard: React.CSSProperties = {
  ...cardBase,
  background: "linear-gradient(180deg, rgba(0,0,107,0.25) 0%, rgba(7,7,12,0.47) 100%)",
};

const habitCard: React.CSSProperties = {
  ...cardBase,
  background: "rgba(28,28,42,0.47)",
};

export function Home(_props: HomeProps) {
  const navigate = useNavigate();
  const calendar = useGoogleCalendar();
  const { events: localEvents } = useCalendarEventsContext();
  const { todaysHabits, todaysProgress, completions, isCompleted, toggleCompletion, getStreak } = useHabitsContext();
  const { tasks: realTasks, toggleTask } = useTasksContext();
  const [activeTab, setActiveTab] = useState<"daily" | "social">("daily");
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [fakeTaskState, setFakeTaskState] = useState<Record<string, boolean>>({});
  const [fakeHabitState, setFakeHabitState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(FAKE_HABITS.map((h) => [h.id, h.completed]))
  );
  const [fakeSupplementState, setFakeSupplementState] = useState<Record<string, boolean>>({});

  const usingFakeHabits = todaysHabits.length === 0;
  const usingFakeTasks = realTasks.length === 0;
  const displayTasks = usingFakeTasks ? FAKE_TASKS : realTasks;

  const dailyStreak = useMemo(() => {
    if (todaysHabits.length === 0) return 0;
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const allDone = todaysHabits.every((h) =>
        completions.some((c) => c.habitId === h.id && c.date === key)
      );
      if (allDone) {
        streak++;
      } else if (i === 0) {
        continue;
      } else {
        break;
      }
    }
    return streak;
  }, [todaysHabits, completions]);

  const bestDailyStreak = useMemo(() => {
    if (todaysHabits.length === 0) return 0;
    const today = new Date();
    let best = 0;
    let current = 0;
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const allDone = todaysHabits.every((h) =>
        completions.some((c) => c.habitId === h.id && c.date === key)
      );
      if (allDone) {
        current++;
        if (current > best) best = current;
      } else {
        current = 0;
      }
    }
    return best;
  }, [todaysHabits, completions]);

  const fakeHabitsDone = useMemo(() => Object.values(fakeHabitState).filter(Boolean).length, [fakeHabitState]);
  const fakeHabitsTotal = FAKE_HABITS.length;

  const displayStreak = usingFakeHabits ? 12 : dailyStreak;
  const displayBest = usingFakeHabits ? 14 : bestDailyStreak;
  const displayDone = usingFakeHabits ? fakeHabitsDone : todaysProgress.done;
  const displayTotal = usingFakeHabits ? fakeHabitsTotal : todaysProgress.total;
  const progressPct = displayTotal > 0
    ? Math.round((displayDone / displayTotal) * 100)
    : 0;

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const monthStr = today.toLocaleDateString("en-US", { month: "short" });
  const dayNum = today.getDate();
  const weekday = today.toLocaleDateString("en-US", { weekday: "long" });

  // --- Sky background -------------------------------------------------------
  const skyActive = useSkyActive();

  // Approximate position from the browser's own timezone; no geolocation prompt, correct on
  // first paint. `observerFromTimeZone` already falls back on an unknown zone, so the catch
  // only covers an Intl call that throws outright.
  const observer = useMemo<Observer>(() => {
    try {
      return observerFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch (err) {
      reportError(err, { area: "sky", target: "observer" });
      return DEFAULT_OBSERVER;
    }
  }, []);

  const [skyPhaseNow, setSkyPhaseNow] = useState<SkyPhase>(() => skyPhase(new Date()));
  // The phase being faded out, or null when a single sky is on screen.
  const [outgoingPhase, setOutgoingPhase] = useState<SkyPhase | null>(null);
  // False only for the one paint that puts the incoming layer at opacity 0.
  const [incomingShown, setIncomingShown] = useState(true);
  // Read by the boundary timer, which must not re-arm itself on every phase change.
  const skyPhaseRef = useRef(skyPhaseNow);
  const [panelW, setPanelW] = useState(0);
  const [skyImgSizes, setSkyImgSizes] = useState<Record<string, ImageSize>>({});
  const panelEl = useRef<HTMLDivElement>(null);

  const noteSkyImgSize = (src: string, el: HTMLImageElement | null) => {
    const w = el?.naturalWidth ?? 0;
    const h = el?.naturalHeight ?? 0;
    if (w <= 0 || h <= 0) return;
    setSkyImgSizes((prev) => (prev[src]?.w === w && prev[src]?.h === h ? prev : { ...prev, [src]: { w, h } }));
  };

  // A sky that will not load leaves the panel black, which is worth knowing about rather than
  // staring at. Reported, not toasted: the background is decoration, not the user's task.
  const noteSkyImgError = (src: string) => {
    reportError(new Error(`sky image failed to load: ${src}`), { area: "sky", target: "image" });
  };

  // Whether the incoming photograph has decoded. The crossfade waits for it, so it never fades
  // in an empty layer, but it does not wait forever (see below).
  const incomingLoaded = skyImgSizes[SKY_IMAGES[skyPhaseNow]] !== undefined;

  // NightSky is laid out in raw pixels, so the panel's width has to be measured rather than
  // assumed: it spans the viewport, not the 430px content column, and rotates with the device.
  // Measured before the first paint so the sun anchor and the stars are never briefly wrong.
  useLayoutEffect(() => {
    const el = panelEl.current;
    if (!el) return;
    const measure = () => setPanelW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observerRO = new ResizeObserver(measure);
    observerRO.observe(el);
    return () => observerRO.disconnect();
  }, []);

  // Re-read the clock and start a crossfade if the phase has moved on. The phase lives in a
  // ref as well as in state so this never has to be rebuilt, and so the boundary timer below
  // does not re-arm itself every time the sky changes.
  const applySkyPhase = useCallback(() => {
    const next = skyPhase(new Date());
    if (next === skyPhaseRef.current) return;
    const previous = skyPhaseRef.current;
    skyPhaseRef.current = next;
    setSkyPhaseNow(next);
    if (prefersReducedMotion()) return; // cut straight to the new sky, no fade
    setIncomingShown(false);
    setOutgoingPhase(previous);
  }, []);

  // One timer per boundary rather than a poll. `nextBoundary` is always strictly in the
  // future, including across a DST shift, so the delay can never be zero and thrash.
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      const now = new Date();
      const delay = Math.max(1000, nextBoundary(now).getTime() - now.getTime());
      timer = window.setTimeout(() => {
        applySkyPhase();
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [applySkyPhase]);

  // An installed PWA has its timers frozen while it is in the background, so the boundary
  // timer cannot be the only trigger: re-check the clock whenever the app becomes visible.
  useEffect(() => {
    if (skyActive) applySkyPhase();
  }, [skyActive, applySkyPhase]);

  // Drive the crossfade: paint the incoming layer hidden once, let CSS carry it in over the
  // outgoing one (which stays fully opaque, so there is no dip in brightness mid-fade), then
  // drop the outgoing layer. Keyed on `outgoingPhase` so flipping `incomingShown` does not
  // cancel the teardown timer.
  //
  // The 50ms is just long enough for the browser to paint opacity 0 with the transition in
  // place. If the incoming photograph has not decoded yet the start is held back, so the fade
  // cannot reveal an empty layer — but only up to STALL_MS, after which it proceeds anyway
  // rather than leaving yesterday's sky on screen because an asset is missing.
  useEffect(() => {
    if (!outgoingPhase) return;
    const PAINT_MS = 50;
    const STALL_MS = 4000;
    const startIn = incomingLoaded ? PAINT_MS : STALL_MS;
    const start = window.setTimeout(() => setIncomingShown(true), startIn);
    const end = window.setTimeout(() => setOutgoingPhase(null), startIn + CROSSFADE_MS + 100);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [outgoingPhase, incomingLoaded]);

  const arcIds = useMemo(() => {
    const salt = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return { clip: `arc-clip-${salt}`, glow: `arc-glow-${salt}` };
  }, []);

  const clipPathEl = useRef<SVGPathElement>(null);
  const glowEl = useRef<SVGGElement>(null);
  const glowHaloEl = useRef<SVGCircleElement>(null);
  const glowCoreEl = useRef<SVGCircleElement>(null);
  const shownPct = useRef(0);

  // The gauge sweeps from empty to its value instead of snapping there. The
  // spring writes straight to the DOM so a fill does not re-render the page.
  useLayoutEffect(() => {
    const paint = (pct: number) => {
      shownPct.current = pct;
      clipPathEl.current?.setAttribute("d", buildArcClip(pct));
      const { x, y } = arcTip(pct);
      glowHaloEl.current?.setAttribute("cx", String(x));
      glowHaloEl.current?.setAttribute("cy", String(y));
      glowCoreEl.current?.setAttribute("cx", String(x));
      glowCoreEl.current?.setAttribute("cy", String(y));
      // No leading edge to light up until there is some fill.
      glowEl.current?.setAttribute("opacity", String(Math.min(pct / 4, 1)));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(progressPct);
      return;
    }
    return animateSpring({
      from: shownPct.current,
      to: progressPct,
      response: 0.55,
      damping: 1,
      onUpdate: paint,
    });
  }, [progressPct]);

  const allEvents = useMemo(() => {
    const gcalNormalized = calendar.connected
      ? calendar.events.map(normalizeGcalEvent)
      : [];
    const localNormalized = localEvents
      .filter((e) => e.date === todayKey)
      .map(normalizeLocalEvent);
    const merged = [...gcalNormalized, ...localNormalized];
    if (merged.length === 0) return makeFakeEvents();
    return merged.sort((a, b) => a.sortKey - b.sortKey);
  }, [calendar.connected, calendar.events, localEvents, todayKey]);

  const nextUpEvents = allEvents.slice(0, 2);
  const calendarEvents = calendarExpanded ? allEvents : allEvents.slice(0, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, overflow: "visible", position: "relative" }}>
      {/* Fixed background sky — independent of content. Back to front: outgoing sky (only
          during a crossfade), incoming sky, grain, bottom fade. The hero content sits above
          it all at zIndex 2 and is untouched by the sky. */}
      <div ref={panelEl} style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: PANEL_H,
        pointerEvents: "none",
        zIndex: 0,
        borderRadius: "0 0 24px 24px",
        overflow: "hidden",
      }}>
        {/* One array keyed by phase, outgoing first. React then matches the layer that was
            already on screen by its key, so starting a crossfade does not remount it (and so
            its photograph does not flash, nor its stars recompute). The outgoing layer keeps
            animating until it is covered: killing its sun glow at t=0 would pop. */}
        {([outgoingPhase, skyPhaseNow].filter((p): p is SkyPhase => p !== null)).map((p) => (
          <SkyLayer
            key={p}
            phase={p}
            panelW={panelW}
            observer={observer}
            active={skyActive}
            visible={p === skyPhaseNow ? incomingShown : true}
            animated={p === skyPhaseNow && outgoingPhase !== null}
            size={skyImgSizes[SKY_IMAGES[p]]}
            onSize={noteSkyImgSize}
            onLoadError={noteSkyImgError}
          />
        ))}
        {/* Static grain noise */}
        <div style={{
          position: "absolute",
          inset: 0,
          opacity: 0.1,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }} />
        {/* Bottom fade to canvas */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          background: "linear-gradient(to bottom, rgba(7,7,12,0) 0%, rgba(7,7,12,0.4) 40%, rgba(7,7,12,0.85) 70%, #07070C 100%)",
        }} />
      </div>

      {/* Hero content — scrolls independently over the fixed background */}
      <section style={{
        position: "relative",
        zIndex: 2,
      }}>

        {/* Header: Date + Avatar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          zIndex: 2,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{
              fontFamily: geist,
              fontWeight: 700,
              fontSize: 20,
              color: "#EAECF4",
              letterSpacing: "-0.02em",
            }}>
              {monthStr} {dayNum}
            </span>
            <span style={{
              fontFamily: geist,
              fontWeight: 400,
              fontSize: 20,
              color: "rgba(234,236,244,0.45)",
            }}>
              {weekday}
            </span>
            <CaretDown size={16} weight="bold" color="rgba(234,236,244,0.4)" style={{ marginLeft: -2, alignSelf: "center" }} />
          </div>

          <div
            onClick={() => navigate("/settings")}
            style={{
              width: 36,
              height: 36,
              borderRadius: 100,
              border: "1px solid rgba(142,155,196,0.4)",
              overflow: "hidden",
              cursor: "pointer",
            }}
          >
            <img
              src="/assets/profile-avatar.png"
              alt="Profile"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>

        {/* Arc Progress + Streak */}
        <div style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 36,
        }}>
          {/* Radial scrim. Starts below the arc and carries the streak number and the rows
              under it. The inner stop was 0.82 when the background was a busy mountain
              photograph; an even sky needs far less help, so it is down to 0.55 while the
              outer stops stay put. If the real afternoon sky turns out too bright for the
              15-17px rows, make this value per-phase (heavier on afternoon only) rather than
              raising it for all three — see "The scrim gets lighter" in
              docs/superpowers/specs/2026-10-15-animated-sky-backgrounds-design.md. */}
          <div style={{
            position: "absolute",
            top: 104,
            left: "50%",
            transform: "translateX(-50%)",
            width: 340,
            height: 230,
            background: "radial-gradient(ellipse at center, rgba(7,7,12,0.55) 0%, rgba(7,7,12,0.45) 45%, transparent 75%)",
            pointerEvents: "none",
            zIndex: -1,
          }} />
          <div style={{ width: ARC_BOX_W, position: "relative" }}>
            {/* Clip path for the shader. userSpaceOnUse so its units are the
                overlay's own CSS pixels, which match the viewBox 1:1.
                Starts empty; the spring above fills it. */}
            <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
              <defs>
                <clipPath id={arcIds.clip} clipPathUnits="userSpaceOnUse">
                  <path ref={clipPathEl} d={buildArcClip(0)} />
                </clipPath>
                <radialGradient id={arcIds.glow}>
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
                  <stop offset="40%" stopColor="#D8E0F7" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#8E9BC4" stopOpacity="0" />
                </radialGradient>
              </defs>
            </svg>

            {/* Fixed width, like the overlays: the shader's clip path is in
                userSpaceOnUse units, so all three layers must stay 1:1. */}
            <svg
              viewBox={`0 0 ${ARC_BOX_W} ${ARC_BOX_H}`}
              style={{ width: ARC_BOX_W, height: ARC_BOX_H, display: "block" }}
            >
              {/* Track — the not-done part of the arc */}
              <path
                d={ARC_PATH}
                fill="none"
                stroke="rgba(142,155,196,0.5)"
                strokeWidth={ARC_W}
                strokeLinecap="round"
              />
            </svg>

            {/* Water shader, clipped to the done part of the arc */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: ARC_BOX_W,
              height: ARC_BOX_H,
              clipPath: `url(#${arcIds.clip})`,
              WebkitClipPath: `url(#${arcIds.clip})`,
              pointerEvents: "none",
            }}>
              <NeuroNoise
                width={ARC_BOX_W}
                height={ARC_BOX_H}
                colorFront="#F4F7FF"
                colorMid="#BFCAE8"
                colorBack="#97A4CC"
                brightness={0.35}
                contrast={0.6}
                speed={0.9}
                scale={0.8}
              />
            </div>

            {/* Specular highlight travelling with the leading edge of the fill.
                overflow visible so the halo can bloom past the box. */}
            <svg
              aria-hidden
              viewBox={`0 0 ${ARC_BOX_W} ${ARC_BOX_H}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: ARC_BOX_W,
                height: ARC_BOX_H,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <g ref={glowEl} opacity={0}>
                <circle ref={glowHaloEl} r={17} fill={`url(#${arcIds.glow})`} />
                <circle ref={glowCoreEl} r={Math.max(ARC_W / 2 - 2.5, 1.5)} fill="#FFFFFF" opacity={0.75} />
              </g>
            </svg>

            {/* Streak number — below the arc, so the summit can rise into the
                hollow under the curve */}
            <div style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "center",
            }}>
              <span style={{
                fontFamily: geist,
                fontWeight: 700,
                fontSize: 64,
                color: "#EAECF4",
                lineHeight: 1,
                letterSpacing: "-0.02em",
                textShadow: "0 2px 16px rgba(7,7,12,0.8)",
              }}>
                {displayStreak}
              </span>
            </div>
          </div>
          <span style={{
            fontFamily: geist,
            fontWeight: 600,
            fontSize: 17,
            color: "#EAECF4",
            marginTop: 6,
            textShadow: "0 1px 8px rgba(7,7,12,0.6)",
          }}>
            Day Streak
          </span>
          <span style={{
            fontFamily: geist,
            fontWeight: 400,
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            marginTop: 3,
            textShadow: "0 1px 6px rgba(7,7,12,0.6)",
          }}>
            Best: {displayBest} days
          </span>

          <span style={{
            fontFamily: geist,
            fontWeight: 600,
            fontSize: 15,
            color: "#8E9BC4",
            marginTop: 16,
            textShadow: "0 1px 6px rgba(7,7,12,0.6)",
          }}>
            {progressPct}% habits done today
          </span>
        </div>

        {/* Next Up — inside the hero image */}
        <div style={{
          position: "relative",
          zIndex: 2,
          marginTop: 24,
          padding: "12px 4px 0",
        }}>
          <h2 style={{
            fontFamily: geist,
            fontWeight: 700,
            fontSize: 14,
            color: "#EAECF4",
            margin: "0 0 12px 0",
          }}>
            Next Up
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {nextUpEvents.map((event, i) => (
              <div key={event.id}>
                {i > 0 && (
                  <div style={{ height: 1, background: "rgba(234,236,244,0.06)", margin: "12px 0" }} />
                )}
                <div style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      background: getEventColor(i),
                      flexShrink: 0,
                      marginTop: 5,
                    }} />
                    <div>
                      <div style={{
                        fontFamily: geist,
                        fontWeight: 500,
                        fontSize: 14,
                        color: "white",
                      }}>
                        {event.title}
                      </div>
                      <div style={{
                        fontFamily: "Geist Mono, monospace",
                        fontWeight: 300,
                        fontSize: 10,
                        color: "rgba(255,255,255,0.46)",
                        marginTop: 2,
                      }}>
                        {event.time}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 300,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginTop: 2,
                  }}>
                    {event.relativeTime}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Daily / Social toggle */}
      <div style={{
        position: "relative",
        zIndex: 2,
        display: "flex",
        justifyContent: "center",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 20,
          paddingLeft: 1,
          paddingRight: 12,
          paddingTop: 1,
          paddingBottom: 1,
        }}>
          <button
            onClick={() => setActiveTab("daily")}
            style={{
              fontFamily: geist,
              fontWeight: 600,
              fontSize: 15,
              color: activeTab === "daily" ? "white" : "rgba(255,255,255,0.64)",
              background: activeTab === "daily" ? "rgba(28,28,42,0.87)" : "transparent",
              border: "none",
              borderRadius: 16,
              padding: "4px 16px",
              cursor: "pointer",
              transition: "background 200ms ease, color 200ms ease",
            }}
          >
            Daily
          </button>
          <button
            onClick={() => setActiveTab("social")}
            style={{
              fontFamily: geist,
              fontWeight: 600,
              fontSize: 15,
              color: activeTab === "social" ? "white" : "rgba(255,255,255,0.64)",
              background: activeTab === "social" ? "rgba(28,28,42,0.87)" : "transparent",
              border: "none",
              borderRadius: 16,
              padding: "4px 16px",
              cursor: "pointer",
              transition: "background 200ms ease, color 200ms ease",
            }}
          >
            Social
          </button>
        </div>
      </div>

      {/* Calendar section */}
      <section style={{ position: "relative", zIndex: 2 }}>
        <div style={{ ...calendarCard, padding: "20px 20px 12px" }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}>
            <h2 style={{
              fontFamily: geist,
              fontWeight: 700,
              fontSize: 14,
              color: "#EAECF4",
              margin: 0,
            }}>
              Calendar
            </h2>
            <span
              onClick={() => navigate("/calendar")}
              style={{
                fontFamily: geist,
                fontWeight: 400,
                fontSize: 14,
                color: "rgba(234,236,244,0.4)",
                cursor: "pointer",
              }}
            >
              See all
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {calendarEvents.map((event, i) => (
              <div key={event.id}>
                {i > 0 && (
                  <div style={{ height: 1, background: "rgba(234,236,244,0.06)", margin: "14px 0" }} />
                )}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: getEventColor(i + 2),
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: geist,
                      fontWeight: 600,
                      fontSize: 16,
                      color: "white",
                    }}>
                      {event.title}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 400,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.69)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}>
                    {event.time}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Expand chevron */}
          <div
            onClick={allEvents.length > 3 ? () => setCalendarExpanded(!calendarExpanded) : undefined}
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: 12,
              cursor: allEvents.length > 3 ? "pointer" : "default",
            }}
          >
            <CaretDown
              size={20}
              weight="bold"
              color={allEvents.length > 3 ? "rgba(234,236,244,0.3)" : "rgba(234,236,244,0.15)"}
              style={{
                transform: calendarExpanded ? "rotate(180deg)" : "none",
                transition: "transform 200ms ease",
              }}
            />
          </div>
        </div>
      </section>
      {/* Tasks card */}
      {displayTasks.length > 0 && (
        <section style={{ position: "relative", zIndex: 2 }}>
          <div style={{ ...tasksCard, padding: "20px 20px 16px" }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}>
              <h2 style={{
                fontFamily: geist,
                fontWeight: 700,
                fontSize: 14,
                color: "#EAECF4",
                margin: 0,
              }}>
                Tasks
              </h2>
              <span style={{
                fontFamily: geist,
                fontWeight: 400,
                fontSize: 14,
                color: "rgba(234,236,244,0.4)",
              }}>
                {displayTasks.filter((t) => usingFakeTasks ? (fakeTaskState[t.id] ?? t.done) : t.done).length} of {displayTasks.length}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {displayTasks.map((task, i) => {
                const isDone = usingFakeTasks ? (fakeTaskState[task.id] ?? task.done) : task.done;
                return (
                <div key={task.id}>
                  {i > 0 && (
                    <div style={{ height: 1, background: "rgba(234,236,244,0.06)", margin: "10px 0" }} />
                  )}
                  <div
                    onClick={() => usingFakeTasks
                      ? setFakeTaskState((prev) => ({ ...prev, [task.id]: !isDone }))
                      : toggleTask(task.id)
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      minHeight: 36,
                    }}
                  >
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: isDone
                        ? "2px solid #8E9BC4"
                        : "2px solid rgba(234,236,244,0.2)",
                      background: isDone ? "#8E9BC4" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 200ms ease",
                    }}>
                      {isDone && (
                        <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                          <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{
                      fontFamily: geist,
                      fontWeight: 500,
                      fontSize: 16,
                      color: isDone ? "rgba(234,236,244,0.35)" : "#EAECF4",
                      textDecoration: isDone ? "line-through" : "none",
                      transition: "color 200ms ease",
                    }}>
                      {task.label}
                    </span>
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Habits grid */}
      <section style={{ position: "relative", zIndex: 2 }}>
        <h2 style={{
          fontFamily: geist,
          fontWeight: 700,
          fontSize: 14,
          color: "#EAECF4",
          margin: "0 0 16px 0",
        }}>
          Habits for Today
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}>
          {usingFakeHabits
            ? FAKE_HABITS.map((fh) => {
                const completed = fakeHabitState[fh.id] ?? fh.completed;
                const colorSet = HABIT_COLORS[fh.color];
                return (
                  <div
                    key={fh.id}
                    style={{
                      ...habitCard,
                      padding: "14px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{
                        width: 33, height: 33, borderRadius: 10,
                        background: colorSet.bg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <HabitIcon name={fh.icon} size={20} color={colorSet.fill} />
                      </div>
                      <div
                        onClick={() => setFakeHabitState((prev) => ({ ...prev, [fh.id]: !completed }))}
                        style={{
                          width: 24, height: 24, borderRadius: 6,
                          border: completed ? `1px solid ${colorSet.fill}` : "1px solid #8E9BC4",
                          background: completed ? colorSet.fill : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", transition: "background 200ms ease, border-color 200ms ease",
                        }}
                      >
                        {completed && (
                          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                            <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: geist, fontWeight: 500, fontSize: 14, color: "#EAECF4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fh.name}
                      </div>
                      {fh.streak > 0 && (
                        <div style={{ fontFamily: "Geist Mono, monospace", fontWeight: 400, fontSize: 8, color: "rgba(255,255,255,0.47)", marginTop: 2 }}>
                          {fh.streak} day streak
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            : todaysHabits.map((habit) => {
                const completed = isCompleted(habit.id);
                const streak = getStreak(habit.id);
                const colorSet = HABIT_COLORS[habit.color];
                return (
                  <div
                    key={habit.id}
                    style={{
                      ...habitCard,
                      padding: "14px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{
                        width: 33, height: 33, borderRadius: 10,
                        background: colorSet.bg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <HabitIcon name={habit.icon} size={20} color={colorSet.fill} />
                      </div>
                      <div
                        onClick={() => toggleCompletion(habit.id)}
                        style={{
                          width: 24, height: 24, borderRadius: 6,
                          border: completed ? `1px solid ${colorSet.fill}` : "1px solid #8E9BC4",
                          background: completed ? colorSet.fill : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", transition: "background 200ms ease, border-color 200ms ease",
                        }}
                      >
                        {completed && (
                          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                            <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: geist, fontWeight: 500, fontSize: 14, color: "#EAECF4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {habit.name}
                      </div>
                      {streak > 0 && (
                        <div style={{ fontFamily: "Geist Mono, monospace", fontWeight: 400, fontSize: 8, color: "rgba(255,255,255,0.47)", marginTop: 2 }}>
                          {streak} day streak
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
          }
        </div>
      </section>

      {/* Supplements section */}
      <section style={{ position: "relative", zIndex: 2 }}>
        <h2 style={{
          fontFamily: geist,
          fontWeight: 700,
          fontSize: 14,
          color: "#EAECF4",
          margin: "0 0 16px 0",
        }}>
          Supplements
        </h2>

        <div style={{
          display: "flex",
          gap: 14,
          overflowX: "auto",
          paddingBottom: 4,
          margin: "0 -16px",
          padding: "0 16px",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}>
          {FAKE_SUPPLEMENTS.map((sup) => {
            const taken = fakeSupplementState[sup.id] ?? sup.taken;
            return (
              <div
                key={sup.id}
                style={{
                  position: "relative",
                  width: 154,
                  height: 155,
                  borderRadius: 20,
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <img
                  src={sup.image}
                  alt={sup.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <div style={{
                  position: "absolute",
                  inset: 0,
                  boxShadow: "inset 0 163px 4px 0 rgba(0,0,0,0.63)",
                  borderRadius: 20,
                }} />
                {/* Checkbox */}
                <div
                  onClick={() => setFakeSupplementState((prev) => ({ ...prev, [sup.id]: !taken }))}
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    width: 23,
                    height: 23,
                    borderRadius: 4,
                    border: "1px solid white",
                    background: taken ? "#8E9BC4" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {taken && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                {/* Label */}
                <div style={{
                  position: "absolute",
                  bottom: 12,
                  left: 12,
                }}>
                  <div style={{
                    fontFamily: geist,
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#EAECF4",
                  }}>
                    {sup.name}
                  </div>
                  <div style={{
                    fontFamily: "Geist Mono, monospace",
                    fontWeight: 600,
                    fontSize: 10,
                    color: "rgba(234,236,244,0.71)",
                    marginTop: 1,
                  }}>
                    {sup.dosage}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
