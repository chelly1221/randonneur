import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logAuditAction, AUDIT_ACTIONS } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  const validStatuses = ["active", "muted", "banned"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { status },
  });

  const actionMap: Record<string, string> = {
    banned: AUDIT_ACTIONS.USER_BAN,
    muted: AUDIT_ACTIONS.USER_MUTE,
    active: AUDIT_ACTIONS.USER_ACTIVATE,
  };
  logAuditAction(
    session.user.id,
    actionMap[status] ?? "user_status_change",
    "user",
    id,
    { displayName: updated.displayName, status }
  );

  return NextResponse.json(updated);
}
