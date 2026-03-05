import { generateUniqueCourseSlug } from "./slug";

/**
 * Super Randonnees France Scraper
 *
 * Fetches Super Randonnee permanent courses from https://www.superrandonnees.org/sr-in-france
 * and syncs them into the local courses table.
 *
 * The site lists 14 Super Randonnee courses across France. Each course has a detail
 * page under /sr-in-france/routes/{slug} with varying amounts of structured data.
 * Most pages include an OpenRunner route link for route visualization.
 *
 * Flow:
 * 1. Fetch the SR in France main page, extract links to individual route pages
 * 2. For each route, fetch the detail page and extract OpenRunner ID + metadata
 * 3. Fetch route data from OpenRunner API (encoded polyline + elevation)
 * 4. Build GPX from polyline, parse geometry/elevation, upload to MinIO
 * 5. Create or update course records
 *
 * Data sources:
 *   - Route geometry: OpenRunner API (api.openrunner.com/api/v2/routes/{id})
 *   - Metadata: Detail pages + known route data (distance, elevation, descriptions)
 *
 * Settings keys: FR_SCRAPER_ENABLED, FR_LAST_SCRAPE_DATE, FR_LAST_SCRAPE_RESULT
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const MAIN_URL = "https://www.superrandonnees.org/sr-in-france";
const OPENRUNNER_API = "https://api.openrunner.com/api/v2/routes";

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
  detailUrl: string;
  distanceKm: number;
  elevationM: number;
  startLocation: string;
  endLocation: string;
  description: string;
  openrunnerId: string | null;
  officialPageUrl: string;
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
 * HTTP GET via Node https module (IPv4 forced for Docker compatibility).
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
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "e")
    .replace(/&egrave;/g, "e")
    .replace(/&agrave;/g, "a")
    .replace(/&ugrave;/g, "u")
    .replace(/&ocirc;/g, "o")
    .replace(/&icirc;/g, "i")
    .replace(/&ccedil;/g, "c")
    .replace(/&ucirc;/g, "u")
    .replace(/&euml;/g, "e")
    .replace(/&iuml;/g, "i");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Known route data that supplements what we can extract from HTML.
 * The superrandonnees.org detail pages have inconsistent structured data,
 * so we maintain known metadata here.
 *
 * Source: manually verified from the individual route pages.
 */
const KNOWN_ROUTES: Record<string, {
  name: string;
  distanceKm: number;
  elevationM: number;
  startLocation: string;
  endLocation: string;
  description: string;
  openrunnerId: string | null;
}> = {
  "sr-de-savoie": {
    name: "SR de Savoie",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Chambery",
    endLocation: "Chambery",
    description: "Super Randonnee de Savoie through the Alpine region of Savoie. Organized by Les Cyclotouristes Chamberiens.",
    openrunnerId: null,
  },
  "haute-provence": {
    name: "SR de Haute Provence",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Manosque",
    endLocation: "Manosque",
    description: "A loop through Upper Provence featuring three major climbs: Gorges du Verdon, Montagne de Lure, and Mont Ventoux, plus lesser-known ascents including Espinouse, Fontbelle, L'Homme Mort, Lagarde-d'Apt, and Aire dei Masco. Best ridden April through December.",
    openrunnerId: null,
  },
  "dauphine-gratine": {
    name: "SR du Dauphine Gratine",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Saint-Egreve",
    endLocation: "Voreppe",
    description: "Circles around Grenoble traversing multiple massifs: Chartreuse, Balcons de Belledonne, Chamrousse, Alpe du Grand Serre, Plateau Matheysin, and Vercors. The highest passage is at 1721 meters altitude. Designed by Hugues Rico, opened 2010.",
    openrunnerId: "2223159",
  },
  "pyrenees-pirineos": {
    name: "SR Pyrenees-Pirineos",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Argeles-Gazost",
    endLocation: "Argeles-Gazost",
    description: "A large loop through the central Pyrenees connecting France and Spain. Riders traverse from France into Spain via Col du Portillon and return via Col du Pourtalet. Two peaks exceed 2000m including Col du Tourmalet and Port de la Bonaigua.",
    openrunnerId: "2645377",
  },
  "ours-cathare": {
    name: "SR de l'Ours Cathare",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Foix",
    endLocation: "Foix",
    description: "An 8-shaped route between high mountains and Cathar country using mainly small, rough paved roads. Highest point is Port de Pailheres at 2001m. Traverses Ariege, Aude, Haute-Garonne, and Pyrenees-Orientales. A secret and tough SR, very beautiful, very varied, very wild. Opened 2013.",
    openrunnerId: "2037669",
  },
  "garbure-et-piperade": {
    name: "SR Garbure et Piperade",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Oloron-Sainte-Marie",
    endLocation: "Oloron-Sainte-Marie",
    description: "Route through the Western Pyrenees visiting Bearn, Aragon, Navarre, and Soule regions, crossing the Franco-Spanish border 4 times. Features approximately 15 mountain passes including Marie Blanque, Somport, La Pierre-Saint-Martin, and Larrau. Opened 2013.",
    openrunnerId: "2973032",
  },
  "cotes-de-bourgogne": {
    name: "SR des Cotes de Bourgogne",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Marsannay-la-Cote",
    endLocation: "Marsannay-la-Cote",
    description: "Hills of Burgundy Super Randonnee starting near Dijon. Crosses Cote-d'Or, Yonne, Nievre, and Saone-et-Loire departments through Morvan, Auxois, Charolais, Maconnais regions. Highest point at Haut Folin summit (901m).",
    openrunnerId: "3890472",
  },
  "leman-dement": {
    name: "SR du Leman Dement",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Bellegarde-sur-Valserine",
    endLocation: "Bellegarde-sur-Valserine",
    description: "Circles Lake Geneva and surrounding mountain ranges. Approximately one-third in Switzerland through Jura Mountains, Hauts de Montreux, and Upper Savoy. Features Col du Grand Colombier and the plateau des Glieres. Proposed by Laurent Dene, opened 2017.",
    openrunnerId: "6444436",
  },
  "baridur": {
    name: "SR Baridur",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Cernay",
    endLocation: "Cernay",
    description: "Traverses the Hautes-Vosges and Vosges Centrales. Major peaks include Ballon d'Alsace, Ballon de Servance, Grand Ballon, Petit Ballon, Hohneck, Donon, and Champ du Feu. Incorporates approximately forty passes plus Haut-Koenigsbourg castle and the Route des Cretes. The name 'baridur' is Alsatian dialect meaning 'a tour in the mountain.'",
    openrunnerId: "6364416",
  },
  "port-la-montagne": {
    name: "SR de Port-la-Montagne",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Toulon",
    endLocation: "Toulon",
    description: "Visits the massifs of southern Provence: Siou-Blanc, Maures, Rouet, Esterel, Tanneron, pays de Fayence, Haut-Var, Sainte-Victoire, Sainte-Baume, Fontblanche, Monts Toulonnais. Starts from the port of Toulon. Best ridden outside July-September due to fire risk.",
    openrunnerId: "7183153",
  },
  "desert": {
    name: "SR du Desert",
    distanceKm: 610,
    elevationM: 10000,
    startLocation: "Sisteron",
    endLocation: "Sisteron",
    description: "A remote gravel route spanning Drome, Hautes-Alpes, and Alpes de Haute-Provence. Features 211km of unpaved sections across 25 segments and 16 unpaved passes. Visits France's least-populated villages including Rochefourchat (1 resident) and Majastres (4 residents). Highest point Col d'Arron at 1445m.",
    openrunnerId: "12783279",
  },
  "oreille-dane": {
    name: "SR de l'Oreille d'Ane",
    distanceKm: 600,
    elevationM: 10000,
    startLocation: "Gap",
    endLocation: "Gap",
    description: "Between Upper Alps (Ecrins national park) and Upper Provence, centered around Gap. Visits the Bochaine, Devoluy, Beaumont, Champsaur, and Valgaudemar. Four out-and-back sections to Ceuse, Notre-Dame de la Salette, Gioberney cirque, and Orcieres-Merlette. Highest point 1820m.",
    openrunnerId: "12915952",
  },
  "mounta-cala": {
    name: "SR Mounta Cala",
    distanceKm: 622,
    elevationM: 18000,
    startLocation: "Menton",
    endLocation: "Ventimiglia",
    description: "Traverses Alpes-Maritimes, Piedmont, and Liguria, crossing the Franco-Italian border three times. Includes approximately 205km of unpaved roads. Highest point Col de la Lombarde at 2351m. Features significant gravel climbs: Authion (18km), Granges de la Brasque (12km), Baisse de Sanson (12km).",
    openrunnerId: "13616438",
  },
  "maralpina": {
    name: "SR Maralpina",
    distanceKm: 317,
    elevationM: 15500,
    startLocation: "Ventimiglia",
    endLocation: "Col de la Madone de Gorbio",
    description: "One of the most difficult SRs. Travels northward from the Italian coast through the Ligurian Alps, crossing into France at Col de la Lombarde (2351m). Encompasses the Mercantour-Argentera massif and Nice's Prealps. Quiet roads, perched villages, and often steep slopes. Created 2022.",
    openrunnerId: "9123650",
  },
};

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
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

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
 * Same Google polyline encoding but single-value (elevations in meters).
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
    elevations.push(value);
  }

  return elevations;
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
 * Parse the SR in France main page to extract route slugs.
 * Looks for links to /sr-in-france/routes/{slug} subpages.
 */
export function parseMainPage(html: string): { name: string; slug: string }[] {
  const routes: { name: string; slug: string }[] = [];
  const seen = new Set<string>();

  // Match links to /sr-in-france/routes/{slug}
  const linkRegex = /<a\s+[^>]*href=["'](?:https?:\/\/www\.superrandonnees\.org)?\/sr-in-france\/routes\/([a-z0-9_-]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const slug = match[1].toLowerCase();
    const text = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, "").trim());

    // Skip sub-pages like haute-provence-2009
    if (slug.match(/-\d{4}$/)) continue;

    if (!seen.has(slug)) {
      seen.add(slug);
      routes.push({
        name: text || slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        slug,
      });
    }
  }

  return routes;
}

/**
 * Parse a detail page to extract OpenRunner ID and any metadata.
 *
 * Note: superrandonnees.org is hosted on Google Sites, so links are often
 * wrapped in Google redirect URLs with percent-encoded values, e.g.:
 *   href="https://www.google.com/url?q=https%3A%2F%2Fwww.openrunner.com%2Fr%2F2645377&amp;sa=D..."
 */
export function parseDetailPage(html: string): {
  openrunnerId: string | null;
  distanceKm: number | null;
  elevationM: number | null;
  startLocation: string | null;
  description: string | null;
} {
  // First, decode percent-encoded URLs in the HTML so we can find OpenRunner links
  // Google Sites wraps external links via google.com/url?q=...
  const decodedHtml = html
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/")
    .replace(/%3F/gi, "?")
    .replace(/%3D/gi, "=")
    .replace(/%26/gi, "&");

  // Extract OpenRunner ID from various URL formats (search both original and decoded HTML)
  let openrunnerId: string | null = null;
  const orPatterns = [
    /openrunner\.com\/r\/(\d+)/i,
    /openrunner\.com\/route-details\/(\d+)/i,
    /openrunner\.com\/[a-z]{2}\/route-details\/(\d+)/i,
    /openrunner\.com\/route\/(\d+)/i,
  ];
  for (const pattern of orPatterns) {
    const m = decodedHtml.match(pattern) || html.match(pattern);
    if (m) {
      openrunnerId = m[1];
      break;
    }
  }

  // Try to extract distance from text (e.g. "317 km", "610 km", "622 km")
  // Only match in visible text content, not in script/style blocks
  let distanceKm: number | null = null;
  const textContent = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const distMatch = textContent.match(/(\d{3,4})\s*km/i);
  if (distMatch) {
    const d = parseInt(distMatch[1]);
    if (d >= 200 && d <= 1500) {
      distanceKm = d;
    }
  }

  // Try to extract elevation (e.g. "15,500 vertical meters", "18,000+", "10,000m")
  let elevationM: number | null = null;
  const eleMatch = textContent.match(/([\d,]+)\s*(?:vertical\s*meters|metres?\s*(?:of\s*)?(?:climb|elevation|ascent|d['e]nivel))/i);
  if (eleMatch) {
    const e = parseInt(eleMatch[1].replace(/,/g, ""));
    if (e >= 1000 && e <= 30000) {
      elevationM = e;
    }
  }

  // Start location extraction is unreliable on Google Sites pages (matches JS code),
  // so we skip it and rely on KNOWN_ROUTES data instead
  const startLocation: string | null = null;

  // Description extraction is unreliable on Google Sites pages (picks up embedded JS),
  // so we skip it and rely on KNOWN_ROUTES data instead
  const description: string | null = null;

  return { openrunnerId, distanceKm, elevationM, startLocation, description };
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
  startLocation: string | null;
  endLocation: string | null;
} | null> {
  const url = `${OPENRUNNER_API}/${openrunnerId}`;

  let data: OpenRunnerData;
  try {
    const json = await httpsGet(url, 60000);
    const raw = JSON.parse(json);
    // API wraps response in { data: {...} }
    data = raw.data || raw;
  } catch (e) {
    console.error(`[sr-france] Failed to fetch OpenRunner ${openrunnerId}:`, e);
    return null;
  }

  if (!data.shape?.full_encoded) {
    console.warn(`[sr-france] No shape data for OpenRunner ${openrunnerId}`);
    return null;
  }

  // Decode polyline to get coordinates
  const points = decodePolyline(data.shape.full_encoded);
  if (points.length < 2) {
    console.warn(`[sr-france] Too few points for OpenRunner ${openrunnerId}`);
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
    gpxFileKey = `courses/fr-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch (e) {
    gpxFileKey = null; // Reset — file not actually in MinIO
    console.error(`[sr-france] MinIO upload failed for ${slug}:`, e);
    // Non-critical — geometry and elevation still available without MinIO upload
  }

  const startLocation = data.start_location?.name || null;
  const endLocation = data.end_location?.name || null;

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
 * Build route entries by combining parsed HTML routes with known route metadata.
 * Routes found on the page are matched to KNOWN_ROUTES by slug.
 * Any known routes not found on the page are also included.
 */
function buildRouteEntries(
  parsedRoutes: { name: string; slug: string }[]
): RouteEntry[] {
  const entries: RouteEntry[] = [];
  const processedSlugs = new Set<string>();

  // First, process routes found on the page
  for (const parsed of parsedRoutes) {
    const known = KNOWN_ROUTES[parsed.slug];
    if (!known) continue; // Skip unknown routes

    processedSlugs.add(parsed.slug);

    entries.push({
      slug: parsed.slug,
      name: known.name,
      detailUrl: `${MAIN_URL}/routes/${parsed.slug}`,
      distanceKm: known.distanceKm,
      elevationM: known.elevationM,
      startLocation: known.startLocation,
      endLocation: known.endLocation,
      description: known.description,
      openrunnerId: known.openrunnerId,
      officialPageUrl: `${MAIN_URL}/routes/${parsed.slug}`,
    });
  }

  // Also include any known routes not found in the HTML
  for (const [slug, known] of Object.entries(KNOWN_ROUTES)) {
    if (processedSlugs.has(slug)) continue;

    entries.push({
      slug,
      name: known.name,
      detailUrl: `${MAIN_URL}/routes/${slug}`,
      distanceKm: known.distanceKm,
      elevationM: known.elevationM,
      startLocation: known.startLocation,
      endLocation: known.endLocation,
      description: known.description,
      openrunnerId: known.openrunnerId,
      officialPageUrl: `${MAIN_URL}/routes/${slug}`,
    });
  }

  return entries;
}

/**
 * Run the Super Randonnees France scraper.
 */
export async function runSrFranceScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch main SR in France page
    console.log("[sr-france] Fetching SR in France page...");
    const mainHtml = await httpsGet(MAIN_URL);

    // Step 2: Parse route listings
    const parsedRoutes = parseMainPage(mainHtml);
    console.log(`[sr-france] Found ${parsedRoutes.length} route links on main page`);

    // Step 3: Build route entries with known metadata
    const routes = buildRouteEntries(parsedRoutes);
    result.total = routes.length;
    console.log(`[sr-france] Processing ${routes.length} routes`);

    if (routes.length === 0) {
      result.errors.push(
        "No routes found — HTML structure may have changed"
      );
      return result;
    }

    // Step 4: Fetch detail pages to discover/verify OpenRunner IDs
    for (const route of routes) {
      try {
        await sleep(500);
        console.log(`[sr-france] Fetching detail page for ${route.name}...`);
        const detailHtml = await httpsGet(route.detailUrl, 30000);
        const parsed = parseDetailPage(detailHtml);

        // Use detail page OpenRunner ID if found and known one is missing
        if (parsed.openrunnerId && !route.openrunnerId) {
          route.openrunnerId = parsed.openrunnerId;
          console.log(`[sr-france] Discovered OpenRunner ID ${parsed.openrunnerId} for ${route.name}`);
        }

        // Update distance/elevation only if parsed from page and known data is default (10000m / round 600km)
        // HTML distance extraction is unreliable on Google Sites pages (picks up waypoint distances),
        // so we only use it when it differs significantly from the known default
        if (parsed.distanceKm && parsed.distanceKm >= 300 && route.distanceKm === 600) {
          route.distanceKm = parsed.distanceKm;
        }
        if (parsed.elevationM && parsed.elevationM > 10000 && route.elevationM === 10000) {
          route.elevationM = parsed.elevationM;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[sr-france] Detail page fetch failed for ${route.name}: ${msg}`);
        // Non-critical — we have known data as fallback
      }
    }

    // Step 5: Process each route
    for (const route of routes) {
      try {
        const externalId = `fr-sr-${route.slug}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "sr-france",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== route.name) updates.name = route.name;
          if (existing.distanceKm !== route.distanceKm)
            updates.distanceKm = route.distanceKm;
          if (existing.startLocation !== route.startLocation)
            updates.startLocation = route.startLocation;
          if (existing.endLocation !== route.endLocation)
            updates.endLocation = route.endLocation;
          if (route.description && existing.description !== route.description)
            updates.description = route.description;
          if (route.officialPageUrl && existing.officialPageUrl !== route.officialPageUrl)
            updates.officialPageUrl = route.officialPageUrl;

          // Re-download GPX if missing and OpenRunner ID available
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
                if (orData.distanceKm > 0) updates.distanceKm = orData.distanceKm;
                if (orData.elevationProfile)
                  updates.elevationProfile = orData.elevationProfile;

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
              result.errors.push(
                `OpenRunner re-download failed for ${route.slug}: ${msg}`
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

        if (route.openrunnerId) {
          await sleep(500);
          try {
            console.log(`[sr-france] Fetching OpenRunner data for ${route.name}...`);
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
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`OpenRunner failed for ${route.slug}: ${msg}`);
          }
        }

        // Build course number
        const courseNumber = `FR-${route.slug}`;

        // Official page URL: the detail page on superrandonnees.org
        const officialPageUrl = route.openrunnerId
          ? `https://www.openrunner.com/route-details/${route.openrunnerId}`
          : route.officialPageUrl;

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
            region: null,
            category: ["superrandonnee"],
            tags: ["sr-france"],
            description: route.description || null,
            officialPageUrl,
            gpxFileKey,
            country: "FR",
            sourceType: "sr-france",
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
        console.log(`[sr-france] Created: ${route.name} (${distanceKm}km, ${elevationM}m)`);
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
      where: { key: "FR_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "FR_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "FR_LAST_SCRAPE_RESULT" },
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
        key: "FR_LAST_SCRAPE_RESULT",
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
