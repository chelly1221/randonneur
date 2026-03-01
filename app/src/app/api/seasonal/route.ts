import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function getCurrentSeasonYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  // For winter (Dec-Feb), December belongs to the next year's winter
  // but Jan/Feb belong to the current year's winter
  if (month === 12) return now.getFullYear() + 1;
  return now.getFullYear();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || getCurrentSeason();
  const year = parseInt(
    searchParams.get("year") || String(getCurrentSeasonYear())
  );

  const validSeasons = ["spring", "summer", "autumn", "winter"];
  if (!validSeasons.includes(season)) {
    return NextResponse.json(
      { error: "유효하지 않은 시즌입니다. spring, summer, autumn, winter 중 선택하세요." },
      { status: 400 }
    );
  }

  const picks = await prisma.seasonalPick.findMany({
    where: { season, year },
    orderBy: { sortOrder: "asc" },
    include: {
      course: {
        select: {
          id: true,
          name: true,
          distanceKm: true,
          elevationM: true,
          region: true,
          startLocation: true,
          description: true,
          category: true,
        },
      },
    },
  });

  return NextResponse.json({
    season,
    year,
    picks: picks.map((p) => ({
      id: p.id,
      description: p.description,
      sortOrder: p.sortOrder,
      course: {
        id: p.course.id,
        name: p.course.name,
        distanceKm: p.course.distanceKm,
        elevationM: p.course.elevationM,
        region: p.course.region,
        startLocation: p.course.startLocation,
        description: p.course.description,
        category: p.course.category,
      },
    })),
  });
}
