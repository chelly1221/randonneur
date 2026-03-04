/**
 * Audax South Africa Super Randonnee Scraper
 *
 * Fetches the SR Afrique du Sud permanent course from https://audaxsa.co.za/sr-afrique-du-sud/
 * and syncs it into the local courses table with route data from RideWithGPS.
 *
 * The page lists one Super Randonnee course: SR Afrique du Sud, a 600km route
 * with 10,000m of climbing through the Western Cape mountains (10 mountain passes).
 *
 * Flow:
 * 1. Fetch the SR page from audaxsa.co.za
 * 2. Extract/validate RideWithGPS route URL from the HTML
 * 3. Fetch route JSON from RideWithGPS public API
 * 4. Build GPX from track_points, parse geometry/elevation, upload to MinIO
 * 5. Create or update course record
 *
 * Note: RideWithGPS .gpx download returns 401 (requires login).
 * The .json endpoint is public and contains full track_points data.
 * We build GPX from the JSON track_points array.
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const SR_PAGE_URL = "https://audaxsa.co.za/sr-afrique-du-sud/";

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

/** Parsed route data from RWGPS JSON */
interface RwgpsRouteData {
  trackPoints: RwgpsTrackPoint[];
  elevationGain: number;
  elevationLoss: number;
  name: string;
}

/**
 * Known route data for the SR Afrique du Sud.
 * Supplements what we extract from the HTML page.
 * Source: manually verified from the official page and RWGPS route.
 */
const KNOWN_ROUTES: Record<string, {
  name: string;
  distanceKm: number;
  elevationM: number;
  startLocation: string;
  endLocation: string;
  region: string;
  rwgpsRouteId: string;
  openRunnerUrl: string;
  description: string;
}> = {
  "sr-afrique-du-sud": {
    name: "SR Afrique du Sud",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Western Cape",
    endLocation: "Western Cape",
    region: "Western Cape",
    rwgpsRouteId: "35909642",
    openRunnerUrl: "https://www.openrunner.com/r/12994076",
    description: "South Africa's ACP-approved Super Randonnee. 600km with 10,000 meters of climbing through 10 mountain passes in the Western Cape. Approximately 10% gravel sections. Self-sufficient, no support vehicles allowed. Time limit: 60hrs (Randonneur) or 75km/day (Tourist).",
  },
};

/**
 * HTTP GET via Node https module (IPv4 forced for Docker compatibility).
 */
function httpsGet(url: string, timeout = 30000): Promise<string> {
  // eslint-disable-next-line no-eval
  const httpsModule = eval("require")("https") as {
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
    const req = httpsModule.get(
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
            : `https://${new URL(url).host}${location}`;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse the SR page HTML to extract/validate the RideWithGPS route URL.
 * Returns the RWGPS route ID if found on the page, or null.
 */
function parsePageForRwgpsId(html: string): string | null {
  const match = html.match(/ridewithgps\.com\/routes\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Parse the SR page HTML to extract the OpenRunner URL if present.
 */
function parsePageForOpenRunnerUrl(html: string): string | null {
  const match = html.match(/https?:\/\/(?:www\.)?openrunner\.com\/r\/\d+/);
  return match ? match[0] : null;
}

/**
 * Fetch route data from RideWithGPS public JSON API.
 */
async function fetchRwgpsRouteJson(routeId: string): Promise<RwgpsRouteData | null> {
  const url = `https://ridewithgps.com/routes/${routeId}.json`;

  try {
    const json = await httpsGet(url, 60000);
    const data = JSON.parse(json);

    if (!data.track_points || !Array.isArray(data.track_points) || data.track_points.length === 0) {
      return null;
    }

    return {
      trackPoints: data.track_points as RwgpsTrackPoint[],
      elevationGain: data.elevation_gain ?? 0,
      elevationLoss: data.elevation_loss ?? 0,
      name: data.name ?? "",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`RWGPS JSON failed for ${routeId}: ${msg}`);
  }
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build elevation profile and GeoJSON from RWGPS track points.
 */
function processTrackPoints(points: RwgpsTrackPoint[]): {
  elevationProfile: { distance: number; elevation: number }[];
  geojsonGeometry: object | null;
  elevationGainCalc: number;
} {
  if (points.length === 0) {
    return { elevationProfile: [], geojsonGeometry: null, elevationGainCalc: 0 };
  }

  // Build elevation profile (distance in km)
  const rawElevations = points.map((pt) => ({
    distance: pt.d / 1000,
    elevation: pt.e,
  }));
  const elevationProfile = sampleElevations(rawElevations, 500);

  // Build GeoJSON LineString
  const coordinates = points.map((pt) => [pt.x, pt.y]);
  const geojsonGeometry =
    coordinates.length > 1
      ? { type: "LineString", coordinates }
      : null;

  // Calculate elevation gain from track points
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].e - points[i - 1].e;
    if (diff > 0) gain += diff;
  }

  return { elevationProfile, geojsonGeometry, elevationGainCalc: Math.round(gain) };
}

/**
 * Fetch RWGPS route data and return all processed fields.
 */
async function fetchAndProcessRoute(routeId: string, slug: string): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const routeData = await fetchRwgpsRouteJson(routeId);
  if (!routeData || routeData.trackPoints.length === 0) return null;

  const { elevationProfile, geojsonGeometry, elevationGainCalc } =
    processTrackPoints(routeData.trackPoints);

  // Use RWGPS elevation_gain if available, otherwise our calculation
  const elevationM =
    routeData.elevationGain > 0
      ? Math.round(routeData.elevationGain)
      : elevationGainCalc;

  // Build GPX and upload to MinIO
  let gpxFileKey: string | null = null;
  try {
    const gpxString = buildGpxFromTrackPoints(
      routeData.trackPoints,
      routeData.name || `ZA-${slug}`
    );
    const gpxBuffer = Buffer.from(gpxString, "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/za-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical — geometry and elevation still available without MinIO upload
  }

  return { gpxFileKey, elevationM, elevationProfile, geojsonGeometry };
}

/**
 * Run the Audax South Africa SR scraper.
 */
export async function runAudaxSaScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch SR page to validate/extract data
    console.log("[audax-sa] Fetching SR Afrique du Sud page...");
    const pageHtml = await httpsGet(SR_PAGE_URL);

    // Step 2: Extract RWGPS route ID from page
    const pageRwgpsId = parsePageForRwgpsId(pageHtml);
    const pageOpenRunnerUrl = parsePageForOpenRunnerUrl(pageHtml);
    console.log(`[audax-sa] Page RWGPS ID: ${pageRwgpsId}, OpenRunner: ${pageOpenRunnerUrl}`);

    // Step 3: Process known routes
    const slugs = Object.keys(KNOWN_ROUTES);
    result.total = slugs.length;

    for (const slug of slugs) {
      try {
        const known = KNOWN_ROUTES[slug];
        const externalId = `za-sr-${slug}`;

        // Use the RWGPS ID from the page if available, otherwise fall back to known data
        const rwgpsRouteId = pageRwgpsId || known.rwgpsRouteId;
        const openRunnerUrl = pageOpenRunnerUrl || known.openRunnerUrl;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "audax-sa",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== known.name) updates.name = known.name;
          if (existing.distanceKm !== known.distanceKm)
            updates.distanceKm = known.distanceKm;
          if (existing.region !== known.region) updates.region = known.region;
          if (existing.startLocation !== known.startLocation)
            updates.startLocation = known.startLocation;
          if (existing.endLocation !== known.endLocation)
            updates.endLocation = known.endLocation;
          if (known.description && existing.description !== known.description)
            updates.description = known.description;

          // Update officialPageUrl if OpenRunner URL changed
          const expectedOfficialUrl = openRunnerUrl || SR_PAGE_URL;
          if (existing.officialPageUrl !== expectedOfficialUrl)
            updates.officialPageUrl = expectedOfficialUrl;

          // Re-download route data if GPX is missing
          if (!existing.gpxFileKey && rwgpsRouteId) {
            try {
              await sleep(500);
              const routeResult = await fetchAndProcessRoute(rwgpsRouteId, slug);
              if (routeResult) {
                if (routeResult.gpxFileKey) updates.gpxFileKey = routeResult.gpxFileKey;
                if (routeResult.elevationM > 0) updates.elevationM = routeResult.elevationM;
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
              result.errors.push(
                `Route fetch failed for ${slug}: ${msg}`
              );
            }
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
        let gpxFileKey: string | null = null;
        let elevationM = known.elevationM;
        let elevationProfile: { distance: number; elevation: number }[] | null = null;
        let geojsonGeometry: object | null = null;

        if (rwgpsRouteId) {
          await sleep(500);
          try {
            console.log(`[audax-sa] Fetching RWGPS route ${rwgpsRouteId} for ${known.name}...`);
            const routeResult = await fetchAndProcessRoute(rwgpsRouteId, slug);
            if (routeResult) {
              gpxFileKey = routeResult.gpxFileKey;
              if (routeResult.elevationM > 0) elevationM = routeResult.elevationM;
              elevationProfile = routeResult.elevationProfile;
              geojsonGeometry = routeResult.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`Route data failed for ${slug}: ${msg}`);
          }
        }

        // Build course number
        const courseNumber = `ZA-${slug}`;

        // Official page URL (prefer OpenRunner for direct route viewing)
        const officialPageUrl = openRunnerUrl || SR_PAGE_URL;

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        const newCourse = await prisma.course.create({
          data: {
            courseNumber,
            name: known.name,
            distanceKm: known.distanceKm,
            elevationM,
            startLocation: known.startLocation,
            endLocation: known.endLocation,
            region: known.region,
            category: ["superrandonnee"],
            tags: ["audax-sa"],
            description: known.description || null,
            officialPageUrl,
            gpxFileKey,
            country: "ZA",
            sourceType: "audax-sa",
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
        console.log(`[audax-sa] Created: ${known.name} (${known.distanceKm}km, ${elevationM}m)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Route ${slug}: ${msg}`);
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
      where: { key: "ZA_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "ZA_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "ZA_LAST_SCRAPE_RESULT" },
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
        key: "ZA_LAST_SCRAPE_RESULT",
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
