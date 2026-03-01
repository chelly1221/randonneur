import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureBucket, uploadGpx, getPresignedUrl } from "@/lib/minio";
import { randomUUID } from "crypto";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params;

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const photos = await prisma.reviewPhoto.findMany({
    where: { reviewId },
    orderBy: { sortOrder: "asc" },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
    },
  });

  const photosWithUrls = await Promise.all(
    photos.map(async (photo) => {
      let imageUrl: string;
      try {
        imageUrl = await getPresignedUrl(photo.imageKey, 3600);
      } catch {
        imageUrl = `/api/images/${encodeURIComponent(photo.imageKey)}`;
      }
      return {
        id: photo.id,
        reviewId: photo.reviewId,
        imageKey: photo.imageKey,
        imageUrl,
        caption: photo.caption,
        sortOrder: photo.sortOrder,
        user: photo.user,
      };
    })
  );

  return NextResponse.json(photosWithUrls);
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
  if (user.status !== "active") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  const { id: reviewId } = await params;

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  // Only the review owner can upload photos
  if (review.userId !== user.id) {
    return NextResponse.json(
      { error: "Only the review owner can upload photos" },
      { status: 403 }
    );
  }

  // Check existing photo count
  const existingCount = await prisma.reviewPhoto.count({
    where: { reviewId },
  });
  if (existingCount >= 5) {
    return NextResponse.json(
      { error: "Maximum 5 photos per review" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const files = formData.getAll("photos") as File[];

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  if (existingCount + files.length > 5) {
    return NextResponse.json(
      { error: `Maximum 5 photos per review. Currently ${existingCount}, trying to add ${files.length}` },
      { status: 400 }
    );
  }

  const allowedExts = ["jpg", "jpeg", "png", "webp"];
  const createdPhotos = [];

  await ensureBucket();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";

    if (!allowedExts.includes(ext)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.name}. Allowed: jpg, png, webp` },
        { status: 400 }
      );
    }

    // 10MB limit per file
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large: ${file.name}. Maximum 10MB.` },
        { status: 400 }
      );
    }

    const imageKey = `review-photos/${reviewId}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await uploadGpx(imageKey, buffer, file.type || "image/jpeg");

    const photo = await prisma.reviewPhoto.create({
      data: {
        reviewId,
        userId: user.id,
        imageKey,
        sortOrder: existingCount + i,
      },
    });

    createdPhotos.push({
      id: photo.id,
      reviewId: photo.reviewId,
      imageKey: photo.imageKey,
      caption: photo.caption,
      sortOrder: photo.sortOrder,
    });
  }

  return NextResponse.json(createdPhotos, { status: 201 });
}
