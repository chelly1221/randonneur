import { PrismaClient } from "@prisma/client";

type RwgpsPoint = { x: number; y: number; d?: number };
type RwgpsPoi = {
  name: string;
  lat: number;
  lng: number;
  description?: string | null;
  url?: string | null;
};

const prisma = new PrismaClient();

function sqDist(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dx = aLng - bLng;
  const dy = aLat - bLat;
  return dx * dx + dy * dy;
}

async function main() {
  const courseNumber = process.argv[2];
  const routeId = process.argv[3];

  if (!courseNumber || !routeId) {
    throw new Error(
      "Usage: npx tsx /app/import-rwgps-checkpoints.ts <COURSE_NUMBER> <RWGPS_ROUTE_ID>"
    );
  }

  const course = await prisma.course.findFirst({
    where: { courseNumber },
    select: { id: true, name: true },
  });
  if (!course) throw new Error(`Course not found: ${courseNumber}`);

  const res = await fetch(`https://ridewithgps.com/routes/${routeId}.json`);
  if (!res.ok) throw new Error(`Failed to fetch RWGPS route: HTTP ${res.status}`);
  const data = (await res.json()) as {
    points_of_interest?: RwgpsPoi[];
    track_points?: RwgpsPoint[];
  };

  const pois = data.points_of_interest ?? [];
  const track = data.track_points ?? [];
  if (pois.length === 0) throw new Error("No points_of_interest found");
  if (track.length === 0) throw new Error("No track_points found");

  // Replace existing checkpoints for the course.
  await prisma.checkpoint.deleteMany({ where: { courseId: course.id } });

  let inserted = 0;

  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];

    let best = track[0];
    let bestD = sqDist(poi.lat, poi.lng, best.y, best.x);
    for (let j = 1; j < track.length; j++) {
      const tp = track[j];
      const d = sqDist(poi.lat, poi.lng, tp.y, tp.x);
      if (d < bestD) {
        bestD = d;
        best = tp;
      }
    }

    const distanceKm = (best.d ?? 0) / 1000;
    const description = poi.description || poi.url || null;

    await prisma.checkpoint.create({
      data: {
        courseId: course.id,
        name: poi.name,
        description,
        distanceKm,
        sortOrder: i + 1,
      },
    });
    inserted++;
  }

  console.log(
    `Imported checkpoints: ${inserted} for ${courseNumber} (${course.name}) from RWGPS route ${routeId}`
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
