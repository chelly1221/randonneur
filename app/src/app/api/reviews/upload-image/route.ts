import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureBucket, uploadGpx } from "@/lib/minio";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  });
  if (!user || user.status !== "active") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "JPG, PNG, WebP only" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Max 10MB" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const imageKey = `review-images/${user.id}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await ensureBucket();
  await uploadGpx(imageKey, buffer, file.type);

  return NextResponse.json({ url: `/api/images/${imageKey}` });
}
