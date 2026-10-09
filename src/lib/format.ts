export function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysFromToday(date: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86400000);
}

// "Today", "Yesterday", or "Mon, Oct 5" for grouping the feed by day.
export function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = daysFromToday(d);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatTime(time: string | null): string | null {
  if (!time) return null;
  return new Date(`2000-01-01T${time}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export interface PlanWhen {
  dated: boolean;
  weekday: string;
  day: string;
  relative: string;
  time: string | null;
}

export function planWhen(date: string | null, time: string | null): PlanWhen {
  if (!date) return { dated: false, weekday: "", day: "", relative: "No date yet", time: formatTime(time) };
  const d = new Date(`${date}T00:00:00`);
  const diff = daysFromToday(d);
  let relative: string;
  if (diff === 0) relative = "Today";
  else if (diff === 1) relative = "Tomorrow";
  else if (diff > 1 && diff < 7) relative = `In ${diff} days`;
  else relative = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    dated: true,
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    day: String(d.getDate()),
    relative,
    time: formatTime(time),
  };
}
