import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/user-guard";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const { id } = await params;

  const recruit = await prisma.rideRecruit.findUnique({
    where: { id },
    include: {
      participants: {
        where: { status: "joined" },
        select: { id: true, userId: true },
      },
    },
  });

  if (!recruit) {
    return NextResponse.json({ error: "모집글을 찾을 수 없습니다" }, { status: 404 });
  }

  // Cannot join your own recruit (you are the organizer)
  if (recruit.userId === user!.id) {
    return NextResponse.json({ error: "본인의 모집글에는 참여할 수 없습니다" }, { status: 400 });
  }

  // Check if recruit is still open
  if (recruit.status !== "open") {
    return NextResponse.json({ error: "모집이 마감되었습니다" }, { status: 400 });
  }

  // Check existing participation
  const existing = await prisma.rideRecruitParticipant.findUnique({
    where: {
      recruitId_userId: {
        recruitId: id,
        userId: user!.id,
      },
    },
  });

  const body = await request.json().catch(() => ({}));
  const message = body.message?.trim() || null;

  if (existing) {
    // Toggle: if already joined, cancel; if cancelled, rejoin
    if (existing.status === "joined") {
      await prisma.rideRecruitParticipant.update({
        where: { id: existing.id },
        data: { status: "cancelled" },
      });
      return NextResponse.json({ action: "left", message: "참여를 취소했습니다" });
    } else {
      // Rejoining - check max members again
      const currentCount = recruit.participants.length;
      if (currentCount >= recruit.maxMembers) {
        return NextResponse.json({ error: "모집 인원이 가득 찼습니다" }, { status: 400 });
      }
      await prisma.rideRecruitParticipant.update({
        where: { id: existing.id },
        data: { status: "joined", message },
      });
      return NextResponse.json({ action: "joined", message: "다시 참여했습니다" });
    }
  }

  // New participation - check max members
  const currentCount = recruit.participants.length;
  if (currentCount >= recruit.maxMembers) {
    return NextResponse.json({ error: "모집 인원이 가득 찼습니다" }, { status: 400 });
  }

  await prisma.rideRecruitParticipant.create({
    data: {
      recruitId: id,
      userId: user!.id,
      message,
    },
  });

  return NextResponse.json({ action: "joined", message: "참여했습니다" });
}
