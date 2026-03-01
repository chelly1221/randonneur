import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { uploadGpx, ensureBucket } from "@/lib/minio";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const userId = searchParams.get("userId");

  const where: Record<string, unknown> = {};
  if (userId) {
    where.userId = userId;
  }

  const [journals, total] = await Promise.all([
    prisma.journal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: { id: true, displayName: true, avatarKey: true },
        },
        course: {
          select: { id: true, name: true },
        },
        _count: { select: { photos: true } },
        photos: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { imageKey: true },
        },
      },
    }),
    prisma.journal.count({ where }),
  ]);

  return NextResponse.json({ journals, total });
}

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
  if (user.status === "banned" || user.status === "muted") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
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

  // Create journal first
  const journal = await prisma.journal.create({
    data: {
      userId: user.id,
      title: title.trim(),
      content: content.trim(),
      rideDate: rideDate ? new Date(rideDate) : null,
      distance: distance ? parseFloat(distance) : null,
      courseId: courseId || null,
    },
  });

  // Handle photo uploads
  const photos = formData.getAll("photos") as File[];
  if (photos.length > 0) {
    await ensureBucket();
    const photoRecords: { imageKey: string; sortOrder: number }[] = [];

    for (let i = 0; i < Math.min(photos.length, 5); i++) {
      const photo = photos[i];
      if (!photo || photo.size === 0) continue;

      const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const key = `journals/${journal.id}/${i}.${ext}`;
      const buffer = Buffer.from(await photo.arrayBuffer());
      await uploadGpx(key, buffer, photo.type || "image/jpeg");
      photoRecords.push({ imageKey: key, sortOrder: i });
    }

    if (photoRecords.length > 0) {
      await prisma.journalPhoto.createMany({
        data: photoRecords.map((p) => ({
          journalId: journal.id,
          imageKey: p.imageKey,
          sortOrder: p.sortOrder,
        })),
      });
    }
  }

  const result = await prisma.journal.findUnique({
    where: { id: journal.id },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true } },
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json(result, { status: 201 });
}
