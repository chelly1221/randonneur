import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";

const BACKUPS_DIR = "/backups";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const filename = file.name;

  // Validate filename: must end with .tar.gz, no path traversal
  if (!/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(filename)) {
    return NextResponse.json(
      { error: "Invalid filename. Only .tar.gz files with alphanumeric names are allowed." },
      { status: 400 }
    );
  }

  // Ensure backups directory exists
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const filePath = path.join(BACKUPS_DIR, filename);
  const resolved = path.resolve(filePath);

  // Double-check resolved path is within BACKUPS_DIR
  if (!resolved.startsWith(BACKUPS_DIR + "/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(resolved, buffer);

    const stat = fs.statSync(resolved);
    return NextResponse.json({
      filename,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 }
    );
  }
}
