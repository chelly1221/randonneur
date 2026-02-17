import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { downloadGpx } from "@/lib/minio";
import { parseGpx } from "@/lib/gpx";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [course, checkpoints] = await Promise.all([
    prisma.course.findUnique({ where: { id } }),
    prisma.checkpoint.findMany({
      where: { courseId: id },
      orderBy: { distanceKm: "asc" },
    }),
  ]);

  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const geoResult: { geojson: string }[] = await prisma.$queryRawUnsafe(
    `SELECT ST_AsGeoJSON(geom) as geojson FROM courses WHERE id = $1::uuid`,
    id
  );

  let gpxData = null;
  let geojsonParsed = null;

  if (course.gpxFileKey) {
    try {
      const gpxBuffer = await downloadGpx(course.gpxFileKey);
      const gpxString = gpxBuffer.toString("utf-8");
      gpxData = parseGpx(gpxString);
      geojsonParsed = gpxData.geojson;
    } catch {
      // GPX parsing failed, fall back to DB geometry
    }
  }

  if (!geojsonParsed && geoResult[0]?.geojson) {
    const geom = JSON.parse(geoResult[0].geojson);
    geojsonParsed = {
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, geometry: geom, properties: {} }],
    };
  }

  let bounds = gpxData?.bounds ?? null;
  if (!bounds && geoResult[0]?.geojson) {
    const geom = JSON.parse(geoResult[0].geojson);
    if (geom.coordinates) {
      let minLat = Infinity,
        maxLat = -Infinity,
        minLng = Infinity,
        maxLng = -Infinity;
      for (const [lng, lat] of geom.coordinates) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      bounds = { minLat, maxLat, minLng, maxLng };
    }
  }

  const elevations = gpxData?.elevations ?? [];

  const cpData = checkpoints.map((cp) => ({
    id: cp.id,
    name: cp.name,
    description: cp.description,
    distanceKm: cp.distanceKm,
    imageKey: cp.imageKey,
  }));

  return NextResponse.json({
    course: {
      id: course.id,
      name: course.name,
      courseNumber: course.courseNumber,
      distanceKm: course.distanceKm,
      elevationM: course.elevationM,
      estimatedTime: course.estimatedTime,
      startLocation: course.startLocation,
      endLocation: course.endLocation,
      region: course.region,
      category: course.category,
      tags: course.tags,
      description: course.description,
      designer: course.designer,
      gpxFileKey: course.gpxFileKey,
      archived: course.archived,
    },
    checkpoints: cpData,
    elevations,
    geojson: geojsonParsed,
    bounds,
  });
}
