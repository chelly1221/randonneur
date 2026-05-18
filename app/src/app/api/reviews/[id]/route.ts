import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (user.status === "banned" || user.status === "muted") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }
  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { completionStatus, difficulty, content } = body;

  if (content !== undefined && (typeof content !== "string" || !content.trim())) {
    return NextResponse.json({ error: "content cannot be empty" }, { status: 400 });
  }

  const validStatuses = ["success", "dnf", "dnq", "dns"];
  const validDifficulties = ["1", "2", "3", "4", "5"];

  if (completionStatus && !validStatuses.includes(completionStatus)) {
    return NextResponse.json({ error: "Invalid completionStatus" }, { status: 400 });
  }
  if (difficulty && !validDifficulties.includes(difficulty)) {
    return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (completionStatus !== undefined) data.completionStatus = completionStatus;
  if (difficulty !== undefined) data.difficulty = difficulty || null;
  if (content !== undefined) data.content = sanitizeHtml(content.trim());

  const updated = await prisma.review.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, displayName: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = session.user.roles?.includes("admin");
  if (existing.userId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.review.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
