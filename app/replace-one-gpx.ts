import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { parseGpx, sampleElevations } from "./src/lib/gpx";
import { uploadGpx } from "./src/lib/minio";

const prisma = new PrismaClient();

async function main() {
  const courseNumber = process.argv[2];
  const filePath = process.argv[3];

  if (!courseNumber || !filePath) {
    throw new Error("Usage: npx tsx /app/replace-one-gpx.ts <COURSE_NUMBER> <GPX_PATH>");
  }

  const course = await prisma.course.findFirst({
    where: { courseNumber },
    select: { id: true, name: true },
  });
  if (!course) throw new Error(`Course not found: ${courseNumber}`);

  const buffer = readFileSync(filePath);
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
      "UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid",
      JSON.stringify(lineGeometry),
      course.id
    );
  }

  console.log(
    `OK ${courseNumber} ${course.name} replaced from ${filePath} dist=${parsed.distance} elev=${parsed.elevationGain}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
