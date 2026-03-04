/**
 * Audax Italia Permanent Course Scraper
 *
 * Fetches permanent brevetti from:
 *   https://www.audaxitalia.it/index.php?pg=brevetti_permanenti&bpia=1
 *
 * The site lists ~44 permanent courses (BPI - Brevetto Permanente Italiano).
 * Each course has a detail page with metadata (distance, elevation, location).
 *
 * Route data sources vary by course:
 *   - Direct GPX download via force_download.php (some courses)
 *   - OpenRunner route links (some courses)
 *   - Komoot tour links (some courses)
 *   - No route data (some courses — metadata only)
 *
 * Flow:
 * 1. Fetch archive listing pages (paginated, ~27 per page)
 * 2. Parse course entries: name, distance category, location, org/obid IDs
 * 3. Fetch each detail page for elevation, description, GPX/OpenRunner links
 * 4. Download GPX where available, upload to MinIO
 * 5. Create or update course records in database
 */

import { prisma } from "./db";
import { parseGpx, sampleElevations } from "./gpx";

const BASE_URL = "https://www.audaxitalia.it";
const LISTING_URL = `${BASE_URL}/index.php?pg=brevetti_permanenti&bpia=1`;

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface ParsedCourseEntry {
  name: string;
  distanceCategory: string; // e.g. "200 km", "301-400 km MTB"
  location: string; // e.g. "Terzo Di Aquileia (UD)"
  organizer: string; // e.g. "I DRAGHI A.S.D."
  orgId: string;
  obid: string;
  slug: string;
}

interface CourseDetail {
  distanceKm: number;
  elevationM: number;
  description: string | null;
  organizer: string | null;
  gpxDownloadUrl: string | null;
  openRunnerUrl: string | null;
  komootUrl: string | null;
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
 * Make a URL-safe slug from a course name.
 */
function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Extract a numeric distance from a distance category string.
 * e.g. "200 km" -> 200, "301-400 km MTB" -> 400, "90 km gravel" -> 90
 */
function parseDistanceCategory(cat: string): number {
  // Try range format first: "301-400 km"
  const rangeMatch = cat.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return parseInt(rangeMatch[2], 10);
  }
  // Single number: "200 km"
  const singleMatch = cat.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }
  return 0;
}

/**
 * Parse the listing page HTML to extract course entries.
 *
 * Each course is rendered as a div with onclick handler containing org/obid:
 *   <div class="testo_gen c br_cl0 ..." onclick="go_url('index.php?pg=brevetti_permanenti&org=253&obid=4125');">
 *     <div class="br_data1">Course Name</div>
 *     <div class="br_c1">
 *       <div class="br_km1">200 Km</div>
 *       <div class="br_comune">Location (Province)</div>
 *     </div>
 *     <div class="br_org">Organizer Name</div>
 *   </div>
 */
function parseListingPage(html: string): ParsedCourseEntry[] {
  const courses: ParsedCourseEntry[] = [];
  const seen = new Set<string>();

  // Match each course block by the onclick handler with org and obid
  const blockRegex = /onclick="go_url\('index\.php\?pg=brevetti_permanenti&org=(\d+)&obid=(\d+)'\);">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const orgId = match[1];
    const obid = match[2];
    const block = match[3];
    const key = `${orgId}-${obid}`;

    if (seen.has(key)) continue;
    seen.add(key);

    // Extract name from br_data1 div
    const nameMatch = block.match(/<div\s+class="br_data1[^"]*"[^>]*>([^<]+)<\/div>/i);
    const name = nameMatch ? decodeHtmlEntities(nameMatch[1].trim()) : "";
    if (!name) continue;

    // Extract distance from br_km1 div
    const kmMatch = block.match(/<div\s+class="br_km1[^"]*"[^>]*>([^<]+)<\/div>/i);
    const distanceCategory = kmMatch ? decodeHtmlEntities(kmMatch[1].trim()) : "";

    // Extract location from br_comune div
    const locMatch = block.match(/<div\s+class="br_comune[^"]*"[^>]*>([^<]+)<\/div>/i);
    const location = locMatch ? decodeHtmlEntities(locMatch[1].trim()) : "";

    // Extract organizer from br_org div
    const orgMatch = block.match(/<div\s+class="br_org[^"]*"[^>]*>([^<]+)<\/div>/i);
    const organizer = orgMatch ? decodeHtmlEntities(orgMatch[1].trim()) : "";

    const slug = makeSlug(`${obid}-${name}`);

    courses.push({
      name,
      distanceCategory,
      location,
      organizer,
      orgId,
      obid,
      slug,
    });
  }

  return courses;
}

/**
 * Parse a detail page to extract full course information.
 *
 * The page uses structured label/value pairs:
 *   <div class="lb"><i class="..."></i>Label</div><p>Value</p>
 *
 * Common labels: Distanza, Dislivello, Dove, Servizi, Quota di iscrizione
 */
function parseDetailPage(html: string): CourseDetail {
  let distanceKm = 0;
  let elevationM = 0;
  let description: string | null = null;
  let organizer: string | null = null;
  let gpxDownloadUrl: string | null = null;
  let openRunnerUrl: string | null = null;
  let komootUrl: string | null = null;

  // Extract structured label/value pairs from the detail page.
  // Pattern: <div class="lb">...Label</div> followed by <p>Value</p>
  const labelRegex = /class="lb">([\s\S]*?)<\/div>/gi;
  let lbMatch;
  while ((lbMatch = labelRegex.exec(html)) !== null) {
    const label = lbMatch[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    const afterLabel = html.slice(
      lbMatch.index + lbMatch[0].length,
      lbMatch.index + lbMatch[0].length + 300
    );
    const pMatch = afterLabel.match(/<p>([\s\S]*?)<\/p>/);
    if (!pMatch) continue;
    const value = pMatch[1].replace(/<[^>]+>/g, "").trim();

    if (label.includes("distanza") && value) {
      const dMatch = value.match(/(\d+(?:[.,]\d+)?)/);
      if (dMatch) {
        distanceKm = parseFloat(dMatch[1].replace(",", "."));
      }
    } else if (label.includes("dislivello") && value) {
      // Handle Italian number formatting: "2.800" = 2800, "4.634" = 4634
      const eMatch = value.match(/(\d[\d.,]*)/);
      if (eMatch) {
        const raw = eMatch[1].replace(/\./g, "").replace(",", ".");
        elevationM = Math.round(parseFloat(raw));
      }
    }
  }

  // Fallback distance/elevation extraction from free text
  if (distanceKm === 0) {
    const distFallback = html.match(
      /[Dd]istanza[:\s]+(\d+(?:[.,]\d+)?)\s*(?:km|KM)/i
    );
    if (distFallback) {
      distanceKm = parseFloat(distFallback[1].replace(",", "."));
    }
  }
  if (elevationM === 0) {
    const elevFallback = html.match(
      /[Dd]islivello[:\s]+(\d[\d.,]*)\s*(?:metri|mt|m\b)/i
    );
    if (elevFallback) {
      const raw = elevFallback[1].replace(/\./g, "").replace(",", ".");
      elevationM = Math.round(parseFloat(raw));
    }
  }

  // Extract organizer name from br_n_org div (detail page) or br_org div (listing)
  const orgLinkMatch = html.match(
    /class="br_n_org"[^>]*>[\s\S]*?<a[^>]*>([^<]+)/i
  );
  if (orgLinkMatch) {
    organizer = decodeHtmlEntities(orgLinkMatch[1].trim());
  }
  if (!organizer) {
    const orgDivMatch = html.match(
      /class="br_org[^"]*"[^>]*>([^<]+)/i
    );
    if (orgDivMatch) {
      organizer = decodeHtmlEntities(orgDivMatch[1].trim());
    }
  }

  // Extract GPX download link
  const gpxMatch = html.match(/force_download\.php\?[^"'\s]+/i);
  if (gpxMatch) {
    gpxDownloadUrl = `${BASE_URL}/${gpxMatch[0]}`;
  }

  // Extract OpenRunner URL from HTML or JavaScript
  const openRunnerPatterns = [
    /https?:\/\/(?:www\.)?openrunner\.com\/(?:r|route-details)\/(\d+)/i,
    /openrunner\.com\/(?:r|route-details)\/(\d+)/i,
  ];
  for (const pattern of openRunnerPatterns) {
    const m = html.match(pattern);
    if (m) {
      openRunnerUrl = m[0].startsWith("http") ? m[0] : `https://${m[0]}`;
      break;
    }
  }

  // Extract Komoot URL
  const komootMatch = html.match(
    /https?:\/\/(?:www\.)?komoot\.(?:it|com|de)\/tour\/(\d+)/i
  );
  if (komootMatch) {
    komootUrl = komootMatch[0];
  }

  // Extract route description from the brzc_b section inside descrizione_br.
  // The brzc_b div contains <p> tags with route narrative text, mixed with
  // administrative content. We look for <p> blocks that read like route
  // descriptions (longer text, not about registration/medical certificates).
  const brzcbMatch = html.match(
    /class="brzc_b">([\s\S]*?)(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/i
  );
  if (brzcbMatch) {
    const pTags = [...brzcbMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/gi)];
    const candidates = pTags
      .map((m) =>
        decodeHtmlEntities(
          m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        )
      )
      .filter(
        (t) =>
          t.length > 60 &&
          !t.toLowerCase().includes("datahealth") &&
          !t.toLowerCase().includes("certificat") &&
          !t.toLowerCase().includes("cookie") &&
          !t.toLowerCase().includes("iscrizioni") &&
          !t.toLowerCase().includes("bonifico") &&
          !t.toLowerCase().includes("loggato") &&
          !t.toLowerCase().includes("liberatoria")
      );
    if (candidates.length > 0) {
      // Join the first few narrative paragraphs
      description = candidates.slice(0, 3).join(" ").slice(0, 500);
    }
  }

  return {
    distanceKm,
    elevationM,
    description,
    organizer,
    gpxDownloadUrl,
    openRunnerUrl,
    komootUrl,
  };
}

/**
 * Download and process a GPX file from the Audax Italia site.
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
    gpxFileKey = `courses/it-${slug}.gpx`;
    await minioLib.uploadGpx(gpxFileKey, gpxBuffer);
  } catch {
    gpxFileKey = null; // Reset — file not actually in MinIO
    // Non-critical
  }

  return { gpxFileKey, elevationM, distanceKm, elevationProfile, geojsonGeometry };
}

// Note: OpenRunner and Komoot GPX exports require authentication/browser sessions,
// so we cannot automatically fetch GPX from those services. Courses with only
// OpenRunner or Komoot links will be imported as metadata-only (no GPX/geometry)
// with the external route URL stored in officialPageUrl for user reference.

/**
 * Run the Audax Italia permanent course scraper.
 */
export async function runAudaxItalyScraper(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    // Step 1: Fetch listing pages (paginated by lim_brevetto offset)
    // The site shows 27 items per page, using lim_brevetto=N as the offset.
    // Page 1: no lim_brevetto param (or lim_brevetto=0)
    // Page 2: lim_brevetto=27
    // Page 3: lim_brevetto=54, etc.
    const allEntries: ParsedCourseEntry[] = [];
    const PAGE_SIZE = 27;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const url =
          offset === 0
            ? LISTING_URL
            : `${LISTING_URL}&lim_brevetto=${offset}`;
        const pageNum = Math.floor(offset / PAGE_SIZE) + 1;
        console.log(`[audax-italy] Fetching listing page ${pageNum} (offset ${offset})...`);
        const html = await httpsGet(url);

        const entries = parseListingPage(html);
        console.log(`[audax-italy] Page ${pageNum}: ${entries.length} courses found`);

        if (entries.length === 0) {
          hasMore = false;
        } else {
          allEntries.push(...entries);
          // Check if there's a next page by looking for nextpg_brevetto content
          // or a higher lim_brevetto link
          const nextOffset = offset + PAGE_SIZE;
          const nextPageRegex = new RegExp(
            `lim_brevetto=${nextOffset}`,
            "i"
          );
          hasMore = nextPageRegex.test(html);
          offset = nextOffset;
        }

        await sleep(500);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Failed to fetch listing page at offset ${offset}: ${msg}`);
        hasMore = false;
      }
    }

    // Deduplicate by obid
    const deduped: ParsedCourseEntry[] = [];
    const seenObids = new Set<string>();
    for (const entry of allEntries) {
      if (seenObids.has(entry.obid)) continue;
      seenObids.add(entry.obid);
      deduped.push(entry);
    }

    result.total = deduped.length;
    console.log(
      `[audax-italy] Total unique courses: ${deduped.length} (from ${allEntries.length} raw)`
    );

    if (deduped.length === 0) {
      result.errors.push("No courses found — HTML structure may have changed");
      return result;
    }

    // Step 2: Process each course
    for (const entry of deduped) {
      try {
        const externalId = `it-${entry.obid}`;

        // Check if already exists
        const existing = await prisma.course.findFirst({
          where: {
            sourceType: "audax-italy",
            externalId,
          },
        });

        if (existing) {
          // Check for metadata updates: fetch detail page
          await sleep(500);
          let detail: CourseDetail | null = null;
          try {
            const detailUrl = `${BASE_URL}/index.php?pg=brevetti_permanenti&org=${entry.orgId}&obid=${entry.obid}`;
            const detailHtml = await httpsGet(detailUrl);
            detail = parseDetailPage(detailHtml);
          } catch {
            // Non-critical; skip update check
          }

          const updates: Record<string, unknown> = {};
          if (existing.name !== entry.name) updates.name = entry.name;

          if (detail) {
            if (detail.distanceKm > 0 && existing.distanceKm !== detail.distanceKm) {
              updates.distanceKm = detail.distanceKm;
            }
            if (detail.elevationM > 0 && existing.elevationM !== detail.elevationM) {
              updates.elevationM = detail.elevationM;
            }
          }

          // Re-download GPX if missing
          if (!existing.gpxFileKey && detail) {
            try {
              let gpxData = null;
              if (detail.gpxDownloadUrl) {
                gpxData = await downloadAndProcessGpx(
                  detail.gpxDownloadUrl,
                  entry.slug
                );
              }

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
              result.errors.push(`GPX re-download failed for ${entry.slug}: ${msg}`);
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

        // Fetch detail page
        let detail: CourseDetail | null = null;
        try {
          const detailUrl = `${BASE_URL}/index.php?pg=brevetti_permanenti&org=${entry.orgId}&obid=${entry.obid}`;
          const detailHtml = await httpsGet(detailUrl);
          detail = parseDetailPage(detailHtml);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`Detail page failed for ${entry.slug}: ${msg}`);
        }

        let gpxFileKey: string | null = null;
        let elevationM = detail?.elevationM ?? 0;
        let distanceKm = detail?.distanceKm ?? parseDistanceCategory(entry.distanceCategory);
        let elevationProfile: { distance: number; elevation: number }[] | null = null;
        let geojsonGeometry: object | null = null;

        // Try to get GPX data
        if (detail?.gpxDownloadUrl) {
          try {
            await sleep(500);
            const data = await downloadAndProcessGpx(
              detail.gpxDownloadUrl,
              entry.slug
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
            result.errors.push(`GPX download failed for ${entry.slug}: ${msg}`);
          }
        }

        // Build course number
        const courseNumber = `IT-${entry.obid}`;

        // Official page URL
        const officialPageUrl = `${BASE_URL}/index.php?pg=brevetti_permanenti&org=${entry.orgId}&obid=${entry.obid}`;

        // Determine region from location province code
        const region = entry.location || "Italia";

        // Use organizer from detail page (more accurate) or listing page
        const designerName =
          detail?.organizer || entry.organizer || null;

        // Skip courses without GPX - can't display on map
        if (!gpxFileKey) {
          result.skipped++;
          continue;
        }

        const newCourse = await prisma.course.create({
          data: {
            courseNumber,
            name: entry.name,
            distanceKm: distanceKm || 0,
            elevationM,
            startLocation: entry.location || "Italia",
            endLocation: entry.location || "Italia",
            region,
            category: ["brevet"],
            tags: ["audax-italy"],
            description: detail?.description || null,
            designer: designerName,
            officialPageUrl,
            gpxFileKey,
            country: "IT",
            sourceType: "audax-italy",
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
          `[audax-italy] Created: ${entry.name} (${distanceKm}km, ${gpxFileKey ? "with GPX" : "no GPX"})`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Course ${entry.slug}: ${msg}`);
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
      where: { key: "IT_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "IT_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "IT_LAST_SCRAPE_RESULT" },
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
        key: "IT_LAST_SCRAPE_RESULT",
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
