import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    where.status = status;
  }

  const submissions = await prisma.checkpointPhotoSubmission.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
      checkpoint: {
        select: {
          id: true,
          name: true,
          course: { select: { id: true, name: true, courseNumber: true } },
        },
      },
    },
  });

  return NextResponse.json(submissions);
}
