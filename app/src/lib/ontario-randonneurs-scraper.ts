/**
 * Randonneurs Ontario Permanent Course Scraper
 *
 * Fetches routes from 4 chapter pages:
 *   - https://randonneursontario.ca/routes/torroutes.html (Toronto)
 *   - https://randonneursontario.ca/routes/simroutes.html (Simcoe-Muskoka)
 *   - https://randonneursontario.ca/routes/ottroutes.html (Ottawa)
 *   - https://randonneursontario.ca/routes/hurroutes.html (Huron)
 *
 * Each page has <li><a href="...">Route Name Distance</a></li> entries.
 * Link types:
 *   - RideWithGPS: https://ridewithgps.com/routes/{ID}
 *   - GPX via map viewer: ../routes/gmap400.php?...&track={file}.gpx
 *   - PDF route sheets: ../routes/{chapter}/{file}.pdf (skipped)
 *
 * Flow:
 * 1. Fetch each chapter page
 * 2. Parse route links, categorize by type
 * 3. For RWGPS links: fetch JSON API for track data, build GPX
 * 4. For GPX links: download directly from server
 * 5. Parse/upload GPX, create or update course record
 */

import { prisma } from "./db";
import { parseGpx, sampleElevations } from "./gpx";

const BASE_URL = "https://randonneursontario.ca";

const CHAPTER_PAGES = [
  { key: "tor", name: "Toronto", url: `${BASE_URL}/routes/torroutes.html`, path: "torroutes" },
  { key: "sim", name: "Simcoe-Muskoka", url: `${BASE_URL}/routes/simroutes.html`, path: "simroutes" },
  { key: "ott", name: "Ottawa", url: `${BASE_URL}/routes/ottroutes.html`, path: "ottroutes" },
  { key: "hur", name: "Huron", url: `${BASE_URL}/routes/hurroutes.html`, path: "hurroutes" },
];

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
  chapter: string;       // tor, sim, ott, hur
  chapterName: string;   // Toronto, Simcoe-Muskoka, Ottawa, Huron
  name: string;          // Route name (without distance suffix)
  distanceKm: number;    // Extracted from name or category
  category: string;      // populaire, brevet, event
  linkType: "rwgps" | "gpx" | "pdf";
  rwgpsId?: string;      // RWGPS route ID
  gpxUrl?: string;       // Direct GPX file URL
  slug: string;          // Unique identifier
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

/**
 * Extract distance from route name. The last number in the name is usually the distance.
 * e.g. "Bewdley 160" → 160, "Concord Beeton Flat 100" → 100
 */
function extractDistanceFromName(name: string): number {
  // Match the last standalone number in the name
  const matches = name.match(/\b(\d{2,5})\b/g);
  if (matches && matches.length > 0) {
    return parseInt(matches[matches.length - 1], 10);
  }
  return 0;
}

/**
 * Extract category from section header.
 */
function categorizeFromHeader(header: string): string {
  const h = header.toLowerCase();
  if (h.includes("populaire")) return "populaire";
  if (h.includes("devil") || h.includes("granite")) return "event";
  return "brevet";
}

/**
 * Parse a chapter page HTML to extract route links.
 */
function parseChapterPage(
  html: string,
  chapter: string,
  chapterName: string,
  chapterPath: string
): ParsedRoute[] {
  const routes: ParsedRoute[] = [];
  const seen = new Set<string>();

  // Split by h2/h3 headers to get category context
  // Match headers like <h2>Populaires</h2>, <h3>200 km Brevets</h3>
  const sections = html.split(/<h[23][^>]*>/i);

  let currentCategory = "brevet";

  for (const section of sections) {
    // Extract header text from the beginning of each section
    const headerMatch = section.match(/^([^<]+)<\/h[23]>/i);
    if (headerMatch) {
      currentCategory = categorizeFromHeader(headerMatch[1]);
    }

    // Find all <a> links in <li> or <p> elements
    const linkRegex = /<(?:li|p)[^>]*>\s*<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(section)) !== null) {
      const href = match[1];
      const rawName = decodeHtmlEntities(match[2].trim());

      // Skip empty names or non-route links
      if (!rawName || rawName.length < 3) continue;

      // Clean name: remove "PDF" suffix
      const cleanName = rawName.replace(/\s+PDF\s*$/i, "").trim();
      if (!cleanName) continue;

      const distanceKm = extractDistanceFromName(cleanName);
      const slug = `${chapter}-${makeSlug(cleanName)}`;

      // Deduplicate
      if (seen.has(slug)) continue;
      seen.add(slug);

      // Categorize link type
      if (href.includes("ridewithgps.com/routes/")) {
        const rwgpsMatch = href.match(/ridewithgps\.com\/routes\/(\d+)/);
        if (rwgpsMatch) {
          routes.push({
            chapter,
            chapterName,
            name: cleanName,
            distanceKm,
            category: currentCategory,
            linkType: "rwgps",
            rwgpsId: rwgpsMatch[1],
            slug,
          });
        }
      } else if (href.includes("gmap400.php") && href.includes(".gpx")) {
        // Extract GPX filename from gmap400.php URL
        const trackMatch = href.match(/track=([^&]+\.gpx)/i);
        if (trackMatch) {
          const gpxFilename = trackMatch[1];
          const gpxUrl = `${BASE_URL}/routes/${chapterPath}/${gpxFilename}`;
          routes.push({
            chapter,
            chapterName,
            name: cleanName,
            distanceKm,
            category: currentCategory,
            linkType: "gpx",
            gpxUrl,
            slug,
          });
        }
      } else if (href.endsWith(".pdf")) {
        // PDF — skip, no route geometry
        continue;
      }
    }
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

    if (!data.track_points || !Array.isArray(data.track_points) || data.track_points.length === 0) {
      // Try trips endpoint
      const tripsUrl = `https://ridewithgps.com/trips/${rwgpsId}.json`;
      try {
        const tripsJson = await httpsGet(tripsUrl, 60000);
        const tripsData = JSON.parse(tripsJson);
        if (!tripsData.trip?.track_points || tripsData.trip.track_points.length === 0) {
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
      if (!tripsData.trip?.track_points || tripsData.trip.track_points.length === 0) {
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

  const elevationM = elevationGain > 0 ? Math.round(elevationGain) : Math.round(gain);
  const distanceKm =
    distance > 0
      ? Math.round((distance / 1000) * 10) / 10
      : trackPoints.length > 0
        ? Math.round((trackPoints[trackPoints.length - 1].d / 1000) * 10) / 10
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
    gpxFileKey = `courses/or-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    // Non-critical
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Download and process a GPX file directly from the Ontario site.
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
    gpxFileKey = `courses/or-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    // Non-critical
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Run the Randonneurs Ontario scraper.
 */
export async function runOntarioRandonneursScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch all chapter pages
    const allRoutes: ParsedRoute[] = [];

    for (const chapter of CHAPTER_PAGES) {
      try {
        console.log(`[ontario] Fetching ${chapter.name} routes...`);
        const html = await httpsGet(chapter.url);
        const routes = parseChapterPage(html, chapter.key, chapter.name, chapter.path);
        console.log(`[ontario] ${chapter.name}: ${routes.length} routes (RWGPS + GPX)`);
        allRoutes.push(...routes);
        await sleep(500);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Failed to fetch ${chapter.name}: ${msg}`);
      }
    }

    // Deduplicate across chapters (same RWGPS ID might appear in multiple chapters)
    const deduped: ParsedRoute[] = [];
    const seenRwgps = new Set<string>();
    const seenSlugs = new Set<string>();

    for (const route of allRoutes) {
      if (route.rwgpsId) {
        if (seenRwgps.has(route.rwgpsId)) continue;
        seenRwgps.add(route.rwgpsId);
      }
      if (seenSlugs.has(route.slug)) continue;
      seenSlugs.add(route.slug);
      deduped.push(route);
    }

    result.total = deduped.length;
    console.log(`[ontario] Total unique routes: ${deduped.length} (from ${allRoutes.length} raw)`);

    if (deduped.length === 0) {
      result.errors.push("No routes found — HTML structure may have changed");
      return result;
    }

    // Step 2: Process each route
    for (const route of deduped) {
      try {
        const externalId = route.rwgpsId
          ? `or-rwgps-${route.rwgpsId}`
          : `or-${route.slug}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "ontario-randonneurs",
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

          // Re-download GPX if missing
          if (!existing.gpxFileKey) {
            try {
              await sleep(500);
              const gpxData = route.linkType === "rwgps" && route.rwgpsId
                ? await fetchAndProcessRwgps(route.rwgpsId, route.slug, route.name)
                : route.linkType === "gpx" && route.gpxUrl
                  ? await downloadAndProcessGpx(route.gpxUrl, route.slug)
                  : null;

              if (gpxData) {
                if (gpxData.gpxFileKey) updates.gpxFileKey = gpxData.gpxFileKey;
                if (gpxData.elevationM > 0) updates.elevationM = gpxData.elevationM;
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
              result.errors.push(`GPX re-download failed for ${route.slug}: ${msg}`);
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
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null = null;
        let geojsonGeometry: object | null = null;

        if (route.linkType === "rwgps" && route.rwgpsId) {
          try {
            const data = await fetchAndProcessRwgps(route.rwgpsId, route.slug, route.name);
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
        } else if (route.linkType === "gpx" && route.gpxUrl) {
          try {
            const data = await downloadAndProcessGpx(route.gpxUrl, route.slug);
            if (data) {
              gpxFileKey = data.gpxFileKey;
              elevationM = data.elevationM;
              if (data.distanceKm > 0) distanceKm = data.distanceKm;
              elevationProfile = data.elevationProfile;
              geojsonGeometry = data.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`GPX download failed for ${route.slug}: ${msg}`);
          }
        }

        // Build course number
        const prefix = route.chapter.toUpperCase();
        const number = route.rwgpsId || makeSlug(route.name).slice(0, 20);
        const courseNumber = `OR-${prefix}-${number}`;

        // Official page URL
        const officialPageUrl = route.rwgpsId
          ? `https://ridewithgps.com/routes/${route.rwgpsId}`
          : route.gpxUrl || `${BASE_URL}/routes/${route.chapter}routes.html`;

        const newCourse = await prisma.course.create({
          data: {
            courseNumber,
            name: route.name,
            distanceKm: distanceKm || 0,
            elevationM,
            startLocation: route.chapterName,
            endLocation: route.chapterName,
            region: `Ontario - ${route.chapterName}`,
            category: [route.category],
            tags: ["ontario-randonneurs", route.chapter],
            description: null,
            officialPageUrl,
            gpxFileKey,
            country: "CA",
            sourceType: "ontario-randonneurs",
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
      where: { key: "OR_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "OR_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "OR_LAST_SCRAPE_RESULT" },
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
        key: "OR_LAST_SCRAPE_RESULT",
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
