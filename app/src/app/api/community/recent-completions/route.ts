import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "10") || 10), 30);
  const country = searchParams.get("country");

  const where: Record<string, unknown> = {
    user: { status: "active" },
  };
  if (country) {
    where.course = { country };
  }

  const completions = await prisma.completion.findMany({
    where,
    orderBy: { completedAt: "desc" },
    take: limit,
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      course: {
        select: { id: true, slug: true, name: true, distanceKm: true, elevationM: true, region: true },
      },
    },
  });

  return NextResponse.json(completions);
}
