export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: HabitColor;
  frequency: "daily" | "weekly";
  createdAt: string;
}

export interface Completion {
  id?: string;
  habitId: string;
  date: string;
}

export type HabitColor = "red" | "blue" | "green" | "yellow" | "purple" | "orange";

export type Theme = "dark";

export const HABIT_COLORS: Record<
  HabitColor,
  { bg: string; text: string; fill: string; label: string }
> = {
  red: { bg: "var(--color-habit-red-bg)", text: "var(--color-habit-red-text)", fill: "#E5534B", label: "Rose" },
  blue: { bg: "var(--color-habit-blue-bg)", text: "var(--color-habit-blue-text)", fill: "#539BF5", label: "Sky" },
  green: { bg: "var(--color-habit-green-bg)", text: "var(--color-habit-green-text)", fill: "#57AB5A", label: "Sage" },
  yellow: { bg: "var(--color-habit-yellow-bg)", text: "var(--color-habit-yellow-text)", fill: "#C69026", label: "Amber" },
  purple: { bg: "var(--color-habit-purple-bg)", text: "var(--color-habit-purple-text)", fill: "#986EE2", label: "Iris" },
  orange: { bg: "var(--color-habit-orange-bg)", text: "var(--color-habit-orange-text)", fill: "#CC6B2C", label: "Clay" },
};

export const HABIT_ICONS = [
  "Barbell", "BookOpen", "Brain", "Coffee", "Drop",
  "Fire", "Flower", "Heart", "Lightning", "Moon",
  "MusicNote", "Pencil", "Plant", "SmileyWink", "Sun",
  "Timer", "Tree", "Wind", "YinYang", "Footprints",
] as const;

export type HabitIcon = (typeof HABIT_ICONS)[number];

export interface Friend {
  friendshipId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  username: string;
}

export interface FriendRequest {
  friendshipId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  username: string;
  createdAt: string;
}

export interface FeedEntry {
  id: string;
  userId: string;
  type: "streak_milestone" | "habit_started" | "daily_complete" | "plan_created";
  payload: Record<string, unknown>;
  createdAt: string;
  userName: string;
  userAvatar: string | null;
  mine: boolean;
  cheers: number;
  cheeredByMe: boolean;
  cheeredBy: string[];
}

export interface SharedPlan {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  status: "planning" | "confirmed" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface PlanMember {
  id: string;
  planId: string;
  userId: string;
  rsvp: "pending" | "going" | "maybe" | "declined";
  joinedAt: string;
  name: string;
  avatarUrl: string | null;
  username: string;
}

export interface ChecklistItem {
  id: string;
  planId: string;
  label: string;
  done: boolean;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
}
