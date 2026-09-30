import { HABIT_ICONS } from "../types";
import { HabitIcon } from "./HabitIcon";

interface IconPickerProps {
  selected: string;
  color: string;
  onSelect: (icon: string) => void;
}

const ICON_LABELS: Record<string, string> = {
  Barbell: "Weights",
  BookOpen: "Reading",
  Brain: "Mindfulness",
  Coffee: "Coffee",
  Drop: "Water",
  Fire: "Energy",
  Flower: "Nature",
  Heart: "Health",
  Lightning: "Power",
  Moon: "Sleep",
  MusicNote: "Music",
  Pencil: "Writing",
  Plant: "Growth",
  SmileyWink: "Mood",
  Sun: "Morning",
  Timer: "Timer",
  Tree: "Outdoors",
  Wind: "Breathing",
  YinYang: "Balance",
  Footprints: "Walking",
};

export function IconPicker({ selected, color, onSelect }: IconPickerProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: "var(--space-2)",
      }}
    >
      {HABIT_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          aria-label={ICON_LABELS[icon] ?? icon}
          title={ICON_LABELS[icon] ?? icon}
          aria-pressed={selected === icon}
          onClick={() => onSelect(icon)}
          style={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-sm)",
            border:
              selected === icon
                ? `2px solid ${color}`
                : "1px solid var(--color-border)",
            background:
              selected === icon
                ? "var(--color-surface-dim)"
                : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 150ms ease",
            cursor: "pointer",
          }}
        >
          <HabitIcon
            name={icon}
            size={22}
            color={selected === icon ? color : "var(--color-text-secondary)"}
          />
        </button>
      ))}
    </div>
  );
}
