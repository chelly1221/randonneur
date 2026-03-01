/**
 * ACP BRM World Calendar Scraper
 *
 * Fetches worldwide BRM (Brevet de Randonneurs Mondiaux) schedules from the
 * official ACP (Audax Club Parisien) calendar API and syncs them into the
 * local events table.
 *
 * API: https://brevets.audax-club-parisien.com/controleur/api/brm_calendar.php
 * Source: https://www.audax-club-parisien.com/en/our-organizations/brm-world/#calendar
 */

import { prisma } from "./db";

const ACP_API_HOST = "brevets.audax-club-parisien.com";
const ACP_API_PATH = "/controleur/api/brm_calendar.php";

const ACP_CALENDAR_URL =
  "https://www.audax-club-parisien.com/en/our-organizations/brm-world/#calendar";

/** Raw event from the ACP API */
interface AcpBrevetRaw {
  Date: string; // "01/03/2026" (DD/MM/YYYY)
  Distance: number; // 200, 300, 400, 600, 1000
  Statut: string;
  Contact: string;
  MailContact: string;
  Pays: string; // "Korea", "France", "Allemagne", etc.
  TimeDate: number; // Unix timestamp (seconds)
  SiteWeb: string;
  Ville: string; // Start city, e.g. "Cheonan", "Seoul"
  Departement: string;
  Region: string;
  RoadMap: string; // Route link (often empty)
  Denivele: number; // Elevation gain (often 0)
  Inscription: number | null;
  NomClub: string; // e.g. "RANDONNEURS KOREA SEOUL"
}

/** Map ACP club names to Korean region names (used for Korean events only) */
const CLUB_TO_REGION: Record<string, string> = {
  "RANDONNEURS KOREA SEOUL": "서울/경기",
  "RANDONNEURS KOREA CHEONAN": "천안/대전",
  "RANDONNEURS KOREA GWANGJU": "광주",
  "RANDONNEURS KOREA DAEGU": "대구",
  "RANDONNEURS KOREA BUSAN": "부산/제주",
};

/** Club name to region slug for external IDs (Korean events) */
const CLUB_TO_SLUG: Record<string, string> = {
  "RANDONNEURS KOREA SEOUL": "seoul",
  "RANDONNEURS KOREA CHEONAN": "cheonan",
  "RANDONNEURS KOREA GWANGJU": "gwangju",
  "RANDONNEURS KOREA DAEGU": "daegu",
  "RANDONNEURS KOREA BUSAN": "busan",
};

export interface ScrapeResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

/**
 * Slugify a string for use in external IDs.
 */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30);
}

/**
 * Fetch worldwide BRM events from the ACP calendar API for a date range.
 * Uses https.request with family:4 (IPv4) because the ACP server's IPv6
 * is unreachable from Docker bridge networks, causing undici-based fetch
 * to timeout on dual-stack connection attempts.
 */
async function fetchAcpEvents(
  startDate: string,
  endDate: string
): Promise<AcpBrevetRaw[]> {
  const body = new URLSearchParams({
    action: "search",
    startdate: startDate,
    enddate: endDate,
    distance: "",
    pays: "",      // Empty = all countries
    region: "",
    departement: "",
  }).toString();

  // Use eval("require") to completely bypass webpack's static analysis.
  // Webpack cannot resolve the 'https' Node builtin when bundling instrumentation.
  // This module only runs server-side so require("https") is always available.
  // eslint-disable-next-line no-eval
  const httpsModule = eval('require')("https") as {
    request: (
      opts: Record<string, unknown>,
      cb: (res: { statusCode?: number; resume: () => void; setEncoding: (e: string) => void; on: (e: string, cb: (d?: string) => void) => void }) => void
    ) => {
      on: (e: string, cb: (err?: Error) => void) => void;
      write: (d: string) => void;
      end: () => void;
      destroy: (err?: Error) => void;
    };
  };
  const { request } = httpsModule;

  const data = await new Promise<string>((resolve, reject) => {
    const req = request(
      {
        hostname: ACP_API_HOST,
        port: 443,
        path: ACP_API_PATH,
        method: "POST",
        family: 4, // Force IPv4 — ACP IPv6 unreachable from Docker
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "Audax-3chan/1.0",
        },
        timeout: 60000, // 60s for worldwide data (~4500 events)
      },
      (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`ACP API HTTP ${res.statusCode}`));
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
    req.on("timeout", () => {
      req.destroy(new Error("ACP API request timeout"));
    });
    req.write(body);
    req.end();
  });

  const parsed: unknown = JSON.parse(data);

  if (typeof parsed === "string") {
    throw new Error(`ACP API error: ${parsed}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("ACP API returned unexpected format");
  }

  return parsed as AcpBrevetRaw[];
}

/**
 * Check if this is a Korean event (by country name).
 */
function isKoreanEvent(event: AcpBrevetRaw): boolean {
  return event.Pays === "Korea";
}

/**
 * Generate a unique external ID for deduplication.
 * Format: acp-{YYYY}-{MMdd}-{countrySlug}-{clubOrVilleSlug}-{distance}
 */
function generateExternalId(event: AcpBrevetRaw): string {
  const [dd, mm] = event.Date.split("/");
  const date = new Date(event.TimeDate * 1000);
  const yyyy = date.getUTCFullYear();
  const countrySlug = slugify(event.Pays) || "unknown";

  let clubSlug: string;
  if (isKoreanEvent(event)) {
    clubSlug = CLUB_TO_SLUG[event.NomClub] || slugify(event.Ville);
  } else {
    clubSlug = slugify(event.Ville) || slugify(event.NomClub);
  }

  let id = `acp-${yyyy}-${mm}${dd}-${countrySlug}-${clubSlug}-${event.Distance}`;

  // Append ville slug if not already present (for uniqueness within same club/date)
  const villeSlug = slugify(event.Ville);
  if (villeSlug && !id.includes(villeSlug)) {
    id += `-${villeSlug}`;
  }

  return id;
}

/**
 * Build event title.
 * Korean events: "서울/경기 200km 브레베"
 * International events: "Paris 200km BRM"
 */
function buildTitle(event: AcpBrevetRaw): string {
  if (isKoreanEvent(event)) {
    const region = CLUB_TO_REGION[event.NomClub];
    if (region) {
      return `${region} ${event.Distance}km 브레베`;
    }
    return `${event.Ville} ${event.Distance}km 브레베`;
  }
  return `${event.Ville || event.Pays} ${event.Distance}km BRM`;
}

/**
 * Build location string.
 * Korean events: "서울/경기 (Seoul)"
 * International events: "Paris, France"
 */
function buildLocation(event: AcpBrevetRaw): string {
  if (isKoreanEvent(event)) {
    const region = CLUB_TO_REGION[event.NomClub];
    if (region && event.Ville) {
      return `${region} (${event.Ville})`;
    }
    return region || event.Ville || "Korea";
  }
  if (event.Ville && event.Pays) {
    return `${event.Ville}, ${event.Pays}`;
  }
  return event.Ville || event.Pays || "Unknown";
}

/**
 * Build event description.
 * Korean events: Korean text
 * International events: English text
 */
function buildDescription(event: AcpBrevetRaw): string {
  if (isKoreanEvent(event)) {
    const parts: string[] = [];
    parts.push(`ACP 공식 ${event.Distance}km BRM`);
    const region = CLUB_TO_REGION[event.NomClub];
    if (region) {
      parts[0] += ` - ${region}`;
    }
    if (event.NomClub) {
      parts.push(`주최: ${event.NomClub}`);
    }
    if (event.Contact) {
      parts.push(`담당: ${event.Contact}`);
    }
    if (event.Denivele > 0) {
      parts.push(`누적 표고: ${event.Denivele}m`);
    }
    return parts.join("\n");
  }

  // International events
  const parts: string[] = [];
  parts.push(`ACP Official ${event.Distance}km BRM - ${event.Pays}`);
  if (event.NomClub) {
    parts.push(`Club: ${event.NomClub}`);
  }
  if (event.Contact) {
    parts.push(`Contact: ${event.Contact}`);
  }
  if (event.Denivele > 0) {
    parts.push(`Elevation: ${event.Denivele}m`);
  }
  return parts.join("\n");
}

/**
 * Parse the ACP date string (DD/MM/YYYY) into a Date.
 * Korean events use KST noon (UTC+9), international events use UTC noon.
 */
function parseAcpDate(dateStr: string, isKorea: boolean): Date {
  const [dd, mm, yyyy] = dateStr.split("/").map(Number);
  if (isKorea) {
    // KST noon = UTC 03:00 to avoid timezone edge cases
    return new Date(Date.UTC(yyyy, mm - 1, dd, 3, 0, 0));
  }
  // International: use UTC noon
  return new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
}

/**
 * Sync ACP BRM events (worldwide) into the database.
 */
export async function syncBrevetEvents(
  startDate: string,
  endDate: string,
  adminUserId: string
): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    total: 0,
  };

  try {
    const rawEvents = await fetchAcpEvents(startDate, endDate);
    result.total = rawEvents.length;

    if (rawEvents.length === 0) {
      return result;
    }

    for (const raw of rawEvents) {
      try {
        const externalId = generateExternalId(raw);
        const korea = isKoreanEvent(raw);
        const date = parseAcpDate(raw.Date, korea);
        const title = buildTitle(raw);
        const location = buildLocation(raw);
        const description = buildDescription(raw);
        const country = raw.Pays || null;

        // Build source URL — link to the ACP road map if available, else calendar
        let sourceUrl: string | null = null;
        if (raw.RoadMap && raw.RoadMap.trim()) {
          const rm = raw.RoadMap.trim();
          sourceUrl = rm.startsWith("http") ? rm : `https://${rm}`;
        } else {
          sourceUrl = ACP_CALENDAR_URL;
        }

        // Check for existing event
        const existing = await prisma.event.findFirst({
          where: {
            sourceType: "acp",
            externalId,
          },
        });

        if (existing) {
          // Update if sourceUrl or details changed
          const updates: Record<string, unknown> = {};
          if (sourceUrl && existing.sourceUrl !== sourceUrl) {
            updates.sourceUrl = sourceUrl;
          }
          if (existing.title !== title) {
            updates.title = title;
          }
          if (existing.location !== location) {
            updates.location = location;
          }
          if (existing.country !== country) {
            updates.country = country;
          }

          if (Object.keys(updates).length > 0) {
            await prisma.event.update({
              where: { id: existing.id },
              data: updates,
            });
            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          await prisma.event.create({
            data: {
              userId: adminUserId,
              title,
              description,
              eventType: "brevet",
              location,
              startDate: date,
              sourceType: "acp",
              externalId,
              sourceUrl,
              country,
            },
          });
          result.created++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const eid = generateExternalId(raw);
        result.errors.push(`${eid}: ${msg}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`ACP API failed: ${msg}`);
  }

  return result;
}

/**
 * Run the ACP BRM scraper for worldwide events.
 * Fetches the current year's full schedule (Jan 1 – Dec 31).
 */
export async function runAcpScraper(): Promise<ScrapeResult> {
  // Find first admin user
  const admin = await prisma.user.findFirst({
    where: { role: "admin", status: "active" },
    orderBy: { createdAt: "asc" },
  });

  if (!admin) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: ["No admin user found"],
      total: 0,
    };
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  // Fetch current year's events
  const startDate = `${currentYear}-01-01`;
  const endDate = `${currentYear}-12-31`;
  const result = await syncBrevetEvents(startDate, endDate, admin.id);

  // If we're in Oct-Dec, also fetch next year (ACP may have preliminary data)
  if (now.getMonth() >= 9) {
    const nextYear = currentYear + 1;
    const nextResult = await syncBrevetEvents(
      `${nextYear}-01-01`,
      `${nextYear}-12-31`,
      admin.id
    );
    result.created += nextResult.created;
    result.updated += nextResult.updated;
    result.skipped += nextResult.skipped;
    result.total += nextResult.total;
    result.errors.push(...nextResult.errors);
  }

  // Save last scrape info to settings
  try {
    await prisma.setting.upsert({
      where: { key: "KORA_LAST_SCRAPE_DATE" },
      update: { value: now.toISOString() },
      create: { key: "KORA_LAST_SCRAPE_DATE", value: now.toISOString() },
    });
    await prisma.setting.upsert({
      where: { key: "KORA_LAST_SCRAPE_RESULT" },
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
        key: "KORA_LAST_SCRAPE_RESULT",
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

// Backward-compatible alias
export const runKoraScraper = runAcpScraper;
