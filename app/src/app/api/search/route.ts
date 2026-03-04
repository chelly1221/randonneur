import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const type = searchParams.get("type") ?? "all"; // all, courses, reviews, users
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 50);

  if (!q || q.length < 2) {
    return NextResponse.json({ courses: [], reviews: [], users: [] });
  }

  // Convert query to tsquery format — join words with &
  const tsQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  const results: { courses: unknown[]; reviews: unknown[]; users: unknown[] } = {
    courses: [],
    reviews: [],
    users: [],
  };

  if (type === "all" || type === "courses") {
    results.courses = await prisma.$queryRaw`
      SELECT id, name, distance_km as "distanceKm", elevation_m as "elevationM",
             start_location as "startLocation", end_location as "endLocation",
             region, 'course' as type,
             ts_rank(search_vector, to_tsquery('simple', ${tsQuery})) as rank
      FROM courses
      WHERE search_vector @@ to_tsquery('simple', ${tsQuery})
        AND archived = false
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
  }

  if (type === "all" || type === "reviews") {
    results.reviews = await prisma.$queryRaw`
      SELECT r.id, r.content, r.created_at as "createdAt",
             c.id as "courseId", c.name as "courseName",
             u.display_name as "userName",
             'review' as type,
             ts_rank(r.search_vector, to_tsquery('simple', ${tsQuery})) as rank
      FROM reviews r
      JOIN courses c ON c.id = r.course_id
      JOIN users u ON u.id = r.user_id
      WHERE r.search_vector @@ to_tsquery('simple', ${tsQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
  }

  if (type === "all" || type === "users") {
    const likeQuery = `%${q}%`;
    results.users = await prisma.$queryRaw`
      SELECT u.id, u.display_name as "displayName", u.avatar_key as "avatarKey",
             LEFT(u.bio, 100) as "bio",
             (SELECT COUNT(*)::int FROM completions c WHERE c.user_id = u.id) as "completionCount"
      FROM users u
      WHERE u.status = 'active'
        AND u.display_name ILIKE ${likeQuery}
      ORDER BY u.display_name ASC
      LIMIT ${limit}
    `;
  }

  return NextResponse.json(results);
}
