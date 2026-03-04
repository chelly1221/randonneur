import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { checkAndAwardBadges } from "@/lib/badges";
import { sanitizeHtml } from "@/lib/sanitize";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const reviews = await prisma.review.findMany({
    where: { courseId: id },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, displayName: true } },
      _count: { select: { comments: true, likes: true } },
    },
  });

  return NextResponse.json(reviews);
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

  const { id: courseId } = await params;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const body = await request.json();
  const { completionStatus, difficulty, content } = body;

  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const validStatuses = ["success", "dnf", "dnq", "dns"];
  const validDifficulties = ["1", "2", "3", "4", "5"];

  if (completionStatus && !validStatuses.includes(completionStatus)) {
    return NextResponse.json({ error: "Invalid completionStatus" }, { status: 400 });
  }
  if (difficulty && !validDifficulties.includes(difficulty)) {
    return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
  }

  const review = await prisma.review.create({
    data: {
      userId: user.id,
      courseId,
      completionStatus: completionStatus ?? "success",
      difficulty: difficulty ?? null,
      content: sanitizeHtml(content.trim()),
    },
    include: {
      user: { select: { id: true, displayName: true } },
    },
  });

  // Award badges asynchronously
  checkAndAwardBadges(user.id).catch(() => {});

  return NextResponse.json(review, { status: 201 });
}
