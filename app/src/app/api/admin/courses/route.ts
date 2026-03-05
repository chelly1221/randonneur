import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search");
  const country = searchParams.get("country");
  const archived = searchParams.get("archived"); // "true", "false", or null (all)
  const cursor = searchParams.get("cursor"); // cursor-based pagination (course ID)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  const where: Prisma.CourseWhereInput = {};

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { courseNumber: { contains: q, mode: "insensitive" } },
      { startLocation: { contains: q, mode: "insensitive" } },
    ];
  }

  if (country) {
    where.country = country;
  }

  if (archived === "true") {
    where.archived = true;
  } else if (archived === "false") {
    where.archived = false;
  }
  // null = show all (no filter)

  const findArgs: Prisma.CourseFindManyArgs = {
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1, // fetch one extra to check hasMore
    select: {
      id: true,
      slug: true,
      courseNumber: true,
      name: true,
      distanceKm: true,
      elevationM: true,
      region: true,
      country: true,
      gpxFileKey: true,
      archived: true,
      sourceType: true,
      createdAt: true,
    },
  };

  if (cursor) {
    findArgs.cursor = { id: cursor };
    findArgs.skip = 1; // skip the cursor item itself
  }

  const [courses, total] = await Promise.all([
    prisma.course.findMany(findArgs),
    prisma.course.count({ where }),
  ]);

  const hasMore = courses.length > limit;
  const items = hasMore ? courses.slice(0, limit) : courses;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({
    courses: items,
    total,
    hasMore,
    nextCursor,
  });
}
