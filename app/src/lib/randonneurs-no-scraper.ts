/**
 * Randonneurs Norge (Norway) Permanent Course Scraper
 *
 * Fetches permanent courses from 6 pages:
 *   - https://www.randonneurs.no/permanente-breveter/norsk-randonneur-permanentserie/200km-permanent/
 *   - https://www.randonneurs.no/permanente-breveter/norsk-randonneur-permanentserie/300km-permanent/
 *   - https://www.randonneurs.no/permanente-breveter/norsk-randonneur-permanentserie/400km-permanent/
 *   - https://www.randonneurs.no/permanente-breveter/norsk-randonneur-permanentserie/600km-permanent/
 *   - https://www.randonneurs.no/permanente-breveter/norsk-randonneur-permanentserie/1000km-permanent/
 *   - https://www.randonneurs.no/permanente-breveter/jotunheimen-super-randonnee/
 *
 * Each distance page describes a single permanent course (with forward/reverse directions).
 * The 600km page has a RideWithGPS link for GPX data; others are metadata-only.
 *
 * Flow:
 * 1. Fetch each page
 * 2. Parse route names, distances, start/end locations, checkpoints from tables
 * 3. For RWGPS links: fetch JSON API for track data, build GPX
 * 4. Parse/upload GPX, create or update course record
 */

import { prisma } from "./db";
import { sampleElevations } from "./gpx";

const BASE_URL = "https://www.randonneurs.no";

/**
 * Each page defines one or more route variants (directions).
 * We hardcode the known structure since each page is a single permanent
 * with route details embedded in prose + checkpoint tables.
 */
interface PageConfig {
  url: string;
  distanceCategory: string; // "200", "300", "400", "600", "1000", "SR"
  variants: RouteVariant[];
}

interface RouteVariant {
  slug: string;          // Unique identifier for this direction
  name: string;          // Human-readable route name
  distanceKm: number;    // Distance in km
  elevationM: number;    // Approximate elevation gain (from page descriptions)
  startLocation: string;
  endLocation: string;
  region: string;        // Norwegian region
  rwgpsId?: string;      // RideWithGPS route ID if available
  description: string;   // Route description
}

const PAGES: PageConfig[] = [
  {
    url: `${BASE_URL}/permanente-breveter/norsk-randonneur-permanentserie/200km-permanent/`,
    distanceCategory: "200",
    variants: [
      {
        slug: "hell-stiklestad-200",
        name: "Hell \u2013 Stiklestad 200km",
        distanceKm: 214.4,
        elevationM: 800,
        startLocation: "Hell",
        endLocation: "Stiklestad",
        region: "Tr\u00f8ndelag",
        rwgpsId: "28542231",
        description: "200km permanent fra Hell (Godsterminalen) til Stiklestad Nasjonale Kultursenter langs Trondheimsfjorden. Inkluderer ferje Flakk\u2013R\u00f8rvik (7,4 km). Flatt etter norske forhold, h\u00f8yeste punkt ca 250 m.o.h.",
      },
      {
        slug: "stiklestad-hell-200",
        name: "Stiklestad \u2013 Hell 200km",
        distanceKm: 214.5,
        elevationM: 800,
        startLocation: "Stiklestad",
        endLocation: "Hell",
        region: "Tr\u00f8ndelag",
        rwgpsId: "28753894",
        description: "200km permanent fra Stiklestad Nasjonale Kultursenter til Hell (Godsterminalen) langs Trondheimsfjorden. Inkluderer ferje Flakk\u2013R\u00f8rvik (7,4 km). Flatt etter norske forhold, h\u00f8yeste punkt ca 250 m.o.h.",
      },
    ],
  },
  {
    url: `${BASE_URL}/permanente-breveter/norsk-randonneur-permanentserie/300km-permanent/`,
    distanceCategory: "300",
    variants: [
      {
        slug: "alesund-averoy-300",
        name: "\u00c5lesund \u2013 Aver\u00f8y 300km",
        distanceKm: 312.1,
        elevationM: 2000,
        startLocation: "\u00c5lesund",
        endLocation: "Aver\u00f8y",
        region: "M\u00f8re og Romsdal",
        rwgpsId: "28491340",
        description: "300km permanent fra \u00c5lesund til Aver\u00f8y via Eidsdal, S\u00f8lsnes og Molde. Inkluderer tre ferjer/busstunneler. H\u00f8yeste punkt ca 850 m.o.h.",
      },
      {
        slug: "averoy-alesund-300",
        name: "Aver\u00f8y \u2013 \u00c5lesund 300km",
        distanceKm: 312.1,
        elevationM: 2000,
        startLocation: "Aver\u00f8y",
        endLocation: "\u00c5lesund",
        region: "M\u00f8re og Romsdal",
        rwgpsId: "28841721",
        description: "300km permanent fra Aver\u00f8y til \u00c5lesund via Molde, S\u00f8lsnes og Eidsdal. Inkluderer tre ferjer/busstunneler. H\u00f8yeste punkt ca 850 m.o.h.",
      },
    ],
  },
  {
    url: `${BASE_URL}/permanente-breveter/norsk-randonneur-permanentserie/400km-permanent/`,
    distanceCategory: "400",
    variants: [
      {
        slug: "stavanger-kristiansand-400",
        name: "Stavanger \u2013 Kristiansand 400km",
        distanceKm: 404.8,
        elevationM: 3000,
        startLocation: "Stavanger",
        endLocation: "Kristiansand",
        region: "Rogaland / Vest-Agder",
        rwgpsId: "28537231",
        description: "400km permanent fra NSB Stavanger til Shell Garnerl\u00f8kka, Kristiansand. Ruten g\u00e5r gjennom J\u00e6ren, forbi J\u00f8ssingfjord og \u00c5na-Sira, Lindesnes fyr og Lista. H\u00f8yeste punkt ca 300 m.o.h. mellom Hauge og Flekkefjord.",
      },
      {
        slug: "kristiansand-stavanger-400",
        name: "Kristiansand \u2013 Stavanger 400km",
        distanceKm: 404.7,
        elevationM: 3000,
        startLocation: "Kristiansand",
        endLocation: "Stavanger",
        region: "Vest-Agder / Rogaland",
        rwgpsId: "28779267",
        description: "400km permanent fra Shell Garnerl\u00f8kka, Kristiansand til NSB Stavanger. Ruten g\u00e5r forbi Lista, Lindesnes fyr, \u00c5na-Sira og J\u00f8ssingfjord gjennom J\u00e6ren. H\u00f8yeste punkt ca 300 m.o.h. mellom Hauge og Flekkefjord.",
      },
    ],
  },
  {
    url: `${BASE_URL}/permanente-breveter/norsk-randonneur-permanentserie/600km-permanent/`,
    distanceCategory: "600",
    variants: [
      {
        slug: "bergen-oslo-600",
        name: "Bergen \u2013 Oslo 600km",
        distanceKm: 620.8,
        elevationM: 7000,
        startLocation: "Bergen",
        endLocation: "Oslo",
        region: "Vestland / Viken",
        rwgpsId: "28632446",
        description: "600km permanent fra NSB Bergen stasjon til Ruter kundesenter Oslo S. Tre fjelloverganger inkludert Haukeli (ca 1150 m.o.h.). Inkluderer to ferjer: Gjermundshavn\u2013\u00c5rsnes og Ut\u00e5ker\u2013Sk\u00e5nevik.",
      },
      {
        slug: "oslo-bergen-600",
        name: "Oslo \u2013 Bergen 600km",
        distanceKm: 620.8,
        elevationM: 7000,
        startLocation: "Oslo",
        endLocation: "Bergen",
        region: "Viken / Vestland",
        description: "600km permanent fra Ruter kundesenter Oslo S til NSB Bergen stasjon. Tre fjelloverganger inkludert Haukeli (ca 1150 m.o.h.). Inkluderer to ferjer: Gjermundshavn\u2013\u00c5rsnes og Ut\u00e5ker\u2013Sk\u00e5nevik.",
      },
    ],
  },
  {
    url: `${BASE_URL}/permanente-breveter/norsk-randonneur-permanentserie/1000km-permanent/`,
    distanceCategory: "1000",
    variants: [
      {
        slug: "moskenes-stamsund-1000",
        name: "Moskenes \u2013 Stamsund 1000km",
        distanceKm: 1000,
        elevationM: 8000,
        startLocation: "Moskenes",
        endLocation: "Stamsund",
        region: "Nordland (Lofoten)",
        rwgpsId: "28656371",
        description: "1000km permanent i Lofoten og Vester\u00e5len. Fra Moskenes ferjekai til Stamsund via Fiskeb\u00f8l, Sortland og Harstad. Inkluderer flere ferjer. Arktisk landskap med midnattsol om sommeren.",
      },
      {
        slug: "stamsund-moskenes-1000",
        name: "Stamsund \u2013 Moskenes 1000km",
        distanceKm: 1000,
        elevationM: 8000,
        startLocation: "Stamsund",
        endLocation: "Moskenes",
        region: "Nordland (Lofoten)",
        rwgpsId: "28753922",
        description: "1000km permanent i Lofoten og Vester\u00e5len. Fra Stamsund til Moskenes ferjekai via Harstad, Sortland og Fiskeb\u00f8l. Inkluderer flere ferjer. Arktisk landskap med midnattsol om sommeren.",
      },
    ],
  },
  {
    url: `${BASE_URL}/permanente-breveter/jotunheimen-super-randonnee/`,
    distanceCategory: "SR",
    variants: [
      {
        slug: "jotunheimen-sr",
        name: "Jotunheimen Super Randonn\u00e9e",
        distanceKm: 600,
        elevationM: 10000,
        startLocation: "Gudvangen",
        endLocation: "Gudvangen",
        region: "Vestland / Innlandet",
        rwgpsId: "26750206",
        description: "Super Randonn\u00e9e med minimum 600 km og 10 000 h\u00f8ydemeter. L\u00f8ypa g\u00e5r fra Gudvangen via Sognefjorden, over Vikafjellet, Sognefjellet, Valdresflya, Filefjell og L\u00e6rdalsfjellet. Anbefalt periode er juli.",
      },
    ],
  },
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
    gpxFileKey = `courses/no-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Strip HTML tags from a string and decode basic entities.
 */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse checkpoint data from a page's HTML tables.
 * The Norwegian site uses tables with <span> inside <td>:
 *   <tr><td><span>Location</span></td><td><span>44,9</span></td>...</tr>
 * Returns an array of { name, distanceKm } objects.
 */
function parseCheckpoints(html: string): { name: string; distanceKm: number }[] {
  const checkpoints: { name: string; distanceKm: number }[] = [];

  // Match table rows with td cells (content may include nested span tags)
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract all td cell contents
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(stripHtml(cellMatch[1]));
    }

    // Need at least 2 cells (name + km)
    if (cells.length < 2) continue;

    const name = cells[0];
    const kmStr = cells[1].replace(",", ".");

    // Skip header rows and empty rows
    if (!name || name.toUpperCase().includes("STED") || name.toUpperCase().includes("KM")) continue;

    const km = parseFloat(kmStr);
    if (!isNaN(km) && name.length > 1) {
      checkpoints.push({ name, distanceKm: km });
    }
  }

  return checkpoints;
}

/**
 * Verify that a page is reachable and parse any RWGPS links from it.
 * Returns { reachable: boolean, rwgpsIds: string[], checkpoints: ... }
 */
async function fetchAndParsePage(url: string): Promise<{
  reachable: boolean;
  rwgpsIds: string[];
  checkpoints: { name: string; distanceKm: number }[];
  html: string;
}> {
  try {
    const html = await httpsGet(url);

    // Find all RWGPS links (both direct route links and embed iframes)
    const rwgpsIds: string[] = [];
    const rwgpsRegex = /(?:ridewithgps|rwgps-embeds)\.com\/(?:routes\/|embeds\?type=route&(?:amp;)?id=)(\d+)/g;
    let m;
    while ((m = rwgpsRegex.exec(html)) !== null) {
      if (!rwgpsIds.includes(m[1])) {
        rwgpsIds.push(m[1]);
      }
    }

    const checkpoints = parseCheckpoints(html);

    return { reachable: true, rwgpsIds, checkpoints, html };
  } catch {
    return { reachable: false, rwgpsIds: [], checkpoints: [], html: "" };
  }
}

/**
 * Run the Randonneurs Norge scraper.
 */
export async function runRandonneursNoScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Count total variants
    const allVariants: {
      variant: RouteVariant;
      page: PageConfig;
    }[] = [];

    for (const page of PAGES) {
      for (const variant of page.variants) {
        allVariants.push({ variant, page });
      }
    }
    result.total = allVariants.length;
    console.log(`[randonneurs-no] Total route variants to process: ${result.total}`);

    // Step 1: Fetch each page to verify reachability and discover any RWGPS links
    const pageData = new Map<string, {
      reachable: boolean;
      rwgpsIds: string[];
      checkpoints: { name: string; distanceKm: number }[];
    }>();

    for (const page of PAGES) {
      try {
        console.log(`[randonneurs-no] Fetching ${page.distanceCategory} page...`);
        const data = await fetchAndParsePage(page.url);
        pageData.set(page.url, data);

        if (data.reachable) {
          console.log(
            `[randonneurs-no] ${page.distanceCategory}: reachable, ` +
            `${data.rwgpsIds.length} RWGPS links, ${data.checkpoints.length} checkpoints`
          );
        } else {
          console.log(`[randonneurs-no] ${page.distanceCategory}: NOT reachable`);
        }
        await sleep(500);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Failed to fetch ${page.distanceCategory} page: ${msg}`);
        pageData.set(page.url, { reachable: false, rwgpsIds: [], checkpoints: [] });
      }
    }

    // Step 2: Process each route variant
    for (const { variant, page } of allVariants) {
      try {
        const externalId = `no-${variant.slug}`;
        const pd = pageData.get(page.url);

        // Check if page was reachable
        if (!pd?.reachable) {
          result.errors.push(`Skipping ${variant.slug}: page not reachable`);
          continue;
        }

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "randonneurs-no",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== variant.name) updates.name = variant.name;
          if (existing.distanceKm !== variant.distanceKm) updates.distanceKm = variant.distanceKm;
          if (existing.elevationM !== variant.elevationM) updates.elevationM = variant.elevationM;
          if (existing.description !== variant.description) updates.description = variant.description;
          if (existing.startLocation !== variant.startLocation) updates.startLocation = variant.startLocation;
          if (existing.endLocation !== variant.endLocation) updates.endLocation = variant.endLocation;

          // Try to fetch GPX if missing and RWGPS is available
          if (!existing.gpxFileKey && variant.rwgpsId) {
            try {
              await sleep(500);
              const gpxData = await fetchAndProcessRwgps(
                variant.rwgpsId,
                variant.slug,
                variant.name
              );
              if (gpxData) {
                if (gpxData.gpxFileKey) updates.gpxFileKey = gpxData.gpxFileKey;
                if (gpxData.elevationM > 0) updates.elevationM = gpxData.elevationM;
                if (gpxData.distanceKm > 0) updates.distanceKm = gpxData.distanceKm;
                if (gpxData.elevationProfile) updates.elevationProfile = gpxData.elevationProfile;

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
              result.errors.push(`GPX re-download failed for ${variant.slug}: ${msg}`);
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
        let elevationM = variant.elevationM;
        let distanceKm = variant.distanceKm;
        let elevationProfile: { distance: number; elevation: number }[] | null = null;
        let geojsonGeometry: object | null = null;

        // Use variant's own rwgpsId first, then check page-level RWGPS IDs
        const rwgpsId = variant.rwgpsId || (pd.rwgpsIds.length > 0 ? pd.rwgpsIds[0] : undefined);

        if (rwgpsId) {
          try {
            await sleep(500);
            const data = await fetchAndProcessRwgps(rwgpsId, variant.slug, variant.name);
            if (data) {
              gpxFileKey = data.gpxFileKey;
              if (data.elevationM > 0) elevationM = data.elevationM;
              if (data.distanceKm > 0) distanceKm = data.distanceKm;
              elevationProfile = data.elevationProfile;
              geojsonGeometry = data.geojsonGeometry;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`RWGPS failed for ${variant.slug}: ${msg}`);
          }
        }

        // Build course number
        const courseNumber = page.distanceCategory === "SR"
          ? "NO-SR-JH"
          : `NO-${page.distanceCategory}-${variant.slug.split("-").slice(0, -1).join("-").toUpperCase()}`;

        // Official page URL
        const officialPageUrl = variant.rwgpsId
          ? `https://ridewithgps.com/routes/${variant.rwgpsId}`
          : page.url;

        // Determine category
        const category = page.distanceCategory === "SR"
          ? ["SR"]
          : ["BP"];

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        const newCourse = await prisma.course.create({
          data: {
            courseNumber,
            name: variant.name,
            distanceKm: distanceKm || 0,
            elevationM,
            startLocation: variant.startLocation,
            endLocation: variant.endLocation,
            region: variant.region,
            category,
            tags: ["randonneurs-no"],
            description: variant.description,
            officialPageUrl,
            gpxFileKey,
            country: "NO",
            sourceType: "randonneurs-no",
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
        console.log(`[randonneurs-no] Created: ${variant.name} (${externalId})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Route ${variant.slug}: ${msg}`);
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
      where: { key: "NO_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "NO_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "NO_LAST_SCRAPE_RESULT" },
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
        key: "NO_LAST_SCRAPE_RESULT",
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
