import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { uploadGpx } from "@/lib/minio";
import { checkAndAwardBadges } from "@/lib/badges";
import { createNotifications } from "@/lib/notifications";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find local user
  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.status === "banned") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  const formData = await request.formData();
  const courseId = formData.get("courseId") as string;
  const completedAt = formData.get("completedAt") as string;
  const notes = formData.get("notes") as string | null;
  const gpxFile = formData.get("gpx") as File | null;
  const rawStatus = formData.get("completionStatus") as string | null;
  const VALID_STATUSES = ["success", "dnf", "dnq", "dns"];
  const completionStatus = rawStatus && VALID_STATUSES.includes(rawStatus) ? rawStatus : "success";

  if (!courseId || !completedAt) {
    return NextResponse.json(
      { error: "courseId and completedAt are required" },
      { status: 400 }
    );
  }

  // Verify course exists
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let gpxFileKey = null;
  if (gpxFile && gpxFile.size > 0) {
    if (gpxFile.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "GPX file too large (max 50MB)" }, { status: 400 });
    }
    const buffer = Buffer.from(await gpxFile.arrayBuffer());
    gpxFileKey = `completions/${user.id}/${randomUUID()}.gpx`;
    await uploadGpx(gpxFileKey, buffer);
  }

  const completion = await prisma.completion.create({
    data: {
      userId: user.id,
      courseId,
      completedAt: new Date(completedAt),
      completionStatus,
      notes: notes || null,
      gpxFileKey,
    },
    include: { course: true },
  });

  // Award badges asynchronously (don't block the response)
  checkAndAwardBadges(user.id).catch(() => {});

  // Notify followers about the completion (non-blocking)
  prisma.follow.findMany({
    where: { followingId: user.id },
    select: { followerId: true },
  }).then((followers) => {
    const followerIds = followers.map((f) => f.followerId);
    if (followerIds.length > 0) {
      createNotifications(
        followerIds,
        "completion",
        "코스 완주",
        `${user.displayName}님이 ${course.name}을(를) 완주했습니다`,
        `/courses/${course.slug}`
      ).catch(() => {});
    }
  }).catch(() => {});

  return NextResponse.json(completion, { status: 201 });
}
