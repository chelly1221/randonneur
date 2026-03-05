import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendAdminNotification } from "@/lib/push";
import { sanitizeHtml } from "@/lib/sanitize";
import { getPresignedUrl } from "@/lib/minio";

export async function GET(
  _request: NextRequest,
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

  const { id: courseId } = await params;

  const req = await prisma.improvementRequest.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });

  if (!req) return NextResponse.json(null);

  const imageUrls: string[] = [];
  for (const key of req.images) {
    try {
      imageUrls.push(await getPresignedUrl(key));
    } catch {
      imageUrls.push("");
    }
  }

  return NextResponse.json({ ...req, imageUrls });
}

export async function PUT(
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

  const { id: courseId } = await params;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const body = await request.json();
  const { content, category } = body;

  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const VALID_CATEGORIES = ["gpx", "checkpoint", "route", "info", "other"];
  const cleanCategory =
    category && VALID_CATEGORIES.includes(category) ? category : null;

  const existing = await prisma.improvementRequest.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });

  const sanitizedContent = sanitizeHtml(content.trim());

  let result;
  if (!existing) {
    // Create new
    result = await prisma.improvementRequest.create({
      data: {
        userId: user.id,
        courseId,
        category: cleanCategory,
        content: sanitizedContent,
        status: "pending",
      },
    });
    sendAdminNotification(
      "improvement",
      `새 수정 요청: ${course.name} (${cleanCategory || "기타"})`
    ).catch((err) => console.error("Push error:", err));
  } else if (existing.status === "pending") {
    // Update existing pending request
    result = await prisma.improvementRequest.update({
      where: { id: existing.id },
      data: { category: cleanCategory, content: sanitizedContent },
    });
  } else {
    // status is "resolved" — create a new pending request (reset)
    result = await prisma.improvementRequest.update({
      where: { id: existing.id },
      data: {
        category: cleanCategory,
        content: sanitizedContent,
        status: "pending",
        adminNote: null,
      },
    });
    sendAdminNotification(
      "improvement",
      `수정 요청 재오픈: ${course.name} (${cleanCategory || "기타"})`
    ).catch((err) => console.error("Push error:", err));
  }

  return NextResponse.json(result);
}
