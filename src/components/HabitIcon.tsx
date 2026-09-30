import * as Icons from "@phosphor-icons/react";

interface HabitIconProps {
  name: string;
  size?: number;
  color?: string;
  weight?: "regular" | "bold" | "fill";
}

const iconMap: Record<string, React.ComponentType<Icons.IconProps>> = {
  Barbell: Icons.Barbell,
  BookOpen: Icons.BookOpen,
  Brain: Icons.Brain,
  Coffee: Icons.Coffee,
  Drop: Icons.Drop,
  Fire: Icons.Fire,
  Flower: Icons.Flower,
  Heart: Icons.Heart,
  Lightning: Icons.Lightning,
  Moon: Icons.Moon,
  MusicNote: Icons.MusicNote,
  Pencil: Icons.Pencil,
  Plant: Icons.Plant,
  SmileyWink: Icons.SmileyWink,
  Sun: Icons.Sun,
  Timer: Icons.Timer,
  Tree: Icons.Tree,
  Wind: Icons.Wind,
  YinYang: Icons.YinYang,
  Footprints: Icons.Footprints,
};

export function HabitIcon({ name, size = 24, color, weight = "regular" }: HabitIconProps) {
  const Component = iconMap[name] ?? Icons.CircleDashed;
  return <Component size={size} color={color} weight={weight} aria-hidden="true" />;
}
