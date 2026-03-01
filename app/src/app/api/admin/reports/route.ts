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
  if (status && ["pending", "resolved", "dismissed"].includes(status)) {
    where.status = status;
  }

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, displayName: true } },
      review: {
        select: {
          id: true,
          content: true,
          user: { select: { id: true, displayName: true } },
          course: { select: { id: true, name: true } },
        },
      },
      comment: {
        select: {
          id: true,
          content: true,
          user: { select: { id: true, displayName: true } },
        },
      },
    },
  });

  return NextResponse.json({ reports });
}
