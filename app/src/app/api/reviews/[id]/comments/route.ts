import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
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
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.status === "banned" || user.status === "muted") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  const { id: reviewId } = await params;

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { course: { select: { slug: true } } },
  });
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

  // Notify the review author if the commenter is not the review author (non-blocking)
  if (review.userId !== user.id) {
    createNotification(
      review.userId,
      "comment",
      "새 댓글",
      `${user.displayName}님이 댓글을 남겼습니다`,
      `/courses/${review.course.slug}`
    ).catch(() => {});
  }

  // If this is a reply, also notify the parent comment author (non-blocking)
  if (parentId) {
    prisma.comment.findUnique({
      where: { id: parentId },
      select: { userId: true },
    }).then((parentComment) => {
      if (
        parentComment &&
        parentComment.userId !== user.id &&
        parentComment.userId !== review.userId // avoid duplicate notification
      ) {
        createNotification(
          parentComment.userId,
          "comment",
          "새 답글",
          `${user.displayName}님이 답글을 남겼습니다`,
          `/courses/${review.course.slug}`
        ).catch(() => {});
      }
    }).catch(() => {});
  }

  return NextResponse.json(comment, { status: 201 });
}
