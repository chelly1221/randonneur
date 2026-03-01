import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: { ids?: string[]; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.all) {
    // Mark all notifications as read for this user
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });

    return NextResponse.json({ updated: result.count, unreadCount: 0 });
  }

  if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
    // Validate ID count limit
    if (body.ids.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Too many IDs. Maximum is ${MAX_IDS}` },
        { status: 400 }
      );
    }

    // Validate all IDs are valid UUIDs
    const invalidIds = body.ids.filter((id) => typeof id !== "string" || !UUID_REGEX.test(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Invalid notification ID format" },
        { status: 400 }
      );
    }

    // Mark specific notifications as read (only if they belong to this user)
    const result = await prisma.notification.updateMany({
      where: {
        id: { in: body.ids },
        userId: user.id,
        read: false,
      },
      data: { read: true },
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: user.id, read: false },
    });

    return NextResponse.json({ updated: result.count, unreadCount });
  }

  return NextResponse.json(
    { error: "Provide either { ids: string[] } or { all: true }" },
    { status: 400 }
  );
}
