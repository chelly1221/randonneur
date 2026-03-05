import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadGpx, ensureBucket } from "@/lib/minio";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const key = formData.get("key") as string;

  if (!file || !key) {
    return NextResponse.json(
      { error: "Missing file or key" },
      { status: 400 }
    );
  }

  // Validate key to prevent path traversal
  if (key.includes("..") || key.startsWith("/") || !/^[a-zA-Z0-9/_\-.]+$/.test(key)) {
    return NextResponse.json(
      { error: "Invalid key" },
      { status: 400 }
    );
  }

  // File size limit: 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large (max 10MB)" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await ensureBucket();
  await uploadGpx(key, buffer, file.type || "image/jpeg");

  return NextResponse.json({ key });
}
