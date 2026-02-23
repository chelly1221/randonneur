import { PrismaClient } from "@prisma/client";
import { downloadGpx } from "./src/lib/minio";
import { parseGpx } from "./src/lib/gpx";

const prisma = new PrismaClient();

async function main() {
  const courses = await prisma.course.findMany({
    where: {
      gpxFileKey: { not: null },
    },
    select: {
      id: true,
      courseNumber: true,
      name: true,
      gpxFileKey: true,
      checkpoints: {
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { courseNumber: "asc" },
  });

  let checked = 0;
  let skippedHasCp = 0;
  let skippedNoWpt = 0;
  let insertedCourses = 0;
  let insertedCheckpoints = 0;
  let failed = 0;

  for (const course of courses) {
    checked++;
    const label = `${course.courseNumber ?? course.id} ${course.name}`;

    if (course.checkpoints.length > 0) {
      skippedHasCp++;
      continue;
    }

    try {
      const gpxBuffer = await downloadGpx(course.gpxFileKey!);
      const gpxString = gpxBuffer.toString("utf-8");
      const parsed = parseGpx(gpxString);

      if (parsed.checkpoints.length === 0) {
        skippedNoWpt++;
        continue;
      }

      const rows = parsed.checkpoints.map((cp, i) => ({
        courseId: course.id,
        name: cp.name,
        description: cp.description,
        distanceKm: cp.distanceKm,
        sortOrder: i,
        imageKey: null as string | null,
      }));

      await prisma.checkpoint.createMany({ data: rows });
      insertedCourses++;
      insertedCheckpoints += rows.length;
      console.log(`OK   ${label}: +${rows.length} checkpoints`);
    } catch (error) {
      failed++;
      console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("---- Summary ----");
  console.log(`Checked: ${checked}`);
  console.log(`Skipped (already has CP): ${skippedHasCp}`);
  console.log(`Skipped (no WPT in GPX): ${skippedNoWpt}`);
  console.log(`Inserted courses: ${insertedCourses}`);
  console.log(`Inserted checkpoints: ${insertedCheckpoints}`);
  console.log(`Failed: ${failed}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
