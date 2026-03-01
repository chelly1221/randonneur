import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureBucket } from "@/lib/minio";
import * as Minio from "minio";

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "minio",
  port: parseInt(process.env.MINIO_PORT || "9000"),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER || "minioadmin",
  secretKey: process.env.MINIO_ROOT_PASSWORD || "minioadmin",
});

const BUCKET = process.env.MINIO_BUCKET || "gpx-files";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (userId) {
    // Public: list bikes for a specific user
    const bikes = await prisma.bike.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(bikes);
  }

  // Private: list current user's bikes
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

  const bikes = await prisma.bike.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(bikes);
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

  // Check max 5 bikes
  const bikeCount = await prisma.bike.count({
    where: { userId: user.id },
  });
  if (bikeCount >= 5) {
    return NextResponse.json(
      { error: "최대 5대까지 등록할 수 있습니다." },
      { status: 400 }
    );
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
  if (isDefault) {
    await prisma.bike.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  // Create the bike first to get the ID
  const bike = await prisma.bike.create({
    data: {
      userId: user.id,
      name: name.trim(),
      brand,
      model,
      year: year && year > 1900 && year <= new Date().getFullYear() + 1 ? year : null,
      type,
      isDefault,
    },
  });

  // Upload photo if provided
  let imageKey: string | null = null;
  if (photo && photo.size > 0) {
    if (photo.size > 5 * 1024 * 1024) {
      // Still return the bike but skip the photo
      return NextResponse.json(bike);
    }

    const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const allowedExts = ["jpg", "jpeg", "png", "webp"];
    if (allowedExts.includes(ext)) {
      const buffer = Buffer.from(await photo.arrayBuffer());
      imageKey = `bikes/${bike.id}.${ext}`;

      await ensureBucket();
      await minioClient.putObject(BUCKET, imageKey, buffer, buffer.length, {
        "Content-Type": photo.type,
      });

      // Update bike with image key
      const updated = await prisma.bike.update({
        where: { id: bike.id },
        data: { imageKey },
      });
      return NextResponse.json(updated);
    }
  }

  return NextResponse.json(bike);
}
