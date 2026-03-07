import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { uploadGpx } from "@/lib/minio";
import { randomUUID } from "crypto";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const completion = await prisma.completion.findUnique({ where: { id } });
  if (!completion) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (completion.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const completedAt = formData.get("completedAt") as string | null;
  const completionStatus = formData.get("completionStatus") as string | null;
  const notes = formData.get("notes") as string | null;
  const gpxFile = formData.get("gpx") as File | null;

  const VALID_STATUSES = ["success", "dnf", "dnq", "dns"];
  const data: Record<string, unknown> = {};

  if (completedAt) {
    data.completedAt = new Date(completedAt);
  }
  if (completionStatus && VALID_STATUSES.includes(completionStatus)) {
    data.completionStatus = completionStatus;
  }
  if (notes !== undefined) {
    data.notes = notes || null;
  }

  if (gpxFile && gpxFile.size > 0) {
    if (gpxFile.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "GPX file too large (max 50MB)" }, { status: 400 });
    }
    const buffer = Buffer.from(await gpxFile.arrayBuffer());
    const gpxFileKey = `completions/${user.id}/${randomUUID()}.gpx`;
    await uploadGpx(gpxFileKey, buffer);
    data.gpxFileKey = gpxFileKey;
  }

  const updated = await prisma.completion.update({
    where: { id },
    data,
    include: { course: { select: { id: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const completion = await prisma.completion.findUnique({ where: { id } });
  if (!completion) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (completion.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.completion.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
