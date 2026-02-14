import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

interface CourseImportRow {
  name: string;
  distanceKm: number;
  elevationM: number;
  estimatedTime?: string;
  startLocation: string;
  endLocation: string;
  region: string;
  category?: string;
  tags?: string[];
  description?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { courses } = (await request.json()) as { courses: CourseImportRow[] };

  if (!Array.isArray(courses) || courses.length === 0) {
    return NextResponse.json(
      { error: "No courses provided" },
      { status: 400 }
    );
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < courses.length; i++) {
    const row = courses[i];
    try {
      const course = await prisma.course.create({
        data: {
          name: row.name,
          distanceKm: row.distanceKm,
          elevationM: row.elevationM,
          estimatedTime: row.estimatedTime ?? null,
          startLocation: row.startLocation,
          endLocation: row.endLocation,
          region: row.region,
          category: row.category ? [row.category] : [],
          tags: row.tags ?? [],
          description: row.description ?? null,
        },
      });
      results.push(course);
    } catch (e) {
      errors.push({
        row: i,
        name: row.name,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    imported: results.length,
    errors: errors.length,
    errorDetails: errors,
  });
}
