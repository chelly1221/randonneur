import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "6"), 20);
  const country = searchParams.get("country");

  // Score = completions*3 + favorites*2 + reviews*1
  const results = await prisma.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      distance_km: number;
      elevation_m: number;
      start_location: string;
      end_location: string;
      region: string | null;
      score: number;
    }[]
  >`
    SELECT c.id, c.slug, c.name, c.distance_km, c.elevation_m,
           c.start_location, c.end_location, c.region,
           (
             COALESCE((SELECT COUNT(*) FROM completions WHERE course_id = c.id), 0) * 3 +
             COALESCE((SELECT COUNT(*) FROM favorites WHERE course_id = c.id), 0) * 2 +
             COALESCE((SELECT COUNT(*) FROM reviews WHERE course_id = c.id), 0) * 1
           )::int as score
    FROM courses c
    WHERE c.archived = false
      AND (${country}::text IS NULL OR c.country = ${country})
    ORDER BY score DESC, c.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(
    results.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      distanceKm: r.distance_km,
      elevationM: r.elevation_m,
      startLocation: r.start_location,
      endLocation: r.end_location,
      region: r.region,
      score: r.score,
    }))
  );
}
