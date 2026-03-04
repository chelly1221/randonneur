import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [
      totalCourses,
      aggregates,
      totalCompletions,
      countryGroups,
      distanceBuckets,
    ] = await Promise.all([
      prisma.course.count(),

      prisma.course.aggregate({
        _sum: {
          distanceKm: true,
          elevationM: true,
        },
      }),

      prisma.completion.count(),

      prisma.course.groupBy({
        by: ["country"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),

      prisma.$queryRaw<{ dist_range: string; count: bigint }[]>`
        SELECT dist_range, COUNT(*)::bigint AS count
        FROM (
          SELECT
            CASE
              WHEN distance_km < 100 THEN '기타'
              WHEN distance_km < 250 THEN '~200'
              WHEN distance_km < 350 THEN '~300'
              WHEN distance_km < 450 THEN '~400'
              WHEN distance_km < 750 THEN '~600'
              WHEN distance_km < 1200 THEN '~1000'
              ELSE '1200+'
            END AS dist_range
          FROM courses
          WHERE country = 'KR'
        ) sub
        GROUP BY dist_range
        ORDER BY
          CASE dist_range
            WHEN '기타' THEN 0
            WHEN '~200' THEN 1
            WHEN '~300' THEN 2
            WHEN '~400' THEN 3
            WHEN '~600' THEN 4
            WHEN '~1000' THEN 5
            WHEN '1200+' THEN 6
          END
      `,
    ]);

    const totalDistance = Math.round(aggregates._sum.distanceKm ?? 0);
    const totalElevation = Math.round(aggregates._sum.elevationM ?? 0);

    const countryDistribution = countryGroups
      .filter((g) => g.country)
      .map((g) => ({
        country: g.country!,
        count: g._count.id,
      }));

    const totalCountries = countryDistribution.length;

    const distanceDistribution = distanceBuckets.map((b) => ({
      range: b.dist_range,
      count: Number(b.count),
    }));

    return NextResponse.json({
      totalCourses,
      totalDistance,
      totalCountries,
      totalCompletions,
      totalElevation,
      countryDistribution,
      distanceDistribution,
    });
  } catch (error) {
    console.error("Failed to fetch home stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
