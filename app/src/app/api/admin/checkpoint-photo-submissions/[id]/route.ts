import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { deleteGpx } from "@/lib/minio";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const submission = await prisma.checkpointPhotoSubmission.findUnique({
    where: { id },
  });
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { action, adminNote } = body as { action: "approve" | "reject"; adminNote?: string };

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (action === "approve") {
    // Update the checkpoint's imageKey and mark submission as approved
    await prisma.$transaction([
      prisma.checkpoint.update({
        where: { id: submission.checkpointId },
        data: { imageKey: submission.imageKey },
      }),
      prisma.checkpointPhotoSubmission.update({
        where: { id },
        data: { status: "approved", adminNote: adminNote ?? null },
      }),
    ]);
  } else {
    // Delete file from MinIO and mark as rejected
    try {
      await deleteGpx(submission.imageKey);
    } catch {
      // Ignore if file doesn't exist
    }
    await prisma.checkpointPhotoSubmission.update({
      where: { id },
      data: { status: "rejected", adminNote: adminNote ?? null },
    });
  }

  const updated = await prisma.checkpointPhotoSubmission.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
      checkpoint: {
        select: {
          id: true,
          name: true,
          course: { select: { id: true, name: true, courseNumber: true } },
        },
      },
    },
  });

  return NextResponse.json(updated);
}
