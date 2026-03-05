import { generateUniqueCourseSlug } from "./slug";

/**
 * RUSA (Randonneurs USA) Permanent Course Scraper
 *
 * Fetches permanent routes from RUSA's search page:
 *   POST https://rusa.org/cgi-bin/permsearch_PF.pl
 *
 * Listing returns a table with: Route #, Start Location, Km, Climbing, Name, States.
 * Each route links to a detail page:
 *   https://rusa.org/cgi-bin/permview_GF.pl?permid={id}
 *
 * The detail page contains a "Route URL" field linking to RideWithGPS.
 *
 * Flow:
 * 1. Fetch full listing of all active permanents
 * 2. Parse table rows for route metadata
 * 3. For new routes, fetch detail page to get RWGPS link
 * 4. Fetch RWGPS JSON API for track data, build GPX
 * 5. Upload GPX to MinIO, create/update course record
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const RUSA_SEARCH_URL = "https://rusa.org/cgi-bin/permsearch_PF.pl";
const RUSA_DETAIL_URL = "https://rusa.org/cgi-bin/permview_GF.pl";

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

interface ListingRoute {
  permId: string;
  name: string;
  distanceKm: number;
  climbingFt: number;
  startLocation: string; // e.g. "AK: Anchorage"
  states: string; // e.g. "AK" or "GA, AL"
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

/**
 * HTTP POST via Node https/http module (IPv4 forced for Docker compatibility).
 */
function httpsPost(
  url: string,
  body: string,
  timeout = 60000
): Promise<string> {
  const isHttps = url.startsWith("https");
  // eslint-disable-next-line no-eval
  const mod = eval("require")(isHttps ? "https" : "http") as {
    request: (
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
      write: (data: string) => void;
      end: () => void;
    };
  };

  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: "POST",
        family: 4,
        headers: {
          "User-Agent": "Audax-3chan/1.0",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
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
    req.write(body);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
    .replace(/&eacute;/g, "e")
    .replace(/&egrave;/g, "e")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, " - ")
    .replace(/&ndash;/g, "-")
    .replace(/&#39;/g, "'");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Make a URL-safe slug from a route name.
 */
function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Parse the RUSA permanent search listing HTML to extract route metadata.
 *
 * The table has rows like:
 * <TR style='background-color:LightGray'>
 *   <TD><A HREF="/cgi-bin/permview_GF.pl?permid=3603">3603</A></TD>
 *   <TD>AK: Anchorage</TD>
 *   <TD align=right>203</TD>
 *   <TD title='80 ft/mi' class='climbing-data' align=right>10,086'</TD>
 *   <TD align=center></TD>
 *   <TD align=left><A HREF="/cgi-bin/permview_GF.pl?permid=3603">APA</A></TD>
 *   <TD>AK</TD>
 * </TR>
 */
function parseListingPage(html: string): ListingRoute[] {
  const routes: ListingRoute[] = [];

  // Split HTML into table rows and process each one
  const trRegex = /<TR[^>]*>([\s\S]*?)<\/TR>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1];

    // Check if this row contains a permview link
    const permIdMatch = rowHtml.match(
      /permview_GF\.pl\?permid=(\d+)/
    );
    if (!permIdMatch) continue;

    const permId = permIdMatch[1];

    // Extract all TD contents
    const tdRegex = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      cells.push(tdMatch[1].trim());
    }

    // Expected columns: Route#, Start Location, Km, Climbing, (empty/unpaved icon), Name, States
    // Minimum 6 cells (with possible extra column)
    if (cells.length < 6) continue;

    // Cell 0: Route # link
    // Cell 1: Start Location
    const startLocation = decodeHtmlEntities(
      cells[1].replace(/<[^>]*>/g, "").trim()
    );

    // Cell 2: Distance (may have unpaved div)
    const distMatch = cells[2].match(/^(\d+)/);
    const distanceKm = distMatch ? parseInt(distMatch[1], 10) : 0;

    // Cell 3: Climbing
    const climbingRaw = cells[3].replace(/<[^>]*>/g, "").replace(/[^0-9]/g, "");
    const climbingFt = parseInt(climbingRaw, 10) || 0;

    // Find the name cell - it contains a permview link with the route name
    // Could be cell 4, 5, or later depending on extra columns
    let name = "";
    let statesCell = "";
    for (let i = 4; i < cells.length; i++) {
      const nameMatch = cells[i].match(
        /permview_GF\.pl\?permid=\d+[^>]*>([^<]+)<\/A>/i
      );
      if (nameMatch) {
        name = decodeHtmlEntities(nameMatch[1].trim());
        // States is the next cell
        if (i + 1 < cells.length) {
          statesCell = decodeHtmlEntities(
            cells[i + 1].replace(/<[^>]*>/g, "").trim()
          );
        }
        break;
      }
    }

    if (permId && name) {
      routes.push({
        permId,
        name,
        distanceKm,
        climbingFt,
        startLocation,
        states: statesCell,
      });
    }
  }

  return routes;
}

/**
 * Parse a RUSA permanent detail page to extract the RideWithGPS route URL.
 *
 * The detail page has:
 * <TH align=left>Route URL</TH>
 * <TD><A HREF="https://ridewithgps.com/routes/35965090" ...>...</A></TD>
 */
function parseDetailPage(html: string): {
  rwgpsId: string | null;
  description: string | null;
  shape: string | null;
} {
  let rwgpsId: string | null = null;
  let description: string | null = null;
  let shape: string | null = null;

  // Extract RWGPS route ID from the Route URL field
  const rwgpsMatch = html.match(
    /Route URL<\/TH>\s*<TD[^>]*><A\s+HREF="https?:\/\/ridewithgps\.com\/routes\/(\d+)"/i
  );
  if (rwgpsMatch) {
    rwgpsId = rwgpsMatch[1];
  }

  // Extract description
  const descMatch = html.match(
    /Description<\/TH>\s*<TD[^>]*>([\s\S]*?)<\/TD>/i
  );
  if (descMatch) {
    description = decodeHtmlEntities(descMatch[1].replace(/<[^>]*>/g, "").trim());
    if (!description || description.length < 2) description = null;
  }

  // Extract shape
  const shapeMatch = html.match(/Shape<\/TH>\s*<TD[^>]*>([^<]+)<\/TD>/i);
  if (shapeMatch) {
    shape = shapeMatch[1].trim().toLowerCase();
  }

  return { rwgpsId, description, shape };
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
    gpxFileKey = `courses/us-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Parse the start location from RUSA format (e.g. "AK: Anchorage") into state and city.
 */
function parseStartLocation(raw: string): { state: string; city: string } {
  const parts = raw.split(":");
  if (parts.length >= 2) {
    return {
      state: parts[0].trim(),
      city: parts.slice(1).join(":").trim(),
    };
  }
  return { state: "", city: raw.trim() };
}

/**
 * Run the RUSA permanents scraper.
 */
export async function runRusaScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch the full listing of all active permanents
    console.log("[rusa] Fetching full permanent listing...");
    const formBody =
      "start=&dist=&min_climbing=0&max_climbing=999999&climbing_unit=feet" +
      "&include_loop=1&include_ob=1&include_pp=1" +
      "&through=&includes=&sortfield=location&submit=search";
    const listingHtml = await httpsPost(RUSA_SEARCH_URL, formBody);

    const allRoutes = parseListingPage(listingHtml);
    result.total = allRoutes.length;
    console.log(`[rusa] Found ${allRoutes.length} permanents in listing`);

    if (allRoutes.length === 0) {
      result.errors.push("No routes found - HTML structure may have changed");
      return result;
    }

    // Step 2: Get existing routes from DB for dedup
    const existingRoutes = await prisma.course.findMany({
      where: { sourceType: "rusa" },
      select: { id: true, externalId: true, gpxFileKey: true, name: true },
    });
    const existingByExternalId = new Map(
      existingRoutes.map((r) => [r.externalId, r])
    );
    console.log(
      `[rusa] ${existingRoutes.length} existing RUSA courses in DB`
    );

    // Blacklisted external IDs — deleted by admin, skip on re-sync
    const BLACKLISTED_IDS = new Set(["us-4599", "us-5458"]);

    // Step 3: Process each route
    for (const route of allRoutes) {
      try {
        const externalId = `us-${route.permId}`;

        if (BLACKLISTED_IDS.has(externalId)) {
          result.skipped++;
          continue;
        }

        const existing = existingByExternalId.get(externalId);

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== route.name) updates.name = route.name;

          // Re-download GPX if missing
          if (!existing.gpxFileKey) {
            try {
              await sleep(500);
              console.log(
                `[rusa] Re-fetching detail for ${route.permId} (missing GPX)...`
              );
              const detailHtml = await httpsGet(
                `${RUSA_DETAIL_URL}?permid=${route.permId}`
              );
              const detail = parseDetailPage(detailHtml);

              if (detail.rwgpsId) {
                await sleep(500);
                const gpxData = await fetchAndProcessRwgps(
                  detail.rwgpsId,
                  makeSlug(`${route.permId}-${route.name}`),
                  route.name
                );

                if (gpxData) {
                  if (gpxData.gpxFileKey) updates.gpxFileKey = gpxData.gpxFileKey;
                  if (gpxData.elevationM > 0) updates.elevationM = gpxData.elevationM;
                  if (gpxData.distanceKm > 0 && !route.distanceKm)
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
                `GPX re-download failed for ${route.permId}: ${msg}`
              );
            }
          }

          // Regenerate slug if name or distance changed
          if (updates.name !== undefined || updates.distanceKm !== undefined) {
            updates.slug = await generateUniqueCourseSlug(
              (updates.name as string) ?? existing.name,
              (updates.distanceKm as number) ?? 0,
              `US-${route.permId}`,
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

        // Fetch detail page for RWGPS link and description
        console.log(
          `[rusa] Fetching detail for ${route.permId} (${route.name})...`
        );
        const detailHtml = await httpsGet(
          `${RUSA_DETAIL_URL}?permid=${route.permId}`
        );
        const detail = parseDetailPage(detailHtml);

        let gpxFileKey: string | null = null;
        let elevationM = route.climbingFt
          ? Math.round(route.climbingFt * 0.3048)
          : 0;
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;

        if (detail.rwgpsId) {
          try {
            await sleep(500);
            const data = await fetchAndProcessRwgps(
              detail.rwgpsId,
              makeSlug(`${route.permId}-${route.name}`),
              route.name
            );
            if (data) {
              gpxFileKey = data.gpxFileKey;
              if (data.elevationM > 0) elevationM = data.elevationM;
              if (data.distanceKm > 0) distanceKm = data.distanceKm;
              elevationProfile = data.elevationProfile;
              geojsonGeometry = data.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`RWGPS failed for ${route.permId}: ${msg}`);
          }
        }

        // Build course metadata
        const { state, city } = parseStartLocation(route.startLocation);
        const courseNumber = `US-${route.permId}`;
        const officialPageUrl = `https://rusa.org/cgi-bin/permview_GF.pl?permid=${route.permId}`;

        // Determine category based on distance
        const category: string[] = [];
        if (distanceKm < 200) {
          category.push("populaire");
        } else {
          category.push("brevet");
        }
        if (detail.shape) {
          category.push(detail.shape);
        }

        const region = state
          ? `${state}${city ? " - " + city : ""}`
          : route.startLocation;

        const startEnd = city || route.startLocation;

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
            startLocation: startEnd,
            endLocation: startEnd,
            region,
            category,
            tags: ["rusa"],
            description: detail.description,
            officialPageUrl,
            gpxFileKey,
            country: "US",
            sourceType: "rusa",
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
          `[rusa] Created: ${courseNumber} - ${route.name} (${distanceKm}km)`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Route ${route.permId}: ${msg}`);
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
      where: { key: "US_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "US_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "US_LAST_SCRAPE_RESULT" },
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
        key: "US_LAST_SCRAPE_RESULT",
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
    `[rusa] Scrape complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors out of ${result.total} total`
  );

  return result;
}
