import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { DISTANCE_RANGES } from "@/types";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const region = searchParams.get("region");
  const distance = searchParams.get("distance");
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const withGeojson = searchParams.get("geojson") === "true";

  const where: Prisma.CourseWhereInput = {};
  if (region) where.region = region;
  if (category) where.category = { has: category };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { startLocation: { contains: q, mode: "insensitive" } },
      { endLocation: { contains: q, mode: "insensitive" } },
    ];
  }
  if (distance) {
    const range = DISTANCE_RANGES.find((d) => d.value === distance);
    if (range) {
      where.distanceKm = { gte: range.min, lte: range.max };
    }
  }

  const [courses, total] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: { distanceKm: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.course.count({ where }),
  ]);

  let result = courses as (typeof courses[number] & { geojson?: string | null })[];

  if (withGeojson) {
    const ids = courses.map((c) => c.id);
    if (ids.length > 0) {
      const geojsonResults: { id: string; geojson: string }[] =
        await prisma.$queryRawUnsafe(
          `SELECT id, ST_AsGeoJSON(geom) as geojson FROM courses WHERE id = ANY($1::uuid[])`,
          ids
        );
      const geoMap = new Map(geojsonResults.map((r) => [r.id, r.geojson]));
      result = courses.map((c) => ({
        ...c,
        geojson: geoMap.get(c.id) ?? null,
      }));
    }
  }

  return NextResponse.json({
    courses: result,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const course = await prisma.course.create({
    data: {
      name: body.name,
      distanceKm: body.distanceKm,
      elevationM: body.elevationM,
      estimatedTime: body.estimatedTime ?? null,
      startLocation: body.startLocation,
      endLocation: body.endLocation,
      region: body.region,
      category: body.category ?? [],
      tags: body.tags ?? [],
      description: body.description ?? null,
      gpxFileKey: body.gpxFileKey ?? null,
    },
  });

  // Set geometry if provided
  if (body.geojson) {
    await prisma.$executeRawUnsafe(
      `UPDATE courses SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2::uuid`,
      JSON.stringify(body.geojson),
      course.id
    );
  }

  return NextResponse.json(course, { status: 201 });
}
