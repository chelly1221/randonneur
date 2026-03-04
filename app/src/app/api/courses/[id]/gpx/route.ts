import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { downloadGpx } from "@/lib/minio";
import { createHash } from "crypto";
import { checkRateLimit, getIpKey } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 30 requests per minute per IP
  const ipKey = getIpKey(request, "gpx-download");
  const limit = checkRateLimit(ipKey, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.resetMs / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: { gpxFileKey: true, name: true },
  });

  if (!course?.gpxFileKey) {
    return NextResponse.json({ error: "GPX file not found" }, { status: 404 });
  }

  try {
    const data = await downloadGpx(course.gpxFileKey);

    // Log download
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    await prisma.download.create({
      data: { courseId: id, ipHash },
    });

    const filename = `${course.name.replace(/[^a-zA-Z0-9가-힣]/g, "_")}.gpx`;

    return new Response(data.toString("utf-8"), {
      headers: {
        "Content-Type": "application/gpx+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "X-RateLimit-Remaining": String(limit.remaining),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to download GPX" },
      { status: 500 }
    );
  }
}
