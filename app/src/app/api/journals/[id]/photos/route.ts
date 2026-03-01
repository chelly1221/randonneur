import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { uploadGpx, ensureBucket } from "@/lib/minio";

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

  const { id } = await params;
  const journal = await prisma.journal.findUnique({
    where: { id },
    include: { _count: { select: { photos: true } } },
  });
  if (!journal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (journal.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingCount = journal._count.photos;
  if (existingCount >= 5) {
    return NextResponse.json(
      { error: "최대 5장까지 업로드할 수 있습니다" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const photos = formData.getAll("photos") as File[];

  if (photos.length === 0) {
    return NextResponse.json({ error: "사진을 선택해주세요" }, { status: 400 });
  }

  await ensureBucket();
  const created: { imageKey: string; sortOrder: number }[] = [];

  for (let i = 0; i < Math.min(photos.length, 5 - existingCount); i++) {
    const photo = photos[i];
    if (!photo || photo.size === 0) continue;

    const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const key = `journals/${id}/${existingCount + i}.${ext}`;
    const buffer = Buffer.from(await photo.arrayBuffer());
    await uploadGpx(key, buffer, photo.type || "image/jpeg");
    created.push({ imageKey: key, sortOrder: existingCount + i });
  }

  if (created.length > 0) {
    await prisma.journalPhoto.createMany({
      data: created.map((p) => ({
        journalId: id,
        imageKey: p.imageKey,
        sortOrder: p.sortOrder,
      })),
    });
  }

  const updatedPhotos = await prisma.journalPhoto.findMany({
    where: { journalId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(updatedPhotos, { status: 201 });
}
