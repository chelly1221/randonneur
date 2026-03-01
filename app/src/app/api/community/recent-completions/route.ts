import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 30);

  const completions = await prisma.completion.findMany({
    where: {
      user: { status: "active" },
    },
    orderBy: { completedAt: "desc" },
    take: limit,
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      course: {
        select: { id: true, name: true, distanceKm: true, elevationM: true, region: true },
      },
    },
  });

  return NextResponse.json(completions);
}
