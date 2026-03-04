import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));

    const countries = await prisma.course.findMany({
      where: { archived: { not: true } },
      select: { country: true },
      distinct: ["country"],
    });

    const distinctCountries = countries
      .map((c) => c.country)
      .filter((c): c is string => c !== null && c !== "")
      .sort();

    if (distinctCountries.length === 0) {
      return NextResponse.json(null);
    }

    const selectedCountry =
      distinctCountries[weekNumber % distinctCountries.length];

    const [courseCount, aggregates, allCourses] = await Promise.all([
      prisma.course.count({
        where: { country: selectedCountry, archived: { not: true } },
      }),
      prisma.course.aggregate({
        where: { country: selectedCountry, archived: { not: true } },
        _sum: { distanceKm: true },
        _avg: { elevationM: true },
      }),
      prisma.course.findMany({
        where: { country: selectedCountry, archived: { not: true } },
        select: {
          id: true,
          name: true,
          distanceKm: true,
          elevationM: true,
          region: true,
        },
      }),
    ]);

    const skipAmount =
      allCourses.length > 3 ? (weekNumber * 3) % allCourses.length : 0;
    const sampleCourses: typeof allCourses = [];
    for (let i = 0; i < Math.min(3, allCourses.length); i++) {
      sampleCourses.push(allCourses[(skipAmount + i) % allCourses.length]);
    }

    return NextResponse.json({
      country: selectedCountry,
      courseCount,
      totalDistance: Math.round(aggregates._sum.distanceKm ?? 0),
      avgElevation: Math.round(aggregates._avg.elevationM ?? 0),
      sampleCourses,
    });
  } catch (error) {
    console.error("Country spotlight error:", error);
    return NextResponse.json(
      { error: "Failed to fetch country spotlight" },
      { status: 500 }
    );
  }
}
