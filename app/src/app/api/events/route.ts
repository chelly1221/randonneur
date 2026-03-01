import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/user-guard";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // e.g. "2026-03"
  const type = searchParams.get("type"); // brevet, group_ride, festival, other

  const where: Record<string, unknown> = {};

  if (month) {
    const [year, mon] = month.split("-").map(Number);
    if (year && mon && mon >= 1 && mon <= 12) {
      // Use ISO date strings to avoid server-timezone ambiguity.
      // The calendar is used by Korean users (KST = UTC+9), so we
      // construct boundaries in KST and let the DB compare correctly.
      const startISO = `${year}-${String(mon).padStart(2, "0")}-01T00:00:00+09:00`;
      const nextMonth = mon === 12 ? 1 : mon + 1;
      const nextYear = mon === 12 ? year + 1 : year;
      const endISO = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`;
      where.startDate = { gte: new Date(startISO), lt: new Date(endISO) };
    }
  } else {
    // Default: upcoming events
    where.startDate = { gte: new Date() };
  }

  if (type) {
    where.eventType = type;
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startDate: "asc" },
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      course: {
        select: { id: true, name: true, distanceKm: true, region: true },
      },
      participants: {
        select: { status: true },
      },
    },
  });

  // Compute participant counts by status
  const result = events.map((event) => {
    const goingCount = event.participants.filter((p) => p.status === "going").length;
    const interestedCount = event.participants.filter((p) => p.status === "interested").length;
    return {
      ...event,
      participants: undefined,
      goingCount,
      interestedCount,
      participantCount: goingCount + interestedCount,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  // Only admins can create official events
  const session = await auth();
  const isAdmin = (session?.user?.roles ?? []).includes("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자만 이벤트를 등록할 수 있습니다" }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, eventType, courseId, location, startDate, endDate, maxParticipants } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const validTypes = ["brevet", "group_ride", "festival", "other"];
  if (!eventType || !validTypes.includes(eventType)) {
    return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
  }

  if (!startDate) {
    return NextResponse.json({ error: "startDate is required" }, { status: 400 });
  }

  const parsedStart = new Date(startDate);
  if (isNaN(parsedStart.getTime())) {
    return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
  }

  let parsedEnd: Date | null = null;
  if (endDate) {
    parsedEnd = new Date(endDate);
    if (isNaN(parsedEnd.getTime())) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    }
    if (parsedEnd <= parsedStart) {
      return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 });
    }
  }

  if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
  }

  const event = await prisma.event.create({
    data: {
      userId: user!.id,
      title: title.trim(),
      description: description?.trim() || null,
      eventType,
      courseId: courseId || null,
      location: location?.trim() || null,
      startDate: parsedStart,
      endDate: parsedEnd,
      maxParticipants: maxParticipants ? (parseInt(String(maxParticipants)) || null) : null,
    },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(event, { status: 201 });
}
