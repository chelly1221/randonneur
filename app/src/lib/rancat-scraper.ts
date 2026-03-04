/**
 * Randonneurs Catalunya (RANCAT) Permanent Course Scraper
 *
 * Fetches permanent routes from https://rancat.cat/proves/
 *
 * The main page lists ~10 permanent courses/brevets. Each course page
 * may contain an OpenRunner route link (openrunner.com/index.php?id={ID}
 * or openrunner.com/route-details/{ID}).
 *
 * For routes with OpenRunner IDs, we fetch route data from the
 * OpenRunner API (api.openrunner.com/api/v2/routes/{id}) which returns
 * an encoded polyline (Google format) and elevation data.
 *
 * Flow:
 * 1. Fetch main /proves/ page, extract links to individual route pages
 * 2. Fetch each route page, extract OpenRunner IDs and metadata
 * 3. For routes with OpenRunner data: decode polyline, build GPX, upload
 * 4. Create or update course records
 *
 * Settings keys: ES_SCRAPER_ENABLED, ES_LAST_SCRAPE_DATE, ES_LAST_SCRAPE_RESULT
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const BASE_URL = "https://rancat.cat";
const OPENRUNNER_API = "https://api.openrunner.com/api/v2/routes";

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface ParsedRoute {
  name: string;
  slug: string;
  pageUrl: string;
  distanceKm: number;
  elevationM: number;
  description: string;
  openrunnerId: string | null;
  startLocation: string;
  endLocation: string;
}

interface OpenRunnerData {
  name: string;
  length: number; // meters
  elevation: {
    ascent: number;
    descent: number;
    min: number;
    max: number;
    full_encoded: string;
  };
  shape: {
    full_encoded: string;
  };
  start_location?: { name: string };
  end_location?: { name: string };
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Decode Google encoded polyline format.
 * Returns array of [lat, lng] pairs.
 */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Decode longitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * Decode OpenRunner elevation profile encoded string.
 * Same Google polyline encoding but single-value (elevations already in meters).
 */
function decodeElevationProfile(encoded: string): number[] {
  const elevations: number[] = [];
  let index = 0;
  let value = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    value += result & 1 ? ~(result >> 1) : result >> 1;
    elevations.push(value); // Values are already in meters
  }

  return elevations;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build GPX XML from decoded polyline coordinates and elevations.
 */
function buildGpxFromPolyline(
  points: [number, number][],
  elevations: number[],
  name: string
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Audax-3chan via OpenRunner"',
    '  xmlns="http://www.topografix.com/GPX/1/1">',
    "  <trk>",
    `    <name>${escapeXml(name)}</name>`,
    "    <trkseg>",
  ];

  for (let i = 0; i < points.length; i++) {
    const [lat, lng] = points[i];
    const ele = i < elevations.length ? elevations[i] : 0;
    lines.push(
      `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`
    );
  }

  lines.push("    </trkseg>", "  </trk>", "</gpx>");
  return lines.join("\n");
}

/**
 * Parse the main /proves/ page to extract route page links.
 *
 * The page structure has <h4>Route Name</h4> followed by an <a> tag
 * linking to /proves/{slug}/. We collect h4 titles and link URLs
 * separately, then match each link to the closest preceding h4.
 */
function parseMainPage(html: string): { name: string; url: string }[] {
  // Collect all h4 tags with their positions
  const h4Tags: { text: string; index: number }[] = [];
  const h4Regex = /<h4[^>]*>([^<]+)<\/h4>/gi;
  let match;
  while ((match = h4Regex.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1].trim());
    // Clean up notes like "&#8211; PROVA EN REVISIO..."
    const cleaned = text.replace(/\s*[\u2013\u2014–—-]\s*PROVA\s+EN\s+REVISI.*/i, "").trim();
    if (cleaned) {
      h4Tags.push({ text: cleaned, index: match.index });
    }
  }

  // Collect all links to /proves/{slug}/ with their positions
  const provesLinks: { url: string; slug: string; index: number }[] = [];
  const linkRegex = /href=["'](https?:\/\/rancat\.cat\/proves\/([^"'/]+)\/?)['"]/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const slug = match[2];
    // Skip the main /proves/ page itself, feed, and other non-route slugs
    if (!slug || slug === "feed" || slug === "proves") continue;
    provesLinks.push({ url, slug, index: match.index });
  }

  // Deduplicate links by slug
  const seen = new Set<string>();
  const uniqueLinks = provesLinks.filter((l) => {
    if (seen.has(l.slug)) return false;
    seen.add(l.slug);
    return true;
  });

  // Match each link to the closest preceding h4
  const routes: { name: string; url: string }[] = [];
  for (const link of uniqueLinks) {
    let closestH4: { text: string; index: number } | null = null;
    for (const h4 of h4Tags) {
      if (h4.index < link.index) {
        closestH4 = h4;
      }
    }

    if (closestH4) {
      routes.push({ name: closestH4.text, url: link.url });
    }
  }

  return routes;
}

/**
 * Extract OpenRunner route ID from a route page HTML.
 */
function extractOpenrunnerId(html: string): string | null {
  // Match various OpenRunner URL formats:
  // openrunner.com/index.php?id=NNNN
  // openrunner.com/route-details/NNNN
  // openrunner.com/en/route-details/NNNN
  const patterns = [
    /openrunner\.com\/(?:index\.php\?id=|route-details\/|[a-z]{2}\/route-details\/)(\d+)/i,
    /openrunner\.com\/route\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Extract distance from page text. Looks for patterns like "600 km", "1.200 km", "1,200 km".
 */
function extractDistanceFromPage(html: string): number {
  // Remove HTML tags for cleaner text matching
  const text = html.replace(/<[^>]+>/g, " ");

  // Match distance patterns: "600 km", "1.200 km", "1,200 km", "600km"
  const patterns = [
    /(\d{1,2}[.,]\d{3})\s*km/i,   // 1.200 km or 1,200 km
    /(\d{3,5})\s*km/i,             // 600 km, 1200 km
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = match[1].replace(/[.,]/g, "");
      const val = parseInt(num, 10);
      if (val > 50 && val < 5000) return val;
    }
  }

  return 0;
}

/**
 * Extract elevation from page text. Looks for patterns like "10.000 m", "3,267 m", etc.
 */
function extractElevationFromPage(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ");

  // Match elevation patterns, looking for context clues
  const patterns = [
    /(\d{1,2}[.,]\d{3})\s*m(?:etres?|eters?)?(?:\s+(?:de\s+)?(?:desnivell|elevation|ascent|d['´]ascens))/i,
    /(?:desnivell|elevation|ascent|d['´]ascens)[^0-9]*(\d{1,2}[.,]\d{3})\s*m/i,
    /(\d{1,2}[.,]\d{3})\s*m\b/i,  // Generic X.XXX m pattern
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = match[1].replace(/[.,]/g, "");
      const val = parseInt(num, 10);
      if (val > 500 && val < 30000) return val;
    }
  }

  return 0;
}

/**
 * Extract a brief description from the page text.
 */
function extractDescription(html: string): string {
  // Look for the first substantial paragraph in the content area
  const contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const content = contentMatch ? contentMatch[1] : html;

  const paraRegex = /<p[^>]*>([^<]{50,})<\/p>/gi;
  const match = paraRegex.exec(content);
  if (match) {
    const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "").trim());
    return text.length > 300 ? text.slice(0, 297) + "..." : text;
  }

  return "";
}

/**
 * Parse a route page and extract metadata + OpenRunner ID.
 */
function parseRoutePage(
  html: string,
  pageUrl: string,
  fallbackName: string
): ParsedRoute | null {
  const openrunnerId = extractOpenrunnerId(html);
  const distanceKm = extractDistanceFromPage(html);
  const elevationM = extractElevationFromPage(html);
  const description = extractDescription(html);

  // Extract slug from URL
  const urlMatch = pageUrl.match(/\/proves\/([^/]+)\/?$/);
  const slug = urlMatch ? urlMatch[1] : makeSlug(fallbackName);

  // Try to get a better name from the page title
  // Note: h1 often just says "Creacio" on rancat, so prefer fallbackName from main page
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const titleText = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : "";
  const name =
    titleText && titleText.length > 3 && titleText.toLowerCase() !== "creació"
      ? titleText
      : fallbackName;

  return {
    name,
    slug,
    pageUrl,
    distanceKm,
    elevationM,
    description,
    openrunnerId,
    startLocation: "Catalunya",
    endLocation: "Catalunya",
  };
}

/**
 * Fetch OpenRunner route data and process into course data.
 */
async function fetchAndProcessOpenRunner(
  openrunnerId: string,
  slug: string,
  routeName: string
): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  distanceKm: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
  startLocation: string;
  endLocation: string;
} | null> {
  const url = `${OPENRUNNER_API}/${openrunnerId}`;

  let data: OpenRunnerData;
  try {
    const json = await httpsGet(url, 60000);
    const raw = JSON.parse(json);
    // API wraps response in { data: {...} }
    data = raw.data || raw;
  } catch (e) {
    console.error(`[rancat] Failed to fetch OpenRunner ${openrunnerId}:`, e);
    return null;
  }

  if (!data.shape?.full_encoded) {
    console.warn(`[rancat] No shape data for OpenRunner ${openrunnerId}`);
    return null;
  }

  // Decode polyline to get coordinates
  const points = decodePolyline(data.shape.full_encoded);
  if (points.length < 2) {
    console.warn(`[rancat] Too few points for OpenRunner ${openrunnerId}`);
    return null;
  }

  // Decode elevation profile
  let elevations: number[] = [];
  if (data.elevation?.full_encoded) {
    elevations = decodeElevationProfile(data.elevation.full_encoded);
  }

  const distanceKm = Math.round((data.length / 1000) * 10) / 10;
  const elevationM = Math.round(data.elevation?.ascent || 0);

  // Build elevation profile for chart
  let elevationProfile: { distance: number; elevation: number }[] | null = null;
  if (elevations.length > 0 && points.length > 0) {
    // Distribute elevations evenly along the distance
    const totalDist = distanceKm;
    const rawProfile = elevations.map((ele, i) => ({
      distance: (i / Math.max(elevations.length - 1, 1)) * totalDist,
      elevation: ele,
    }));
    elevationProfile = sampleElevations(rawProfile, 500);
  }

  // Build GeoJSON geometry
  const coordinates = points.map(([lat, lng]) => [lng, lat]); // GeoJSON is [lng, lat]
  const geojsonGeometry =
    coordinates.length > 1 ? { type: "LineString", coordinates } : null;

  // Build GPX and upload to MinIO
  let gpxFileKey: string | null = null;
  try {
    const gpxString = buildGpxFromPolyline(points, elevations, routeName);
    const gpxBuffer = Buffer.from(gpxString, "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = `courses/es-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch (e) {
    gpxFileKey = null; // Reset — file not actually in MinIO
    console.error(`[rancat] MinIO upload failed for ${slug}:`, e);
    // Non-critical
  }

  const startLocation = data.start_location?.name || "Catalunya";
  const endLocation = data.end_location?.name || "Catalunya";

  return {
    gpxFileKey,
    elevationM,
    distanceKm,
    elevationProfile,
    geojsonGeometry,
    startLocation,
    endLocation,
  };
}

/**
 * Run the Randonneurs Catalunya scraper.
 */
export async function runRancatScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch main page and extract route links
    console.log("[rancat] Fetching main proves page...");
    const mainHtml = await httpsGet(`${BASE_URL}/proves/`);
    const routeLinks = parseMainPage(mainHtml);
    console.log(`[rancat] Found ${routeLinks.length} route links`);

    if (routeLinks.length === 0) {
      result.errors.push("No route links found — HTML structure may have changed");
      return result;
    }

    // Step 2: Fetch each route page and extract metadata
    const parsedRoutes: ParsedRoute[] = [];

    for (const link of routeLinks) {
      try {
        await sleep(500);
        console.log(`[rancat] Fetching ${link.name}: ${link.url}`);
        const pageHtml = await httpsGet(link.url);
        const route = parseRoutePage(pageHtml, link.url, link.name);
        if (route) {
          parsedRoutes.push(route);
          console.log(
            `[rancat]   -> ${route.name}: ${route.distanceKm}km, ` +
            `OpenRunner: ${route.openrunnerId || "none"}`
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Failed to fetch ${link.name}: ${msg}`);
      }
    }

    result.total = parsedRoutes.length;
    console.log(`[rancat] Total routes parsed: ${parsedRoutes.length}`);

    if (parsedRoutes.length === 0) {
      result.errors.push("No routes parsed — pages may have changed");
      return result;
    }

    // Step 3: Process each route
    for (const route of parsedRoutes) {
      try {
        const externalId = route.openrunnerId
          ? `es-or-${route.openrunnerId}`
          : `es-${route.slug}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "rancat",
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
          if (route.elevationM > 0 && existing.elevationM !== route.elevationM) {
            updates.elevationM = route.elevationM;
          }

          // Re-download GPX/geometry if missing and OpenRunner ID available
          if (!existing.gpxFileKey && route.openrunnerId) {
            try {
              await sleep(500);
              const orData = await fetchAndProcessOpenRunner(
                route.openrunnerId,
                route.slug,
                route.name
              );

              if (orData) {
                if (orData.gpxFileKey) updates.gpxFileKey = orData.gpxFileKey;
                if (orData.elevationM > 0) updates.elevationM = orData.elevationM;
                if (orData.distanceKm > 0 && !existing.distanceKm)
                  updates.distanceKm = orData.distanceKm;
                if (orData.elevationProfile)
                  updates.elevationProfile = orData.elevationProfile;
                if (orData.startLocation !== "Catalunya")
                  updates.startLocation = orData.startLocation;
                if (orData.endLocation !== "Catalunya")
                  updates.endLocation = orData.endLocation;

                if (orData.geojsonGeometry) {
                  try {
                    await prisma.$executeRawUnsafe(
                      `UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid`,
                      JSON.stringify(orData.geojsonGeometry),
                      existing.id
                    );
                  } catch {
                    // Non-critical
                  }
                }
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              result.errors.push(`OpenRunner re-download failed for ${route.slug}: ${msg}`);
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
        let elevationM = route.elevationM;
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null = null;
        let geojsonGeometry: object | null = null;
        let startLocation = route.startLocation;
        let endLocation = route.endLocation;

        if (route.openrunnerId) {
          await sleep(500);
          try {
            const orData = await fetchAndProcessOpenRunner(
              route.openrunnerId,
              route.slug,
              route.name
            );
            if (orData) {
              gpxFileKey = orData.gpxFileKey;
              if (orData.elevationM > 0) elevationM = orData.elevationM;
              if (orData.distanceKm > 0) distanceKm = orData.distanceKm;
              elevationProfile = orData.elevationProfile;
              geojsonGeometry = orData.geojsonGeometry;
              if (orData.startLocation !== "Catalunya")
                startLocation = orData.startLocation;
              if (orData.endLocation !== "Catalunya")
                endLocation = orData.endLocation;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`OpenRunner failed for ${route.slug}: ${msg}`);
          }
        }

        // Build course number
        const courseNumber = `ES-${route.slug}`;

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        const newCourse = await prisma.course.create({
          data: {
            courseNumber,
            name: route.name,
            distanceKm: distanceKm || 0,
            elevationM: elevationM || 0,
            startLocation,
            endLocation,
            region: "Catalunya",
            category: ["permanent"],
            tags: ["rancat"],
            description: route.description || null,
            officialPageUrl: route.pageUrl,
            gpxFileKey,
            country: "ES",
            sourceType: "rancat",
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
          `[rancat] Created: ${route.name} (${distanceKm}km, ` +
          `GPX: ${gpxFileKey ? "yes" : "no"})`
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
      where: { key: "ES_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "ES_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "ES_LAST_SCRAPE_RESULT" },
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
        key: "ES_LAST_SCRAPE_RESULT",
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
