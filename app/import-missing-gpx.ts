import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { parseGpx, sampleElevations } from "./src/lib/gpx";
import { uploadGpx } from "./src/lib/minio";

const prisma = new PrismaClient();
const SOURCE_DIR = "/app";

function extractCourseNumber(fileName: string): string | null {
  const matched = fileName.toUpperCase().match(/PT-?(\d{2,3}R?)/);
  if (!matched) return null;
  return `PT-${matched[1]}`;
}

async function main() {
  const files = readdirSync(SOURCE_DIR).filter((f) => f.toLowerCase().endsWith(".gpx"));
  if (files.length === 0) {
    console.log("No GPX files found in /app");
    return;
  }

  const missing = await prisma.course.findMany({
    where: { gpxFileKey: null, courseNumber: { startsWith: "PT-" } },
    select: { id: true, courseNumber: true, name: true },
  });
  const byNumber = new Map(missing.map((c) => [c.courseNumber ?? "", c]));

  let ok = 0;
  let skipped = 0;

  for (const file of files) {
    const courseNumber = extractCourseNumber(file);
    if (!courseNumber) continue;

    const course = byNumber.get(courseNumber);
    if (!course) {
      continue;
    }

    const buffer = readFileSync(join(SOURCE_DIR, file));
    const parsed = parseGpx(buffer.toString("utf-8"));
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

    await prisma.course.update({
      where: { id: course.id },
      data: {
        gpxFileKey: key,
        distanceKm: parsed.distance,
        elevationM: parsed.elevationGain,
        elevationProfile: sampleElevations(parsed.elevations),
      },
    });

    if (lineGeometry) {
      await prisma.$executeRawUnsafe(
        `UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid`,
        JSON.stringify(lineGeometry),
        course.id
      );
    }

    console.log(
      `OK   ${course.courseNumber} ${course.name} <- ${file} (dist=${parsed.distance}km elev=${parsed.elevationGain}m)`
    );
    ok++;
  }

  const stillMissing = await prisma.course.count({
    where: { gpxFileKey: null, courseNumber: { startsWith: "PT-" } },
  });
  skipped = files.length - ok;
  console.log(`Done. Imported: ${ok}, File-skipped: ${skipped}, Remaining missing PT GPX: ${stillMissing}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
