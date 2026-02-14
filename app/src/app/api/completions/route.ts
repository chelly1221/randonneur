import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { uploadGpx } from "@/lib/minio";

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

  const formData = await request.formData();
  const courseId = formData.get("courseId") as string;
  const completedAt = formData.get("completedAt") as string;
  const notes = formData.get("notes") as string | null;
  const gpxFile = formData.get("gpx") as File | null;

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
    const buffer = Buffer.from(await gpxFile.arrayBuffer());
    gpxFileKey = `completions/${user.id}/${Date.now()}.gpx`;
    await uploadGpx(gpxFileKey, buffer);
  }

  const completion = await prisma.completion.create({
    data: {
      userId: user.id,
      courseId,
      completedAt: new Date(completedAt),
      notes: notes || null,
      gpxFileKey,
    },
    include: { course: true },
  });

  return NextResponse.json(completion, { status: 201 });
}
