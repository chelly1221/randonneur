export const COURSE_PALETTE = [
  "#e53935", // red
  "#1a237e", // dark blue
  "#4fc3f7", // sky blue
  "#fdd835", // yellow
  "#0288d1", // ocean blue
  "#7b1fa2", // purple
  "#2e7d32", // forest green
  "#f06292", // pink
  "#00897b", // teal
  "#5d4037", // brown
  "#283593", // indigo
  "#c0ca33", // lime
] as const;
// Orange (#ff9800) deliberately excluded — reserved for hover/selection highlight

export function getCourseColor(id: string): string {
  const hex = id.replace(/-/g, "").substring(0, 8);
  return COURSE_PALETTE[parseInt(hex, 16) % COURSE_PALETTE.length];
}
