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

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function blendWithWhite(hex: string, ratio: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const nr = clampChannel(r + (255 - r) * ratio);
  const ng = clampChannel(g + (255 - g) * ratio);
  const nb = clampChannel(b + (255 - b) * ratio);

  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb
    .toString(16)
    .padStart(2, "0")}`;
}

export function getPastelCourseColor(id: string): string {
  return blendWithWhite(getCourseColor(id), 0.62);
}
