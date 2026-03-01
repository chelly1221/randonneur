import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

async function checkAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "인증이 필요합니다.", status: 401 };
  }
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  if (!roles.includes("admin")) {
    return { error: "관리자 권한이 필요합니다.", status: 403 };
  }
  return null;
}

export async function GET() {
  const authErr = await checkAdmin();
  if (authErr) {
    return NextResponse.json({ error: authErr.error }, { status: authErr.status });
  }

  const picks = await prisma.seasonalPick.findMany({
    orderBy: [{ year: "desc" }, { season: "asc" }, { sortOrder: "asc" }],
    include: {
      course: {
        select: {
          id: true,
          name: true,
          distanceKm: true,
          elevationM: true,
          region: true,
        },
      },
    },
  });

  return NextResponse.json(
    picks.map((p) => ({
      id: p.id,
      courseId: p.courseId,
      season: p.season,
      year: p.year,
      description: p.description,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt,
      course: {
        id: p.course.id,
        name: p.course.name,
        distanceKm: p.course.distanceKm,
        elevationM: p.course.elevationM,
        region: p.course.region,
      },
    }))
  );
}

export async function POST(request: NextRequest) {
  const authErr = await checkAdmin();
  if (authErr) {
    return NextResponse.json({ error: authErr.error }, { status: authErr.status });
  }

  const body = await request.json();
  const { courseId, season, year, description, sortOrder } = body;

  if (!courseId || !season || !year) {
    return NextResponse.json(
      { error: "courseId, season, year는 필수입니다." },
      { status: 400 }
    );
  }

  const validSeasons = ["spring", "summer", "autumn", "winter"];
  if (!validSeasons.includes(season)) {
    return NextResponse.json(
      { error: "유효하지 않은 시즌입니다." },
      { status: 400 }
    );
  }

  // Verify course exists
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json(
      { error: "코스를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  try {
    const pick = await prisma.seasonalPick.create({
      data: {
        courseId,
        season,
        year: parseInt(String(year)),
        description: description || null,
        sortOrder: sortOrder ?? 0,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            distanceKm: true,
            elevationM: true,
            region: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: pick.id,
      courseId: pick.courseId,
      season: pick.season,
      year: pick.year,
      description: pick.description,
      sortOrder: pick.sortOrder,
      course: pick.course,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "이 코스는 해당 시즌에 이미 등록되어 있습니다." },
        { status: 409 }
      );
    }
    throw e;
  }
}

export async function DELETE(request: NextRequest) {
  const authErr = await checkAdmin();
  if (authErr) {
    return NextResponse.json({ error: authErr.error }, { status: authErr.status });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id는 필수입니다." }, { status: 400 });
  }

  await prisma.seasonalPick.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
