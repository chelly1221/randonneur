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
    return NextResponse.json({ reviewIds: [], commentIds: [] });
  }

  const likes = await prisma.like.findMany({
    where: { userId: user.id },
    select: { reviewId: true, commentId: true },
  });

  const reviewIds = likes.filter((l) => l.reviewId).map((l) => l.reviewId!);
  const commentIds = likes.filter((l) => l.commentId).map((l) => l.commentId!);

  return NextResponse.json({ reviewIds, commentIds });
}
