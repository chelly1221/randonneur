import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const SR_CATEGORY = "sr-600";
const SR_TIME_LIMIT = "60시간";

function normalizeCategory(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function isSrCourse(category: string[], courseNumber?: string | null): boolean {
  if (category.includes(SR_CATEGORY)) return true;
  if (typeof courseNumber === "string" && /^SR-/i.test(courseNumber)) return true;
  return false;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get GeoJSON geometry
  const geoResult: { geojson: string }[] = await prisma.$queryRawUnsafe(
    `SELECT ST_AsGeoJSON(geom) as geojson FROM courses WHERE id = $1::uuid`,
    id
  );

  return NextResponse.json({
    ...course,
    geojson: geoResult[0]?.geojson ?? null,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const existing = await prisma.course.findUnique({
    where: { id },
    select: { id: true, category: true, courseNumber: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build data object with only provided fields (supports partial updates)
  const data: Record<string, unknown> = {};
  const nextCategory = "category" in body ? normalizeCategory(body.category) : existing.category;
  const nextCourseNumber =
    "courseNumber" in body
      ? (typeof body.courseNumber === "string" ? body.courseNumber : null)
      : existing.courseNumber;

  if ("name" in body) data.name = body.name;
  if ("distanceKm" in body) data.distanceKm = body.distanceKm;
  if ("elevationM" in body) data.elevationM = body.elevationM;
  if ("courseNumber" in body) data.courseNumber = nextCourseNumber;
  if ("startLocation" in body) data.startLocation = body.startLocation;
  if ("endLocation" in body) data.endLocation = body.endLocation;
  if ("region" in body) data.region = body.region;
  if ("category" in body) data.category = nextCategory;
  if ("tags" in body) data.tags = body.tags;
  if ("description" in body) data.description = body.description;
  if ("designer" in body) data.designer = body.designer ?? null;
  if ("officialPageUrl" in body) {
    data.officialPageUrl =
      typeof body.officialPageUrl === "string" && body.officialPageUrl.trim()
        ? body.officialPageUrl.trim()
        : null;
  }
  if ("gpxFileKey" in body) data.gpxFileKey = body.gpxFileKey;
  if ("archived" in body) data.archived = body.archived;
  if ("elevationProfile" in body) data.elevationProfile = body.elevationProfile;
  if (isSrCourse(nextCategory, nextCourseNumber)) {
    data.estimatedTime = SR_TIME_LIMIT;
  } else if ("estimatedTime" in body) {
    data.estimatedTime = body.estimatedTime;
  }

  const course = await prisma.course.update({
    where: { id },
    data,
  });

  if (body.geojson) {
    await prisma.$executeRawUnsafe(
      `UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid`,
      JSON.stringify(body.geojson),
      course.id
    );
  }

  return NextResponse.json(course);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.course.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
