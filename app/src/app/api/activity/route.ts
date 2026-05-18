import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const VALID_FILTERS = new Set(["all", "following", "mine"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = parseInt(searchParams.get("limit") ?? "20");
  const limit = Math.min(Number.isNaN(limitParam) ? 20 : limitParam, 50);
  const filterParam = searchParams.get("filter") ?? "all";
  const filter = VALID_FILTERS.has(filterParam) ? filterParam : "all";

  const session = await auth();
  let dbUser: { id: string } | null = null;
  let followingIds: string[] = [];

  if (session?.user?.id) {
    dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (dbUser && filter === "following") {
      const follows = await prisma.follow.findMany({
        where: { followerId: dbUser.id },
        select: { followingId: true },
      });
      followingIds = follows.map((f) => f.followingId);
    }
  }

  // Auth-required filters without a valid session should return empty
  if (filter === "mine" && !dbUser) {
    return NextResponse.json({ activities: [], noFollows: false });
  }
  if (filter === "following" && !dbUser) {
    return NextResponse.json({ activities: [], noFollows: false });
  }

  // Build user filter based on the selected filter mode
  let userFilter: Record<string, unknown>;

  if (filter === "mine" && dbUser) {
    // Show only current user's activity
    userFilter = { userId: dbUser.id };
  } else if (filter === "following" && followingIds.length > 0) {
    // Show followed users' activities
    userFilter = { userId: { in: followingIds } };
  } else if (filter === "following" && followingIds.length === 0) {
    // User follows nobody — return empty with metadata
    return NextResponse.json({ activities: [], noFollows: true });
  } else {
    // "all" — show all active users' activities
    userFilter = { user: { status: "active" } };
  }

  const [completions, reviews] = await Promise.all([
    prisma.completion.findMany({
      where: userFilter,
      orderBy: { completedAt: "desc" },
      take: limit,
      include: {
        user: {
          select: { id: true, displayName: true, avatarKey: true },
        },
        course: {
          select: { id: true, slug: true, name: true, distanceKm: true, region: true },
        },
      },
    }),
    prisma.review.findMany({
      where: userFilter,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: { id: true, displayName: true, avatarKey: true },
        },
        course: {
          select: { id: true, slug: true, name: true, distanceKm: true, region: true },
        },
      },
    }),
  ]);

  // Merge and sort by date
  const activities = [
    ...completions.map((c) => ({
      id: `completion-${c.id}`,
      type: "completion" as const,
      user: c.user,
      course: c.course,
      date: c.completedAt,
      content: null,
    })),
    ...reviews.map((r) => ({
      id: `review-${r.id}`,
      type: "review" as const,
      user: r.user,
      course: r.course,
      date: r.createdAt,
      content: r.content.length > 80 ? r.content.slice(0, 80) + "..." : r.content,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  return NextResponse.json({ activities, noFollows: false });
}
