import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      email: true,
      role: true,
      avatarKey: true,
      _count: {
        select: {
          completions: true,
          journals: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Recent activity: last 3 completions or reviews
  const [recentCompletions, recentReviews] = await Promise.all([
    prisma.completion.findMany({
      where: { userId: id },
      orderBy: { completedAt: "desc" },
      take: 3,
      select: {
        id: true,
        completedAt: true,
        course: { select: { id: true, name: true } },
      },
    }),
    prisma.review.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        createdAt: true,
        course: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Merge and sort by date, take top 3
  const recentActivity = [
    ...recentCompletions.map((c) => ({
      type: "completion" as const,
      courseName: c.course.name,
      courseId: c.course.id,
      date: c.completedAt.toISOString(),
    })),
    ...recentReviews.map((r) => ({
      type: "review" as const,
      courseName: r.course.name,
      courseId: r.course.id,
      date: r.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  // Check follow status for logged-in user
  let isFollowing = false;
  let isSelf = false;
  const session = await auth();
  if (session?.user?.id) {
    const currentUser = await prisma.user.findUnique({
      where: { keycloakId: session.user.id },
      select: { id: true },
    });
    if (currentUser) {
      if (currentUser.id === id) {
        isSelf = true;
      } else {
        const follow = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUser.id,
              followingId: id,
            },
          },
        });
        isFollowing = !!follow;
      }
    }
  }

  // Mask email: show only first character + domain
  let maskedEmail: string | null = null;
  if (user.email) {
    const atIndex = user.email.indexOf("@");
    if (atIndex > 0) {
      maskedEmail = user.email.charAt(0) + "***@" + user.email.substring(atIndex + 1);
    } else {
      // Malformed email (no @) — hide entirely
      maskedEmail = null;
    }
  }

  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    email: maskedEmail,
    role: user.role,
    avatarKey: user.avatarKey,
    completionCount: user._count.completions,
    journalCount: user._count.journals,
    recentActivity,
    isFollowing,
    isSelf,
  });
}
