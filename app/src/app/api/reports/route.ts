import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendAdminNotification } from "@/lib/push";

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
  if (user.status !== "active") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  const body = await request.json();
  const { reviewId, commentId, reason, detail } = body;

  if (!reviewId && !commentId) {
    return NextResponse.json({ error: "reviewId or commentId required" }, { status: 400 });
  }

  const validReasons = ["spam", "harassment", "misinformation", "inappropriate", "other"];
  if (!reason || !validReasons.includes(reason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      reviewId: reviewId ?? null,
      commentId: commentId ?? null,
      reason,
      detail: detail?.trim() || null,
    },
  });

  const targetType = reviewId ? "리뷰" : "댓글";
  sendAdminNotification("report", `새 신고: ${reason} (${targetType})`).catch(
    (err) => console.error("Push error:", err)
  );

  return NextResponse.json(report, { status: 201 });
}
