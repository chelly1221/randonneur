import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const { reviewId, commentId } = body;

  if (!reviewId && !commentId) {
    return NextResponse.json({ error: "reviewId or commentId required" }, { status: 400 });
  }
  if (reviewId && commentId) {
    return NextResponse.json({ error: "Provide only one of reviewId or commentId" }, { status: 400 });
  }

  if (reviewId) {
    const existing = await prisma.like.findUnique({
      where: { userId_reviewId: { userId: user.id, reviewId } },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      const count = await prisma.like.count({ where: { reviewId } });
      return NextResponse.json({ liked: false, count });
    }

    await prisma.like.create({ data: { userId: user.id, reviewId } });
    const count = await prisma.like.count({ where: { reviewId } });

    // Notify the review author (non-blocking, skip if liking own review)
    prisma.review.findUnique({
      where: { id: reviewId },
      select: { userId: true, courseId: true },
    }).then((review) => {
      if (review && review.userId !== user.id) {
        createNotification(
          review.userId,
          "like",
          "좋아요",
          `${user.displayName}님이 리뷰에 좋아요를 눌렀습니다`,
          `/courses/${review.courseId}`
        ).catch(() => {});
      }
    }).catch(() => {});

    return NextResponse.json({ liked: true, count });
  }

  if (commentId) {
    const existing = await prisma.like.findUnique({
      where: { userId_commentId: { userId: user.id, commentId } },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      const count = await prisma.like.count({ where: { commentId } });
      return NextResponse.json({ liked: false, count });
    }

    await prisma.like.create({ data: { userId: user.id, commentId } });
    const count = await prisma.like.count({ where: { commentId } });

    // Notify the comment author (non-blocking, skip if liking own comment)
    prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, review: { select: { courseId: true } } },
    }).then((comment) => {
      if (comment && comment.userId !== user.id) {
        createNotification(
          comment.userId,
          "like",
          "좋아요",
          `${user.displayName}님이 댓글에 좋아요를 눌렀습니다`,
          `/courses/${comment.review.courseId}`
        ).catch(() => {});
      }
    }).catch(() => {});

    return NextResponse.json({ liked: true, count });
  }
}
