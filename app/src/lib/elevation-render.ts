export interface ElevationPoint {
  distance: number;
  elevation: number;
}

export interface ElevationBand {
  from: number;
  to: number;
  color: string;
}

export interface ElevationRenderData {
  points: ElevationPoint[];
  bands: ElevationBand[];
}

/**
 * Sliding-window half-size for slope smoothing.
 * For segment i, slope is computed from points[i - SLOPE_HALF_WINDOW] to points[i + 1 + SLOPE_HALF_WINDOW].
 * With ~1500 points over 200km (~133m/segment), a window of 7 covers ~930m —
 * enough to average out GPS noise while preserving real terrain features.
 */
export const SLOPE_HALF_WINDOW = 3;

/**
 * Color based on the visual slope of the chart line, not geographic grade.
 * visualSlope = (Δelev / elevRange) / (Δdist / totalDist)
 * This matches what the user sees: if the line goes up on screen, it's colored.
 */
export function getVisualSlopeColor(visualSlope: number): string {
  if (visualSlope < 0.3) return "#90ee90";  // green — flat / downhill
  if (visualSlope < 1.0) return "#fdd835";  // yellow — gentle rise
  if (visualSlope < 2.5) return "#ff9f00";  // orange — moderate rise
  if (visualSlope < 5.0) return "#ff2d55";  // red — steep rise
  if (visualSlope < 10) return "#ff0033";   // dark red — very steep
  return "#8b0000";                          // maroon — extreme
}

export function buildElevationBands(points: ElevationPoint[]): ElevationBand[] {
  if (points.length < 2) return [];

  const totalDist = points[points.length - 1].distance - points[0].distance;
  if (totalDist <= 0) return [];

  let minElev = Infinity, maxElev = -Infinity;
  for (const p of points) {
    if (p.elevation < minElev) minElev = p.elevation;
    if (p.elevation > maxElev) maxElev = p.elevation;
  }
  const elevRange = maxElev - minElev;
  if (elevRange <= 0) return [];

  const bands: ElevationBand[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const lo = Math.max(0, i - SLOPE_HALF_WINDOW);
    const hi = Math.min(points.length - 1, i + 1 + SLOPE_HALF_WINDOW);
    const dx = points[hi].distance - points[lo].distance;
    if (dx <= 0) continue;

    const dy = points[hi].elevation - points[lo].elevation;
    const visualSlope = (dy / elevRange) / (dx / totalDist);
    const color = getVisualSlopeColor(visualSlope);

    const last = bands[bands.length - 1];
    if (last && last.color === color) {
      last.to = points[i + 1].distance;
    } else {
      bands.push({ from: points[i].distance, to: points[i + 1].distance, color });
    }
  }
  return bands;
}

export function normalizeElevationRenderData(
  raw: unknown
): ElevationRenderData {
  if (Array.isArray(raw)) {
    const points = raw as ElevationPoint[];
    return { points, bands: [] };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as { points?: unknown; bands?: unknown };
    const points = Array.isArray(obj.points) ? (obj.points as ElevationPoint[]) : [];
    const bands = Array.isArray(obj.bands) ? (obj.bands as ElevationBand[]) : [];
    return { points, bands };
  }
  return { points: [], bands: [] };
}
