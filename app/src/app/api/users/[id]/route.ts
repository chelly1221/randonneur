import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      bio: true,
      avatarKey: true,
      createdAt: true,
      userBadges: {
        include: { badge: true },
        orderBy: { earnedAt: "desc" },
      },
      _count: {
        select: { completions: true, reviews: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Aggregate stats
  const completions = await prisma.completion.findMany({
    where: { userId: id },
    include: { course: { select: { distanceKm: true, elevationM: true, region: true } } },
  });

  const totalDistance = Math.round(completions.reduce((s, c) => s + (c.course.distanceKm ?? 0), 0));
  const totalElevation = completions.reduce((s, c) => s + (c.course.elevationM ?? 0), 0);
  const uniqueRegions = new Set(completions.map((c) => c.course.region).filter(Boolean)).size;

  // Recent activity (last 5 completions)
  const recentCompletions = await prisma.completion.findMany({
    where: { userId: id },
    orderBy: { completedAt: "desc" },
    take: 5,
    include: { course: { select: { id: true, name: true, distanceKm: true } } },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      bio: user.bio,
      avatarKey: user.avatarKey,
      createdAt: user.createdAt,
      badges: user.userBadges.map((ub) => ({
        ...ub.badge,
        earnedAt: ub.earnedAt,
      })),
    },
    stats: {
      totalCompletions: user._count.completions,
      totalReviews: user._count.reviews,
      totalDistance,
      totalElevation,
      uniqueRegions,
    },
    recentCompletions,
  });
}
