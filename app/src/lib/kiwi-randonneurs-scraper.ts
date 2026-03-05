import { generateUniqueCourseSlug } from "./slug";

/**
 * Kiwi Randonneurs (New Zealand) Permanent Course Scraper
 *
 * Fetches permanent courses from:
 *   https://www.kiwirandonneurs.org.nz/events/permanents-1
 *
 * The page has a single table with columns:
 *   Route (linked to RideWithGPS) | Route Code | Start Town | Surface | Distance
 *
 * All courses link to RideWithGPS, so we:
 * 1. Fetch the permanents page
 * 2. Parse the HTML table for route info + RWGPS IDs
 * 3. Fetch RWGPS JSON API for track data, build GPX
 * 4. Upload GPX to MinIO, create or update course record
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const PERMANENTS_URL =
  "https://www.kiwirandonneurs.org.nz/events/permanents-1";

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface RwgpsTrackPoint {
  x: number; // longitude
  y: number; // latitude
  e: number; // elevation (meters)
  d: number; // cumulative distance (meters)
}

interface ParsedRoute {
  name: string;
  rwgpsId: string;
  routeCode: string;
  startTown: string;
  surface: string;
  distanceKm: number;
  slug: string;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(
      /&#x([0-9a-fA-F]+);/g,
      (_, code) => String.fromCharCode(parseInt(code, 16))
    )
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
 * Parse the permanents page HTML table.
 *
 * Actual HTML structure (Sporty CMS):
 *   <tr>
 *     <th scope="row"><a href="https://ridewithgps.com/routes/{ID}">Route Name</a></th>
 *     <th scope="row">Route Code</th>
 *     <td>Start Town</td>
 *     <td>Surface</td>
 *     <td>Distance km</td>
 *   </tr>
 *
 * Note: first two cells use <th>, rest use <td>. Some links have <p> wrappers
 * and one URL contains a stray "&nbsp;" that must be stripped.
 */
function parsePermanentsPage(html: string): ParsedRoute[] {
  const routes: ParsedRoute[] = [];
  const seen = new Set<string>();

  // Extract only <tbody> content to skip the <thead> header row
  // (The header row's <th> cells also link to RWGPS, so we must exclude it.)
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const searchArea = tbodyMatch ? tbodyMatch[1] : html;

  // Match table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(searchArea)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract all cells — both <th> and <td>
    const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].trim());
    }

    // Need at least 5 cells (Route, Route Code, Start Town, Surface, Distance)
    if (cells.length < 5) continue;

    // First cell should contain an <a> linking to ridewithgps.
    // The href may contain &nbsp; (e.g. "https://&nbsp;ridewithgps.com/...")
    // so we strip &nbsp; before matching.
    const cell0Clean = cells[0].replace(/&nbsp;/g, "");
    const linkMatch = cell0Clean.match(
      /<a[^>]+href=["']([^"']*ridewithgps\.com\/routes\/(\d+))[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
    );
    if (!linkMatch) continue;

    const rwgpsId = linkMatch[2];
    // Strip nested HTML tags and &nbsp; from route name
    const rawName = linkMatch[3]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    const name = decodeHtmlEntities(rawName);

    if (!name || !rwgpsId) continue;

    // Route code (second cell)
    const routeCode = cells[1].replace(/<[^>]+>/g, "").trim();

    // Start town (third cell)
    const startTown = decodeHtmlEntities(
      cells[2].replace(/<[^>]+>/g, "").trim()
    );

    // Surface (fourth cell)
    const surface = decodeHtmlEntities(
      cells[3].replace(/<[^>]+>/g, "").trim()
    );

    // Distance (fifth cell) — e.g. "200 km" or "440 km"
    const distanceMatch = cells[4].match(/(\d+)/);
    const distanceKm = distanceMatch ? parseInt(distanceMatch[1], 10) : 0;

    const slug = makeSlug(name);

    // Skip empty rows (name is just whitespace or <br>)
    if (!slug) continue;

    // Deduplicate by RWGPS ID
    if (seen.has(rwgpsId)) continue;
    seen.add(rwgpsId);

    routes.push({
      name,
      rwgpsId,
      routeCode,
      startTown,
      surface,
      distanceKm,
      slug,
    });
  }

  return routes;
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
    // Try trips endpoint as fallback
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
    gpxFileKey = `courses/nz-${slug}.gpx`;
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
 * Determine a region label from the start town.
 */
function regionFromTown(startTown: string): string {
  const lower = startTown.toLowerCase();
  // Wairarapa region towns
  if (
    ["carterton", "martinborough", "greytown", "masterton", "featherston"].some(
      (t) => lower.includes(t)
    )
  ) {
    return "Wairarapa";
  }
  // Manawatu region towns
  if (
    ["palmerston north", "feilding", "levin", "dannevirke"].some((t) =>
      lower.includes(t)
    )
  ) {
    return "Manawatu";
  }
  // Canterbury region towns
  if (
    ["christchurch", "lincoln", "fairlie", "timaru", "ashburton"].some((t) =>
      lower.includes(t)
    )
  ) {
    return "Canterbury";
  }
  // West Coast region towns
  if (
    ["greymouth", "hokitika", "westport", "reefton"].some((t) =>
      lower.includes(t)
    )
  ) {
    return "West Coast";
  }
  return "New Zealand";
}

/**
 * Run the Kiwi Randonneurs (NZ) permanent course scraper.
 */
export async function runKiwiRandonneursScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch the permanents page
    console.log("[kiwi-randonneurs] Fetching permanents page...");
    const html = await httpsGet(PERMANENTS_URL);
    const routes = parsePermanentsPage(html);
    result.total = routes.length;

    console.log(
      `[kiwi-randonneurs] Found ${routes.length} permanent routes`
    );

    if (routes.length === 0) {
      result.errors.push(
        "No routes found — HTML structure may have changed"
      );
      return result;
    }

    // Step 2: Process each route
    for (const route of routes) {
      try {
        const externalId = `nz-rwgps-${route.rwgpsId}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "kiwi-randonneurs",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== route.name) updates.name = route.name;
          if (
            route.distanceKm > 0 &&
            existing.distanceKm !== route.distanceKm
          ) {
            updates.distanceKm = route.distanceKm;
          }
          if (existing.startLocation !== route.startTown) {
            updates.startLocation = route.startTown;
          }

          // Re-download GPX if missing
          if (!existing.gpxFileKey) {
            try {
              await sleep(500);
              const gpxData = await fetchAndProcessRwgps(
                route.rwgpsId,
                route.slug,
                route.name
              );

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
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              result.errors.push(
                `GPX re-download failed for ${route.slug}: ${msg}`
              );
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
        await sleep(500);

        let gpxFileKey: string | null = null;
        let elevationM = 0;
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;

        try {
          const data = await fetchAndProcessRwgps(
            route.rwgpsId,
            route.slug,
            route.name
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
          result.errors.push(`RWGPS failed for ${route.slug}: ${msg}`);
        }

        // Build course number: NZ-{RWGPS_ID}
        const courseNumber = `NZ-${route.rwgpsId}`;

        // Determine region from start town
        const region = regionFromTown(route.startTown);

        // Surface tag
        const surfaceTag =
          route.surface.toLowerCase() === "mixed" ? "mixed-surface" : "road";

        // Official page URL
        const officialPageUrl = `https://ridewithgps.com/routes/${route.rwgpsId}`;

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
            startLocation: route.startTown,
            endLocation: route.startTown,
            region,
            category: ["permanent"],
            tags: ["kiwi-randonneurs", surfaceTag],
            description: null,
            officialPageUrl,
            gpxFileKey,
            country: "NZ",
            sourceType: "kiwi-randonneurs",
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
          `[kiwi-randonneurs] Created: ${route.name} (${distanceKm} km, ${route.startTown})`
        );
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
      where: { key: "NZ_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "NZ_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "NZ_LAST_SCRAPE_RESULT" },
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
        key: "NZ_LAST_SCRAPE_RESULT",
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
