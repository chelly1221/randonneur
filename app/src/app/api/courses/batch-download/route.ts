import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { downloadGpx } from "@/lib/minio";
import JSZip from "jszip";

export async function GET() {
  const courses = await prisma.course.findMany({
    where: { archived: false, gpxFileKey: { not: null } },
    select: { name: true, courseNumber: true, gpxFileKey: true },
    orderBy: { courseNumber: "asc" },
  });

  const zip = new JSZip();

  for (const course of courses) {
    if (!course.gpxFileKey) continue;
    try {
      const data = await downloadGpx(course.gpxFileKey);
      const prefix = course.courseNumber ? `${course.courseNumber}_` : "";
      const filename = `${prefix}${course.name.replace(/[^a-zA-Z0-9가-힣]/g, "_")}.gpx`;
      zip.file(filename, data);
    } catch {
      // Skip failed downloads
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="randonneur-courses.zip"',
    },
  });
}

export async function POST(request: NextRequest) {
  const { courseIds } = await request.json();

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    return NextResponse.json({ error: "No course IDs provided" }, { status: 400 });
  }

  if (courseIds.length > 50) {
    return NextResponse.json({ error: "Maximum 50 courses per batch" }, { status: 400 });
  }

  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds }, gpxFileKey: { not: null } },
    select: { id: true, name: true, gpxFileKey: true },
  });

  const zip = new JSZip();

  for (const course of courses) {
    if (!course.gpxFileKey) continue;
    try {
      const data = await downloadGpx(course.gpxFileKey);
      const filename = `${course.name.replace(/[^a-zA-Z0-9가-힣]/g, "_")}.gpx`;
      zip.file(filename, data);
    } catch {
      // Skip failed downloads
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="courses.zip"',
    },
  });
}
