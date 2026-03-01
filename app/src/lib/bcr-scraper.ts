/**
 * BC Randonneurs Permanent Course Scraper
 *
 * Fetches permanent courses from https://database.randonneurs.bc.ca/browse/routes
 * and syncs courses that have GPX files into the local courses table.
 *
 * Flow:
 * 1. Fetch the routes listing page (single HTML table with all routes)
 * 2. Parse table rows: distance, climbing, region, permanent#, name, controls, GPX URL
 * 3. For each row with a GPX file link, download the GPX from Backblaze B2
 * 4. Parse GPX with existing parseGpx() to get geometry, elevation, distance
 * 5. Upload GPX to MinIO, create or update course record
 *
 * GPX files are hosted on Backblaze B2:
 *   https://f000.backblazeb2.com/file/bcr-public/routesheets/{ID}/permanent/{filename}.gpx
 */

import { prisma } from "./db";
import { parseGpx, sampleElevations } from "./gpx";

const LISTING_URL = "https://database.randonneurs.bc.ca/browse/routes";
const BASE_URL = "https://database.randonneurs.bc.ca";

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface ParsedRoute {
  routeId: string;       // from <tr id="route-result-{ID}">
  name: string;
  distanceKm: number;
  climbingM: number;
  region: string;
  permanentNumber: string;
  controls: string;
  gpxUrl: string;
  detailUrl: string;
}

/**
 * HTTP GET via Node https/http module (IPv4 forced for Docker compatibility).
 */
function httpGet(url: string, timeout = 30000): Promise<Buffer> {
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
          httpGet(absolute, timeout).then(resolve, reject);
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

function httpGetText(url: string, timeout = 30000): Promise<string> {
  return httpGet(url, timeout).then((buf) => buf.toString("utf8"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Decode HTML entities.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Extract a clean region name from the full region string.
 * e.g. "BC Randonneurs CC - Lower Mainland (011602)" -> "Lower Mainland"
 */
function extractRegion(raw: string): string {
  const match = raw.match(/- ([^(]+)/);
  return match ? match[1].trim() : raw.trim();
}

/**
 * Parse the listing page HTML table into route rows.
 * Only returns routes that have GPX file links.
 */
function parseRoutesTable(html: string): ParsedRoute[] {
  const routes: ParsedRoute[] = [];

  const trRegex = /<tr\s+id="route-result-(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const routeId = trMatch[1];
    const trContent = trMatch[2];

    // Extract GPX URL — only process routes with GPX files
    const gpxMatch = trContent.match(
      /href="(https?:\/\/f000\.backblazeb2\.com\/[^"]+\.gpx)"/i
    );
    if (!gpxMatch) continue;
    const gpxUrl = gpxMatch[1];

    // Extract all <td> cells
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      cells.push(tdMatch[1]);
    }

    // Expected cells: [distance, climbing, region, permanent, name, controls]
    if (cells.length < 6) continue;

    // Distance
    const distanceKm = parseFloat(cells[0].trim());
    if (isNaN(distanceKm) || distanceKm <= 0) continue;

    // Climbing (may be empty)
    const climbingStr = cells[1].trim();
    const climbingM = climbingStr ? parseFloat(climbingStr) : 0;

    // Region
    const region = extractRegion(decodeHtmlEntities(cells[2].replace(/<[^>]+>/g, "").trim()));

    // Permanent number
    const permMatch = cells[3].match(/#(\d+)/);
    const permanentNumber = permMatch ? permMatch[1] : routeId;

    // Route name
    const nameMatch = cells[4].match(/<a[^>]*>([^<]+)<\/a>/i);
    const name = nameMatch
      ? decodeHtmlEntities(nameMatch[1].trim())
      : `Route ${routeId}`;

    // Controls
    const controls = decodeHtmlEntities(
      cells[5].replace(/<[^>]+>/g, "").trim()
    );

    routes.push({
      routeId,
      name,
      distanceKm,
      climbingM: isNaN(climbingM) ? 0 : climbingM,
      region,
      permanentNumber,
      controls,
      gpxUrl,
      detailUrl: `${BASE_URL}/route/${routeId}`,
    });
  }

  return routes;
}

/**
 * Run the BC Randonneurs permanent course scraper.
 */
export async function runBcrScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch listing page
    console.log("[bcr] Fetching routes listing page...");
    const listingHtml = await httpGetText(LISTING_URL);

    // Step 2: Parse table rows (only those with GPX)
    const routes = parseRoutesTable(listingHtml);
    result.total = routes.length;
    console.log(`[bcr] Found ${routes.length} routes with GPX files`);

    if (routes.length === 0) {
      result.errors.push(
        "No routes with GPX found — HTML structure may have changed"
      );
      return result;
    }

    // Step 3: Process each route
    for (const route of routes) {
      try {
        const externalId = `bcr-${route.routeId}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "bcr",
            externalId,
          },
        });

        if (existing) {
          // Check for updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== route.name) updates.name = route.name;
          if (existing.distanceKm !== route.distanceKm)
            updates.distanceKm = route.distanceKm;
          if (route.climbingM > 0 && existing.elevationM !== route.climbingM)
            updates.elevationM = route.climbingM;
          if (existing.region !== route.region) updates.region = route.region;

          // Re-download GPX if we don't have one
          if (!existing.gpxFileKey) {
            try {
              await sleep(500);
              const gpxData = await downloadAndProcessGpx(
                route.gpxUrl,
                route.routeId,
                route.name
              );
              if (gpxData) {
                if (gpxData.gpxFileKey) updates.gpxFileKey = gpxData.gpxFileKey;
                if (gpxData.elevationM > 0 && !route.climbingM)
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
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              result.errors.push(
                `GPX re-download failed for ${route.routeId}: ${msg}`
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

        // Rate limit
        await sleep(500);

        // Download and process GPX
        let gpxFileKey: string | null = null;
        let elevationM = route.climbingM;
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;

        try {
          const gpxData = await downloadAndProcessGpx(
            route.gpxUrl,
            route.routeId,
            route.name
          );
          if (gpxData) {
            gpxFileKey = gpxData.gpxFileKey;
            // Use GPX-calculated values if table values are missing
            if (!elevationM && gpxData.elevationM > 0)
              elevationM = gpxData.elevationM;
            if (gpxData.distanceKm > 0)
              distanceKm = gpxData.distanceKm;
            elevationProfile = gpxData.elevationProfile;
            geojsonGeometry = gpxData.geojsonGeometry;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(
            `GPX download failed for ${route.routeId}: ${msg}`
          );
        }

        // Build start/end from controls
        const controlList = route.controls
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        const startLocation = controlList[0] || route.region;
        const endLocation =
          controlList.length > 1
            ? controlList[controlList.length - 1]
            : startLocation;

        // Create course
        const newCourse = await prisma.course.create({
          data: {
            courseNumber: `BCR-${route.permanentNumber}`,
            name: route.name,
            distanceKm,
            elevationM,
            startLocation,
            endLocation,
            region: route.region,
            category: ["permanent"],
            tags: ["bc-randonneurs"],
            description: route.controls
              ? `Controls: ${route.controls}`
              : null,
            officialPageUrl: route.detailUrl,
            gpxFileKey,
            country: "CA",
            sourceType: "bcr",
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
        result.errors.push(`Route ${route.routeId}: ${msg}`);
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
      where: { key: "BCR_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "BCR_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "BCR_LAST_SCRAPE_RESULT" },
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
        key: "BCR_LAST_SCRAPE_RESULT",
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

/**
 * Download GPX from Backblaze B2, parse it, upload to MinIO.
 */
async function downloadAndProcessGpx(
  gpxUrl: string,
  routeId: string,
  routeName: string
): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  distanceKm: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const gpxBuffer = await httpGet(gpxUrl, 60000);
  const gpxString = gpxBuffer.toString("utf8");

  if (!gpxString.includes("<trkpt") && !gpxString.includes("<rtept")) {
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
    gpxFileKey = `courses/bcr-${routeId}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    // Non-critical
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}
