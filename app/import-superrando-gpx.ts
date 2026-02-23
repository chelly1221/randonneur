import { PrismaClient } from "@prisma/client";
import { readFile } from "fs/promises";
import { readdirSync } from "fs";
import { join } from "path";
import { parseGpx, sampleElevations } from "./src/lib/gpx";
import { uploadGpx } from "./src/lib/minio";

const prisma = new PrismaClient();
const GPX_DIR = "/app/tmp-sr-gpx";

function extractCourseNumber(fileName: string): string | null {
  const m = fileName.toUpperCase().match(/SR-?(\d{2})/);
  if (!m) return null;
  return `SR-${m[1]}`;
}

async function main() {
  const files = readdirSync(GPX_DIR).filter((f) => f.toLowerCase().endsWith(".gpx"));
  if (files.length === 0) {
    throw new Error(`No GPX files found in ${GPX_DIR}`);
  }

  const srCourses = await prisma.course.findMany({
    where: { courseNumber: { startsWith: "SR-" } },
    select: { id: true, courseNumber: true, name: true },
  });
  const byNumber = new Map(srCourses.map((c) => [c.courseNumber ?? "", c]));

  let ok = 0;
  let skipped = 0;

  for (const file of files) {
    const courseNumber = extractCourseNumber(file);
    if (!courseNumber) {
      console.log(`SKIP ${file}: could not parse course number`);
      skipped++;
      continue;
    }

    const course = byNumber.get(courseNumber);
    if (!course) {
      console.log(`SKIP ${file}: no course found for ${courseNumber}`);
      skipped++;
      continue;
    }

    const fullPath = join(GPX_DIR, file);
    const buffer = await readFile(fullPath);
    const gpxString = buffer.toString("utf-8");
    const parsed = parseGpx(gpxString);

    const key = `courses/${course.id}.gpx`;
    await uploadGpx(key, buffer);

    let lineGeometry: { type: "LineString"; coordinates: number[][] } | null = null;
    for (const feature of parsed.geojson.features) {
      if (feature.geometry.type === "LineString") {
        lineGeometry = feature.geometry as { type: "LineString"; coordinates: number[][] };
        break;
      }
      if (feature.geometry.type === "MultiLineString") {
        lineGeometry = {
          type: "LineString",
          coordinates: (feature.geometry.coordinates as number[][][]).flat(),
        };
        break;
      }
    }

    const elevationProfile = sampleElevations(parsed.elevations);

    const updated = await prisma.course.update({
      where: { id: course.id },
      data: {
        gpxFileKey: key,
        distanceKm: parsed.distance,
        elevationM: parsed.elevationGain,
        elevationProfile,
      },
    });

    if (lineGeometry) {
      await prisma.$executeRawUnsafe(
        `UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid`,
        JSON.stringify(lineGeometry),
        updated.id
      );
    }

    console.log(
      `OK   ${course.courseNumber} ${course.name} <- ${file} (dist=${parsed.distance}km, elev=${parsed.elevationGain}m)`
    );
    ok++;
  }

  console.log(`Done. Success: ${ok}, Skipped: ${skipped}, Files: ${files.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
