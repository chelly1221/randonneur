import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status, adminNote } = body;

  const validStatuses = ["pending", "resolved", "dismissed"];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (adminNote !== undefined) data.adminNote = adminNote;

  const updated = await prisma.report.update({
    where: { id },
    data,
    include: {
      reporter: { select: { id: true, displayName: true } },
      review: {
        select: {
          id: true,
          content: true,
          user: { select: { id: true, displayName: true } },
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

  return NextResponse.json(updated);
}
