import { generateUniqueCourseSlug } from "./slug";

/**
 * Korea Randonneurs Permanent Course Scraper
 *
 * Fetches permanent courses from http://www.korearandonneurs.kr:8080/jsp/randonneurs/permanents
 * and syncs them into the local courses table.
 *
 * Flow:
 * 1. Fetch permanents list page HTML
 * 2. Parse HTML table rows (code, name, distance, elevation, time limit, start, end, designer)
 * 3. For each course, fetch detail page for RWGPS route URL
 * 4. Fetch route JSON from RideWithGPS public API
 * 5. Build GPX from track_points, parse geometry/elevation, upload to MinIO
 *
 * Deduplication: matches existing courses by courseNumber (e.g. "PT-01").
 * New courses get sourceType = 'kora-permanent', externalId = 'kora-PT01'.
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const BASE_URL = "http://www.korearandonneurs.kr:8080";
const PERMANENTS_URL = `${BASE_URL}/jsp/randonneurs/permanents`;

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface PermanentRow {
  code: string; // e.g. "PT01", "PT19R"
  courseNumber: string; // e.g. "PT-01", "PT-19R"
  name: string;
  distanceKm: number;
  elevationM: number;
  estimatedTime: string;
  startLocation: string;
  endLocation: string;
  designer: string;
  detailPath: string; // e.g. "../permanent/info-PT01.htm"
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
  name: string;
}

/**
 * HTTP GET via Node http/https module.
 * Supports both http and https URLs.
 */
function httpGet(url: string, timeout = 30000): Promise<string> {
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
          httpGet(absolute, timeout).then(resolve, reject);
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
 * Parse the permanents list page HTML table into rows.
 * Skips commented-out rows (inactive courses).
 */
function parsePermamentsList(html: string): PermanentRow[] {
  const rows: PermanentRow[] = [];

  // Remove HTML comments first (inactive courses are wrapped in <!-- -->)
  const noComments = html.replace(/<!--[\s\S]*?-->/g, "");

  // Find the second <tbody> which contains course data
  const tbodyMatches = [...noComments.matchAll(/<tbody>([\s\S]*?)<\/tbody>/gi)];
  if (tbodyMatches.length < 2) return rows;

  const tableContent = tbodyMatches[1][1];

  const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(tableContent)) !== null) {
    const trContent = trMatch[1];

    // Extract all <td> cell content
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      cells.push(tdMatch[1]);
    }

    // Expected: [code, name, distance, elevation, time, start, end, designer]
    if (cells.length < 8) continue;

    // Extract detail page link from code cell
    const linkMatch = cells[0].match(/HREF="([^"]+)"/i);
    if (!linkMatch) continue;

    // Extract code text (e.g. "PT-01")
    const codeText = cells[0].replace(/<[^>]+>/g, "").trim();
    if (!codeText.startsWith("PT-")) continue;

    // Code without dash: PT01, PT19R
    const code = codeText.replace(/-/g, "");

    const nameText = cells[1].replace(/<[^>]+>/g, "").trim();
    const distanceStr = cells[2].replace(/[^\d.]/g, "");
    const distanceKm = parseFloat(distanceStr);
    if (isNaN(distanceKm)) continue;

    // Elevation: "4,440m" -> 4440
    const elevationStr = cells[3].replace(/[^\d]/g, "");
    const elevationM = parseInt(elevationStr) || 0;

    const estimatedTime = cells[4].replace(/<[^>]+>/g, "").trim();
    const startLocation = cells[5].replace(/<[^>]+>/g, "").trim();
    const endLocation = cells[6].replace(/<[^>]+>/g, "").trim();
    const designer = cells[7].replace(/<[^>]+>/g, "").trim();

    rows.push({
      code,
      courseNumber: codeText,
      name: nameText,
      distanceKm,
      elevationM,
      estimatedTime,
      startLocation,
      endLocation,
      designer,
      detailPath: linkMatch[1],
    });
  }

  return rows;
}

/**
 * Fetch detail page and extract RideWithGPS URL and description.
 */
async function fetchDetailPage(detailPath: string): Promise<{
  rwgpsUrl: string | null;
  description: string;
  googleDriveUrl: string | null;
}> {
  // Convert relative path: "../permanent/info-PT01.htm" -> "/jsp/permanent/info-PT01.htm"
  const absolutePath = detailPath.replace(/^\.\./, "/jsp");
  const url = `${BASE_URL}${absolutePath}`;

  const html = await httpGet(url);

  // Find RideWithGPS URL
  let rwgpsUrl: string | null = null;
  const rwgpsMatch = html.match(
    /https?:\/\/ridewithgps\.com\/(?:routes|trips)\/(\d+)/i
  );
  if (rwgpsMatch) {
    rwgpsUrl = rwgpsMatch[0];
  }

  // Find Google Drive URL (for GPX download)
  let googleDriveUrl: string | null = null;
  const driveMatch = html.match(
    /https?:\/\/drive\.google\.com\/[^"'\s]+/i
  );
  if (driveMatch) {
    googleDriveUrl = driveMatch[0];
  }

  // Extract description from the detail section
  let description = "";
  const tab1Match = html.match(/<div[^>]*id="tab1"[^>]*>([\s\S]*?)<\/div>/i);
  if (tab1Match) {
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(tab1Match[1])) !== null) {
      const text = pMatch[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (text && text.length > 10) paragraphs.push(text);
    }
    // Take only Korean description (first paragraph is usually Korean)
    if (paragraphs.length > 0) {
      description = paragraphs[0];
    }
  }

  return { rwgpsUrl, description, googleDriveUrl };
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
async function fetchRwgpsRouteJson(routeId: string): Promise<RwgpsRouteData | null> {
  const url = `https://ridewithgps.com/routes/${routeId}.json`;

  try {
    const json = await httpGet(url, 60000);
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
    // Try trips endpoint if routes fails
    try {
      const tripsUrl = `https://ridewithgps.com/trips/${routeId}.json`;
      const json = await httpGet(tripsUrl, 60000);
      const data = JSON.parse(json);

      if (!data.trip?.track_points || data.trip.track_points.length === 0) {
        return null;
      }

      return {
        trackPoints: data.trip.track_points as RwgpsTrackPoint[],
        elevationGain: data.trip?.elevation_gain ?? 0,
        elevationLoss: data.trip?.elevation_loss ?? 0,
        name: data.trip?.name ?? "",
      };
    } catch {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`RWGPS JSON failed for ${routeId}: ${msg}`);
    }
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

  const rawElevations = points.map((pt) => ({
    distance: pt.d / 1000,
    elevation: pt.e,
  }));
  const elevationProfile = sampleElevations(rawElevations, 500);

  const coordinates = points.map((pt) => [pt.x, pt.y]);
  const geojsonGeometry =
    coordinates.length > 1
      ? { type: "LineString", coordinates }
      : null;

  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].e - points[i - 1].e;
    if (diff > 0) gain += diff;
  }

  return { elevationProfile, geojsonGeometry, elevationGainCalc: Math.round(gain) };
}

/**
 * Fetch RWGPS route data, build GPX, upload to MinIO.
 */
async function fetchAndProcessRoute(rwgpsUrl: string, code: string): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
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

  // Build GPX and upload to MinIO
  let gpxFileKey: string | null = null;
  try {
    const gpxString = buildGpxFromTrackPoints(
      routeData.trackPoints,
      routeData.name || code
    );
    const gpxBuffer = Buffer.from(gpxString, "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/${code.toLowerCase()}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical
  }

  return { gpxFileKey, elevationM, elevationProfile, geojsonGeometry };
}

/**
 * Run the Korea Randonneurs permanent course scraper.
 */
export async function runKoraPermScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch permanents list page
    console.log("[kora-perm] Fetching permanents list page...");
    const listHtml = await httpGet(PERMANENTS_URL);

    // Step 2: Parse table rows
    const rows = parsePermamentsList(listHtml);
    result.total = rows.length;
    console.log(`[kora-perm] Found ${rows.length} active permanent courses`);

    if (rows.length === 0) {
      result.errors.push(
        "No courses found in permanents table — HTML structure may have changed"
      );
      return result;
    }

    // Step 3: Process each course
    for (const row of rows) {
      try {
        const externalId = `kora-${row.code}`;

        // Check if already exists by courseNumber OR externalId
        let existing = await prisma.course.findFirst({
          where: {
            sourceType: "kora-permanent",
            externalId,
          },
        });

        // Also check by courseNumber for legacy courses (imported without sourceType)
        if (!existing) {
          existing = await prisma.course.findFirst({
            where: {
              courseNumber: row.courseNumber,
              country: "KR",
            },
          });
        }

        if (existing) {
          // Update all fields from source
          const updates: Record<string, unknown> = {};

          if (existing.name !== row.name) updates.name = row.name;
          if (existing.distanceKm !== row.distanceKm) updates.distanceKm = row.distanceKm;
          if (existing.elevationM !== row.elevationM && row.elevationM > 0) updates.elevationM = row.elevationM;
          if (existing.startLocation !== row.startLocation) updates.startLocation = row.startLocation;
          if (existing.endLocation !== row.endLocation) updates.endLocation = row.endLocation;
          if (existing.estimatedTime !== row.estimatedTime) updates.estimatedTime = row.estimatedTime;
          if (row.designer && existing.designer !== row.designer) updates.designer = row.designer;

          // Set sourceType/externalId if not set (backfill legacy)
          if (!existing.sourceType) updates.sourceType = "kora-permanent";
          if (!existing.externalId) updates.externalId = externalId;

          // Fetch detail page to check for RWGPS URL changes
          let detailRwgpsUrl: string | null = null;
          try {
            await sleep(500);
            const detail = await fetchDetailPage(row.detailPath);
            detailRwgpsUrl = detail.rwgpsUrl;
            if (detail.description && !existing.description) {
              updates.description = detail.description;
            }
          } catch {
            // Non-critical — keep existing data
          }

          // Update officialPageUrl if RWGPS URL changed
          if (detailRwgpsUrl && existing.officialPageUrl !== detailRwgpsUrl) {
            updates.officialPageUrl = detailRwgpsUrl;
          }

          // Determine if we need to (re)fetch route data
          const rwgpsUrl = detailRwgpsUrl || existing.officialPageUrl;
          const rwgpsChanged = detailRwgpsUrl && existing.officialPageUrl !== detailRwgpsUrl;
          const needsRouteData = !existing.gpxFileKey || rwgpsChanged;

          if (needsRouteData && rwgpsUrl?.includes("ridewithgps.com")) {
            try {
              await sleep(1000);
              const routeResult = await fetchAndProcessRoute(rwgpsUrl, row.code);
              if (routeResult) {
                if (routeResult.gpxFileKey) updates.gpxFileKey = routeResult.gpxFileKey;
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
              result.errors.push(`Route fetch failed for ${row.code}: ${msg}`);
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

        // Rate limit before detail page fetch
        await sleep(500);

        // Fetch detail page
        let rwgpsUrl: string | null = null;
        let description = "";
        let googleDriveUrl: string | null = null;
        try {
          const detail = await fetchDetailPage(row.detailPath);
          rwgpsUrl = detail.rwgpsUrl;
          description = detail.description;
          googleDriveUrl = detail.googleDriveUrl;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`Detail page failed for ${row.code}: ${msg}`);
        }

        // Fetch and process route data from RWGPS
        let gpxFileKey: string | null = null;
        let elevationProfile: { distance: number; elevation: number }[] | null = null;
        let geojsonGeometry: object | null = null;
        let rwgpsElevation = 0;

        if (rwgpsUrl) {
          await sleep(1000);
          try {
            const routeResult = await fetchAndProcessRoute(rwgpsUrl, row.code);
            if (routeResult) {
              gpxFileKey = routeResult.gpxFileKey;
              elevationProfile = routeResult.elevationProfile;
              geojsonGeometry = routeResult.geojsonGeometry;
              rwgpsElevation = routeResult.elevationM;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`Route data failed for ${row.code}: ${msg}`);
          }
        }

        // Use KORA-provided elevation if available, otherwise RWGPS
        const elevationM = row.elevationM > 0 ? row.elevationM : rwgpsElevation;

        // Official page URL: prefer RWGPS, fallback to Google Drive
        const officialPageUrl = rwgpsUrl || googleDriveUrl || null;

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        // Create course
        const courseSlug = await generateUniqueCourseSlug(row.name, row.distanceKm, row.courseNumber);
        const course = await prisma.course.create({
          data: {
            slug: courseSlug,
            courseNumber: row.courseNumber,
            name: row.name,
            distanceKm: row.distanceKm,
            elevationM,
            estimatedTime: row.estimatedTime || null,
            startLocation: row.startLocation,
            endLocation: row.endLocation,
            region: null, // KORA page doesn't provide region
            category: ["permanent"],
            tags: [],
            description: description || null,
            designer: row.designer || null,
            officialPageUrl,
            gpxFileKey,
            country: "KR",
            sourceType: "kora-permanent",
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
              course.id
            );
          } catch {
            // Non-critical
          }
        }

        result.created++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Course ${row.code}: ${msg}`);
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
      where: { key: "KORA_PERM_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "KORA_PERM_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "KORA_PERM_LAST_SCRAPE_RESULT" },
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
        key: "KORA_PERM_LAST_SCRAPE_RESULT",
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
