import { generateUniqueCourseSlug } from "./slug";

/**
 * Alberta Randonneurs Permanent Course Scraper
 *
 * Fetches permanent courses from https://www.albertarandonneurs.com/?page_id=54
 * and syncs them into the local courses table with route data from RideWithGPS.
 *
 * Page structure:
 *   - Routes are organized by distance (73km–1000km) and region (Calgary,
 *     Edmonton, Medicine Hat, Red Deer, Fort McMurray, Lethbridge)
 *   - Each route links to a detail page (?page_id={N})
 *   - Detail pages contain RideWithGPS route URLs and sometimes GPX file links
 *
 * Flow:
 * 1. Fetch the listing page and parse route links (name, distance, region, page_id)
 * 2. For each route, fetch the detail page
 * 3. Extract RideWithGPS URL (or GPX file link) from detail page
 * 4. Fetch route JSON from RideWithGPS public API (or download GPX)
 * 5. Build GPX from track_points, parse geometry/elevation, upload to MinIO
 * 6. Create or update course record
 */

import { prisma } from "./db";
import { parseGpx, sampleElevations } from "./gpx";

const LISTING_URL = "https://www.albertarandonneurs.com/?page_id=54";
const BASE_URL = "https://www.albertarandonneurs.com";

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

/** RWGPS JSON track point */
interface RwgpsTrackPoint {
  x: number; // longitude
  y: number; // latitude
  e: number; // elevation (meters)
  d: number; // cumulative distance (meters)
}

interface ParsedRoute {
  pageId: string; // WordPress page ID
  name: string; // Route name (e.g. "Elbow Falls 200")
  distanceKm: number; // Extracted from section header
  region: string; // Calgary, Edmonton, Medicine Hat, Red Deer, Fort McMurray, Lethbridge
  startLocation: string; // From second table column
  detailUrl: string; // Full URL to detail page
  slug: string; // URL-safe slug for unique identification
}

/**
 * HTTP GET via Node https/http module (IPv4 forced for Docker compatibility).
 */
function httpsGet(url: string, timeout = 30000): Promise<string> {
  const isHttps = url.startsWith("https");
  // eslint-disable-next-line no-eval
  const mod = eval("require")(isHttps ? "https" : "http") as {
    get: (
      url: string,
      opts: Record<string, unknown>,
      cb: (res: {
        statusCode?: number;
        headers: Record<string, string>;
        resume: () => void;
        setEncoding: (e: string) => void;
        on: (e: string, cb: (d?: string) => void) => void;
      }) => void
    ) => {
      on: (e: string, cb: (err?: Error) => void) => void;
      destroy: (err?: Error) => void;
    };
  };

  return new Promise((resolve, reject) => {
    const req = mod.get(
      url,
      {
        family: 4,
        headers: { "User-Agent": "Audax-3chan/1.0" },
        timeout,
      },
      (res) => {
        // Follow redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const location = res.headers.location;
          const absolute = location.startsWith("http")
            ? location
            : `${new URL(url).origin}${location}`;
          httpsGet(absolute, timeout).then(resolve, reject);
          res.resume();
          return;
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (chunks += c));
        res.on("end", () => resolve(chunks));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timeout")));
  });
}

function httpGetBuffer(url: string, timeout = 30000): Promise<Buffer> {
  const isHttps = url.startsWith("https");
  // eslint-disable-next-line no-eval
  const mod = eval("require")(isHttps ? "https" : "http") as {
    get: (
      url: string,
      opts: Record<string, unknown>,
      cb: (res: {
        statusCode?: number;
        headers: Record<string, string>;
        resume: () => void;
        on: (e: string, cb: (d?: Buffer) => void) => void;
      }) => void
    ) => {
      on: (e: string, cb: (err?: Error) => void) => void;
      destroy: (err?: Error) => void;
    };
  };

  return new Promise((resolve, reject) => {
    const req = mod.get(
      url,
      {
        family: 4,
        headers: { "User-Agent": "Audax-3chan/1.0" },
        timeout,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const location = res.headers.location;
          const absolute = location.startsWith("http")
            ? location
            : `${new URL(url).origin}${location}`;
          httpGetBuffer(absolute, timeout).then(resolve, reject);
          res.resume();
          return;
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => { if (c) chunks.push(c); });
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timeout")));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Make a URL-safe slug from a route name.
 */
function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Parse the listing page HTML to extract route entries.
 *
 * The page is structured with distance section headings (e.g. "200 km Rides")
 * and region sub-headings (Calgary, Edmonton, etc.), followed by 2-column tables
 * where col1 = route name (linked), col2 = start location.
 */
function parseListingPage(html: string): ParsedRoute[] {
  const routes: ParsedRoute[] = [];
  const seen = new Set<string>();

  // Handle table rows: <tr><td><a title="..." href="/?page_id=X">Name</a></td><td>Start Location</td>
  // The <a> tag may have a title attribute before href
  const tableRowRegex = /<tr[^>]*>\s*<td[^>]*><a\s+[^>]*href=["'][^"']*\?page_id=(\d+)["'][^>]*>([\s\S]*?)<\/a><\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;

  // First, extract section headers to build a position -> context map
  interface SectionMarker {
    position: number;
    distance?: number;
    region?: string;
  }
  const markers: SectionMarker[] = [];

  // Distance pattern in headings: "200 km Rides", "73 km", etc.
  const headingRegex = /<(?:h[1-6]|strong|b)[^>]*>([\s\S]*?)<\/(?:h[1-6]|strong|b)>/gi;
  let headMatch;
  while ((headMatch = headingRegex.exec(html)) !== null) {
    const text = headMatch[1].replace(/<[^>]+>/g, "").trim();

    // Check for distance header
    const distMatch = text.match(/(\d+)\s*km/i);
    if (distMatch) {
      markers.push({ position: headMatch.index, distance: parseInt(distMatch[1], 10) });
    }

    // Check for region header
    const regionNames = ["Calgary", "Edmonton", "Medicine Hat", "Red Deer", "Fort McMurray", "Lethbridge", "All"];
    for (const r of regionNames) {
      if (text.includes(r)) {
        markers.push({ position: headMatch.index, region: r });
        break;
      }
    }
  }

  // Now extract all route links from table rows
  let trMatch;
  while ((trMatch = tableRowRegex.exec(html)) !== null) {
    const pageId = trMatch[1];
    const rawName = trMatch[2].replace(/<[^>]+>/g, "").trim();
    const rawStartLocation = trMatch[3].replace(/<[^>]+>/g, "").trim();

    const name = decodeHtmlEntities(rawName);
    const startLocation = decodeHtmlEntities(rawStartLocation);

    if (!name || name.length < 2) continue;
    if (!pageId) continue;

    // Skip TBA/TBD entries and non-route entries
    if (name.toUpperCase() === "TBA" || name.toUpperCase().startsWith("TBD")) continue;
    if (/^\d{4}\s+(Results|Clothing|Calendar)/i.test(name)) continue;
    if (/Ride Report/i.test(name)) continue;

    // Determine context from markers
    const pos = trMatch.index;
    let distance = 0;
    let region = "Alberta";

    for (const marker of markers) {
      if (marker.position < pos) {
        if (marker.distance !== undefined) distance = marker.distance;
        if (marker.region !== undefined) region = marker.region;
      }
    }

    // Also try extracting distance from the route name if not from header
    if (distance === 0) {
      const nameDistMatch = name.match(/\b(\d{2,5})\b/g);
      if (nameDistMatch && nameDistMatch.length > 0) {
        distance = parseInt(nameDistMatch[nameDistMatch.length - 1], 10);
      }
    }

    const slug = makeSlug(name);
    const dedupeKey = `${pageId}-${slug}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    routes.push({
      pageId,
      name,
      distanceKm: distance,
      region: region === "All" ? "Alberta" : region,
      startLocation: startLocation || region,
      detailUrl: `${BASE_URL}/?page_id=${pageId}`,
      slug,
    });
  }

  return routes;
}

/**
 * Extract RideWithGPS route URL from a detail page.
 */
function extractRwgpsUrl(html: string): string | null {
  // Look for RideWithGPS route/trip URL
  const rwgpsMatch = html.match(
    /https?:\/\/ridewithgps\.com\/(?:routes|trips)\/(\d+)/i
  );
  if (rwgpsMatch) return rwgpsMatch[0];

  // Fallback: check href attributes
  const linkMatch = html.match(
    /href=["'](https?:\/\/ridewithgps\.com\/[^"']+)["']/i
  );
  if (linkMatch) return linkMatch[1];

  return null;
}

/**
 * Extract GPX file URL from a detail page.
 * Alberta Randonneurs hosts GPX files at /gps/{filename}.gpx
 */
function extractGpxUrl(html: string): string | null {
  const gpxMatch = html.match(
    /(?:href=["'])([^"']*\.gpx)["']/i
  );
  if (gpxMatch) {
    const url = gpxMatch[1];
    if (url.startsWith("http")) return url;
    return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  // Also check for /gps/ path references
  const gpsMatch = html.match(
    /(?:href=["'])\/?gps\/([^"']+\.gpx)["']/i
  );
  if (gpsMatch) {
    return `${BASE_URL}/gps/${gpsMatch[1]}`;
  }

  return null;
}

/**
 * Extract description text from a detail page.
 */
function extractDescription(html: string): string | null {
  // Look for description in the main content area
  // Alberta Randonneurs detail pages typically have a paragraph of text after the heading
  const contentMatch = html.match(
    /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (!contentMatch) return null;

  const content = contentMatch[1];

  // Get the first meaningful paragraph
  const pMatch = content.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  if (!pMatch) return null;

  for (const p of pMatch) {
    const text = p.replace(/<[^>]+>/g, "").trim();
    // Skip short texts, form elements, navigation
    if (text.length > 20 && !text.includes("Start Time") && !text.includes("Brevet Card")) {
      return decodeHtmlEntities(text);
    }
  }

  return null;
}

/**
 * Extract RWGPS route ID from a URL.
 */
function extractRwgpsRouteId(url: string): string | null {
  const match = url.match(/ridewithgps\.com\/(?:routes|trips)\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Build GPX XML string from RWGPS track points.
 */
function buildGpxFromTrackPoints(
  points: RwgpsTrackPoint[],
  name: string
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Audax-3chan via RideWithGPS"',
    '  xmlns="http://www.topografix.com/GPX/1/1">',
    "  <trk>",
    `    <name>${escapeXml(name)}</name>`,
    "    <trkseg>",
  ];

  for (const pt of points) {
    lines.push(
      `      <trkpt lat="${pt.y}" lon="${pt.x}"><ele>${pt.e}</ele></trkpt>`
    );
  }

  lines.push("    </trkseg>", "  </trk>", "</gpx>");
  return lines.join("\n");
}

/**
 * Fetch route data from RideWithGPS public JSON API.
 */
async function fetchRwgpsRouteJson(
  routeId: string
): Promise<{
  trackPoints: RwgpsTrackPoint[];
  elevationGain: number;
  distance: number;
  name: string;
} | null> {
  const url = `https://ridewithgps.com/routes/${routeId}.json`;

  try {
    const json = await httpsGet(url, 60000);
    const data = JSON.parse(json);

    if (
      !data.track_points ||
      !Array.isArray(data.track_points) ||
      data.track_points.length === 0
    ) {
      return null;
    }

    return {
      trackPoints: data.track_points as RwgpsTrackPoint[],
      elevationGain: data.elevation_gain ?? 0,
      distance: data.distance ?? 0,
      name: data.name ?? "",
    };
  } catch {
    // Try trips endpoint if routes fails
    try {
      const tripsUrl = `https://ridewithgps.com/trips/${routeId}.json`;
      const json = await httpsGet(tripsUrl, 60000);
      const data = JSON.parse(json);

      if (!data.trip?.track_points || data.trip.track_points.length === 0) {
        return null;
      }

      return {
        trackPoints: data.trip.track_points as RwgpsTrackPoint[],
        elevationGain: data.trip?.elevation_gain ?? 0,
        distance: data.trip?.distance ?? 0,
        name: data.trip?.name ?? "",
      };
    } catch {
      return null;
    }
  }
}

/**
 * Process RWGPS track points into elevation profile, geometry, and elevation gain.
 */
function processTrackPoints(points: RwgpsTrackPoint[]): {
  elevationProfile: { distance: number; elevation: number }[];
  geojsonGeometry: object | null;
  elevationGainCalc: number;
} {
  if (points.length === 0) {
    return { elevationProfile: [], geojsonGeometry: null, elevationGainCalc: 0 };
  }

  const rawElevations = points.map((pt) => ({
    distance: pt.d / 1000,
    elevation: pt.e,
  }));
  const elevationProfile = sampleElevations(rawElevations, 500);

  const coordinates = points.map((pt) => [pt.x, pt.y]);
  const geojsonGeometry =
    coordinates.length > 1 ? { type: "LineString", coordinates } : null;

  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].e - points[i - 1].e;
    if (diff > 0) gain += diff;
  }

  return { elevationProfile, geojsonGeometry, elevationGainCalc: Math.round(gain) };
}

/**
 * Fetch RWGPS route, build GPX, upload to MinIO, return processed data.
 */
async function fetchAndProcessRwgps(
  rwgpsUrl: string,
  slug: string,
  routeName: string
): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  distanceKm: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const routeId = extractRwgpsRouteId(rwgpsUrl);
  if (!routeId) return null;

  const routeData = await fetchRwgpsRouteJson(routeId);
  if (!routeData || routeData.trackPoints.length === 0) return null;

  const { elevationProfile, geojsonGeometry, elevationGainCalc } =
    processTrackPoints(routeData.trackPoints);

  const elevationM =
    routeData.elevationGain > 0
      ? Math.round(routeData.elevationGain)
      : elevationGainCalc;

  const distanceKm =
    routeData.distance > 0
      ? Math.round((routeData.distance / 1000) * 10) / 10
      : routeData.trackPoints.length > 0
        ? Math.round((routeData.trackPoints[routeData.trackPoints.length - 1].d / 1000) * 10) / 10
        : 0;

  // Build GPX and upload to MinIO
  let gpxFileKey: string | null = null;
  try {
    const gpxString = buildGpxFromTrackPoints(
      routeData.trackPoints,
      routeName || routeData.name || slug
    );
    const gpxBuffer = Buffer.from(gpxString, "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/ab-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical — geometry and elevation still available without MinIO upload
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Download and process a GPX file directly from the Alberta site.
 */
async function downloadAndProcessGpx(
  gpxUrl: string,
  slug: string
): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  distanceKm: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const gpxBuffer = await httpGetBuffer(gpxUrl, 60000);
  const gpxString = gpxBuffer.toString("utf8");

  if (!gpxString.includes("<trkpt") && !gpxString.includes("<rtept") && !gpxString.includes("<wpt")) {
    return null;
  }

  const parsed = parseGpx(gpxString);

  if (!parsed.geojson?.features?.length || !parsed.geojson.features[0]?.geometry) {
    return null;
  }

  const geojsonGeometry = parsed.geojson.features[0].geometry;
  const elevationProfile = sampleElevations(parsed.elevations, 500);
  const elevationM = Math.round(parsed.elevationGain);
  const distanceKm = Math.round(parsed.distance * 10) / 10;

  // Upload GPX to MinIO
  let gpxFileKey: string | null = null;
  try {
    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/ab-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Run the Alberta Randonneurs permanent course scraper.
 */
export async function runAlbertaRandonneursScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch listing page
    console.log("[alberta] Fetching ride database listing...");
    const listingHtml = await httpsGet(LISTING_URL);

    // Step 2: Parse route links
    const routes = parseListingPage(listingHtml);
    result.total = routes.length;
    console.log(`[alberta] Found ${routes.length} routes on listing page`);

    if (routes.length === 0) {
      result.errors.push(
        "No routes found on listing page — HTML structure may have changed"
      );
      return result;
    }

    // Step 3: Process each route
    for (const route of routes) {
      try {
        const externalId = `ab-${route.pageId}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "alberta-randonneurs",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== route.name) updates.name = route.name;
          if (route.distanceKm > 0 && existing.distanceKm !== route.distanceKm) {
            updates.distanceKm = route.distanceKm;
          }

          // Fetch detail page to check for updates
          let detailRwgpsUrl: string | null = null;
          let detailGpxUrl: string | null = null;
          try {
            await sleep(500);
            const detailHtml = await httpsGet(route.detailUrl);
            detailRwgpsUrl = extractRwgpsUrl(detailHtml);
            detailGpxUrl = extractGpxUrl(detailHtml);
          } catch {
            // Non-critical
          }

          if (detailRwgpsUrl && existing.officialPageUrl !== detailRwgpsUrl) {
            updates.officialPageUrl = detailRwgpsUrl;
          }

          // Re-download route data if GPX is missing
          if (!existing.gpxFileKey) {
            const rwgpsUrl = detailRwgpsUrl || existing.officialPageUrl;
            try {
              await sleep(500);
              let routeResult = null;

              if (rwgpsUrl?.includes("ridewithgps.com")) {
                routeResult = await fetchAndProcessRwgps(
                  rwgpsUrl,
                  route.slug,
                  route.name
                );
              } else if (detailGpxUrl) {
                routeResult = await downloadAndProcessGpx(
                  detailGpxUrl,
                  route.slug
                );
              }

              if (routeResult) {
                if (routeResult.gpxFileKey) updates.gpxFileKey = routeResult.gpxFileKey;
                if (routeResult.elevationM > 0) updates.elevationM = routeResult.elevationM;
                if (routeResult.distanceKm > 0 && !existing.distanceKm)
                  updates.distanceKm = routeResult.distanceKm;
                if (routeResult.elevationProfile)
                  updates.elevationProfile = routeResult.elevationProfile;

                if (routeResult.geojsonGeometry) {
                  try {
                    await prisma.$executeRawUnsafe(
                      `UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid`,
                      JSON.stringify(routeResult.geojsonGeometry),
                      existing.id
                    );
                  } catch {
                    // Non-critical
                  }
                }
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              result.errors.push(`Route data re-fetch failed for ${route.slug}: ${msg}`);
            }
          }

          // Regenerate slug if name or distance changed
          if (updates.name !== undefined || updates.distanceKm !== undefined) {
            updates.slug = await generateUniqueCourseSlug(
              (updates.name as string) ?? existing.name,
              (updates.distanceKm as number) ?? existing.distanceKm,
              existing.courseNumber ?? "",
              existing.id
            );
          }

          if (Object.keys(updates).length > 0) {
            await prisma.course.update({
              where: { id: existing.id },
              data: updates,
            });
            result.updated++;
          } else {
            result.skipped++;
          }
          continue;
        }

        // === New course ===

        // Rate limit before fetching detail page
        await sleep(500);

        // Step 3a: Fetch detail page for RideWithGPS URL and GPX link
        let rwgpsUrl: string | null = null;
        let gpxUrl: string | null = null;
        let description: string | null = null;
        try {
          const detailHtml = await httpsGet(route.detailUrl);
          rwgpsUrl = extractRwgpsUrl(detailHtml);
          gpxUrl = extractGpxUrl(detailHtml);
          description = extractDescription(detailHtml);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(
            `Detail page fetch failed for ${route.slug}: ${msg}`
          );
        }

        // Step 4: Fetch and process route data
        let gpxFileKey: string | null = null;
        let elevationM = 0;
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null = null;
        let geojsonGeometry: object | null = null;

        if (rwgpsUrl && rwgpsUrl.includes("ridewithgps.com")) {
          await sleep(500);

          try {
            const routeResult = await fetchAndProcessRwgps(
              rwgpsUrl,
              route.slug,
              route.name
            );
            if (routeResult) {
              gpxFileKey = routeResult.gpxFileKey;
              elevationM = routeResult.elevationM;
              if (routeResult.distanceKm > 0) distanceKm = routeResult.distanceKm;
              elevationProfile = routeResult.elevationProfile;
              geojsonGeometry = routeResult.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(
              `RWGPS failed for ${route.slug}: ${msg}`
            );
          }
        } else if (gpxUrl) {
          await sleep(500);

          try {
            const gpxData = await downloadAndProcessGpx(gpxUrl, route.slug);
            if (gpxData) {
              gpxFileKey = gpxData.gpxFileKey;
              elevationM = gpxData.elevationM;
              if (gpxData.distanceKm > 0) distanceKm = gpxData.distanceKm;
              elevationProfile = gpxData.elevationProfile;
              geojsonGeometry = gpxData.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(
              `GPX download failed for ${route.slug}: ${msg}`
            );
          }
        }

        // Build course number from page ID
        const courseNumber = `AB-${route.pageId}`;

        // Official page URL
        const officialPageUrl = rwgpsUrl || route.detailUrl;

        // RWGPS route ID for externalId (use page_id-based ID)
        const rwgpsId = rwgpsUrl ? extractRwgpsRouteId(rwgpsUrl) : null;

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        const courseSlug = await generateUniqueCourseSlug(route.name, distanceKm || 0, courseNumber);
        const newCourse = await prisma.course.create({
          data: {
            slug: courseSlug,
            courseNumber,
            name: route.name,
            distanceKm: distanceKm || 0,
            elevationM,
            startLocation: route.startLocation,
            endLocation: route.startLocation, // Most Alberta routes are loops
            region: `Alberta - ${route.region}`,
            category: ["permanent"],
            tags: ["alberta-randonneurs"],
            description,
            officialPageUrl,
            gpxFileKey,
            country: "CA",
            sourceType: "alberta-randonneurs",
            externalId,
            elevationProfile: elevationProfile
              ? (elevationProfile as unknown as undefined)
              : undefined,
          },
        });

        // Set geometry if available
        if (geojsonGeometry) {
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid`,
              JSON.stringify(geojsonGeometry),
              newCourse.id
            );
          } catch {
            // Non-critical
          }
        }

        result.created++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Route ${route.slug}: ${msg}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`Scraper failed: ${msg}`);
  }

  // Save last scrape info
  try {
    const now = new Date();
    await prisma.setting.upsert({
      where: { key: "AB_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "AB_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "AB_LAST_SCRAPE_RESULT" },
      update: {
        value: JSON.stringify({
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors.length,
          total: result.total,
          timestamp: now.toISOString(),
        }),
      },
      create: {
        key: "AB_LAST_SCRAPE_RESULT",
        value: JSON.stringify({
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors.length,
          total: result.total,
          timestamp: now.toISOString(),
        }),
      },
    });
  } catch {
    // Non-critical
  }

  return result;
}
