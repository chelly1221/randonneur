import { PrismaClient } from "@prisma/client";
import {
  normalizeElevationRenderData,
  type ElevationPoint,
} from "../app/src/lib/elevation-render";

const prisma = new PrismaClient();

async function main() {
  const courses = await prisma.course.findMany({
    select: { id: true, name: true, elevationProfile: true },
    where: { elevationProfile: { not: null } },
  });

  let updated = 0;
  for (const c of courses) {
    const raw = c.elevationProfile;
    const normalized = normalizeElevationRenderData(raw);
    if (!normalized.points.length) continue;

    const points = normalized.points as ElevationPoint[];

    await prisma.course.update({
      where: { id: c.id },
      data: {
        elevationProfile: {
          points,
        },
      },
    });
    updated++;
    console.log(`OK ${c.name}: points=${points.length}`);
  }

  console.log(`Done. Updated ${updated} course rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
