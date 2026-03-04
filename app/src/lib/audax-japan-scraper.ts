/**
 * Audax Japan (AJ) Permanent Course Scraper
 *
 * Fetches the official AJ Permanent course list from:
 *   https://www.audax-japan.org/wp01/wp-content/plugins/ajpermanent/php/ajpermanent.php?category=AJP
 *
 * The API returns a JSON array of ~46 courses from various AJ clubs
 * (Hiroshima, Kanagawa, Kumamoto, Chiba, Fukuoka, Utsunomiya, etc.).
 *
 * For each course with a URL, the scraper visits the club page to find:
 *   - RideWithGPS route links (ridewithgps.com/routes/{id})
 *   - Direct GPX file downloads (.gpx)
 *
 * Flow:
 * 1. Fetch course list JSON from AJ Permanent API
 * 2. Filter out suspended courses (notes containing "休止")
 * 3. For each active course with a URL, scrape the page for route data
 * 4. For RWGPS links: fetch JSON API for track points, build GPX
 * 5. For GPX links: download directly
 * 6. Parse/upload GPX to MinIO, create or update course record
 */

import { prisma } from "./db";
import { parseGpx, sampleElevations } from "./gpx";

const AJ_API_URL =
  "https://www.audax-japan.org/wp01/wp-content/plugins/ajpermanent/php/ajpermanent.php?category=AJP";

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface AjCourse {
  coursecode: string;
  acpclubcode: number;
  clubnamej: string;
  brmcode: string | null;
  distance: number;
  departs: string | null;
  notes: string | null;
  original_course_name: string;
  shortname: string;
  shortnamej: string;
  coursename: string;
  coursenamej: string;
  fileid: string | null;
  url: string | null;
}

interface RwgpsTrackPoint {
  x: number; // longitude
  y: number; // latitude
  e: number; // elevation (meters)
  d: number; // cumulative distance (meters)
}

interface RouteData {
  rwgpsId?: string;
  gpxUrl?: string;
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
        res.on("data", (c) => {
          if (c) chunks.push(c);
        });
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Make a URL-safe slug from a course code.
 * e.g. "AJP-001" -> "ajp-001"
 */
function makeSlug(coursecode: string): string {
  return coursecode
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Map ACP club code to a region name for grouping.
 */
function clubToRegion(clubnamej: string): string {
  // Extract the region from the club name
  // e.g. "AJ広島" -> "Hiroshima", "R熊本" -> "Kumamoto"
  const regionMap: Record<string, string> = {
    広島: "Hiroshima",
    たまがわ: "Tamagawa",
    熊本: "Kumamoto",
    神奈川: "Kanagawa",
    千葉: "Chiba",
    福岡: "Fukuoka",
    宇都宮: "Utsunomiya",
    伊方: "Ikata",
  };

  for (const [jp, en] of Object.entries(regionMap)) {
    if (clubnamej.includes(jp)) return en;
  }
  return clubnamej;
}

/**
 * Scrape a club course page for RideWithGPS links and direct GPX downloads.
 * Checks for:
 *   - Direct route links: ridewithgps.com/routes/{id}
 *   - Embed iframes: ridewithgps.com/embeds?type=route&id={id}
 *   - Direct GPX file download links: href=".../.gpx"
 */
function scrapePageForRouteData(html: string): RouteData {
  const result: RouteData = {};

  // Look for direct GPX file download links first (preferred over RWGPS)
  const gpxMatch = html.match(
    /(?:href=["'])(https?:\/\/[^"']+\.gpx)["']/i
  );
  if (gpxMatch) {
    result.gpxUrl = gpxMatch[1];
  }

  // Look for RideWithGPS direct route links: /routes/{id}
  const rwgpsDirectMatch = html.match(
    /ridewithgps\.com\/routes\/(\d+)/i
  );
  if (rwgpsDirectMatch) {
    result.rwgpsId = rwgpsDirectMatch[1];
  }

  // Also look for RWGPS embed iframes: /embeds?type=route&id={id}
  if (!result.rwgpsId) {
    const rwgpsEmbedMatch = html.match(
      /ridewithgps\.com\/embeds\?[^"']*(?:&amp;|&)id=(\d+)/i
    );
    if (rwgpsEmbedMatch) {
      result.rwgpsId = rwgpsEmbedMatch[1];
    }
  }

  return result;
}

/**
 * Build GPX XML from RWGPS track points.
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
 * Fetch route data from RWGPS JSON API and process into course data.
 */
async function fetchAndProcessRwgps(
  rwgpsId: string,
  slug: string,
  routeName: string
): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  distanceKm: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const url = `https://ridewithgps.com/routes/${rwgpsId}.json`;

  let trackPoints: RwgpsTrackPoint[] = [];
  let elevationGain = 0;
  let distance = 0;

  try {
    const json = await httpsGet(url, 60000);
    const data = JSON.parse(json);

    if (
      !data.track_points ||
      !Array.isArray(data.track_points) ||
      data.track_points.length === 0
    ) {
      // Try trips endpoint
      const tripsUrl = `https://ridewithgps.com/trips/${rwgpsId}.json`;
      try {
        const tripsJson = await httpsGet(tripsUrl, 60000);
        const tripsData = JSON.parse(tripsJson);
        if (
          !tripsData.trip?.track_points ||
          tripsData.trip.track_points.length === 0
        ) {
          return null;
        }
        trackPoints = tripsData.trip.track_points;
        elevationGain = tripsData.trip?.elevation_gain ?? 0;
        distance = tripsData.trip?.distance ?? 0;
      } catch {
        return null;
      }
    } else {
      trackPoints = data.track_points;
      elevationGain = data.elevation_gain ?? 0;
      distance = data.distance ?? 0;
    }
  } catch {
    // Try trips endpoint
    try {
      const tripsUrl = `https://ridewithgps.com/trips/${rwgpsId}.json`;
      const tripsJson = await httpsGet(tripsUrl, 60000);
      const tripsData = JSON.parse(tripsJson);
      if (
        !tripsData.trip?.track_points ||
        tripsData.trip.track_points.length === 0
      ) {
        return null;
      }
      trackPoints = tripsData.trip.track_points;
      elevationGain = tripsData.trip?.elevation_gain ?? 0;
      distance = tripsData.trip?.distance ?? 0;
    } catch {
      return null;
    }
  }

  if (trackPoints.length === 0) return null;

  // Process track points
  const rawElevations = trackPoints.map((pt) => ({
    distance: pt.d / 1000,
    elevation: pt.e,
  }));
  const elevationProfile = sampleElevations(rawElevations, 500);

  const coordinates = trackPoints.map((pt) => [pt.x, pt.y]);
  const geojsonGeometry =
    coordinates.length > 1 ? { type: "LineString", coordinates } : null;

  let gain = 0;
  for (let i = 1; i < trackPoints.length; i++) {
    const diff = trackPoints[i].e - trackPoints[i - 1].e;
    if (diff > 0) gain += diff;
  }

  const elevationM =
    elevationGain > 0 ? Math.round(elevationGain) : Math.round(gain);
  const distanceKm =
    distance > 0
      ? Math.round((distance / 1000) * 10) / 10
      : trackPoints.length > 0
        ? Math.round(
            (trackPoints[trackPoints.length - 1].d / 1000) * 10
          ) / 10
        : 0;

  // Build GPX and upload to MinIO
  let gpxFileKey: string | null = null;
  try {
    const gpxString = buildGpxFromTrackPoints(trackPoints, routeName);
    const gpxBuffer = Buffer.from(gpxString, "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/jp-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Download and process a GPX file directly.
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

  if (
    !gpxString.includes("<trkpt") &&
    !gpxString.includes("<rtept") &&
    !gpxString.includes("<wpt")
  ) {
    return null;
  }

  const parsed = parseGpx(gpxString);

  if (
    !parsed.geojson?.features?.length ||
    !parsed.geojson.features[0]?.geometry
  ) {
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
    gpxFileKey = `courses/jp-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical
  }

  return {
    gpxFileKey,
    elevationM,
    distanceKm,
    elevationProfile,
    geojsonGeometry,
  };
}

/**
 * Run the Audax Japan permanent course scraper.
 */
export async function runAudaxJapanScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch course list from AJ Permanent API
    console.log("[audax-japan] Fetching course list from AJ Permanent API...");
    const json = await httpsGet(AJ_API_URL);
    let courses: AjCourse[];

    try {
      courses = JSON.parse(json);
    } catch {
      result.errors.push("Failed to parse AJ Permanent API response as JSON");
      return result;
    }

    if (!Array.isArray(courses) || courses.length === 0) {
      result.errors.push("No courses returned from AJ Permanent API");
      return result;
    }

    console.log(`[audax-japan] Found ${courses.length} courses in API`);

    // Filter out suspended courses
    const activeCourses = courses.filter(
      (c) => !c.notes || !c.notes.includes("休止")
    );
    console.log(
      `[audax-japan] ${activeCourses.length} active courses (${courses.length - activeCourses.length} suspended)`
    );

    result.total = activeCourses.length;

    // Step 2: Process each active course
    for (const course of activeCourses) {
      try {
        const slug = makeSlug(course.coursecode);
        const externalId = `jp-${slug}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "audax-japan",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};

          if (existing.name !== course.coursenamej) {
            updates.name = course.coursenamej;
          }
          if (
            course.distance > 0 &&
            existing.distanceKm !== course.distance
          ) {
            updates.distanceKm = course.distance;
          }
          if (course.url && existing.officialPageUrl !== course.url) {
            updates.officialPageUrl = course.url;
          }

          // Re-download GPX if missing and course has a URL
          if (!existing.gpxFileKey && course.url) {
            try {
              await sleep(500);
              const routeData = await scrapeCoursePage(course.url);

              if (routeData) {
                // Prefer direct GPX download over RWGPS (RWGPS API may return 403)
                const gpxData = routeData.gpxUrl
                  ? await downloadAndProcessGpx(routeData.gpxUrl, slug)
                  : routeData.rwgpsId
                    ? await fetchAndProcessRwgps(
                        routeData.rwgpsId,
                        slug,
                        course.coursenamej
                      )
                    : null;

                if (gpxData) {
                  if (gpxData.gpxFileKey)
                    updates.gpxFileKey = gpxData.gpxFileKey;
                  if (gpxData.elevationM > 0)
                    updates.elevationM = gpxData.elevationM;
                  if (gpxData.distanceKm > 0 && !existing.distanceKm)
                    updates.distanceKm = gpxData.distanceKm;
                  if (gpxData.elevationProfile)
                    updates.elevationProfile = gpxData.elevationProfile;

                  if (gpxData.geojsonGeometry) {
                    try {
                      await prisma.$executeRawUnsafe(
                        `UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid`,
                        JSON.stringify(gpxData.geojsonGeometry),
                        existing.id
                      );
                    } catch {
                      // Non-critical
                    }
                  }
                }
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              result.errors.push(
                `GPX re-download failed for ${course.coursecode}: ${msg}`
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
        await sleep(500);

        let gpxFileKey: string | null = null;
        let elevationM = 0;
        let distanceKm = course.distance || 0;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;

        // Try to get route data from the club page
        if (course.url) {
          try {
            const routeData = await scrapeCoursePage(course.url);

            if (routeData) {
              // Prefer direct GPX download over RWGPS (RWGPS API may return 403)
              if (routeData.gpxUrl) {
                try {
                  const data = await downloadAndProcessGpx(
                    routeData.gpxUrl,
                    slug
                  );
                  if (data) {
                    gpxFileKey = data.gpxFileKey;
                    elevationM = data.elevationM;
                    if (data.distanceKm > 0) distanceKm = data.distanceKm;
                    elevationProfile = data.elevationProfile;
                    geojsonGeometry = data.geojsonGeometry;
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  result.errors.push(
                    `GPX download failed for ${course.coursecode}: ${msg}`
                  );
                }
              }

              // Fall back to RWGPS if no GPX obtained
              if (!gpxFileKey && routeData.rwgpsId) {
                try {
                  const data = await fetchAndProcessRwgps(
                    routeData.rwgpsId,
                    slug,
                    course.coursenamej
                  );
                  if (data) {
                    gpxFileKey = data.gpxFileKey;
                    elevationM = data.elevationM;
                    if (data.distanceKm > 0) distanceKm = data.distanceKm;
                    elevationProfile = data.elevationProfile;
                    geojsonGeometry = data.geojsonGeometry;
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  result.errors.push(
                    `RWGPS failed for ${course.coursecode}: ${msg}`
                  );
                }
              }
            }

            await sleep(500);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(
              `Page scrape failed for ${course.coursecode}: ${msg}`
            );
          }
        }

        // Build course number: JP-{coursecode}
        const courseNumber = `JP-${course.coursecode}`;

        // Determine region from club name
        const region = clubToRegion(course.clubnamej);

        // Start location: use departs field or club name
        const startLocation = course.departs || course.clubnamej;

        // Build display name: use the Japanese course name
        const displayName = course.coursenamej || course.coursename;

        // Official page URL
        const officialPageUrl =
          course.url ||
          `https://www.audax-japan.org/ajpermanent/`;

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        const newCourse = await prisma.course.create({
          data: {
            courseNumber,
            name: displayName,
            distanceKm: distanceKm || 0,
            elevationM,
            startLocation,
            endLocation: startLocation, // Most permanents are round-trip
            region,
            category: ["permanent"],
            tags: ["audax-japan"],
            description: course.original_course_name || null,
            designer: course.clubnamej,
            officialPageUrl,
            gpxFileKey,
            country: "JP",
            sourceType: "audax-japan",
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
        console.log(
          `[audax-japan] Created: ${courseNumber} - ${displayName} (${distanceKm}km)`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Course ${course.coursecode}: ${msg}`);
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
      where: { key: "JP_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "JP_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "JP_LAST_SCRAPE_RESULT" },
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
        key: "JP_LAST_SCRAPE_RESULT",
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

  console.log(
    `[audax-japan] Scrape complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
  );

  return result;
}

/**
 * Scrape an individual course page for RWGPS or GPX links.
 * Returns null if the page cannot be fetched or no route data found.
 */
async function scrapeCoursePage(url: string): Promise<RouteData | null> {
  try {
    const html = await httpsGet(url, 30000);
    const data = scrapePageForRouteData(html);
    if (data.rwgpsId || data.gpxUrl) {
      return data;
    }
  } catch {
    // Some club pages may be down or inaccessible
  }
  return null;
}
