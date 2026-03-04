import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params;

  const comments = await prisma.comment.findMany({
    where: { reviewId, parentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, displayName: true } },
      _count: { select: { likes: true } },
      children: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, displayName: true } },
          _count: { select: { likes: true } },
        },
      },
    },
  });

  return NextResponse.json(comments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  if (user.status === "banned" || user.status === "muted") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  const { id: reviewId } = await params;

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const body = await request.json();
  const { content, parentId } = body;

  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Validate parentId if provided — must belong to same review and be a top-level comment
  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent || parent.reviewId !== reviewId) {
      return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
    }
    if (parent.parentId) {
      return NextResponse.json({ error: "Only 2-level nesting allowed" }, { status: 400 });
    }
  }

  const comment = await prisma.comment.create({
    data: {
      reviewId,
      userId: user.id,
      parentId: parentId ?? null,
      content: sanitizeHtml(content.trim()),
    },
    include: {
      user: { select: { id: true, displayName: true } },
      _count: { select: { likes: true } },
    },
  });

  return NextResponse.json(comment, { status: 201 });
}
