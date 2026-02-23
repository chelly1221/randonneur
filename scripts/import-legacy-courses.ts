/**
 * Legacy Course Import Script
 *
 * Fetches courses from https://archive1.3chan.kr/randonneur-course/,
 * downloads GPX files, parses geometry, and inserts into the database.
 *
 * Run via Docker:
 *   docker run --rm --network randonneur_default \
 *     -v $(pwd)/app:/app -v $(pwd)/scripts/import-legacy-courses.ts:/app/import-legacy-courses.ts \
 *     -w /app -e DATABASE_URL=... -e MINIO_... \
 *     node:20-alpine sh -c "npm ci --ignore-scripts && npx prisma generate && npx tsx /app/import-legacy-courses.ts"
 */

import { PrismaClient } from "@prisma/client";
import * as Minio from "minio";

// --- Config ---
const LEGACY_URL = "https://archive1.3chan.kr/randonneur-course/";
const GPX_BASE = "https://archive1.3chan.kr/wp-admin/admin-ajax.php?action=download_gpx&course_id=";
const DELAY_MS = 300;

// --- Clients ---
const prisma = new PrismaClient();

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "minio",
  port: parseInt(process.env.MINIO_PORT ?? "9000"),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER ?? "",
  secretKey: process.env.MINIO_ROOT_PASSWORD ?? "",
});
const BUCKET = process.env.MINIO_BUCKET ?? "gpx-files";

// --- GPX Parsing ---
interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
}

function parseGpxPoints(gpxString: string): GpxPoint[] {
  const points: GpxPoint[] = [];
  const trkptRegex =
    /<trkpt\s+lat=["']([^"']+)["']\s+lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;

  let match;
  while ((match = trkptRegex.exec(gpxString)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
    if (!isNaN(lat) && !isNaN(lon)) {
      points.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
    }
  }

  if (points.length === 0) {
    const rteptRegex =
      /<rtept\s+lat=["']([^"']+)["']\s+lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/rtept>/gi;
    while ((match = rteptRegex.exec(gpxString)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
      const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
      }
    }
  }

  return points;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Region Mapping (manual only; no auto-detection) ---
// Fill this map explicitly before import.
// Allowed values: 경기, 강원, 충북, 충남, 경북, 경남, 전북, 전남, 제주
const MANUAL_REGION_BY_COURSE: Record<string, string> = {};

// --- HTML Parsing ---
interface ParsedCourse {
  courseNumber: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  estimatedTime: string;
  startLocation: string;
  endLocation: string;
  gpxCourseId: string;
  archived: boolean;
}

function parseCoursesFromHtml(html: string): ParsedCourse[] {
  const courses: ParsedCourse[] = [];

  // Match each <tr class="course-row" ...>...</tr>
  const trRegex = /<tr\s+class="course-row"\s+data-course-id="(\d+)"\s*\n?\s*data-distance="(\d+)"\s*\n?\s*data-elevation="(\d+)">([\s\S]*?)<\/tr>/gi;

  let match;
  while ((match = trRegex.exec(html)) !== null) {
    const gpxCourseId = match[1];
    const distanceKm = parseFloat(match[2]);
    const elevationM = parseInt(match[3]);
    const rowHtml = match[4];

    // Extract course number from <span class="course-number">PT-02</span>
    const numMatch = rowHtml.match(/<span\s+class="course-number">(.*?)<\/span>/);
    const courseNumberRaw = numMatch ? numMatch[1].trim() : "";

    // Check if archived: "(구)" in course number
    const archived = courseNumberRaw.includes("(구)");
    const courseNumber = courseNumberRaw.replace(/\s*\(구\)\s*/, "").trim();

    // Extract course name from <span class="course-name">...</span>
    const nameMatch = rowHtml.match(/<span\s+class="course-name">(.*?)<\/span>/);
    const name = nameMatch ? nameMatch[1].trim() : courseNumber;

    // Extract estimated time from time-card
    const timeMatch = rowHtml.match(/time-card[\s\S]*?<span\s+class="info-value">([\d:]+)<\/span>/);
    const estimatedTime = timeMatch ? timeMatch[1].trim() : "";

    // Extract route (start → end) from route-card
    const routeMatch = rowHtml.match(/route-card[\s\S]*?<span\s+class="info-value">([\s\S]*?)<\/span>/);
    let startLocation = name;
    let endLocation = name;
    if (routeMatch) {
      const routeText = routeMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const parts = routeText.split("→").map((s: string) => s.trim());
      if (parts.length >= 2) {
        startLocation = parts[0] || name;
        endLocation = parts[1] || name;
      } else if (parts[0]) {
        startLocation = parts[0];
        endLocation = parts[0];
      }
    }

    courses.push({
      courseNumber,
      name,
      distanceKm,
      elevationM,
      estimatedTime,
      startLocation,
      endLocation,
      gpxCourseId,
      archived,
    });
  }

  return courses;
}

// --- Main ---
async function main() {
  console.log("=== Legacy Course Import ===\n");

  // Step 1: Delete dummy seed courses
  console.log("Step 1: Deleting dummy seed courses...");
  const deleted = await prisma.$executeRaw`
    DELETE FROM courses WHERE gpx_file_key IS NULL AND geom IS NULL AND course_number IS NULL
  `;
  console.log(`  Deleted ${deleted} dummy courses.\n`);

  // Step 2: Fetch legacy page HTML
  console.log("Step 2: Fetching legacy page...");
  const response = await fetch(LEGACY_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch legacy page: ${response.status}`);
  }
  const html = await response.text();
  console.log(`  Fetched ${html.length} bytes.\n`);

  // Step 3: Parse course entries from HTML table rows
  console.log("Step 3: Parsing course entries from HTML...");
  const entries = parseCoursesFromHtml(html);
  console.log(`  Found ${entries.length} courses.\n`);

  if (entries.length === 0) {
    console.error("ERROR: No courses found in HTML. The page structure may have changed.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // Step 4: Ensure MinIO bucket
  console.log("Step 4: Ensuring MinIO bucket...");
  const bucketExists = await minioClient.bucketExists(BUCKET);
  if (!bucketExists) {
    await minioClient.makeBucket(BUCKET);
    console.log(`  Created bucket '${BUCKET}'.`);
  } else {
    console.log(`  Bucket '${BUCKET}' exists.`);
  }
  console.log();

  // Step 5: Import each course
  console.log("Step 5: Importing courses...\n");

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    const label = `${entry.courseNumber} ${entry.name}`;

    // Check if already imported
    const existing = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint as count FROM courses WHERE course_number = $1`,
      entry.courseNumber
    );
    if (existing[0]?.count > 0n) {
      console.log(`  SKIP ${label} (already exists)`);
      skipped++;
      continue;
    }

    try {
      // Download GPX
      const gpxUrl = `${GPX_BASE}${entry.gpxCourseId}`;
      const gpxResponse = await fetch(gpxUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; randonneur-import/1.0)",
        },
      });

      if (!gpxResponse.ok) {
        console.log(`  FAIL ${label} - GPX download HTTP ${gpxResponse.status}`);
        failed++;
        await sleep(DELAY_MS);
        continue;
      }

      const gpxText = await gpxResponse.text();

      // Check if it's actually GPX
      if (!gpxText.includes("<gpx") && !gpxText.includes("<trk") && !gpxText.includes("<rte")) {
        console.log(`  FAIL ${label} - Not a valid GPX file (${gpxText.length} bytes)`);
        failed++;
        await sleep(DELAY_MS);
        continue;
      }

      // Parse GPX points
      const points = parseGpxPoints(gpxText);
      if (points.length < 2) {
        console.log(`  FAIL ${label} - GPX has only ${points.length} point(s)`);
        failed++;
        await sleep(DELAY_MS);
        continue;
      }

      // Calculate distance and elevation from GPX
      let gpxDistance = 0;
      let gpxGain = 0;
      for (let i = 1; i < points.length; i++) {
        gpxDistance += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
        const eleDiff = points[i].ele - points[i - 1].ele;
        if (eleDiff > 0) gpxGain += eleDiff;
      }

      // Use HTML values if available, fallback to GPX-derived
      const finalDistance = entry.distanceKm > 0 ? entry.distanceKm : Math.round(gpxDistance * 10) / 10;
      const finalElevation = entry.elevationM > 0 ? entry.elevationM : Math.round(gpxGain);

      // Build GeoJSON LineString
      const coordinates = points.map((p) => [p.lon, p.lat]);
      const geojson = { type: "LineString", coordinates };

      // Region must be specified manually (no auto assignment).
      const region = MANUAL_REGION_BY_COURSE[entry.courseNumber];
      if (!region) {
        console.log(`  FAIL ${label} - missing manual region mapping`);
        failed++;
        await sleep(DELAY_MS);
        continue;
      }

      // Estimate time if not available
      let estimatedTime = entry.estimatedTime;
      if (!estimatedTime && finalDistance > 0) {
        const hours = Math.floor(finalDistance / 15);
        const minutes = Math.round(((finalDistance / 15) - hours) * 60);
        estimatedTime = `${hours}:${minutes.toString().padStart(2, "0")}`;
      }

      // Insert into database with PostGIS geometry
      await prisma.$queryRawUnsafe(
        `INSERT INTO courses (id, course_number, name, distance_km, elevation_m, estimated_time,
          start_location, end_location, region, archived, gpx_file_key, geom, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           ST_SetSRID(ST_GeomFromGeoJSON($11), 4326), NOW(), NOW())`,
        entry.courseNumber,
        entry.name,
        finalDistance,
        finalElevation,
        estimatedTime || null,
        entry.startLocation,
        entry.endLocation,
        region,
        entry.archived,
        `courses/${entry.courseNumber}.gpx`,
        JSON.stringify(geojson)
      );

      // Upload GPX to MinIO
      const gpxBuffer = Buffer.from(gpxText, "utf-8");
      await minioClient.putObject(BUCKET, `courses/${entry.courseNumber}.gpx`, gpxBuffer, gpxBuffer.length, {
        "Content-Type": "application/gpx+xml",
      });

      const archivedTag = entry.archived ? " [archived]" : "";
      console.log(`  OK   ${label} — ${finalDistance}km, ${finalElevation}m↑, ${points.length} pts, ${region}${archivedTag}`);
      imported++;
    } catch (err) {
      console.log(`  FAIL ${label} — ${err instanceof Error ? err.message : err}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log("\n=== Import Summary ===");
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${entries.length}`);

  const totalCount = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM courses`
  );
  console.log(`\n  Total courses in DB: ${totalCount[0]?.count}`);

  await prisma.$disconnect();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
