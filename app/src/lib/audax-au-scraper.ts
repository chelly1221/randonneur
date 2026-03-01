/**
 * Audax Australia Permanent Course Scraper
 *
 * Fetches permanent courses from https://audax.org.au/ride/permanents-register/
 * and syncs them into the local courses table with route data from RideWithGPS.
 *
 * Flow:
 * 1. Fetch permanents register HTML
 * 2. Extract AJAX nonce from page JS config
 * 3. Parse HTML table rows (data-id, name, type, start, distance, locale, region)
 * 4. For each ride, call AJAX audax_permanents_view_dialog to get detail dialog
 * 5. Parse dialog for description + RideWithGPS route URL
 * 6. Fetch route JSON from RideWithGPS public API (GPX export requires auth)
 * 7. Build GPX from track_points, parse geometry/elevation, upload to MinIO
 *
 * Note: RideWithGPS .gpx download returns 401 (requires login).
 * The .json endpoint is public and contains full track_points data.
 * We build GPX from the JSON track_points array.
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const REGISTER_URL = "https://audax.org.au/ride/permanents-register/";
const AJAX_URL = "https://audax.org.au/wp-admin/admin-ajax.php";

/** Map ride type codes to category tags */
const TYPE_TO_CATEGORY: Record<string, string> = {
  BP: "permanent",
  BPD: "permanent-dirt",
  BPG: "permanent-gravel",
  BPR: "permanent-randonneur",
  SR: "super-randonneur",
  RAID: "raid",
};

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

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

interface PermanentRow {
  rideId: string;
  name: string;
  type: string;
  start: string;
  distanceKm: number;
  locale: string;
  region: string;
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
 * Extract the AJAX nonce from the register page HTML.
 */
function extractNonce(html: string): string | null {
  const match = html.match(/["']ajax_nonce["']\s*:\s*["']([^"']+)["']/);
  return match ? match[1] : null;
}

/**
 * Parse the permanents register HTML table into rows.
 */
function parseRegisterTable(html: string): PermanentRow[] {
  const rows: PermanentRow[] = [];

  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];

    // Extract data-id from View button
    const idMatch = trContent.match(/data-id=["'](\d+)["']/);
    if (!idMatch) continue;

    const rideId = idMatch[1];

    // Extract all <td> cell content
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      const text = tdMatch[1].replace(/<[^>]+>/g, "").trim();
      cells.push(text);
    }

    // Expected: [name, type, start, distance, locale, region, actions]
    if (cells.length < 6) continue;

    const distanceStr = cells[3].replace(/[^\d.]/g, "");
    const distanceKm = parseFloat(distanceStr);
    if (isNaN(distanceKm)) continue;

    rows.push({
      rideId,
      name: cells[0],
      type: cells[1],
      start: cells[2],
      distanceKm,
      locale: cells[4],
      region: cells[5],
    });
  }

  return rows;
}

/**
 * Fetch detail dialog for a permanent ride via AJAX.
 */
async function fetchRideDialog(
  rideId: string,
  nonce: string
): Promise<string> {
  const url =
    `${AJAX_URL}?action=audax_permanents_view_dialog&id=${encodeURIComponent(rideId)}&my_ride=0&_audax_ajax=${encodeURIComponent(nonce)}`;
  return httpsGet(url);
}

/**
 * Parse the detail dialog HTML for description text and route URL.
 */
function parseDialogContent(html: string): {
  description: string;
  routeUrl: string | null;
} {
  let description = "";

  // Look for the main description area
  const descMatch = html.match(
    /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (descMatch) {
    description = descMatch[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  // Fallback: extract paragraphs from dialog body
  if (!description) {
    const bodyMatch = html.match(/<dialog[^>]*>([\s\S]*?)<\/dialog>/i);
    if (bodyMatch) {
      const paragraphs: string[] = [];
      const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch;
      while ((pMatch = pRegex.exec(bodyMatch[1])) !== null) {
        const text = pMatch[1].replace(/<[^>]+>/g, "").trim();
        if (text && text.length > 10) paragraphs.push(text);
      }
      description = paragraphs.join("\n");
    }
  }

  // Find RideWithGPS URL
  let routeUrl: string | null = null;
  const rwgpsMatch = html.match(
    /https?:\/\/ridewithgps\.com\/(?:routes|trips)\/(\d+)/i
  );
  if (rwgpsMatch) {
    routeUrl = rwgpsMatch[0];
  }

  // Fallback: check href attributes
  if (!routeUrl) {
    const linkMatch = html.match(
      /href=["'](https?:\/\/ridewithgps\.com\/[^"']+)["']/i
    );
    if (linkMatch) {
      routeUrl = linkMatch[1];
    }
  }

  return { description, routeUrl };
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
 * The .json endpoint is public (unlike .gpx which returns 401).
 *
 * JSON structure:
 *   track_points: [{x: lng, y: lat, e: elevation_m, d: distance_m}, ...]
 *   elevation_gain: number (meters)
 *   elevation_loss: number (meters)
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
 * Uses the distance values directly from RWGPS (already in meters).
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
    distance: pt.d / 1000, // meters to km
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
 * Returns null if route ID can't be extracted or data isn't available.
 */
async function fetchAndProcessRoute(routeUrl: string, rideId: string): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const routeId = extractRwgpsRouteId(routeUrl);
  if (!routeId) return null;

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
      routeData.name || `AU-${rideId}`
    );
    const gpxBuffer = Buffer.from(gpxString, "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/au-${rideId}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    // Non-critical — geometry and elevation still available without MinIO upload
  }

  return { gpxFileKey, elevationM, elevationProfile, geojsonGeometry };
}

/**
 * Run the Audax Australia permanent course scraper.
 */
export async function runAudaxAuScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch register page
    console.log("[audax-au] Fetching permanents register page...");
    const registerHtml = await httpsGet(REGISTER_URL);

    // Step 2: Extract nonce
    const nonce = extractNonce(registerHtml);
    if (!nonce) {
      result.errors.push("Could not extract AJAX nonce from register page");
      return result;
    }

    // Step 3: Parse table rows
    const rows = parseRegisterTable(registerHtml);
    result.total = rows.length;
    console.log(`[audax-au] Found ${rows.length} permanent courses`);

    if (rows.length === 0) {
      result.errors.push(
        "No courses found in register table — HTML structure may have changed"
      );
      return result;
    }

    // Step 4: Process each ride
    for (const row of rows) {
      try {
        const externalId = `audax-au-${row.rideId}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "audax-au",
            externalId,
          },
        });

        if (existing) {
          // Update all fields from source
          const updates: Record<string, unknown> = {};
          if (existing.name !== row.name) updates.name = row.name;
          if (existing.distanceKm !== row.distanceKm)
            updates.distanceKm = row.distanceKm;
          if (existing.region !== row.region) updates.region = row.region;
          if (existing.startLocation !== row.start)
            updates.startLocation = row.start;

          // Fetch detail dialog to check for description/URL changes
          let dialogRouteUrl: string | null = null;
          let dialogDescription: string | null = null;
          try {
            await sleep(500);
            const dialogHtml = await fetchRideDialog(row.rideId, nonce);
            const parsed = parseDialogContent(dialogHtml);
            dialogRouteUrl = parsed.routeUrl;
            dialogDescription = parsed.description || null;
          } catch {
            // Non-critical — keep existing data
          }

          // Update description if fetched and different
          if (dialogDescription && existing.description !== dialogDescription) {
            updates.description = dialogDescription;
          }

          // Update officialPageUrl if RWGPS URL changed
          if (dialogRouteUrl && existing.officialPageUrl !== dialogRouteUrl) {
            updates.officialPageUrl = dialogRouteUrl;
          }

          // Determine if we need to (re)fetch route data
          const rwgpsUrl = dialogRouteUrl || existing.officialPageUrl;
          const rwgpsChanged = dialogRouteUrl && existing.officialPageUrl !== dialogRouteUrl;
          const needsRouteData = !existing.gpxFileKey || rwgpsChanged;

          if (needsRouteData && rwgpsUrl?.includes("ridewithgps.com")) {
            try {
              await sleep(1000);
              const routeResult = await fetchAndProcessRoute(
                rwgpsUrl,
                row.rideId
              );
              if (routeResult) {
                if (routeResult.gpxFileKey)
                  updates.gpxFileKey = routeResult.gpxFileKey;
                if (routeResult.elevationM > 0)
                  updates.elevationM = routeResult.elevationM;
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
                `Route fetch failed for ${row.rideId}: ${msg}`
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

        // Rate limit before AJAX call
        await sleep(500);

        // Step 4a: Fetch detail dialog
        let description = "";
        let routeUrl: string | null = null;
        try {
          const dialogHtml = await fetchRideDialog(row.rideId, nonce);
          const parsed = parseDialogContent(dialogHtml);
          description = parsed.description;
          routeUrl = parsed.routeUrl;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`Dialog fetch failed for ${row.rideId}: ${msg}`);
        }

        // Step 5: Fetch and process route data from RWGPS JSON API
        let gpxFileKey: string | null = null;
        let elevationM = 0;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;

        if (routeUrl && routeUrl.includes("ridewithgps.com")) {
          await sleep(1000); // Rate limit

          try {
            const routeResult = await fetchAndProcessRoute(
              routeUrl,
              row.rideId
            );
            if (routeResult) {
              gpxFileKey = routeResult.gpxFileKey;
              elevationM = routeResult.elevationM;
              elevationProfile = routeResult.elevationProfile;
              geojsonGeometry = routeResult.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`Route data failed for ${row.rideId}: ${msg}`);
          }
        }

        // Map type to category
        const categories: string[] = [];
        const cat = TYPE_TO_CATEGORY[row.type];
        if (cat) categories.push(cat);

        // Build tags from locale
        const tags: string[] = [];
        if (row.locale) tags.push(row.locale);

        // Create course
        const course = await prisma.course.create({
          data: {
            courseNumber: `AU-${row.rideId}`,
            name: row.name,
            distanceKm: row.distanceKm,
            elevationM,
            startLocation: row.start,
            endLocation: row.start,
            region: row.region,
            category: categories,
            tags,
            description: description || null,
            officialPageUrl:
              routeUrl || `${REGISTER_URL}?ride_id=${row.rideId}`,
            gpxFileKey,
            country: "AU",
            sourceType: "audax-au",
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
        result.errors.push(`Ride ${row.rideId}: ${msg}`);
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
      where: { key: "AUDAX_AU_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: {
        key: "AUDAX_AU_LAST_SCRAPE_DATE",
        value: now.toISOString(),
      },
    });
    await prisma.setting.upsert({
      where: { key: "AUDAX_AU_LAST_SCRAPE_RESULT" },
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
        key: "AUDAX_AU_LAST_SCRAPE_RESULT",
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
