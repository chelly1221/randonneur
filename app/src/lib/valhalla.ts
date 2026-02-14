const VALHALLA_URL = process.env.VALHALLA_URL ?? "http://valhalla:8002";

interface ValhallaLocation {
  lat: number;
  lon: number;
}

interface ValhallaRouteResponse {
  trip: {
    legs: {
      shape: string;
      summary: {
        length: number;
        time: number;
      };
      maneuvers: {
        instruction: string;
        length: number;
        time: number;
        type: number;
        begin_shape_index: number;
        end_shape_index: number;
      }[];
    }[];
    summary: {
      length: number;
      time: number;
    };
  };
}

export async function getRoute(
  locations: ValhallaLocation[]
): Promise<ValhallaRouteResponse> {
  const response = await fetch(`${VALHALLA_URL}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: locations.map((l) => ({ lat: l.lat, lon: l.lon })),
      costing: "bicycle",
      units: "kilometers",
      language: "ko-KR",
    }),
  });

  if (!response.ok) {
    throw new Error(`Valhalla route error: ${response.statusText}`);
  }

  return response.json();
}

export async function traceRoute(
  shape: { lat: number; lon: number }[]
): Promise<ValhallaRouteResponse> {
  const response = await fetch(`${VALHALLA_URL}/trace_route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shape,
      costing: "bicycle",
      shape_match: "map_snap",
      units: "kilometers",
      language: "ko-KR",
    }),
  });

  if (!response.ok) {
    throw new Error(`Valhalla trace error: ${response.statusText}`);
  }

  return response.json();
}

// Decode Valhalla's encoded polyline (precision 6)
export function decodePolyline(
  encoded: string,
  precision = 6
): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}
