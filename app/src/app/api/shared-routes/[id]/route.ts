import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { deleteGpx } from "@/lib/minio";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const route = await prisma.sharedRoute.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, keycloakId: true, displayName: true, avatarKey: true },
      },
    },
  });

  if (!route) {
    return NextResponse.json({ error: "루트를 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(route);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const route = await prisma.sharedRoute.findUnique({
    where: { id },
    include: { user: { select: { keycloakId: true } } },
  });

  if (!route) {
    return NextResponse.json({ error: "루트를 찾을 수 없습니다" }, { status: 404 });
  }

  // Only owner or admin can delete
  const isOwner = route.user.keycloakId === session.user.id;
  const isAdmin = session.user.roles?.includes("admin");
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  // Delete GPX file from MinIO
  try {
    await deleteGpx(route.gpxFileKey);
  } catch (e) {
    console.error("Failed to delete GPX from MinIO:", e);
  }

  await prisma.sharedRoute.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
