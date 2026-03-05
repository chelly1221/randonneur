import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { courseId } = body;

  if (!courseId) {
    return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
  }

  // Find user by keycloakId
  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.status === "banned") {
    return NextResponse.json({ error: "Account restricted" }, { status: 403 });
  }

  // Toggle: if exists, delete; if not, create (race-safe)
  const existing = await prisma.favorite.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });

  if (existing) {
    try {
      await prisma.favorite.delete({ where: { id: existing.id } });
    } catch {
      // Already deleted by concurrent request
    }
    return NextResponse.json({ favorited: false });
  }

  try {
    await prisma.favorite.create({
      data: { userId: user.id, courseId },
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      // Already created by concurrent request — treat as success
      return NextResponse.json({ favorited: true });
    }
    throw e;
  }

  return NextResponse.json({ favorited: true });
}
