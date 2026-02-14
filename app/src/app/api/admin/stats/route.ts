import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [courseCount, userCount, completionCount, downloadCount, recentCourses] =
    await Promise.all([
      prisma.course.count(),
      prisma.user.count(),
      prisma.completion.count(),
      prisma.download.count(),
      prisma.course.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, distanceKm: true, region: true, createdAt: true },
      }),
    ]);

  return NextResponse.json({
    courseCount,
    userCount,
    completionCount,
    downloadCount,
    recentCourses,
  });
}
