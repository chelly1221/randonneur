import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, displayName: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [
      completionsWithCourses,
      favoriteCount,
      reviewCount,
      countriesResult,
    ] = await Promise.all([
      prisma.completion.findMany({
        where: { userId: user.id, completionStatus: "success" },
        select: { course: { select: { distanceKm: true } } },
      }),
      prisma.favorite.count({ where: { userId: user.id } }),
      prisma.review.count({ where: { userId: user.id } }),
      prisma.completion.findMany({
        where: { userId: user.id, completionStatus: "success" },
        select: { course: { select: { country: true } } },
        distinct: ["courseId"],
      }),
    ]);

    const completionCount = completionsWithCourses.length;
    const totalDistance = completionsWithCourses.reduce((sum, c) => {
      return sum + (c.course?.distanceKm ?? 0);
    }, 0);

    const countriesRidden = new Set(
      countriesResult
        .map((c) => c.course?.country)
        .filter((c): c is string => !!c)
    ).size;

    let badgeCount = 0;
    try {
      badgeCount = await (prisma as any).userBadge.count({
        where: { userId: user.id },
      });
    } catch {
      // userBadge model may not exist yet
      badgeCount = 0;
    }

    return NextResponse.json({
      displayName: user.displayName,
      completionCount,
      totalDistance: Math.round(totalDistance),
      favoriteCount,
      reviewCount,
      badgeCount,
      countriesRidden,
    });
  } catch (error) {
    console.error("Error fetching my-summary:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
