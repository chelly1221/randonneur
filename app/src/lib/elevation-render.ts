export interface ElevationPoint {
  distance: number;
  elevation: number;
}

export interface ElevationRenderData {
  points: ElevationPoint[];
}

export function normalizeElevationRenderData(
  raw: unknown
): ElevationRenderData {
  if (Array.isArray(raw)) {
    const points = raw as ElevationPoint[];
    return { points };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as { points?: unknown };
    const points = Array.isArray(obj.points) ? (obj.points as ElevationPoint[]) : [];
    return { points };
  }
  return { points: [] };
}
