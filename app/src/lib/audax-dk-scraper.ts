/**
 * Audax Randonneurs Danemark (Denmark) Permanent Course Scraper
 *
 * Fetches permanent courses from https://audax-club.dk/oversigt-over-permanente
 * and syncs them into the local courses table with route data from RideWithGPS.
 *
 * Flow:
 * 1. Fetch the permanent routes overview page (single HTML table)
 * 2. Parse table rows handling rowspan for Region and Startby columns
 * 3. Extract route number, name, distance, region, start city, RWGPS URL per row
 * 4. For each RWGPS route: fetch JSON API for track data, build GPX
 * 5. Parse/upload GPX, create or update course record
 *
 * Table columns:
 *   Område | Startby | Distance | Rute # | Rutebeskrivelse | GPS
 *
 * The table uses rowspan on Område and Startby columns to group routes
 * from the same region and city, so the parser must track inherited values.
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const LISTING_URL = "https://audax-club.dk/oversigt-over-permanente";

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
  routeNumber: string;    // e.g. "19", "28", "16"
  name: string;           // e.g. "Bornholm Rundt med uret"
  distanceKm: number;     // e.g. 100, 161, 200, 300
  region: string;         // e.g. "Bornholm", "Hovedstaden", "Jylland, Nord"
  startCity: string;      // e.g. "Hasle", "Albertslund"
  rwgpsId: string;        // e.g. "26937568"
  rwgpsUrl: string;       // full RWGPS URL
  pdfUrl: string | null;  // route description PDF URL
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Decode HTML entities commonly found on the Danish site.
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
    .replace(/&nbsp;/g, " ")
    .replace(/&aring;/g, "\u00e5")
    .replace(/&Aring;/g, "\u00c5")
    .replace(/&aelig;/g, "\u00e6")
    .replace(/&AElig;/g, "\u00c6")
    .replace(/&oslash;/g, "\u00f8")
    .replace(/&Oslash;/g, "\u00d8")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014");
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/**
 * Extract the first RideWithGPS route ID from a cell's HTML.
 * For the 1000km route (91) with multiple RWGPS links, prefer the "total" link.
 */
function extractRwgpsFromCell(cellHtml: string): { id: string; url: string } | null {
  // Check if there's a "total" link (for multi-day routes)
  const totalMatch = cellHtml.match(
    /href="(https?:\/\/ridewithgps\.com\/routes\/(\d+)[^"]*)"[^>]*>[^<]*<\/a>[^,]*,\s*total/i
  );
  if (totalMatch) {
    return { id: totalMatch[2], url: `https://ridewithgps.com/routes/${totalMatch[2]}` };
  }

  // Get the first RWGPS route link
  const match = cellHtml.match(
    /href="https?:\/\/ridewithgps\.com\/routes\/(\d+)[^"]*"/i
  );
  if (match) {
    return { id: match[1], url: `https://ridewithgps.com/routes/${match[1]}` };
  }

  // Fallback: raw text URL
  const textMatch = cellHtml.match(
    /ridewithgps\.com\/routes\/(\d+)/i
  );
  if (textMatch) {
    return { id: textMatch[1], url: `https://ridewithgps.com/routes/${textMatch[1]}` };
  }

  return null;
}

/**
 * Extract PDF URL from the Rutebeskrivelse cell.
 */
function extractPdfUrl(cellHtml: string): string | null {
  const match = cellHtml.match(/href="([^"]+\.pdf)"/i);
  return match ? match[1] : null;
}

/**
 * Extract route name from the Rutebeskrivelse cell.
 * The name may be split across multiple <a> and <span> tags,
 * so we extract the full cell text rather than just the first link.
 */
function extractRouteName(cellHtml: string): string {
  // Get the full text content of the cell (stripping all tags)
  const fullText = decodeHtmlEntities(stripHtml(cellHtml));
  if (fullText) return fullText;

  // Fallback: try first link text
  const linkMatch = cellHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  if (linkMatch) {
    const text = decodeHtmlEntities(stripHtml(linkMatch[1]));
    if (text) return text;
  }

  return "";
}

/**
 * Parse the listing page HTML table into route entries.
 *
 * The table uses rowspan attributes on the first two columns (Område and Startby)
 * to group multiple routes. The parser tracks inherited values from rowspanned cells.
 *
 * Cells per row vary:
 *   - 6 cells: Full row with all columns (new region + city group)
 *   - 5 cells: New city within same region (rowspan still active on Område)
 *   - 4 cells: New distance+route within same city (both Område and Startby inherited)
 *   - 3 cells: Same distance, new route variant (Område, Startby, Distance inherited)
 *   - 2 cells: Same everything except name/GPS (rare senior variant rows)
 */
function parseListingPage(html: string): ParsedRoute[] {
  const routes: ParsedRoute[] = [];

  // Extract the table body
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return routes;
  const tableHtml = tableMatch[1];

  // Extract all <tr> blocks
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const allRows: string[] = [];
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    allRows.push(trMatch[1]);
  }

  // Skip header row (row 0)
  if (allRows.length <= 1) return routes;

  // Track inherited values from rowspan cells
  let currentRegion = "";
  let currentCity = "";
  let currentDistance = 0;
  let regionRowsRemaining = 0;
  let cityRowsRemaining = 0;
  let distanceRowsRemaining = 0;

  for (let i = 1; i < allRows.length; i++) {
    const rowHtml = allRows[i];

    // Extract all <td> cells with their attributes
    const tdRegex = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
    const cells: { attrs: string; content: string }[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      cells.push({ attrs: tdMatch[1], content: tdMatch[2] });
    }

    if (cells.length === 0) continue;

    // Determine which cells are present based on rowspan tracking
    let cellIdx = 0;
    let region = currentRegion;
    let city = currentCity;
    let distance = currentDistance;
    let routeNumber = "";
    let nameHtml = "";
    let gpsHtml = "";

    // Check if first cell has rowspan (new Område)
    if (regionRowsRemaining <= 0 || cells.length >= 6) {
      // This row has a new region cell
      const regionCell = cells[cellIdx];
      if (regionCell) {
        region = decodeHtmlEntities(stripHtml(regionCell.content));
        const rowspanMatch = regionCell.attrs.match(/rowspan="(\d+)"/i);
        regionRowsRemaining = rowspanMatch ? parseInt(rowspanMatch[1], 10) : 1;
        currentRegion = region;
        cellIdx++;
      }
    }
    regionRowsRemaining--;

    // Check if we have a city cell
    const remainingCells = cells.length - cellIdx;

    if (cityRowsRemaining <= 0 || remainingCells >= 5) {
      // This row has a new city cell
      const cityCell = cells[cellIdx];
      if (cityCell) {
        city = decodeHtmlEntities(stripHtml(cityCell.content));
        const rowspanMatch = cityCell.attrs.match(/rowspan="(\d+)"/i);
        cityRowsRemaining = rowspanMatch ? parseInt(rowspanMatch[1], 10) : 1;
        currentCity = city;
        cellIdx++;
      }
    }
    cityRowsRemaining--;

    // Remaining cells should be: Distance, Rute #, Rutebeskrivelse, GPS
    const leftCells = cells.length - cellIdx;

    if (leftCells >= 4) {
      // Full set: Distance, Rute #, Name, GPS
      distance = parseFloat(stripHtml(cells[cellIdx].content)) || 0;
      const distRowspan = cells[cellIdx].attrs.match(/rowspan="(\d+)"/i);
      distanceRowsRemaining = distRowspan ? parseInt(distRowspan[1], 10) : 1;
      currentDistance = distance;
      cellIdx++;

      routeNumber = stripHtml(cells[cellIdx].content);
      cellIdx++;
      nameHtml = cells[cellIdx].content;
      cellIdx++;
      gpsHtml = cells[cellIdx].content;
    } else if (leftCells >= 3) {
      // Missing Distance: Rute #, Name, GPS (distance inherited)
      distanceRowsRemaining--;
      distance = currentDistance;

      routeNumber = stripHtml(cells[cellIdx].content);
      cellIdx++;
      nameHtml = cells[cellIdx].content;
      cellIdx++;
      gpsHtml = cells[cellIdx].content;
    } else if (leftCells >= 2) {
      // Only Name + GPS (senior variant row, same distance and route# group)
      distanceRowsRemaining--;
      distance = currentDistance;

      nameHtml = cells[cellIdx].content;
      cellIdx++;
      gpsHtml = cells[cellIdx].content;
      // Generate a pseudo route number for senior variants
      routeNumber = "";
    } else {
      continue; // Not enough data
    }

    // Extract RWGPS info
    const rwgps = extractRwgpsFromCell(gpsHtml);
    if (!rwgps) continue; // Skip rows without RWGPS links

    // Extract route name
    const name = extractRouteName(nameHtml);
    if (!name) continue;

    // Extract PDF URL
    const pdfUrl = extractPdfUrl(nameHtml);

    // If no explicit route number, derive from RWGPS ID
    if (!routeNumber) {
      routeNumber = `rwgps-${rwgps.id}`;
    }

    routes.push({
      routeNumber,
      name,
      distanceKm: distance,
      region,
      startCity: city,
      rwgpsId: rwgps.id,
      rwgpsUrl: rwgps.url,
      pdfUrl,
    });
  }

  return routes;
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
        distance: data.trip?.distance ?? 0,
        name: data.trip?.name ?? "",
      };
    } catch {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`RWGPS JSON failed for ${routeId}: ${msg}`);
    }
  }
}

/**
 * Fetch RWGPS route, build GPX, upload to MinIO, return processed data.
 */
async function fetchAndProcessRoute(
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
  const routeData = await fetchRwgpsRouteJson(rwgpsId);
  if (!routeData || routeData.trackPoints.length === 0) return null;

  const { elevationProfile, geojsonGeometry, elevationGainCalc } =
    processTrackPoints(routeData.trackPoints);

  const elevationM =
    routeData.elevationGain > 0
      ? Math.round(routeData.elevationGain)
      : elevationGainCalc;

  // Distance from RWGPS (meters -> km)
  const distanceKm =
    routeData.distance > 0
      ? Math.round((routeData.distance / 1000) * 10) / 10
      : routeData.trackPoints.length > 0
        ? Math.round(
            (routeData.trackPoints[routeData.trackPoints.length - 1].d / 1000) * 10
          ) / 10
        : 0;

  // Build GPX and upload to MinIO
  let gpxFileKey: string | null = null;
  try {
    const gpxString = buildGpxFromTrackPoints(
      routeData.trackPoints,
      routeData.name || routeName
    );
    const gpxBuffer = Buffer.from(gpxString, "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/dk-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical — geometry and elevation still available without MinIO upload
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Build a slug from a route number and RWGPS ID.
 * e.g. "19" -> "19", "rwgps-26937568" -> "rwgps-26937568"
 */
function buildSlug(routeNumber: string): string {
  return routeNumber.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
}

/**
 * Run the Audax Denmark permanent course scraper.
 */
export async function runAudaxDkScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch listing page
    console.log("[audax-dk] Fetching permanent routes listing...");
    const listingHtml = await httpsGet(LISTING_URL);

    // Step 2: Parse table rows
    const routes = parseListingPage(listingHtml);
    result.total = routes.length;
    console.log(`[audax-dk] Found ${routes.length} permanent courses`);

    if (routes.length === 0) {
      result.errors.push(
        "No courses found on listing page — HTML structure may have changed"
      );
      return result;
    }

    // Step 3: Process each route
    for (const route of routes) {
      try {
        const slug = buildSlug(route.routeNumber);
        const externalId = `dk-${slug}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "audax-dk",
            externalId,
          },
        });

        if (existing) {
          // Check for updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== route.name) updates.name = route.name;
          if (existing.distanceKm !== route.distanceKm)
            updates.distanceKm = route.distanceKm;
          if (existing.region !== route.region) updates.region = route.region;
          if (existing.startLocation !== route.startCity)
            updates.startLocation = route.startCity;

          const officialUrl = route.rwgpsUrl;
          if (existing.officialPageUrl !== officialUrl)
            updates.officialPageUrl = officialUrl;

          // Re-fetch route data if GPX is missing
          if (!existing.gpxFileKey) {
            try {
              await sleep(500);
              const routeResult = await fetchAndProcessRoute(
                route.rwgpsId,
                slug,
                route.name
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

        // Rate limit
        await sleep(500);

        // Fetch and process route data from RWGPS
        let gpxFileKey: string | null = null;
        let elevationM = 0;
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;

        try {
          const routeResult = await fetchAndProcessRoute(
            route.rwgpsId,
            slug,
            route.name
          );
          if (routeResult) {
            gpxFileKey = routeResult.gpxFileKey;
            elevationM = routeResult.elevationM;
            if (routeResult.distanceKm > 0)
              distanceKm = routeResult.distanceKm;
            elevationProfile = routeResult.elevationProfile;
            geojsonGeometry = routeResult.geojsonGeometry;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(
            `Route data failed for ${slug}: ${msg}`
          );
        }

        // Build course number: DK-{routeNumber}
        const courseNumber = route.routeNumber.startsWith("rwgps-")
          ? `DK-RWGPS-${route.rwgpsId}`
          : `DK-${route.routeNumber}`;

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        // Create course
        const newCourse = await prisma.course.create({
          data: {
            courseNumber,
            name: route.name,
            distanceKm: distanceKm || 0,
            elevationM,
            startLocation: route.startCity,
            endLocation: route.startCity, // Danish permanents are typically loops
            region: route.region,
            category: ["permanent"],
            tags: ["audax-dk"],
            description: route.pdfUrl
              ? `Route description: ${route.pdfUrl}`
              : null,
            officialPageUrl: route.rwgpsUrl,
            gpxFileKey,
            country: "DK",
            sourceType: "audax-dk",
            externalId: `dk-${slug}`,
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
        console.log(`[audax-dk] Created: ${route.name} (dk-${slug})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Route ${route.routeNumber}: ${msg}`);
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
      where: { key: "DK_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "DK_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "DK_LAST_SCRAPE_RESULT" },
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
        key: "DK_LAST_SCRAPE_RESULT",
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
