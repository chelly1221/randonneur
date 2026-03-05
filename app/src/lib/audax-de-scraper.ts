import { generateUniqueCourseSlug } from "./slug";

/**
 * Audax Randonneurs Deutschland (ARA) Superrandonnee Scraper
 *
 * Fetches permanent superrandonnee courses from https://audax-randonneure.de/superrandonnees
 * and syncs them into the local courses table.
 *
 * The main page lists 7 superrandonnees across Germany, each ~600km with 10,000m+ elevation.
 * Data sources vary per route:
 *   - ARA Muenchen (Oetztal, Glockner, Vinschgau): GPX files from aramuc.de download pages
 *   - ARA Breisgau (Belchen satt): OpenRunner route link
 *   - ARA Ruhrgebiet (Rheingold): OpenRunner route link
 *   - ARA Dresden (Ruebezahl, Krkonose): links to ara-dresden.de (may be inaccessible)
 *
 * Flow:
 * 1. Fetch main superrandonnees page
 * 2. Parse route listings (name, region, link)
 * 3. Fetch each route detail page for distance, elevation, description
 * 4. For Munich routes: fetch download pages for GPX file URLs
 * 5. Download GPX, parse geometry/elevation, upload to MinIO
 * 6. Create or update course records
 */

import { prisma } from "./db";
import { parseGpx, sampleElevations } from "./gpx";

const MAIN_URL = "https://audax-randonneure.de/superrandonnees";

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface RouteEntry {
  slug: string;
  name: string;
  region: string;             // ARA chapter name
  detailUrl: string;          // URL to the detail page on audax-randonneure.de
  externalUrls: string[];     // External links (aramuc.de, ara-dresden.de, etc.)
  distanceKm: number;
  elevationM: number;
  startLocation: string;
  endLocation: string;
  description: string;
  gpxUrl: string | null;      // Direct GPX download URL (complete track)
  openRunnerUrl: string | null;
  officialPageUrl: string;
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

function httpGetBuffer(url: string, timeout = 60000): Promise<Buffer> {
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

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    .replace(/&nbsp;/g, " ")
    .replace(/&uuml;/g, "ü")
    .replace(/&ouml;/g, "ö")
    .replace(/&auml;/g, "ä")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Auml;/g, "Ä")
    .replace(/&szlig;/g, "ß");
}

/**
 * Known route data that supplements what we can extract from HTML.
 * This handles cases where the HTML doesn't contain structured distance/elevation
 * or where GPX download pages exist on external sites.
 *
 * Source: manually verified from the individual route pages.
 */
const KNOWN_ROUTES: Record<string, {
  distanceKm: number;
  elevationM: number;
  startLocation: string;
  endLocation: string;
  region: string;
  downloadPageUrl?: string;
  openRunnerIds?: string[];
  description: string;
}> = {
  "belchensatt": {
    distanceKm: 616,
    elevationM: 12000,
    startLocation: "Freiburg",
    endLocation: "Freiburg",
    region: "ARA Breisgau",
    openRunnerIds: ["2661844"],
    description: "Schwarzwald, Schweizer Jura, Französisches Jura, Vogesen. The first German Superrandonnée, established 2013.",
  },
  "oetztal-rundfahrt": {
    distanceKm: 613,
    elevationM: 10500,
    startLocation: "Deisenhofen (bei München)",
    endLocation: "Deisenhofen (bei München)",
    region: "ARA München-Oberbayern",
    downloadPageUrl: "https://aramuc.de/downloads-superrandonnee",
    description: "Bayerische Voralpen, Brandenberger Alpen, Inntal, Tuxer Alpen, Eisacktal, Sarntaler Alpen, Passeier Tal, Stubaier Alpen. Eight Alpine passes including Achenpass, Brenner, Ritten, Penser Joch, Jaufenpass, Timmelsjoch, Kühtai, and Buchener Sattel.",
  },
  "rheingold": {
    distanceKm: 608,
    elevationM: 11000,
    startLocation: "Koblenz",
    endLocation: "Boppard (Gedeonseck)",
    region: "ARA Ruhrgebiet",
    openRunnerIds: ["12473138"],
    description: "Starting at the Deutsches Eck in Koblenz through Westerwald, Taunus, Hunsrück, and Eifel. Features Obergermanischer Limes, Wispertal, vineyards at Assmannshausen, Soonwald, Moselle loop at Trittenheim, Eifel volcanics, Effelsberg Radio Telescope, Burg Eltz, Loreley views.",
  },
  "grosse-glockner-rundfahrt": {
    distanceKm: 610,
    elevationM: 10500,
    startLocation: "Deisenhofen (bei München)",
    endLocation: "Endlhausen",
    region: "ARA München-Oberbayern",
    downloadPageUrl: "https://aramuc.de/downloads-zur-grossen-glockner-rundfahrt",
    description: "Valepp, Sudelfeld, Waller Alm, Parschberg, Hochfilzen, Edelweißspitze (2572m), Hochtor (2506m), Iselsberg, Staller Sattel (2052m), Pustertaler Sonnenstraße, Brenner, Gnadenwald, Achenpass. Fourteen significant Alpine passes.",
  },
  "vinschgau-rundfahrt": {
    distanceKm: 618,
    elevationM: 10500,
    startLocation: "Wolfratshausen",
    endLocation: "Wolfratshausen",
    region: "ARA München-Oberbayern",
    downloadPageUrl: "https://aramuc.de/downloads-vinschgau-rundfahrt",
    description: "Seven major Alpine passes including Hahntennjoch, Timmelsjoch, Stilfser Joch, Reschenpass, Piller Höhe, and Buchener Sattel. Only accessible June through October due to winter pass closures.",
  },
  "ruebezahls-rampen": {
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Dresden",
    endLocation: "Dresden",
    region: "ARA Dresden",
    description: "Rübezahl's Rampen superrandonnée through the Giant Mountains (Riesengebirge). 600km with 10,000+ meters of climbing.",
  },
  "krkonose-lehce": {
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Dresden",
    endLocation: "Dresden",
    region: "ARA Dresden",
    description: "Krkonoše lehce (Giant Mountains light) superrandonnée through the Czech Krkonoše mountains. 600km with 10,000+ meters of climbing.",
  },
};

/**
 * Parse the main superrandonnees page to extract route names and links.
 */
function parseMainPage(html: string): { name: string; slug: string; detailPath: string; externalUrls: string[] }[] {
  const routes: { name: string; slug: string; detailPath: string; externalUrls: string[] }[] = [];

  // The page has links to individual SR pages. Look for links within the content area.
  // Pattern: links to /superrandonnees/* sub-pages or external sites

  // Extract all links from the main content
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  // Track route names we've found via known slugs
  const knownSlugs = Object.keys(KNOWN_ROUTES);

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = decodeHtmlEntities(match[2].trim());

    // Check for links to SR sub-pages on the main site
    const subPageMatch = href.match(/\/superrandonnees\/([a-z0-9_-]+)/i);
    if (subPageMatch) {
      const pathSlug = subPageMatch[1].toLowerCase();
      const slug = makeSlug(text);
      // Use the path slug if it matches a known route, otherwise use the name slug
      const bestSlug = knownSlugs.find(k => pathSlug.includes(k) || k.includes(pathSlug)) || slug;
      if (!routes.find(r => r.slug === bestSlug)) {
        routes.push({
          name: text,
          slug: bestSlug,
          detailPath: `/superrandonnees/${subPageMatch[1]}`,
          externalUrls: [],
        });
      }
      continue;
    }

    // Check for links to node pages (/node/250 = Glockner)
    if (href.match(/\/node\/250/)) {
      if (!routes.find(r => r.slug === "grosse-glockner-rundfahrt")) {
        routes.push({
          name: text || "Große Glockner Rundfahrt",
          slug: "grosse-glockner-rundfahrt",
          detailPath: "/node/250",
          externalUrls: [],
        });
      }
      continue;
    }

    // Check for external links to aramuc.de or ara-dresden.de that reference specific routes
    if (href.includes("aramuc.de") || href.includes("ara-dresden.de")) {
      // Try to match these to known routes
      const hrefLower = href.toLowerCase();
      for (const knownSlug of knownSlugs) {
        const routeWords = knownSlug.split("-");
        if (routeWords.some(w => w.length > 3 && hrefLower.includes(w))) {
          const existing = routes.find(r => r.slug === knownSlug);
          if (existing) {
            if (!existing.externalUrls.includes(href)) {
              existing.externalUrls.push(href);
            }
          }
        }
      }
    }
  }

  // Ensure all known routes are present even if not found in HTML
  for (const [slug, data] of Object.entries(KNOWN_ROUTES)) {
    if (!routes.find(r => r.slug === slug)) {
      routes.push({
        name: slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        slug,
        detailPath: `/superrandonnees/${slug}`,
        externalUrls: [],
      });
    }
  }

  return routes;
}

/**
 * Fetch a download page from aramuc.de and extract the complete GPX file URL.
 * We look for the "komplett" or "Kompletter Track" GPX download.
 */
async function findCompleteGpxUrl(downloadPageUrl: string): Promise<string | null> {
  try {
    const html = await httpsGet(downloadPageUrl, 30000);

    // Find GPX download links - look for "komplett" or complete track
    // Pattern: protected-download URLs ending in .gpx
    const gpxLinkRegex = /<a\s+[^>]*href=["']([^"']*\.gpx[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const gpxLinks: { url: string; text: string }[] = [];

    while ((match = gpxLinkRegex.exec(html)) !== null) {
      const url = match[1];
      const text = match[2].replace(/<[^>]+>/g, "").trim().toLowerCase();
      gpxLinks.push({ url, text });
    }

    // Also search for href links that contain .gpx in protected-download patterns
    const protectedRegex = /href=["'](https?:\/\/aramuc\.de\/protected-download\/[^"']*\.gpx)["']/gi;
    while ((match = protectedRegex.exec(html)) !== null) {
      const url = match[1];
      if (!gpxLinks.find(l => l.url === url)) {
        // Try to find the link text
        const textAfter = html.slice(match.index, match.index + 500);
        const textMatch = textAfter.match(/>([^<]+)</);
        gpxLinks.push({ url, text: textMatch ? textMatch[1].toLowerCase() : "" });
      }
    }

    if (gpxLinks.length === 0) return null;

    // Filter to only "complete" tracks (komplett/complete/000_)
    const completeTracks = gpxLinks.filter(l =>
      l.text.includes("komplett") ||
      l.text.includes("complete") ||
      l.text.includes("kompletter") ||
      l.url.includes("komplett") ||
      l.url.includes("000_")
    );

    if (completeTracks.length > 0) {
      // Among complete tracks, prefer the Deisenhofen/Wolfratshausen start (main start)
      // over Brixen/Sterzing (alternate start)
      const mainStartTrack = completeTracks.find(l =>
        l.text.includes("deisenhofen") ||
        l.url.includes("deisenhofen") ||
        l.text.includes("wolfratshausen") ||
        l.url.includes("wolfratshausen") ||
        l.url.includes("000_")
      );
      // Skip alternate start points (Brixen, Sterzing)
      const nonAlternate = completeTracks.find(l =>
        !l.text.includes("brixen") &&
        !l.text.includes("sterzing") &&
        !l.url.includes("brixen") &&
        !l.url.includes("sterzing")
      );
      return mainStartTrack?.url || nonAlternate?.url || completeTracks[0].url;
    }

    // If no obvious complete track, look for the first GPX that's not a segment
    // (segments typically have "K1-K2" or "teil" patterns)
    const nonSegment = gpxLinks.find(l =>
      !l.text.match(/k\d+\s*-\s*k\d+/i) &&
      !l.url.match(/teil\d+/i) &&
      !l.text.match(/^gps-track\s+(start\s+)?[a-z]+-k\d+/i) &&
      l.text.includes("gps") &&
      !l.text.match(/\bstart\s+(brixen|sterzing)\b/i)
    );

    if (nonSegment) return nonSegment.url;

    // Last resort: return the first GPX with "start deisenhofen" or "wolfratshausen" in it
    const mainStart = gpxLinks.find(l =>
      l.text.includes("deisenhofen") || l.text.includes("wolfratshausen") ||
      l.url.includes("deisenhofen") || l.url.includes("wolfratshausen") ||
      l.url.includes("vinschgau_rundfahrt")
    );
    if (mainStart) return mainStart.url;

    // Absolute last resort: first GPX link
    return gpxLinks[0]?.url || null;
  } catch {
    return null;
  }
}

/**
 * Download a GPX file and process it into course data.
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
  const gpxBuffer = await httpGetBuffer(gpxUrl, 120000);
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
    gpxFileKey = `courses/de-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical — geometry and elevation still available without MinIO upload
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Build full route entries by combining parsed data with known route metadata.
 */
function buildRouteEntries(
  parsedRoutes: { name: string; slug: string; detailPath: string; externalUrls: string[] }[]
): RouteEntry[] {
  const entries: RouteEntry[] = [];

  for (const parsed of parsedRoutes) {
    const known = KNOWN_ROUTES[parsed.slug];
    if (!known) continue; // Skip unknown routes

    entries.push({
      slug: parsed.slug,
      name: parsed.name,
      region: known.region,
      detailUrl: `https://audax-randonneure.de${parsed.detailPath}`,
      externalUrls: parsed.externalUrls,
      distanceKm: known.distanceKm,
      elevationM: known.elevationM,
      startLocation: known.startLocation,
      endLocation: known.endLocation,
      description: known.description,
      gpxUrl: null, // Will be populated from download pages
      openRunnerUrl: known.openRunnerIds?.length
        ? `https://www.openrunner.com/route-details/${known.openRunnerIds[0]}`
        : null,
      officialPageUrl: `https://audax-randonneure.de${parsed.detailPath}`,
    });
  }

  return entries;
}

/**
 * Run the Audax Deutschland superrandonnee scraper.
 */
export async function runAudaxDeScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch main superrandonnees page
    console.log("[audax-de] Fetching superrandonnees page...");
    const mainHtml = await httpsGet(MAIN_URL);

    // Step 2: Parse route listings
    const parsedRoutes = parseMainPage(mainHtml);
    console.log(`[audax-de] Found ${parsedRoutes.length} route entries on main page`);

    // Step 3: Build route entries with known metadata
    const routes = buildRouteEntries(parsedRoutes);
    result.total = routes.length;
    console.log(`[audax-de] Processing ${routes.length} routes`);

    if (routes.length === 0) {
      result.errors.push(
        "No routes found — HTML structure may have changed"
      );
      return result;
    }

    // Step 4: For routes with download pages, find GPX URLs
    for (const route of routes) {
      const known = KNOWN_ROUTES[route.slug];
      if (known?.downloadPageUrl) {
        try {
          await sleep(500);
          console.log(`[audax-de] Checking download page for ${route.name}...`);
          const gpxUrl = await findCompleteGpxUrl(known.downloadPageUrl);
          if (gpxUrl) {
            route.gpxUrl = gpxUrl;
            console.log(`[audax-de] Found GPX for ${route.name}`);
          } else {
            console.log(`[audax-de] No complete GPX found for ${route.name}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`Download page failed for ${route.name}: ${msg}`);
        }
      }
    }

    // Step 5: Process each route
    for (const route of routes) {
      try {
        const externalId = `de-${route.slug}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "audax-de",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== route.name) updates.name = route.name;
          if (existing.distanceKm !== route.distanceKm)
            updates.distanceKm = route.distanceKm;
          if (existing.region !== route.region) updates.region = route.region;
          if (existing.startLocation !== route.startLocation)
            updates.startLocation = route.startLocation;
          if (existing.endLocation !== route.endLocation)
            updates.endLocation = route.endLocation;
          if (route.description && existing.description !== route.description)
            updates.description = route.description;

          // Re-download GPX if missing
          if (!existing.gpxFileKey && route.gpxUrl) {
            try {
              await sleep(500);
              const gpxData = await downloadAndProcessGpx(
                route.gpxUrl,
                route.slug
              );
              if (gpxData) {
                if (gpxData.gpxFileKey) updates.gpxFileKey = gpxData.gpxFileKey;
                if (gpxData.elevationM > 0) updates.elevationM = gpxData.elevationM;
                if (gpxData.distanceKm > 0) updates.distanceKm = gpxData.distanceKm;
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
        let gpxFileKey: string | null = null;
        let elevationM = route.elevationM;
        let distanceKm = route.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null = null;
        let geojsonGeometry: object | null = null;

        if (route.gpxUrl) {
          await sleep(500);
          try {
            console.log(`[audax-de] Downloading GPX for ${route.name}...`);
            const gpxData = await downloadAndProcessGpx(
              route.gpxUrl,
              route.slug
            );
            if (gpxData) {
              gpxFileKey = gpxData.gpxFileKey;
              if (gpxData.elevationM > 0) elevationM = gpxData.elevationM;
              if (gpxData.distanceKm > 0) distanceKm = gpxData.distanceKm;
              elevationProfile = gpxData.elevationProfile;
              geojsonGeometry = gpxData.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`GPX download failed for ${route.slug}: ${msg}`);
          }
        }

        // Build course number
        const courseNumber = `DE-${route.slug}`;

        // Official page URL
        const officialPageUrl = route.openRunnerUrl || route.officialPageUrl;

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
            startLocation: route.startLocation,
            endLocation: route.endLocation,
            region: route.region,
            category: ["superrandonnee"],
            tags: ["audax-de"],
            description: route.description || null,
            officialPageUrl,
            gpxFileKey,
            country: "DE",
            sourceType: "audax-de",
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
        console.log(`[audax-de] Created: ${route.name} (${distanceKm}km, ${elevationM}m)`);
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
      where: { key: "DE_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "DE_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "DE_LAST_SCRAPE_RESULT" },
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
        key: "DE_LAST_SCRAPE_RESULT",
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
