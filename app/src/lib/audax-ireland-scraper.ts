/**
 * Audax Ireland Permanent Course Scraper
 *
 * Fetches permanent courses from https://www.audaxireland.org/audax/permanents/
 *
 * Flow:
 * 1. Fetch the permanents listing page
 * 2. Parse route links: name, detail page URL, distance (from name)
 * 3. For each route, visit the detail page to extract RideWithGPS links
 * 4. For each RWGPS link: fetch JSON API for track data, build GPX
 * 5. Upload GPX to MinIO, create or update course record
 *
 * Some pages list multiple RWGPS routes (e.g. Royal Canal 200/300/400).
 * Each distinct RWGPS route becomes a separate course.
 *
 * RideWithGPS JSON API: https://ridewithgps.com/routes/{id}.json
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const LISTING_URL = "https://www.audaxireland.org/audax/permanents/";

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

interface ParsedListingRoute {
  name: string;          // Route name from listing page
  detailUrl: string;     // URL to the detail page
  distanceKm: number;    // Distance extracted from name (e.g. "Antrim 200" → 200)
  slug: string;          // URL-safe slug from name
}

interface ParsedRoute {
  name: string;          // Route name (possibly refined from detail page)
  detailUrl: string;     // Detail page URL
  distanceKm: number;    // Distance
  rwgpsId: string;       // RideWithGPS route ID
  slug: string;          // Unique slug
  startLocation: string; // Start location if found
  description: string;   // Route description snippet
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
 * Make a URL-safe slug from a route name.
 */
function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract distance from route name. Looks for numbers like 200, 300, 400, 600.
 * e.g. "Antrim 200" → 200, "Canals and Greenways 300" → 300
 */
function extractDistanceFromName(name: string): number {
  const matches = name.match(/\b(\d{2,4})\s*(?:km)?\b/gi);
  if (matches && matches.length > 0) {
    // Return the last number that looks like a distance
    for (let i = matches.length - 1; i >= 0; i--) {
      const num = parseInt(matches[i], 10);
      if (num >= 50 && num <= 1500) return num;
    }
  }
  return 0;
}

/**
 * Parse the permanents listing page to extract route links.
 *
 * The page has two sections of permanent routes:
 * 1. A sidebar/subpage list under /audax/permanents/ with dedicated permanent pages
 * 2. A main content area with <li> items linking to gazetteer/permanents pages
 *
 * Each <li> has structure:
 *   <a href="detail-url">Route Name</a> – <a href="mailto:...">Organizer</a>
 *
 * We extract from the entry-content div to avoid nav menu items, tags, etc.
 */
function parseListingPage(html: string): ParsedListingRoute[] {
  const routes: ParsedListingRoute[] = [];
  const seen = new Set<string>();
  const seenUrls = new Set<string>();

  // Extract the main content area to avoid nav/sidebar/footer links
  const contentMatch = html.match(
    /<div\s+class="entry-content"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/article>|<footer|<div\s+class="entry-)/i
  );
  // Fallback: try article content or just a broader match
  const contentHtml = contentMatch
    ? contentMatch[1]
    : (() => {
        const articleMatch = html.match(
          /<article[^>]*>([\s\S]*?)<\/article>/i
        );
        return articleMatch ? articleMatch[1] : html;
      })();

  // Match <li> elements containing <a> links
  // Route links go to:
  //   /audax/permanents/{slug}/
  //   /events-calendar/gazetteer/{distance}-events/{slug}/
  //   /calendar/gazetteer/...
  //   /little-carlingford-200-permanent/
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;

  while ((liMatch = liRegex.exec(contentHtml)) !== null) {
    const liContent = liMatch[1];

    // Find the first <a> link in this <li> that points to an audaxireland.org route
    const linkMatch = liContent.match(
      /<a\s+href=["'](https?:\/\/(?:www\.)?audaxireland\.org\/[^"']+)["'][^>]*>([^<]+)<\/a>/i
    );
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const rawName = decodeHtmlEntities(linkMatch[2].trim());

    // Skip non-route links
    if (href.includes(".docx") || href.includes(".pdf") || href.includes("paypal")) continue;
    if (!rawName || rawName.length < 3) continue;
    if (rawName.includes("@")) continue;

    // Skip non-route sections (awards, blog posts, etc.)
    if (href.includes("/awards-medals/")) continue;
    if (href.includes("/the-saddlebag/")) continue;
    if (href.includes("/club/")) continue;
    if (href.includes("/brevet-hiberniae/")) continue;

    // Only accept URLs that look like route pages
    const isRouteUrl =
      href.includes("/permanents/") ||
      href.includes("/gazetteer/") ||
      href.includes("/calendar/") ||
      href.includes("-permanent") ||
      href.includes("-200") ||
      href.includes("-300") ||
      href.includes("-400") ||
      href.includes("-600");
    if (!isRouteUrl) continue;

    // Skip category/index pages (e.g. "200km Events", "Old Events", "Gazetteer")
    if (
      /^\d+km\s+events?$/i.test(rawName) ||
      rawName === "Gazetteer" ||
      rawName === "Old Events" ||
      rawName === "Permanents"
    ) continue;

    const slug = makeSlug(rawName);
    if (seen.has(slug)) continue;
    seen.add(slug);

    // Deduplicate by normalized URL (strip protocol, www, trailing slash)
    const normalizedUrl = href
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);

    const distanceKm = extractDistanceFromName(rawName);

    routes.push({
      name: rawName,
      detailUrl: href,
      distanceKm,
      slug,
    });
  }

  return routes;
}

/**
 * Extract RideWithGPS route IDs from a detail page HTML.
 * Returns an array since some pages have multiple RWGPS links
 * (e.g. forward/reverse routes, or multi-distance pages).
 */
function extractRwgpsIds(html: string): { rwgpsId: string; contextLabel: string }[] {
  const results: { rwgpsId: string; contextLabel: string }[] = [];
  const seen = new Set<string>();

  // Match ridewithgps.com/routes/{id} links
  const rwgpsRegex = /href=["'](?:https?:)?\/\/(?:www\.)?ridewithgps\.com\/routes\/(\d+)[^"']*["']/gi;
  let match;

  while ((match = rwgpsRegex.exec(html)) !== null) {
    const rwgpsId = match[1];
    if (seen.has(rwgpsId)) continue;
    seen.add(rwgpsId);

    // Try to extract context: look for text before/after the link
    const surroundStart = Math.max(0, match.index - 200);
    const surrounding = html.substring(surroundStart, match.index + match[0].length + 100);

    // Try to find a distance label near the link
    let contextLabel = "";
    const distMatch = surrounding.match(/(\d{2,4})\s*km/i);
    if (distMatch) {
      contextLabel = `${distMatch[1]}km`;
    }

    results.push({ rwgpsId, contextLabel });
  }

  return results;
}

/**
 * Try to extract a start location from the detail page HTML.
 * Looks for patterns like "Start: Location" or "Start/Finish: Location"
 * or "begins in Location" etc.
 */
function extractStartLocation(html: string): string {
  // Strip tags for text search
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Common patterns on Audax Ireland pages
  const patterns = [
    // "Start/Finish: Moate" or "Start Location: Youghal"
    /(?:Start\s*(?:\/\s*Finish)?(?:\s+Location)?(?:\s+Point)?)\s*:\s*([A-Z][a-zA-Z\s''-]+?)(?:\s*[,.(]|\s+(?:Co\.|County)|$)/i,
    // "begins in Schull" or "starting from Carrick-on-Shannon"
    /(?:begins?|starting|departs?|leaves?)\s+(?:at\s+|in\s+|from\s+)([A-Z][a-zA-Z\s''-]+?)(?:\s*[,.(]|\s+(?:Co\.|County))/i,
    // "ride starts in Belfast" or "route starts at Mallusk"
    /(?:ride|route|event)\s+(?:starts?|begins?)\s+(?:at\s+|in\s+|from\s+)([A-Z][a-zA-Z\s''-]+?)(?:\s*[,.(]|\s+(?:Co\.|County))/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) {
      const loc = m[1].trim();
      // Skip generic words that are not locations
      if (/^(the|a|an|location|point|line|from|at|in)$/i.test(loc)) continue;
      if (loc.length >= 3 && loc.length <= 50) return loc;
    }
  }

  return "Ireland";
}

/**
 * Extract a short description from the detail page.
 */
function extractDescription(html: string): string {
  // Look for the main content area — typically in <div class="entry-content">
  const contentMatch = html.match(/<div\s+class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);
  const content = contentMatch ? contentMatch[1] : html;

  // Strip tags and get first meaningful paragraph
  const text = content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Take first 300 chars of meaningful text
  if (text.length > 20) {
    const snippet = text.substring(0, 300);
    const lastSentence = snippet.lastIndexOf(".");
    if (lastSentence > 50) {
      return snippet.substring(0, lastSentence + 1).trim();
    }
    return snippet.trim() + "...";
  }

  return "";
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

  // Process track points into elevation profile
  const rawElevations = trackPoints.map((pt) => ({
    distance: pt.d / 1000,
    elevation: pt.e,
  }));
  const elevationProfile = sampleElevations(rawElevations, 500);

  const coordinates = trackPoints.map((pt) => [pt.x, pt.y]);
  const geojsonGeometry =
    coordinates.length > 1 ? { type: "LineString", coordinates } : null;

  // Calculate elevation gain from track points if API value missing
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
    const candidateKey = `courses/ie-${slug}.gpx`;
    await minioLib.uploadGpx(candidateKey, gpxBuffer);
    // Only set gpxFileKey after a successful upload
    gpxFileKey = candidateKey;
  } catch {
    // Non-critical — course will be created without GPX
    gpxFileKey = null;
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
 * Run the Audax Ireland permanent course scraper.
 */
export async function runAudaxIrelandScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch listing page
    console.log("[audax-ireland] Fetching permanents listing page...");
    const listingHtml = await httpsGet(LISTING_URL);

    // Step 2: Parse route links
    const listingRoutes = parseListingPage(listingHtml);
    console.log(
      `[audax-ireland] Found ${listingRoutes.length} routes on listing page`
    );

    if (listingRoutes.length === 0) {
      result.errors.push(
        "No routes found on listing page — HTML structure may have changed"
      );
      return result;
    }

    // Step 3: Visit each detail page to extract RWGPS links
    const allRoutes: ParsedRoute[] = [];

    for (const listing of listingRoutes) {
      try {
        await sleep(500);
        console.log(
          `[audax-ireland] Fetching detail: ${listing.name} (${listing.detailUrl})`
        );

        let detailHtml: string;
        try {
          detailHtml = await httpsGet(listing.detailUrl, 30000);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // 404s are common — some old links are dead
          if (msg.includes("404") || msg.includes("403")) {
            console.log(
              `[audax-ireland] Skipping ${listing.name}: ${msg}`
            );
            continue;
          }
          throw e;
        }

        const rwgpsLinks = extractRwgpsIds(detailHtml);

        if (rwgpsLinks.length === 0) {
          // No RWGPS links found — skip this route
          console.log(
            `[audax-ireland] No RWGPS links for: ${listing.name}`
          );
          continue;
        }

        const startLocation = extractStartLocation(detailHtml);
        const description = extractDescription(detailHtml);

        if (rwgpsLinks.length === 1) {
          // Single RWGPS route
          allRoutes.push({
            name: listing.name,
            detailUrl: listing.detailUrl,
            distanceKm: listing.distanceKm,
            rwgpsId: rwgpsLinks[0].rwgpsId,
            slug: `${listing.slug}-${rwgpsLinks[0].rwgpsId}`,
            startLocation,
            description,
          });
        } else {
          // Multiple RWGPS routes on same page (e.g. forward/reverse, multi-distance)
          for (const link of rwgpsLinks) {
            const suffix = link.contextLabel
              ? `-${makeSlug(link.contextLabel)}`
              : "";
            const routeName = link.contextLabel
              ? `${listing.name} (${link.contextLabel})`
              : listing.name;

            // Try to extract distance from context label
            let dist = listing.distanceKm;
            if (link.contextLabel) {
              const distMatch = link.contextLabel.match(/(\d+)/);
              if (distMatch) {
                const parsed = parseInt(distMatch[1], 10);
                if (parsed >= 50 && parsed <= 1500) dist = parsed;
              }
            }

            allRoutes.push({
              name: routeName,
              detailUrl: listing.detailUrl,
              distanceKm: dist,
              rwgpsId: link.rwgpsId,
              slug: `${listing.slug}${suffix}-${link.rwgpsId}`,
              startLocation,
              description,
            });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Detail page ${listing.name}: ${msg}`);
      }
    }

    // Deduplicate by RWGPS ID
    const deduped: ParsedRoute[] = [];
    const seenRwgps = new Set<string>();
    for (const route of allRoutes) {
      if (seenRwgps.has(route.rwgpsId)) continue;
      seenRwgps.add(route.rwgpsId);
      deduped.push(route);
    }

    result.total = deduped.length;
    console.log(
      `[audax-ireland] Total unique RWGPS routes: ${deduped.length} (from ${allRoutes.length} raw)`
    );

    if (deduped.length === 0) {
      result.errors.push(
        "No RWGPS routes found — detail page structure may have changed"
      );
      return result;
    }

    // Step 4: Process each route
    for (const route of deduped) {
      try {
        const externalId = `ie-rwgps-${route.rwgpsId}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "audax-ireland",
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

          // Re-download GPX if missing
          if (!existing.gpxFileKey) {
            try {
              await sleep(500);
              const gpxData = await fetchAndProcessRwgps(
                route.rwgpsId,
                makeSlug(route.name),
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
                `GPX re-download failed for ${route.rwgpsId}: ${msg}`
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
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;

        try {
          const data = await fetchAndProcessRwgps(
            route.rwgpsId,
            makeSlug(route.name),
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
          result.errors.push(`RWGPS failed for ${route.rwgpsId}: ${msg}`);
        }

        // Build course number
        const courseNumber = `IE-${route.rwgpsId}`;

        // Official page URL
        const officialPageUrl = `https://ridewithgps.com/routes/${route.rwgpsId}`;

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
            elevationM,
            startLocation: route.startLocation || "Ireland",
            endLocation: route.startLocation || "Ireland",
            region: "Ireland",
            category: ["permanent"],
            tags: ["audax-ireland"],
            description: route.description || null,
            officialPageUrl,
            gpxFileKey,
            country: "IE",
            sourceType: "audax-ireland",
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
          `[audax-ireland] Created: ${route.name} (RWGPS ${route.rwgpsId})`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Route ${route.rwgpsId}: ${msg}`);
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
      where: { key: "IE_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "IE_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "IE_LAST_SCRAPE_RESULT" },
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
        key: "IE_LAST_SCRAPE_RESULT",
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
