import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [followers, following] = await Promise.all([
    prisma.follow.findMany({
      where: { followingId: id },
      include: {
        follower: {
          select: { id: true, displayName: true, avatarKey: true, bio: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.follow.findMany({
      where: { followerId: id },
      include: {
        following: {
          select: { id: true, displayName: true, avatarKey: true, bio: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    followers: followers.map((f) => f.follower),
    following: following.map((f) => f.following),
    followerCount: followers.length,
    followingCount: following.length,
  });
}
