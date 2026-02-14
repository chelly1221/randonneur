export interface GpxData {
  geojson: GeoJSON.FeatureCollection;
  distance: number; // km
  elevationGain: number; // meters
  elevationLoss: number; // meters
  elevations: { distance: number; elevation: number }[];
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
  const trkptRegex =
    /<trkpt\s+lat=["']([^"']+)["']\s+lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;

  let match;
  while ((match = trkptRegex.exec(gpxString)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
    if (!isNaN(lat) && !isNaN(lon)) {
      points.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
    }
  }

  if (points.length === 0) {
    // Try route points (rtept)
    const rteptRegex =
      /<rtept\s+lat=["']([^"']+)["']\s+lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/rtept>/gi;
    while ((match = rteptRegex.exec(gpxString)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
      const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
      }
    }
  }

  // Calculate distance
  let totalDistance = 0;
  let totalGain = 0;
  let totalLoss = 0;
  const elevations: { distance: number; elevation: number }[] = [];
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

  return {
    geojson,
    distance: Math.round(totalDistance * 10) / 10,
    elevationGain: Math.round(totalGain),
    elevationLoss: Math.round(totalLoss),
    elevations,
    bounds,
  };
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
