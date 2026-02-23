export type ThemeId =
  | "dawn"
  | "day"
  | "sunset"
  | "night"
  | "snowy"
  | "rainy"
  | "windy";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  icon: string;
  isDark: boolean;
}

export const THEMES: ThemeMeta[] = [
  { id: "dawn", label: "새벽", icon: "dawn", isDark: true },
  { id: "day", label: "낮", icon: "day", isDark: false },
  { id: "sunset", label: "노을", icon: "sunset", isDark: false },
  { id: "night", label: "밤", icon: "night", isDark: true },
  { id: "snowy", label: "눈", icon: "snowy", isDark: false },
  { id: "rainy", label: "비", icon: "rainy", isDark: true },
  { id: "windy", label: "바람", icon: "windy", isDark: false },
];

export function getAutoTheme(): ThemeId {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "day";
  if (hour >= 11 && hour < 14) return "windy";
  if (hour >= 14 && hour < 17) return "rainy";
  if (hour >= 17 && hour < 19) return "sunset";
  if (hour >= 19 && hour < 21) return "snowy";
  return "night";
}

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id)!;
}
