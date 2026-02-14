/**
 * Geo utilities for working with LineString geometries.
 */

interface LngLat {
  lng: number;
  lat: number;
}

/**
 * Haversine distance between two points in km.
 */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Interpolate a point on a LineString at a given distance (km).
 * Returns [lng, lat] or null if the geometry is invalid.
 */
export function interpolatePointOnLine(
  geojson: GeoJSON.FeatureCollection,
  distanceKm: number
): [number, number] | null {
  const coords = getLineCoords(geojson);
  if (!coords || coords.length < 2) return null;

  let accumulated = 0;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const segLen = haversineKm(prev[1], prev[0], curr[1], curr[0]);

    if (accumulated + segLen >= distanceKm) {
      const ratio = (distanceKm - accumulated) / segLen;
      const lng = prev[0] + ratio * (curr[0] - prev[0]);
      const lat = prev[1] + ratio * (curr[1] - prev[1]);
      return [lng, lat];
    }
    accumulated += segLen;
  }

  // Past the end — return last point
  const last = coords[coords.length - 1];
  return [last[0], last[1]];
}

/**
 * Find the closest point on a LineString to a given point.
 * Returns { point: [lng, lat], distanceAlongKm, distanceFromKm }.
 */
export function closestPointOnLine(
  geojson: GeoJSON.FeatureCollection,
  latlng: LngLat
): {
  point: [number, number];
  distanceAlongKm: number;
  distanceFromKm: number;
} | null {
  const coords = getLineCoords(geojson);
  if (!coords || coords.length < 2) return null;

  let bestDist = Infinity;
  let bestPoint: [number, number] = [coords[0][0], coords[0][1]];
  let bestAlongKm = 0;
  let accumulated = 0;

  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][0],
      ay = coords[i - 1][1];
    const bx = coords[i][0],
      by = coords[i][1];
    const segLen = haversineKm(ay, ax, by, bx);

    // Project point onto segment
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = Math.max(
        0,
        Math.min(1, ((latlng.lng - ax) * dx + (latlng.lat - ay) * dy) / len2)
      );
    }

    const px = ax + t * dx;
    const py = ay + t * dy;
    const dist = haversineKm(latlng.lat, latlng.lng, py, px);

    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = [px, py];
      bestAlongKm = accumulated + t * segLen;
    }

    accumulated += segLen;
  }

  return {
    point: bestPoint,
    distanceAlongKm: bestAlongKm,
    distanceFromKm: bestDist,
  };
}

/**
 * Extract coordinates from the first LineString in a FeatureCollection.
 */
function getLineCoords(
  geojson: GeoJSON.FeatureCollection
): number[][] | null {
  for (const feature of geojson.features) {
    if (feature.geometry.type === "LineString") {
      return feature.geometry.coordinates;
    }
  }
  return null;
}
