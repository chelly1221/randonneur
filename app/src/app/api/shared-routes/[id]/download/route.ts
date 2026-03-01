import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { downloadGpx } from "@/lib/minio";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const route = await prisma.sharedRoute.findUnique({
    where: { id },
  });

  if (!route) {
    return NextResponse.json({ error: "루트를 찾을 수 없습니다" }, { status: 404 });
  }

  // Increment download count
  await prisma.sharedRoute.update({
    where: { id },
    data: { downloadCount: { increment: 1 } },
  });

  // Download GPX from MinIO
  let gpxBuffer: Buffer;
  try {
    gpxBuffer = await downloadGpx(route.gpxFileKey);
  } catch (e) {
    console.error("Failed to download GPX:", e);
    return NextResponse.json({ error: "GPX 파일을 찾을 수 없습니다" }, { status: 404 });
  }

  // Sanitize filename for Content-Disposition
  const safeTitle = route.title.replace(/[^\w가-힣\s.-]/g, "").trim() || "route";
  const filename = `${safeTitle}.gpx`;

  return new Response(gpxBuffer.toString("utf-8"), {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
