import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";

const BACKUPS_DIR = "/backups";

export async function GET() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return NextResponse.json({ backups: [] });
    }

    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith(".tar.gz"))
      .map((filename) => {
        const stat = fs.statSync(path.join(BACKUPS_DIR, filename));
        return {
          filename,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ backups: files });
  } catch {
    return NextResponse.json({ error: "Failed to list backups" }, { status: 500 });
  }
}
