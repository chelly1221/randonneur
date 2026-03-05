import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureBucket, uploadGpx, deleteGpx } from "@/lib/minio";
import { randomUUID } from "crypto";

const MAX_IMAGES = 3;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

  const { id: courseId } = await params;

  const irq = await prisma.improvementRequest.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!irq) {
    return NextResponse.json(
      { error: "Improvement request not found" },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const files = formData.getAll("images") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const currentCount = irq.images.length;
  if (currentCount + files.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `최대 ${MAX_IMAGES}장까지 업로드할 수 있습니다.` },
      { status: 400 }
    );
  }

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "JPG, PNG, WebP 형식만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 10MB 이하여야 합니다." },
        { status: 400 }
      );
    }
  }

  await ensureBucket();

  const newKeys: string[] = [];
  for (const file of files) {
    const ext = EXT_MAP[file.type] ?? "jpg";
    const key = `improvement-requests/${irq.id}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadGpx(key, buffer, file.type);
    newKeys.push(key);
  }

  const updated = await prisma.improvementRequest.update({
    where: { id: irq.id },
    data: { images: [...irq.images, ...newKeys] },
  });

  return NextResponse.json({ images: updated.images });
}

export async function DELETE(
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

  const { id: courseId } = await params;

  const irq = await prisma.improvementRequest.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!irq) {
    return NextResponse.json(
      { error: "Improvement request not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const { imageKey } = body;

  if (!imageKey || !irq.images.includes(imageKey)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  await deleteGpx(imageKey);

  const updated = await prisma.improvementRequest.update({
    where: { id: irq.id },
    data: { images: irq.images.filter((k) => k !== imageKey) },
  });

  return NextResponse.json({ images: updated.images });
}
