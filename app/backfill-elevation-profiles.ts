/**
 * Backfill elevation_profile JSONB for all courses that have a GPX file
 * but no pre-computed elevation profile.
 *
 * Idempotent: only processes courses WHERE elevation_profile IS NULL.
 *
 * Usage (run inside the app container):
 *   docker compose exec app npx tsx /scripts/backfill-elevation-profiles.ts
 */

import { Prisma, PrismaClient } from "@prisma/client";
import * as Minio from "minio";

// --- GPX parsing (inlined to avoid path alias issues in scripts) ---

interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
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

function parseElevations(gpxString: string): { distance: number; elevation: number }[] {
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

  let totalDistance = 0;
  const elevations: { distance: number; elevation: number }[] = [];

  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      totalDistance += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    elevations.push({ distance: totalDistance, elevation: points[i].ele });
  }

  return elevations;
}

function sampleElevations(
  elevations: { distance: number; elevation: number }[],
  maxPoints = 1000
): { distance: number; elevation: number }[] {
  if (elevations.length <= maxPoints) {
    return elevations.map((p) => ({
      distance: Math.round(p.distance * 100) / 100,
      elevation: Math.round(p.elevation * 10) / 10,
    }));
  }

  const step = (elevations.length - 1) / (maxPoints - 1);
  const sampled: { distance: number; elevation: number }[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    const p = elevations[idx];
    sampled.push({
      distance: Math.round(p.distance * 100) / 100,
      elevation: Math.round(p.elevation * 10) / 10,
    });
  }
  return sampled;
}

// --- MinIO client ---

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "minio",
  port: parseInt(process.env.MINIO_PORT ?? "9000"),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER ?? "",
  secretKey: process.env.MINIO_ROOT_PASSWORD ?? "",
});

const BUCKET = process.env.MINIO_BUCKET ?? "gpx-files";

async function downloadGpx(key: string): Promise<Buffer> {
  const stream = await minioClient.getObject(BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// --- Main ---

const prisma = new PrismaClient();

async function main() {
  const courses = await prisma.course.findMany({
    where: {
      gpxFileKey: { not: null },
      elevationProfile: { equals: Prisma.DbNull },
    },
    select: {
      id: true,
      name: true,
      gpxFileKey: true,
    },
  });

  console.log(`Found ${courses.length} courses to backfill.`);

  let success = 0;
  let failed = 0;

  for (const course of courses) {
    try {
      const gpxBuffer = await downloadGpx(course.gpxFileKey!);
      const gpxString = gpxBuffer.toString("utf-8");
      const elevations = parseElevations(gpxString);

      if (elevations.length === 0) {
        console.log(`  SKIP ${course.name}: no elevation data in GPX`);
        continue;
      }

      const sampled = sampleElevations(elevations);

      await prisma.course.update({
        where: { id: course.id },
        data: { elevationProfile: sampled },
      });

      success++;
      console.log(`  OK   ${course.name} (${elevations.length} pts → ${sampled.length} sampled)`);
    } catch (err) {
      failed++;
      console.error(`  FAIL ${course.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}, Skipped: ${courses.length - success - failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
