import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listObjects } from "@/lib/minio";

export async function GET() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const files = await listObjects("");
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
