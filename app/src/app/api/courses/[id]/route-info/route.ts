import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { traceRoute } from "@/lib/valhalla";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get course geometry as coordinates
  const result: { coords: string }[] = await prisma.$queryRawUnsafe(
    `SELECT ST_AsGeoJSON(geom) as coords FROM courses WHERE id = $1::uuid`,
    id
  );

  if (!result[0]?.coords) {
    return NextResponse.json({ error: "No geometry" }, { status: 404 });
  }

  try {
    const geojson = JSON.parse(result[0].coords);
    const coordinates = geojson.coordinates as [number, number][];

    // Sample points for Valhalla (max 100 points)
    const step = Math.max(1, Math.floor(coordinates.length / 100));
    const shape = coordinates
      .filter((_, i) => i % step === 0 || i === coordinates.length - 1)
      .map(([lon, lat]) => ({ lat, lon }));

    const routeData = await traceRoute(shape);

    return NextResponse.json(routeData);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get route info" },
      { status: 500 }
    );
  }
}
