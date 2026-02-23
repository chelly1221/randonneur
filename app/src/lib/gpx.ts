export interface GpxData {
  geojson: GeoJSON.FeatureCollection;
  distance: number; // km
  elevationGain: number; // meters
  elevationLoss: number; // meters
  elevations: { distance: number; elevation: number }[];
  checkpoints: {
    name: string;
    description: string | null;
    lat: number;
    lon: number;
    distanceKm: number;
    sortOrder: number;
  }[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null;
}

interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
}

export function parseGpx(gpxString: string): GpxData {
  // Simple XML regex-based parser for GPX trackpoints
  const points: GpxPoint[] = [];
  const waypointRaw: { lat: number; lon: number; name: string; description: string | null }[] = [];
  const trkptRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;

  let match;
  while ((match = trkptRegex.exec(gpxString)) !== null) {
    const latLon = parseLatLonFromAttrs(match[1]);
    if (!latLon) continue;

    const eleMatch = match[2].match(/<ele>([^<]+)<\/ele>/);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
    points.push({ lat: latLon.lat, lon: latLon.lon, ele: isNaN(ele) ? 0 : ele });
  }

  if (points.length === 0) {
    // Try route points (rtept)
    const rteptRegex = /<rtept\b([^>]*)>([\s\S]*?)<\/rtept>/gi;
    while ((match = rteptRegex.exec(gpxString)) !== null) {
      const latLon = parseLatLonFromAttrs(match[1]);
      if (!latLon) continue;

      const eleMatch = match[2].match(/<ele>([^<]+)<\/ele>/);
      const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
      points.push({ lat: latLon.lat, lon: latLon.lon, ele: isNaN(ele) ? 0 : ele });
    }
  }

  const wptRegex = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/gi;
  while ((match = wptRegex.exec(gpxString)) !== null) {
    const latLon = parseLatLonFromAttrs(match[1]);
    if (!latLon) continue;

    const inner = match[2] ?? "";
    const nameMatch = inner.match(/<name>([\s\S]*?)<\/name>/i);
    const descMatch = inner.match(/<desc>([\s\S]*?)<\/desc>/i);
    waypointRaw.push({
      lat: latLon.lat,
      lon: latLon.lon,
      name: decodeXmlText(nameMatch?.[1] ?? "").trim(),
      description: (() => {
        const desc = decodeXmlText(descMatch?.[1] ?? "").trim();
        return desc ? desc : null;
      })(),
    });
  }

  // Fallback for GPX variants that store control points as rtept metadata
  const rteCpRegex = /<rtept\b([^>]*)>([\s\S]*?)<\/rtept>/gi;
  while ((match = rteCpRegex.exec(gpxString)) !== null) {
    const latLon = parseLatLonFromAttrs(match[1]);
    if (!latLon) continue;

    const inner = match[2] ?? "";
    const nameMatch = inner.match(/<name>([\s\S]*?)<\/name>/i);
    const descMatch = inner.match(/<desc>([\s\S]*?)<\/desc>/i);
    const cmtMatch = inner.match(/<cmt>([\s\S]*?)<\/cmt>/i);
    const name = decodeXmlText(nameMatch?.[1] ?? "").trim();
    const desc = decodeXmlText(descMatch?.[1] ?? "").trim();
    const cmt = decodeXmlText(cmtMatch?.[1] ?? "").trim();

    // Only treat rtept as a checkpoint when metadata exists
    if (!name && !desc && !cmt) continue;

    waypointRaw.push({
      lat: latLon.lat,
      lon: latLon.lon,
      name,
      description: desc || cmt || null,
    });
  }

  // Calculate distance
  let totalDistance = 0;
  let totalGain = 0;
  let totalLoss = 0;
  const elevations: { distance: number; elevation: number }[] = [];
  const cumulativeDistanceKm: number[] = [];
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    if (i > 0) {
      const prev = points[i - 1];
      totalDistance += haversine(prev.lat, prev.lon, pt.lat, pt.lon);

      const eleDiff = pt.ele - prev.ele;
      if (eleDiff > 0) totalGain += eleDiff;
      else totalLoss += Math.abs(eleDiff);
    }

    elevations.push({ distance: totalDistance, elevation: pt.ele });
    cumulativeDistanceKm.push(totalDistance);

    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lon < minLng) minLng = pt.lon;
    if (pt.lon > maxLng) maxLng = pt.lon;
  }

  const coordinates = points.map((p) => [p.lon, p.lat]);

  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features:
      coordinates.length > 1
        ? [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates,
              },
              properties: {},
            },
          ]
        : [],
  };

  const bounds =
    minLat !== Infinity ? { minLat, maxLat, minLng, maxLng } : null;

  const checkpoints = waypointRaw
    .map((wp, idx) => {
      const nearestDistanceKm =
        points.length > 0
          ? cumulativeDistanceKm[nearestPointIndex(points, wp.lat, wp.lon)]
          : 0;

      return {
        name: wp.name || `CP ${idx + 1}`,
        description: wp.description,
        lat: wp.lat,
        lon: wp.lon,
        distanceKm: Math.round(nearestDistanceKm * 10) / 10,
        sortOrder: idx,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((cp, idx) => ({ ...cp, sortOrder: idx }));

  return {
    geojson,
    distance: Math.round(totalDistance * 10) / 10,
    elevationGain: Math.round(totalGain),
    elevationLoss: Math.round(totalLoss),
    elevations,
    checkpoints,
    bounds,
  };
}

export function sampleElevations(
  elevations: { distance: number; elevation: number }[],
  maxPoints = 10000
): { distance: number; elevation: number }[] {
  if (elevations.length <= maxPoints) {
    return elevations.map((p) => ({
      distance: Math.round(p.distance * 100) / 100,
      elevation: Math.round(p.elevation * 10) / 10,
    }));
  }

  const step = (elevations.length - 1) / (maxPoints - 1);
  const sampled: { distance: number; elevation: number }[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    const p = elevations[idx];
    sampled.push({
      distance: Math.round(p.distance * 100) / 100,
      elevation: Math.round(p.elevation * 10) / 10,
    });
  }
  return sampled;
}

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestPointIndex(points: GpxPoint[], lat: number, lon: number): number {
  let minIdx = 0;
  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const d = haversine(lat, lon, pt.lat, pt.lon);
    if (d < minDistance) {
      minDistance = d;
      minIdx = i;
    }
  }

  return minIdx;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function parseLatLonFromAttrs(attrs: string): { lat: number; lon: number } | null {
  const latMatch = attrs.match(/\blat=["']([^"']+)["']/i);
  const lonMatch = attrs.match(/\blon=["']([^"']+)["']/i);
  if (!latMatch || !lonMatch) return null;

  const lat = parseFloat(latMatch[1]);
  const lon = parseFloat(lonMatch[1]);
  if (isNaN(lat) || isNaN(lon)) return null;

  return { lat, lon };
}
