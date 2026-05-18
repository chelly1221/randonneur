import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureBucket, deleteGpx } from "@/lib/minio";
import * as Minio from "minio";

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "minio",
  port: parseInt(process.env.MINIO_PORT || "9000"),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER || "minioadmin",
  secretKey: process.env.MINIO_ROOT_PASSWORD || "minioadmin",
});

const BUCKET = process.env.MINIO_BUCKET || "gpx-files";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const bike = await prisma.bike.findUnique({
    where: { id },
  });

  if (!bike) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(bike);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const bike = await prisma.bike.findUnique({ where: { id } });
  if (!bike) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (bike.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const name = formData.get("name") as string | null;
  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "자전거 이름을 입력해주세요." },
      { status: 400 }
    );
  }

  const brand = (formData.get("brand") as string | null)?.trim() || null;
  const model = (formData.get("model") as string | null)?.trim() || null;
  const yearStr = formData.get("year") as string | null;
  const year = yearStr ? parseInt(yearStr) : null;
  const type = (formData.get("type") as string | null)?.trim() || null;
  const isDefault = formData.get("isDefault") === "true";
  const photo = formData.get("photo") as File | null;

  // If setting as default, unset all other defaults
  if (isDefault && !bike.isDefault) {
    await prisma.bike.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const data: Record<string, unknown> = {
    name: name.trim(),
    brand,
    model,
    year: year && year > 1900 && year <= new Date().getFullYear() + 1 ? year : null,
    type,
    isDefault,
  };

  // Upload new photo if provided
  if (photo && photo.size > 0 && photo.size <= 5 * 1024 * 1024) {
    const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const allowedExts = ["jpg", "jpeg", "png", "webp"];
    if (allowedExts.includes(ext)) {
      // Delete old photo if exists
      if (bike.imageKey) {
        try {
          await deleteGpx(bike.imageKey);
        } catch {
          // Ignore deletion errors
        }
      }

      const buffer = Buffer.from(await photo.arrayBuffer());
      const imageKey = `bikes/${bike.id}.${ext}`;

      await ensureBucket();
      await minioClient.putObject(BUCKET, imageKey, buffer, buffer.length, {
        "Content-Type": photo.type,
      });

      data.imageKey = imageKey;
    }
  }

  const updated = await prisma.bike.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const bike = await prisma.bike.findUnique({ where: { id } });
  if (!bike) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (bike.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete photo from MinIO if exists
  if (bike.imageKey) {
    try {
      await deleteGpx(bike.imageKey);
    } catch {
      // Ignore deletion errors
    }
  }

  await prisma.bike.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
