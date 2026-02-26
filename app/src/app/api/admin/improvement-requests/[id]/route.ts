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
  const existing = await prisma.improvementRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { status, adminNote } = body;

  const validStatuses = ["pending", "resolved"];
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (status !== undefined) data.status = status;
  if (adminNote !== undefined) data.adminNote = adminNote || null;

  const updated = await prisma.improvementRequest.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, displayName: true, email: true } },
      course: { select: { id: true, name: true, courseNumber: true } },
    },
  });

  return NextResponse.json(updated);
}
