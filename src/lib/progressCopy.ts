// The one line inside the arc's dome.
//
// It states what remains. It does not evaluate. A line that tells you something you did
// not already know earns its place every day; a line that judges you earns it once, and
// this one is read every day for years. The bottom rung is the single exception — at
// zero done, saying so is information, not praise.
//
// EVERY user-facing string in this feature lives in this one function. That is what
// confines the rework when Czech arrives: the two counted branches need real plural
// categories (Czech inflects the noun with the number — zbyva 1 polozka / zbyvaji 2
// polozky / zbyva 6 polozek), and nothing else here has to move.
//
// Names are user-authored and their grammar is unpredictable: "Gym", "Go to gym",
// "Work on Pulse", "20 min reading". A frame like "Just the {name}" breaks on three of
// those four. What makes interpolation safe is POSITION, not wording — a name may sit
// at the start of a line or immediately after a colon, and nowhere else. It is never
// lowercased, capitalised, articled or pluralised.
//
// Pure module: imports only other pure modules, with a .ts extension.

import type { PlannedItem } from "./progress.ts";

export const NAME_CAP = 20;

function displayName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "Untitled";
  if (trimmed.length <= NAME_CAP) return trimmed;
  // Cap the result, ellipsis included, so the line's width is bounded whatever the
  // user called the thing.
  return `${trimmed.slice(0, NAME_CAP - 1).trimEnd()}…`;
}

export function progressLine(items: PlannedItem[]): string {
  if (items.length === 0) return "Nothing planned today";

  const remaining = items.filter((i) => !i.done);
  if (remaining.length === 0) return "Everything done";

  // Before this comes the one-left branch on purpose: "Last one" implies progress, and
  // with nothing done there has not been any.
  const doneCount = items.length - remaining.length;
  if (doneCount === 0) return "Nothing yet today";

  const next = displayName(remaining[0].name);
  if (remaining.length === 1) return `Last one: ${next}`;
  if (remaining.length <= 3) return `${next} and ${remaining.length - 1} more`;
  return `${remaining.length} left today`;
}
