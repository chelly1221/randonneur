import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/user-guard";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // open, closed, completed, cancelled
  const courseId = searchParams.get("courseId");
  const from = searchParams.get("from"); // date string
  const to = searchParams.get("to"); // date string
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};

  if (status && status !== "all") {
    where.status = status;
  }

  if (courseId) {
    where.courseId = courseId;
  }

  // Date range filter
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        dateFilter.gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        dateFilter.lte = toDate;
      }
    }
    if (Object.keys(dateFilter).length > 0) {
      where.rideDate = dateFilter;
    }
  }

  const [recruits, total] = await Promise.all([
    prisma.rideRecruit.findMany({
      where,
      orderBy: { rideDate: "asc" },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: { id: true, displayName: true, avatarKey: true },
        },
        course: {
          select: { id: true, name: true, distanceKm: true, region: true },
        },
        participants: {
          where: { status: "joined" },
          select: { id: true, userId: true },
        },
      },
    }),
    prisma.rideRecruit.count({ where }),
  ]);

  const result = recruits.map((recruit) => ({
    ...recruit,
    participantCount: recruit.participants.length,
    participants: undefined,
  }));

  return NextResponse.json({ items: result, total });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await request.json();
  const { title, description, rideDate, courseId, meetingPoint, maxMembers } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "제목을 입력해주세요" }, { status: 400 });
  }

  if (!rideDate) {
    return NextResponse.json({ error: "라이딩 날짜를 선택해주세요" }, { status: 400 });
  }

  const parsedDate = new Date(rideDate);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "유효하지 않은 날짜입니다" }, { status: 400 });
  }

  if (parsedDate < new Date()) {
    return NextResponse.json({ error: "과거 날짜로는 모집할 수 없습니다" }, { status: 400 });
  }

  if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ error: "코스를 찾을 수 없습니다" }, { status: 404 });
    }
  }

  const parsedMax = maxMembers ? Math.max(2, Math.min(100, parseInt(String(maxMembers)) || 10)) : 10;

  const recruit = await prisma.rideRecruit.create({
    data: {
      userId: user!.id,
      title: title.trim(),
      description: description?.trim() || null,
      rideDate: parsedDate,
      courseId: courseId || null,
      meetingPoint: meetingPoint?.trim() || null,
      maxMembers: parsedMax,
    },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true, distanceKm: true, region: true } },
    },
  });

  return NextResponse.json(recruit, { status: 201 });
}
