import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/user-guard";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const { id: eventId } = await params;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: {
        where: { status: "going" },
        select: { id: true },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await request.json();
  const { status } = body;

  const validStatuses = ["going", "interested", "cancelled"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // If cancelling, delete the participant record
  if (status === "cancelled") {
    await prisma.eventParticipant.deleteMany({
      where: { eventId, userId: user!.id },
    });
    return NextResponse.json({ status: "cancelled" });
  }

  // Check maxParticipants limit for 'going' status (race-safe via transaction)
  if (status === "going" && event.maxParticipants) {
    const result = await prisma.$transaction(async (tx) => {
      const goingCount = await tx.eventParticipant.count({
        where: { eventId, status: "going" },
      });
      const existingParticipant = await tx.eventParticipant.findUnique({
        where: { eventId_userId: { eventId, userId: user!.id } },
      });
      const isAlreadyGoing = existingParticipant?.status === "going";

      if (!isAlreadyGoing && goingCount >= event.maxParticipants!) {
        return null; // capacity reached
      }

      return tx.eventParticipant.upsert({
        where: { eventId_userId: { eventId, userId: user!.id } },
        update: { status },
        create: { eventId, userId: user!.id, status },
        include: {
          user: { select: { id: true, displayName: true, avatarKey: true } },
        },
      });
    });

    if (!result) {
      return NextResponse.json({ error: "이벤트 참가 인원이 마감되었습니다." }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  // Upsert participation (no capacity limit)
  const participant = await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId, userId: user!.id } },
    update: { status },
    create: { eventId, userId: user!.id, status },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
    },
  });

  return NextResponse.json(participant);
}
