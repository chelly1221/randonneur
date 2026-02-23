import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";

const BACKUPS_DIR = "/backups";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { filename } = await params;

  // Path traversal prevention: only allow alphanumeric, hyphen, dot, underscore
  if (!/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(BACKUPS_DIR, filename);
  const resolved = path.resolve(filePath);

  // Double-check the resolved path is within BACKUPS_DIR
  if (!resolved.startsWith(BACKUPS_DIR + "/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(resolved);
  const buffer = fs.readFileSync(resolved);

  return new Response(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": stat.size.toString(),
    },
  });
}
