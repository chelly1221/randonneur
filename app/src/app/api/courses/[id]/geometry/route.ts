import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/courses/[id]/geometry
 *
 * Returns simplified course geometry as an array of [lng, lat] coordinates.
 * Used for mini-map previews (SVG-based, not MapLibre).
 * Simplifies geometry to reduce payload size for card-level display.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate UUID format to reject obviously invalid IDs early
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ coordinates: null }, { status: 400 });
  }

  // Use ST_Simplify to reduce point count for mini-map display.
  // Tolerance of 0.002 (~200m) keeps route shape recognizable while
  // cutting coordinate count significantly for card-level rendering.
  const result: { geojson: string | null }[] = await prisma.$queryRawUnsafe(
    `SELECT ST_AsGeoJSON(ST_Simplify(geom, 0.002)) as geojson
     FROM courses
     WHERE id = $1::uuid AND geom IS NOT NULL`,
    id
  );

  if (!result[0]?.geojson) {
    return NextResponse.json({ coordinates: null });
  }

  try {
    const parsed = JSON.parse(result[0].geojson);
    // Cache geometry responses — course geometry rarely changes.
    // s-maxage for CDN/shared caches, max-age for browser, stale-while-revalidate
    // allows serving stale while refetching in the background.
    return NextResponse.json(
      { coordinates: parsed.coordinates as [number, number][] },
      {
        headers: {
          "Cache-Control":
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return NextResponse.json({ coordinates: null });
  }
}
