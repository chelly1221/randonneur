import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "6"), 20);
  const country = searchParams.get("country");

  const session = await auth();

  // If not logged in, return popular courses
  if (!session?.user?.id) {
    return returnPopular(limit, country);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return returnPopular(limit, country);
  }

  // Get user's completed and favorited courses with preferences
  const [completions, favorites] = await Promise.all([
    prisma.completion.findMany({
      where: { userId: user.id },
      include: {
        course: { select: { id: true, region: true, distanceKm: true } },
      },
    }),
    prisma.favorite.findMany({
      where: { userId: user.id },
      include: {
        course: { select: { id: true, region: true, distanceKm: true } },
      },
    }),
  ]);

  const completedIds = completions.map((c) => c.course.id);
  const favoritedIds = favorites.map((f) => f.course.id);
  const excludeIds = [...new Set([...completedIds, ...favoritedIds])];

  // For new users with no activity, return popular courses
  if (completedIds.length === 0 && favoritedIds.length === 0) {
    return returnPopular(limit, country);
  }

  // Gather region and distance preferences from completions + favorites
  const allCourses = [
    ...completions.map((c) => c.course),
    ...favorites.map((f) => f.course),
  ];
  const preferredRegions = [
    ...new Set(allCourses.map((c) => c.region).filter(Boolean) as string[]),
  ];
  const distances = allCourses.map((c) => c.distanceKm);
  const avgDistance =
    distances.length > 0
      ? distances.reduce((a, b) => a + b, 0) / distances.length
      : 200;
  const minDist = Math.max(0, avgDistance - 100);
  const maxDist = avgDistance + 100;

  // Score-based recommendation using raw query
  // Score: same region * 3 + similar distance * 2 + popularity * 1
  const results = await prisma.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      distance_km: number;
      elevation_m: number;
      start_location: string;
      end_location: string;
      region: string | null;
      category: string[];
    }[]
  >`
    SELECT c.id, c.slug, c.name, c.distance_km, c.elevation_m,
           c.start_location, c.end_location, c.region, c.category,
           (
             CASE WHEN c.region = ANY(${preferredRegions}::text[]) THEN 3 ELSE 0 END +
             CASE WHEN c.distance_km BETWEEN ${minDist} AND ${maxDist} THEN 2 ELSE 0 END +
             COALESCE((SELECT COUNT(*) FROM completions WHERE course_id = c.id), 0)::int
           ) as score
    FROM courses c
    WHERE c.archived = false
      AND c.id != ALL(${excludeIds}::uuid[])
      AND (${country}::text IS NULL OR c.country = ${country})
    ORDER BY score DESC, c.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(
    results.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      distanceKm: r.distance_km,
      elevationM: r.elevation_m,
      startLocation: r.start_location,
      endLocation: r.end_location,
      region: r.region,
      category: r.category,
    }))
  );
}

async function returnPopular(limit: number, country: string | null) {
  const results = await prisma.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      distance_km: number;
      elevation_m: number;
      start_location: string;
      end_location: string;
      region: string | null;
      category: string[];
    }[]
  >`
    SELECT c.id, c.slug, c.name, c.distance_km, c.elevation_m,
           c.start_location, c.end_location, c.region, c.category,
           (
             COALESCE((SELECT COUNT(*) FROM completions WHERE course_id = c.id), 0) * 3 +
             COALESCE((SELECT COUNT(*) FROM favorites WHERE course_id = c.id), 0) * 2
           )::int as score
    FROM courses c
    WHERE c.archived = false
      AND (${country}::text IS NULL OR c.country = ${country})
    ORDER BY score DESC, c.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(
    results.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      distanceKm: r.distance_km,
      elevationM: r.elevation_m,
      startLocation: r.start_location,
      endLocation: r.end_location,
      region: r.region,
      category: r.category,
    }))
  );
}
