import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const completions = await prisma.completion.findMany({
    where: { userId: user.id },
    take: 500,
    include: {
      course: {
        select: {
          id: true,
          slug: true,
          name: true,
          distanceKm: true,
          elevationM: true,
          region: true,
        },
      },
    },
    orderBy: { completedAt: "desc" },
  });

  // Calculate stats
  const totalDistance = completions.reduce(
    (sum, c) => sum + c.course.distanceKm,
    0
  );
  const uniqueRegions = new Set(completions.map((c) => c.course.region));
  const totalElevation = completions.reduce(
    (sum, c) => sum + c.course.elevationM,
    0
  );

  return NextResponse.json({
    completions,
    stats: {
      totalCompletions: completions.length,
      totalDistance: Math.round(totalDistance),
      totalElevation,
      uniqueRegions: uniqueRegions.size,
    },
  });
}
