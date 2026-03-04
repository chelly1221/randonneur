import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");

  try {
    const where: Record<string, unknown> = {
      archived: { not: true },
      distanceKm: { gte: 100, lte: 250 },
      elevationM: { lt: 2000 },
    };
    if (country) {
      where.country = country;
    }

    const courses = await prisma.course.findMany({
      where,
      select: {
        id: true,
        name: true,
        distanceKm: true,
        elevationM: true,
        region: true,
        country: true,
      },
      orderBy: { distanceKm: "asc" },
      take: 6,
    });

    return NextResponse.json(courses);
  } catch (error) {
    console.error("Beginner courses error:", error);
    return NextResponse.json(
      { error: "Failed to fetch beginner courses" },
      { status: 500 }
    );
  }
}
