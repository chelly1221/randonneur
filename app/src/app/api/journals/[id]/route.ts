import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getPresignedUrl, uploadGpx, ensureBucket, deleteGpx } from "@/lib/minio";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const journal = await prisma.journal.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true, distanceKm: true, region: true } },
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!journal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Generate presigned URLs for photos
  const photosWithUrls = await Promise.all(
    journal.photos.map(async (photo) => {
      try {
        const url = await getPresignedUrl(photo.imageKey, 3600);
        return { ...photo, url };
      } catch {
        return { ...photo, url: null };
      }
    })
  );

  return NextResponse.json({ ...journal, photos: photosWithUrls });
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

  const { id } = await params;
  const journal = await prisma.journal.findUnique({ where: { id } });
  if (!journal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (journal.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const title = formData.get("title") as string | null;
  const content = formData.get("content") as string | null;
  const rideDate = formData.get("rideDate") as string | null;
  const distance = formData.get("distance") as string | null;
  const courseId = formData.get("courseId") as string | null;

  if (!title || !title.trim()) {
    return NextResponse.json({ error: "제목은 필수입니다" }, { status: 400 });
  }
  if (!content || !content.trim()) {
    return NextResponse.json({ error: "내용은 필수입니다" }, { status: 400 });
  }

  const updated = await prisma.journal.update({
    where: { id },
    data: {
      title: title.trim(),
      content: content.trim(),
      rideDate: rideDate ? new Date(rideDate) : null,
      distance: distance ? parseFloat(distance) : null,
      courseId: courseId || null,
    },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true } },
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });

  // Handle new photo uploads if any
  const newPhotos = formData.getAll("photos") as File[];
  if (newPhotos.length > 0 && newPhotos[0]?.size > 0) {
    await ensureBucket();
    const existingCount = updated.photos.length;
    const photoRecords: { imageKey: string; sortOrder: number }[] = [];

    for (let i = 0; i < Math.min(newPhotos.length, 5 - existingCount); i++) {
      const photo = newPhotos[i];
      if (!photo || photo.size === 0) continue;

      const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const key = `journals/${id}/${existingCount + i}.${ext}`;
      const buffer = Buffer.from(await photo.arrayBuffer());
      await uploadGpx(key, buffer, photo.type || "image/jpeg");
      photoRecords.push({ imageKey: key, sortOrder: existingCount + i });
    }

    if (photoRecords.length > 0) {
      await prisma.journalPhoto.createMany({
        data: photoRecords.map((p) => ({
          journalId: id,
          imageKey: p.imageKey,
          sortOrder: p.sortOrder,
        })),
      });
    }
  }

  const result = await prisma.journal.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true } },
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json(result);
}

export async function DELETE(
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

  const { id } = await params;
  const journal = await prisma.journal.findUnique({
    where: { id },
    include: { photos: true },
  });
  if (!journal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = user.role === "admin";
  if (journal.userId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete photos from MinIO
  for (const photo of journal.photos) {
    try {
      await deleteGpx(photo.imageKey);
    } catch {
      // Ignore deletion errors for individual photos
    }
  }

  await prisma.journal.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
