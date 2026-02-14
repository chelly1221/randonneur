import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

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

  // Build data object with only provided fields (supports partial updates)
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("distanceKm" in body) data.distanceKm = body.distanceKm;
  if ("elevationM" in body) data.elevationM = body.elevationM;
  if ("estimatedTime" in body) data.estimatedTime = body.estimatedTime;
  if ("startLocation" in body) data.startLocation = body.startLocation;
  if ("endLocation" in body) data.endLocation = body.endLocation;
  if ("region" in body) data.region = body.region;
  if ("category" in body) data.category = body.category;
  if ("tags" in body) data.tags = body.tags;
  if ("description" in body) data.description = body.description;
  if ("designer" in body) data.designer = body.designer ?? null;
  if ("gpxFileKey" in body) data.gpxFileKey = body.gpxFileKey;
  if ("archived" in body) data.archived = body.archived;

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
