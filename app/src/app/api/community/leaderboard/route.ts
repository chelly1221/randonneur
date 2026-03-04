import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

type Category = "completions" | "distance" | "elevation";
type Period = "all" | "year" | "month";

interface RankingRow {
  user_id: string;
  display_name: string;
  avatar_key: string | null;
  value: number;
  completion_count: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const category = (searchParams.get("category") ?? "completions") as Category;
  const period = (searchParams.get("period") ?? "all") as Period;
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "20") || 20, 1),
    50
  );

  if (!["completions", "distance", "elevation"].includes(category)) {
    return NextResponse.json(
      { error: "Invalid category. Must be: completions, distance, elevation" },
      { status: 400 }
    );
  }

  if (!["all", "year", "month"].includes(period)) {
    return NextResponse.json(
      { error: "Invalid period. Must be: all, year, month" },
      { status: 400 }
    );
  }

  // Build period filter
  let periodFilter = Prisma.sql``;
  if (period === "year") {
    periodFilter = Prisma.sql`AND c.completed_at >= date_trunc('year', CURRENT_DATE)`;
  } else if (period === "month") {
    periodFilter = Prisma.sql`AND c.completed_at >= date_trunc('month', CURRENT_DATE)`;
  }

  // Build value expression based on category
  let valueExpr: Prisma.Sql;
  if (category === "distance") {
    valueExpr = Prisma.sql`COALESCE(SUM(co.distance_km), 0)`;
  } else if (category === "elevation") {
    valueExpr = Prisma.sql`COALESCE(SUM(co.elevation_m), 0)`;
  } else {
    valueExpr = Prisma.sql`COUNT(c.id)`;
  }

  const rows = await prisma.$queryRaw<RankingRow[]>`
    SELECT
      u.id AS user_id,
      u.display_name,
      u.avatar_key,
      ${valueExpr}::float AS value,
      COUNT(c.id)::int AS completion_count
    FROM completions c
    JOIN users u ON u.id = c.user_id
    JOIN courses co ON co.id = c.course_id
    WHERE c.completion_status = 'success'
      AND u.status = 'active'
      ${periodFilter}
    GROUP BY u.id, u.display_name, u.avatar_key
    HAVING ${valueExpr} > 0
    ORDER BY value DESC, u.display_name ASC
    LIMIT ${limit}
  `;

  const rankings = rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    displayName: row.display_name,
    avatarKey: row.avatar_key,
    value: Number(row.value),
    completionCount: Number(row.completion_count),
  }));

  return NextResponse.json({ rankings });
}
