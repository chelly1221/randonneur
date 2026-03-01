/**
 * Randonneurs.be Permanent Course Scraper
 *
 * Fetches permanent courses from https://randonneurs.be/fr/randonnees-permanentes/
 * and syncs them into the local courses table with route data from RideWithGPS.
 *
 * Flow:
 * 1. Fetch the permanent routes listing page (simple <ul> with <a> links)
 * 2. For each link, fetch the detail page
 * 3. Extract RideWithGPS route URL from the detail page
 * 4. Fetch route JSON from RideWithGPS public API
 * 5. Build GPX from track_points, parse geometry/elevation, upload to MinIO
 * 6. Create or update course record
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const LISTING_URL = "https://randonneurs.be/fr/randonnees-permanentes/";

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

interface RwgpsRouteData {
  trackPoints: RwgpsTrackPoint[];
  elevationGain: number;
  elevationLoss: number;
  distance: number; // meters
  name: string;
}

interface ParsedCourse {
  name: string;
  slug: string;
  detailUrl: string;
}

/**
 * HTTP GET via Node https module (IPv4 forced for Docker compatibility).
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse the listing page to extract course links.
 * Structure: <ul> containing <li><a href="...">Course Name</a></li>
 */
function parseListingPage(html: string): ParsedCourse[] {
  const courses: ParsedCourse[] = [];

  // Find the content area with permanent route links
  // Links follow pattern: https://randonneurs.be/fr/perm-xxx/
  const linkRegex =
    /<a\s+href=["'](https?:\/\/randonneurs\.be\/fr\/(perm-[^"'/]+)\/?)['""][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const detailUrl = match[1];
    const slug = match[2];
    const name = match[3].replace(/<[^>]+>/g, "").trim();

    if (name && slug) {
      courses.push({ name, slug, detailUrl });
    }
  }

  return courses;
}

/**
 * Extract RideWithGPS route URL from a course detail page.
 */
function extractRwgpsUrl(html: string): string | null {
  // Look for RideWithGPS route URL
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
 * Extract RWGPS route ID from a URL.
 */
function extractRwgpsRouteId(url: string): string | null {
  const match = url.match(/ridewithgps\.com\/(?:routes|trips)\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Fetch route data from RideWithGPS public JSON API.
 */
async function fetchRwgpsRouteJson(
  routeId: string
): Promise<RwgpsRouteData | null> {
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
      elevationLoss: data.elevation_loss ?? 0,
      distance: data.distance ?? 0,
      name: data.name ?? "",
    };
  } catch (e) {
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
        elevationLoss: data.trip?.elevation_loss ?? 0,
        distance: data.trip?.distance ?? 0,
        name: data.trip?.name ?? "",
      };
    } catch {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`RWGPS JSON failed for ${routeId}: ${msg}`);
    }
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
async function fetchAndProcessRoute(
  routeUrl: string,
  slug: string
): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  distanceKm: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const routeId = extractRwgpsRouteId(routeUrl);
  if (!routeId) return null;

  const routeData = await fetchRwgpsRouteJson(routeId);
  if (!routeData || routeData.trackPoints.length === 0) return null;

  const { elevationProfile, geojsonGeometry, elevationGainCalc } =
    processTrackPoints(routeData.trackPoints);

  const elevationM =
    routeData.elevationGain > 0
      ? Math.round(routeData.elevationGain)
      : elevationGainCalc;

  // Distance from RWGPS (meters -> km), or calculate from last track point
  const distanceKm =
    routeData.distance > 0
      ? Math.round(routeData.distance / 1000 * 10) / 10
      : routeData.trackPoints.length > 0
        ? Math.round(routeData.trackPoints[routeData.trackPoints.length - 1].d / 1000 * 10) / 10
        : 0;

  // Build GPX and upload to MinIO
  let gpxFileKey: string | null = null;
  try {
    const gpxString = buildGpxFromTrackPoints(
      routeData.trackPoints,
      routeData.name || slug
    );
    const gpxBuffer = Buffer.from(gpxString, "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/be-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    // Non-critical — geometry and elevation still available without MinIO upload
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Run the Randonneurs.be permanent course scraper.
 */
export async function runRandonneursBeScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch listing page
    console.log("[randonneurs-be] Fetching permanent routes listing...");
    const listingHtml = await httpsGet(LISTING_URL);

    // Step 2: Parse course links
    const courses = parseListingPage(listingHtml);
    result.total = courses.length;
    console.log(`[randonneurs-be] Found ${courses.length} permanent courses`);

    if (courses.length === 0) {
      result.errors.push(
        "No courses found on listing page — HTML structure may have changed"
      );
      return result;
    }

    // Step 3: Process each course
    for (const course of courses) {
      try {
        const externalId = `be-${course.slug}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "randonneurs-be",
            externalId,
          },
        });

        if (existing) {
          // Check for updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== course.name) updates.name = course.name;

          // Fetch detail page to check for URL changes
          let detailRouteUrl: string | null = null;
          try {
            await sleep(500);
            const detailHtml = await httpsGet(course.detailUrl);
            detailRouteUrl = extractRwgpsUrl(detailHtml);
          } catch {
            // Non-critical
          }

          if (detailRouteUrl && existing.officialPageUrl !== detailRouteUrl) {
            updates.officialPageUrl = detailRouteUrl;
          }

          // Re-fetch route data if missing or URL changed
          const rwgpsUrl = detailRouteUrl || existing.officialPageUrl;
          const rwgpsChanged =
            detailRouteUrl && existing.officialPageUrl !== detailRouteUrl;
          const needsRouteData = !existing.gpxFileKey || rwgpsChanged;

          if (needsRouteData && rwgpsUrl?.includes("ridewithgps.com")) {
            try {
              await sleep(1000);
              const routeResult = await fetchAndProcessRoute(
                rwgpsUrl,
                course.slug
              );
              if (routeResult) {
                if (routeResult.gpxFileKey)
                  updates.gpxFileKey = routeResult.gpxFileKey;
                if (routeResult.elevationM > 0)
                  updates.elevationM = routeResult.elevationM;
                if (routeResult.distanceKm > 0)
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
              result.errors.push(
                `Route fetch failed for ${course.slug}: ${msg}`
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

        // Rate limit before fetching detail page
        await sleep(500);

        // Step 3a: Fetch detail page for RideWithGPS URL
        let routeUrl: string | null = null;
        try {
          const detailHtml = await httpsGet(course.detailUrl);
          routeUrl = extractRwgpsUrl(detailHtml);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(
            `Detail page fetch failed for ${course.slug}: ${msg}`
          );
        }

        // Step 4: Fetch and process route data from RWGPS
        let gpxFileKey: string | null = null;
        let elevationM = 0;
        let distanceKm = 0;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;

        if (routeUrl && routeUrl.includes("ridewithgps.com")) {
          await sleep(1000);

          try {
            const routeResult = await fetchAndProcessRoute(
              routeUrl,
              course.slug
            );
            if (routeResult) {
              gpxFileKey = routeResult.gpxFileKey;
              elevationM = routeResult.elevationM;
              distanceKm = routeResult.distanceKm;
              elevationProfile = routeResult.elevationProfile;
              geojsonGeometry = routeResult.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(
              `Route data failed for ${course.slug}: ${msg}`
            );
          }
        }

        // Extract designer name from parentheses in course name if present
        let designer: string | null = null;
        const designerMatch = course.name.match(/\(([^)]+)\)\s*$/);
        if (designerMatch) {
          designer = designerMatch[1];
        }

        // Create course
        const newCourse = await prisma.course.create({
          data: {
            courseNumber: `BE-${course.slug.replace(/^perm-/, "").toUpperCase().slice(0, 20)}`,
            name: course.name,
            distanceKm: distanceKm || 0,
            elevationM,
            startLocation: "Belgium",
            endLocation: "Belgium",
            region: "Belgium",
            category: ["permanent"],
            tags: ["randonneurs-be"],
            designer,
            description: null,
            officialPageUrl:
              routeUrl || course.detailUrl,
            gpxFileKey,
            country: "BE",
            sourceType: "randonneurs-be",
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
        result.errors.push(`Course ${course.slug}: ${msg}`);
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
      where: { key: "RANDONNEURS_BE_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: {
        key: "RANDONNEURS_BE_LAST_SCRAPE_DATE",
        value: now.toISOString(),
      },
    });
    await prisma.setting.upsert({
      where: { key: "RANDONNEURS_BE_LAST_SCRAPE_RESULT" },
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
        key: "RANDONNEURS_BE_LAST_SCRAPE_RESULT",
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
