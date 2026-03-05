import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/user-guard";
import { auth } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const recruit = await prisma.rideRecruit.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      course: {
        select: { id: true, slug: true, name: true, distanceKm: true, region: true },
      },
      participants: {
        where: { status: "joined" },
        include: {
          user: {
            select: { id: true, displayName: true, avatarKey: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!recruit) {
    return NextResponse.json({ error: "모집글을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({
    ...recruit,
    participantCount: recruit.participants.length,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const { id } = await params;
  const recruit = await prisma.rideRecruit.findUnique({ where: { id } });
  if (!recruit) {
    return NextResponse.json({ error: "모집글을 찾을 수 없습니다" }, { status: 404 });
  }

  if (recruit.userId !== user!.id) {
    return NextResponse.json({ error: "본인의 모집글만 수정할 수 있습니다" }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, rideDate, courseId, meetingPoint, maxMembers, status: newStatus } = body;

  const data: Record<string, unknown> = {};

  if (title !== undefined) {
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "제목을 입력해주세요" }, { status: 400 });
    }
    data.title = title.trim();
  }

  if (description !== undefined) {
    data.description = description ? sanitizeHtml(description.trim()) : null;
  }

  if (rideDate !== undefined) {
    const parsedDate = new Date(rideDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "유효하지 않은 날짜입니다" }, { status: 400 });
    }
    data.rideDate = parsedDate;
  }

  if (courseId !== undefined) {
    if (courseId) {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return NextResponse.json({ error: "코스를 찾을 수 없습니다" }, { status: 404 });
      }
    }
    data.courseId = courseId || null;
  }

  if (meetingPoint !== undefined) {
    data.meetingPoint = meetingPoint?.trim() || null;
  }

  if (maxMembers !== undefined) {
    data.maxMembers = Math.max(2, Math.min(100, parseInt(String(maxMembers)) || 10));
  }

  if (newStatus !== undefined) {
    const validStatuses = ["open", "closed", "completed", "cancelled"];
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: "유효하지 않은 상태입니다" }, { status: 400 });
    }
    data.status = newStatus;
  }

  const updated = await prisma.rideRecruit.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true, distanceKm: true, region: true } },
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

  const dbUser = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const recruit = await prisma.rideRecruit.findUnique({ where: { id } });
  if (!recruit) {
    return NextResponse.json({ error: "모집글을 찾을 수 없습니다" }, { status: 404 });
  }

  const isAdmin = (session.user.roles ?? []).includes("admin");
  if (recruit.userId !== dbUser.id && !isAdmin) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  await prisma.rideRecruit.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
