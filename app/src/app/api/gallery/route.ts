import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPresignedUrl } from "@/lib/minio";

interface GalleryItem {
  id: string;
  imageKey: string;
  imageUrl: string;
  type: "review" | "checkpoint";
  user: { id: string; displayName: string; avatarKey: string | null } | null;
  course: { id: string; slug: string; name: string; region: string | null } | null;
  caption: string | null;
  createdAt: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "30") || 30), 60);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0") || 0);
  const courseId = searchParams.get("courseId");
  const region = searchParams.get("region");

  const items: GalleryItem[] = [];

  // 1. Review photos
  const reviewPhotoWhere: Record<string, unknown> = {};
  if (courseId) {
    reviewPhotoWhere.review = { courseId };
  }
  if (region) {
    reviewPhotoWhere.review = {
      ...((reviewPhotoWhere.review as Record<string, unknown>) ?? {}),
      course: { region },
    };
  }

  const reviewPhotos = await prisma.reviewPhoto.findMany({
    where: reviewPhotoWhere,
    orderBy: { review: { createdAt: "desc" } },
    take: limit,
    skip: offset,
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      review: {
        select: {
          createdAt: true,
          course: { select: { id: true, slug: true, name: true, region: true } },
        },
      },
    },
  });

  for (const photo of reviewPhotos) {
    let imageUrl: string;
    try {
      imageUrl = await getPresignedUrl(photo.imageKey, 3600);
    } catch {
      imageUrl = `/api/images/${encodeURIComponent(photo.imageKey)}`;
    }
    items.push({
      id: photo.id,
      imageKey: photo.imageKey,
      imageUrl,
      type: "review",
      user: photo.user,
      course: photo.review.course,
      caption: photo.caption,
      createdAt: photo.review.createdAt.toISOString(),
    });
  }

  // 2. Checkpoint photo submissions (approved only)
  const checkpointPhotoWhere: Record<string, unknown> = {
    status: "approved",
  };
  if (courseId) {
    checkpointPhotoWhere.checkpoint = { courseId };
  }
  if (region) {
    checkpointPhotoWhere.checkpoint = {
      ...((checkpointPhotoWhere.checkpoint as Record<string, unknown>) ?? {}),
      course: { region },
    };
  }

  const checkpointPhotos = await prisma.checkpointPhotoSubmission.findMany({
    where: checkpointPhotoWhere,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      checkpoint: {
        select: {
          name: true,
          course: { select: { id: true, slug: true, name: true, region: true } },
        },
      },
    },
  });

  for (const photo of checkpointPhotos) {
    let imageUrl: string;
    try {
      imageUrl = await getPresignedUrl(photo.imageKey, 3600);
    } catch {
      imageUrl = `/api/images/${encodeURIComponent(photo.imageKey)}`;
    }
    items.push({
      id: photo.id,
      imageKey: photo.imageKey,
      imageUrl,
      type: "checkpoint",
      user: photo.user,
      course: photo.checkpoint.course,
      caption: photo.checkpoint.name,
      createdAt: photo.createdAt.toISOString(),
    });
  }

  // Sort all items by createdAt descending, then limit
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const result = items.slice(0, limit);

  return NextResponse.json(result);
}
