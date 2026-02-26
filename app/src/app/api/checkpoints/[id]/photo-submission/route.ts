import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { uploadGpx, ensureBucket, deleteGpx } from "@/lib/minio";
import { randomUUID } from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: checkpointId } = await params;

  const checkpoint = await prisma.checkpoint.findUnique({ where: { id: checkpointId } });
  if (!checkpoint) {
    return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const allowedExts = ["jpg", "jpeg", "png", "webp", "gif"];
  if (!allowedExts.includes(ext)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  const userId = session.user.id as string;

  // Check for existing pending submission by this user for this checkpoint
  const existing = await prisma.checkpointPhotoSubmission.findFirst({
    where: { checkpointId, userId, status: "pending" },
  });

  const imageKey = `pending-images/${checkpointId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await ensureBucket();
  await uploadGpx(imageKey, buffer, file.type || "image/jpeg");

  let submission;
  if (existing) {
    // Delete old file and update record
    try {
      await deleteGpx(existing.imageKey);
    } catch {
      // Ignore if old file doesn't exist
    }
    submission = await prisma.checkpointPhotoSubmission.update({
      where: { id: existing.id },
      data: { imageKey, createdAt: new Date() },
    });
  } else {
    submission = await prisma.checkpointPhotoSubmission.create({
      data: {
        checkpointId,
        userId,
        imageKey,
        status: "pending",
      },
    });
  }

  return NextResponse.json({
    id: submission.id,
    imageKey: submission.imageKey,
    status: submission.status,
  });
}
