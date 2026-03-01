import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 30);

  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      course: {
        select: { id: true, name: true, distanceKm: true, region: true },
      },
      _count: { select: { comments: true, likes: true } },
    },
  });

  return NextResponse.json(reviews);
}
