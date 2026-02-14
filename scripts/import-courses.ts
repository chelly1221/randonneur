/**
 * Import courses from legacy data.
 *
 * Usage:
 *   docker run --rm --network randonneur_default \
 *     -v $(pwd)/app:/app -v $(pwd)/scripts:/scripts -w /app \
 *     -e DATABASE_URL="postgresql://3chan:Scott122001%26%26@postgres:5432/randonneur" \
 *     node:20-alpine npx tsx /scripts/import-courses.ts /scripts/legacy-courses.json
 *
 * Expected JSON format:
 * [
 *   {
 *     "name": "Course Name",
 *     "distanceKm": 200,
 *     "elevationM": 1500,
 *     "estimatedTime": "12h",
 *     "startLocation": "Start",
 *     "endLocation": "End",
 *     "region": "서울",
 *     "category": "classic",
 *     "tags": ["tag1"],
 *     "description": "...",
 *     "gpxUrl": "https://..."  // optional: URL to download GPX
 *   }
 * ]
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("Usage: tsx import-courses.ts <input.json>");
    process.exit(1);
  }

  const raw = fs.readFileSync(inputFile, "utf-8");
  const courses = JSON.parse(raw);

  console.log(`Found ${courses.length} courses to import`);

  let imported = 0;
  let skipped = 0;

  for (const course of courses) {
    const existing = await prisma.course.findFirst({
      where: { name: course.name },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.course.create({
      data: {
        name: course.name,
        distanceKm: course.distanceKm,
        elevationM: course.elevationM,
        estimatedTime: course.estimatedTime ?? null,
        startLocation: course.startLocation,
        endLocation: course.endLocation,
        region: course.region,
        category: course.category ?? null,
        tags: course.tags ?? [],
        description: course.description ?? null,
      },
    });
    imported++;
  }

  console.log(`Imported: ${imported}, Skipped: ${skipped}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
