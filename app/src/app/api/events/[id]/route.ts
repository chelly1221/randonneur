import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      course: {
        select: { id: true, slug: true, name: true, distanceKm: true, region: true },
      },
      participants: {
        where: { status: { not: "cancelled" } },
        include: {
          user: {
            select: { id: true, displayName: true, avatarKey: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  // sourceType, sourceUrl are included automatically via include (all scalar fields)

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const goingCount = event.participants.filter((p) => p.status === "going").length;
  const interestedCount = event.participants.filter((p) => p.status === "interested").length;

  return NextResponse.json({
    ...event,
    goingCount,
    interestedCount,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const isAdmin = (session.user.roles ?? []).includes("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자만 이벤트를 수정할 수 있습니다" }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, eventType, courseId, location, startDate, endDate, maxParticipants } = body;

  const validTypes = ["brevet", "group_ride", "festival", "other"];

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title.trim();
  if (description !== undefined) data.description = description ? sanitizeHtml(description.trim()) : null;
  if (eventType !== undefined) {
    if (!validTypes.includes(eventType)) {
      return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
    }
    data.eventType = eventType;
  }
  if (courseId !== undefined) data.courseId = courseId || null;
  if (location !== undefined) data.location = location?.trim() || null;
  if (startDate !== undefined) {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    data.startDate = d;
  }
  if (endDate !== undefined) {
    if (endDate === null) {
      data.endDate = null;
    } else {
      const d = new Date(endDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
      }
      data.endDate = d;
    }
  }
  if (maxParticipants !== undefined) {
    const parsed = parseInt(String(maxParticipants));
    data.maxParticipants = maxParticipants ? (isNaN(parsed) || parsed < 1 ? null : parsed) : null;
  }

  const updated = await prisma.event.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const isAdmin = (session.user.roles ?? []).includes("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자만 이벤트를 삭제할 수 있습니다" }, { status: 403 });
  }

  await prisma.event.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
