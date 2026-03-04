import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const { followingId } = body;

  if (!followingId) {
    return NextResponse.json({ error: "followingId required" }, { status: 400 });
  }

  if (user.id === followingId) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  // Check target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: followingId },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  // Toggle follow/unfollow
  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: user.id,
        followingId,
      },
    },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  }

  await prisma.follow.create({
    data: {
      followerId: user.id,
      followingId,
    },
  });

  // Notify the followed user (non-blocking)
  createNotification(
    followingId,
    "follow",
    "새 팔로워",
    `${user.displayName}님이 팔로우했습니다`,
    `/users/${user.id}`
  ).catch(() => {});

  return NextResponse.json({ following: true });
}
