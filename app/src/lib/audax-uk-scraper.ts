import { generateUniqueCourseSlug } from "./slug";

/**
 * Audax UK Permanent Course Scraper
 *
 * Fetches permanent events from the Audax UK website:
 *   - API: POST https://www.audax.uk/umbraco/api/EventSearch/SearchPermanant
 *   - Detail pages: https://www.audax.uk/event-details/perm/{id}-{slug}
 *   - GPX files: https://d66hxjbu1ftf2.cloudfront.net/tracks/{id}-{timestamp}.gpx
 *
 * The API returns paginated results (50 per page) for permanent events.
 * Each event has an ID, name, distance, category, organizer, start location,
 * and flags for HasGpx/HasEbrevet. For events with HasGpx, the detail page
 * contains a direct GPX download link from CloudFront.
 *
 * Flow:
 * 1. Fetch all "Open" permanent events via paginated API
 * 2. For each event with HasGpx, fetch detail page to find GPX URL
 * 3. Download GPX, parse geometry + elevation, upload to MinIO
 * 4. Create or update course record in database
 *
 * Settings keys:
 *   GB_SCRAPER_ENABLED, GB_LAST_SCRAPE_DATE, GB_LAST_SCRAPE_RESULT
 */

import { prisma } from "./db";
import { parseGpx, sampleElevations } from "./gpx";

const SEARCH_URL = "https://www.audax.uk/umbraco/api/EventSearch/SearchPermanant";
const DETAIL_BASE = "https://www.audax.uk";

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface AudaxUkEvent {
  Name: string;
  NominalDistance: number;
  Distance: number;
  AAAPoints: number;
  OnlineFee: number;
  PostalFee: number;
  Category: string;
  Organizer: number;
  Image: string | null;
  OrganizerName: string;
  Url: string;
  Id: number;
  RiddenCount: number;
  AukwebCode: string;
  Receipts: boolean;
  HasEbrevet: boolean;
  HasGpx: boolean;
  StartLocation: string | null;
  Direction: string | null;
  DistanceToUser: number;
  Checkpoints: unknown;
  IsCircular: boolean;
  EventDate: string | null;
  StartTime: string | null;
}

interface SearchResponse {
  Query: Record<string, unknown>;
  Facets: Record<string, unknown>;
  Results: AudaxUkEvent[];
  TotalItems: number;
  TotalPages: number;
  CurrentPage: number;
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
        res.on("data", (c) => {
          if (c) chunks.push(c);
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timeout")));
  });
}

/**
 * HTTP POST via Node https module (IPv4 forced for Docker compatibility).
 */
function httpsPost(
  url: string,
  body: string,
  timeout = 30000
): Promise<string> {
  // eslint-disable-next-line no-eval
  const https = eval("require")("https") as {
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
    const req = https.request(
      url,
      {
        method: "POST",
        family: 4,
        headers: {
          "User-Agent": "Audax-3chan/1.0",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout,
      },
      (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode} for POST ${url}`));
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
 * Make a URL-safe slug from an event name.
 */
function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Fetch all open permanent events from the Audax UK API.
 */
async function fetchAllEvents(): Promise<AudaxUkEvent[]> {
  const allEvents: AudaxUkEvent[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const body = JSON.stringify({
      Status: ["Open"],
      Layout: "list",
      Date: null,
      Category: [],
      page,
    });

    console.log(`[audax-uk] Fetching page ${page}...`);
    const response = await httpsPost(SEARCH_URL, body);
    const data: SearchResponse = JSON.parse(response);

    totalPages = data.TotalPages;
    allEvents.push(...data.Results);
    console.log(
      `[audax-uk] Page ${page}/${totalPages}: ${data.Results.length} events (total so far: ${allEvents.length}/${data.TotalItems})`
    );

    page++;
    if (page <= totalPages) {
      await sleep(500);
    }
  }

  return allEvents;
}

/**
 * Extract GPS file download URL from an event detail page.
 * Matches both .gpx and .zip CDN files.
 */
function extractGpsUrl(html: string): string | null {
  // Pattern: https://d66hxjbu1ftf2.cloudfront.net/tracks/{id}[-{timestamp}].{gpx|zip}
  const match = html.match(
    /https:\/\/d66hxjbu1ftf2\.cloudfront\.net\/tracks\/[^"'<>\s]+\.(?:gpx|zip)/i
  );
  return match ? match[0] : null;
}

/**
 * Extract RideWithGPS route URL from event description text.
 */
function extractRwgpsUrl(html: string): string | null {
  const match = html.match(
    /https?:\/\/ridewithgps\.com\/routes\/(\d+)/i
  );
  return match ? match[0] : null;
}

/**
 * Extract GPX file content from a ZIP buffer.
 * Parses central directory for correct offsets/sizes, then extracts the
 * best .gpx entry (prefers *trk0*, otherwise largest).
 */
function extractGpxFromZip(zipBuffer: Buffer): Buffer | null {
  // Find End of Central Directory record (scan backward for PK\x05\x06)
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const cdEntries = zipBuffer.readUInt16LE(eocdOffset + 10);

  // Parse central directory entries to find .gpx files
  const gpxEntries: {
    localHeaderOffset: number;
    compressedSize: number;
    compressionMethod: number;
    filename: string;
  }[] = [];
  let pos = cdOffset;

  for (let i = 0; i < cdEntries; i++) {
    if (pos + 46 > zipBuffer.length) break;
    if (zipBuffer.readUInt32LE(pos) !== 0x02014b50) break;

    const compressionMethod = zipBuffer.readUInt16LE(pos + 10);
    const compressedSize = zipBuffer.readUInt32LE(pos + 20);
    const filenameLength = zipBuffer.readUInt16LE(pos + 28);
    const extraLength = zipBuffer.readUInt16LE(pos + 30);
    const commentLength = zipBuffer.readUInt16LE(pos + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(pos + 42);

    const filename = zipBuffer
      .subarray(pos + 46, pos + 46 + filenameLength)
      .toString("utf8");

    if (filename.toLowerCase().endsWith(".gpx")) {
      gpxEntries.push({
        localHeaderOffset,
        compressedSize,
        compressionMethod,
        filename,
      });
    }

    pos += 46 + filenameLength + extraLength + commentLength;
  }

  if (gpxEntries.length === 0) return null;

  // Pick best entry: prefer trk0, otherwise largest
  let entry = gpxEntries[0];
  if (gpxEntries.length > 1) {
    const trk0 = gpxEntries.find((e) => e.filename.includes("trk0"));
    if (trk0) entry = trk0;
    else
      entry = gpxEntries.sort(
        (a, b) => b.compressedSize - a.compressedSize
      )[0];
  }

  // Read file data from local file header
  const lh = entry.localHeaderOffset;
  if (lh + 30 > zipBuffer.length) return null;
  const lhFilenameLen = zipBuffer.readUInt16LE(lh + 26);
  const lhExtraLen = zipBuffer.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + lhFilenameLen + lhExtraLen;
  const compressedData = zipBuffer.subarray(
    dataStart,
    dataStart + entry.compressedSize
  );

  if (entry.compressionMethod === 0) {
    // STORE — uncompressed
    return Buffer.from(compressedData);
  }
  if (entry.compressionMethod === 8) {
    // DEFLATE — use zlib inflateRaw
    // eslint-disable-next-line no-eval
    const zlib = eval("require")("zlib") as {
      inflateRawSync: (buf: Buffer) => Buffer;
    };
    try {
      return zlib.inflateRawSync(compressedData);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Extract description text from event detail page HTML.
 */
function extractDescription(html: string): string | null {
  // Find the Description section
  const descHeaderIdx = html.indexOf(
    '<h3 class="h5 g-color-gray-dark-v1 g-mb-10">Description</h3>'
  );
  if (descHeaderIdx < 0) return null;

  const afterHeader = html.substring(descHeaderIdx + 70);
  const expandableMatch = afterHeader.match(
    /<div class="rich-text-block[^"]*">([\s\S]*?)<\/div>/
  );
  if (!expandableMatch) return null;

  // Strip HTML tags and decode entities
  const text = decodeHtmlEntities(
    expandableMatch[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim()
  );

  return text.length > 0 ? text : null;
}

/**
 * Extract checkpoint/map data from the event detail page.
 * Returns the start point coordinates if available.
 */
function extractMapData(
  html: string
): { lat: number; lng: number } | null {
  const mapMatch = html.match(/data-event-map=["']([^"']+)["']/);
  if (!mapMatch) return null;

  try {
    const decoded = mapMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    const mapData = JSON.parse(decoded);

    // First checkpoint with Type 3 (start/finish) or just first checkpoint
    if (mapData.Checkpoints && mapData.Checkpoints.length > 0) {
      const cp = mapData.Checkpoints[0];
      if (cp.Point && cp.Point.Latitude && cp.Point.Longitude) {
        return { lat: cp.Point.Latitude, lng: cp.Point.Longitude };
      }
    }

    // Fall back to midpoint
    if (mapData.MidPoint && mapData.MidPoint.Latitude) {
      return {
        lat: mapData.MidPoint.Latitude,
        lng: mapData.MidPoint.Longitude,
      };
    }
  } catch {
    // Non-critical
  }

  return null;
}

/**
 * Download and process a GPS file from the Audax UK CloudFront CDN.
 * Handles both .gpx files and .zip archives containing GPX.
 */
async function downloadAndProcessGps(
  gpsUrl: string,
  fileKey: string
): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  distanceKm: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const rawBuffer = await httpGetBuffer(gpsUrl, 60000);

  // Determine if it's a ZIP file (PK header)
  let gpxBuffer: Buffer;
  if (rawBuffer.length >= 4 && rawBuffer.readUInt32LE(0) === 0x04034b50) {
    // ZIP file — extract GPX from it
    const extracted = extractGpxFromZip(rawBuffer);
    if (!extracted) return null;
    gpxBuffer = extracted;
  } else {
    gpxBuffer = rawBuffer;
  }

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
    gpxFileKey = fileKey;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
  }

  return {
    gpxFileKey,
    elevationM,
    distanceKm,
    elevationProfile,
    geojsonGeometry,
  };
}

/** RWGPS JSON track point */
interface RwgpsTrackPoint {
  x: number; // longitude
  y: number; // latitude
  e: number; // elevation (meters)
  d: number; // cumulative distance (meters)
}

/**
 * Download route data from RideWithGPS and process into GPX/geometry.
 */
async function downloadAndProcessRwgps(
  rwgpsUrl: string,
  fileKey: string
): Promise<{
  gpxFileKey: string | null;
  elevationM: number;
  distanceKm: number;
  elevationProfile: { distance: number; elevation: number }[] | null;
  geojsonGeometry: object | null;
} | null> {
  const routeIdMatch = rwgpsUrl.match(/ridewithgps\.com\/routes\/(\d+)/);
  if (!routeIdMatch) return null;

  const routeId = routeIdMatch[1];
  const json = await httpsGet(
    `https://ridewithgps.com/routes/${routeId}.json`,
    60000
  );
  const data = JSON.parse(json);

  const trackPoints = data.track_points as RwgpsTrackPoint[] | undefined;
  if (!trackPoints || trackPoints.length === 0) return null;

  // Build elevation profile
  const rawElevations = trackPoints.map((pt: RwgpsTrackPoint) => ({
    distance: pt.d / 1000,
    elevation: pt.e,
  }));
  const elevationProfile = sampleElevations(rawElevations, 500);

  // Build GeoJSON
  const coordinates = trackPoints.map((pt: RwgpsTrackPoint) => [pt.x, pt.y]);
  const geojsonGeometry =
    coordinates.length > 1 ? { type: "LineString", coordinates } : null;

  // Calculate elevation gain
  let gain = 0;
  for (let i = 1; i < trackPoints.length; i++) {
    const diff = trackPoints[i].e - trackPoints[i - 1].e;
    if (diff > 0) gain += diff;
  }
  const elevationM =
    data.elevation_gain > 0 ? Math.round(data.elevation_gain) : Math.round(gain);

  const distanceKm =
    data.distance > 0
      ? Math.round((data.distance / 1000) * 10) / 10
      : 0;

  // Build GPX and upload to MinIO
  let gpxFileKey: string | null = null;
  try {
    const gpxLines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Audax-3chan via RideWithGPS"',
      '  xmlns="http://www.topografix.com/GPX/1/1">',
      "  <trk>",
      `    <name>${(data.name || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</name>`,
      "    <trkseg>",
    ];
    for (const pt of trackPoints) {
      gpxLines.push(
        `      <trkpt lat="${pt.y}" lon="${pt.x}"><ele>${pt.e}</ele></trkpt>`
      );
    }
    gpxLines.push("    </trkseg>", "  </trk>", "</gpx>");
    const gpxBuffer = Buffer.from(gpxLines.join("\n"), "utf8");

    // eslint-disable-next-line no-eval
    const minioLib = eval("require")("./minio") as {
      uploadGpx: (key: string, data: Buffer) => Promise<string>;
    };
    gpxFileKey = fileKey;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null;
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

/**
 * Map Audax UK category codes to our category array.
 * BP = Brevet Populaire (50-199km), BR = Brevet Randonneur (200km+)
 */
function mapCategory(category: string, distance: number): string[] {
  const cats: string[] = [];
  if (category === "BP") {
    cats.push("BP");
  } else if (category === "BR") {
    cats.push("BR");
  } else {
    cats.push(category || "BP");
  }
  // Add distance-based suffix
  if (distance >= 1000) cats.push("1000+");
  return cats;
}

/**
 * Run the Audax UK permanent course scraper.
 */
export async function runAudaxUkScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch all open permanent events from the API
    console.log("[audax-uk] Starting scrape of Audax UK permanent events...");
    const events = await fetchAllEvents();
    result.total = events.length;

    if (events.length === 0) {
      result.errors.push(
        "No events found — Audax UK API may have changed"
      );
      return result;
    }

    console.log(`[audax-uk] Total events to process: ${events.length}`);

    // Step 2: Process each event
    for (const event of events) {
      try {
        const slug = makeSlug(event.Name);
        const externalId = `gb-${event.Id}`;
        const fileKey = `courses/gb-${event.Id}.gpx`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "audax-uk",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates
          const updates: Record<string, unknown> = {};
          if (existing.name !== event.Name) updates.name = event.Name;
          if (
            event.Distance > 0 &&
            existing.distanceKm !== event.Distance
          ) {
            updates.distanceKm = event.Distance;
          }
          if (
            event.StartLocation &&
            existing.startLocation !== event.StartLocation
          ) {
            updates.startLocation = event.StartLocation;
          }

          // Re-download GPX if missing (check regardless of HasGpx flag)
          if (!existing.gpxFileKey) {
            try {
              await sleep(500);
              console.log(
                `[audax-uk] Re-downloading GPS for existing: ${event.Name}`
              );
              const detailHtml = await httpsGet(
                `${DETAIL_BASE}${event.Url}`
              );
              const gpsUrl = extractGpsUrl(detailHtml);
              const rwgpsUrl = extractRwgpsUrl(detailHtml);

              if (gpsUrl) {
                await sleep(500);
                const gpxData = await downloadAndProcessGps(
                  gpsUrl,
                  fileKey
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
              } else if (rwgpsUrl) {
                // Fallback: fetch route data from RideWithGPS
                await sleep(500);
                const gpxData = await downloadAndProcessRwgps(
                  rwgpsUrl,
                  fileKey
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
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              result.errors.push(
                `GPX re-download failed for ${event.Name}: ${msg}`
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
        let elevationM = 0;
        let distanceKm = event.Distance || event.NominalDistance || 0;
        let elevationProfile: { distance: number; elevation: number }[] | null =
          null;
        let geojsonGeometry: object | null = null;
        let description: string | null = null;
        let startCoords: { lat: number; lng: number } | null = null;

        // Always fetch detail page for description, coords, and GPS file
        try {
          await sleep(500);
          console.log(
            `[audax-uk] Fetching detail page for: ${event.Name} (${event.Id})`
          );
          const detailHtml = await httpsGet(
            `${DETAIL_BASE}${event.Url}`
          );

          description = extractDescription(detailHtml);
          startCoords = extractMapData(detailHtml);
          const gpsUrl = extractGpsUrl(detailHtml);
          const rwgpsUrl = extractRwgpsUrl(detailHtml);

          if (gpsUrl) {
            await sleep(500);
            console.log(
              `[audax-uk] Downloading GPS: ${gpsUrl.split("/").pop()}`
            );
            const gpxData = await downloadAndProcessGps(gpsUrl, fileKey);

            if (gpxData) {
              gpxFileKey = gpxData.gpxFileKey;
              elevationM = gpxData.elevationM;
              if (gpxData.distanceKm > 0) distanceKm = gpxData.distanceKm;
              elevationProfile = gpxData.elevationProfile;
              geojsonGeometry = gpxData.geojsonGeometry;
            }
          } else if (rwgpsUrl) {
            // Fallback: RideWithGPS route from description
            await sleep(500);
            const gpxData = await downloadAndProcessRwgps(rwgpsUrl, fileKey);
            if (gpxData) {
              gpxFileKey = gpxData.gpxFileKey;
              elevationM = gpxData.elevationM;
              if (gpxData.distanceKm > 0) distanceKm = gpxData.distanceKm;
              elevationProfile = gpxData.elevationProfile;
              geojsonGeometry = gpxData.geojsonGeometry;
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(
            `Detail/GPX failed for ${event.Name}: ${msg}`
          );
        }

        // Build course number from AukwebCode or event ID
        const courseNumber = event.AukwebCode
          ? `GB-${event.AukwebCode}`
          : `GB-${event.Id}`;

        // Official page URL
        const officialPageUrl = `${DETAIL_BASE}${event.Url}`;

        // Determine region from start location or direction
        const region = event.StartLocation || "United Kingdom";

        // Start/end location
        const startLocation = event.StartLocation || "United Kingdom";
        const endLocation = event.IsCircular
          ? startLocation
          : event.StartLocation || "United Kingdom";

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        const courseSlug = await generateUniqueCourseSlug(event.Name, distanceKm || 0, courseNumber);
        const newCourse = await prisma.course.create({
          data: {
            slug: courseSlug,
            courseNumber,
            name: event.Name,
            distanceKm: distanceKm || 0,
            elevationM,
            startLocation,
            endLocation,
            region,
            category: mapCategory(event.Category, distanceKm),
            tags: ["audax-uk"],
            description,
            designer: event.OrganizerName || null,
            officialPageUrl,
            gpxFileKey,
            country: "GB",
            sourceType: "audax-uk",
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
        } else if (startCoords) {
          // If no GPX geometry, set a point geometry from the start coordinates
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE courses SET geom = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3::uuid`,
              startCoords.lng,
              startCoords.lat,
              newCourse.id
            );
          } catch {
            // Non-critical
          }
        }

        result.created++;
        console.log(
          `[audax-uk] Created: ${event.Name} (${courseNumber}, ${distanceKm}km${gpxFileKey ? ", with GPX" : ""})`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Event ${event.Name} (${event.Id}): ${msg}`);
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
      where: { key: "GB_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "GB_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "GB_LAST_SCRAPE_RESULT" },
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
        key: "GB_LAST_SCRAPE_RESULT",
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
    `[audax-uk] Scrape complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
  );

  return result;
}
