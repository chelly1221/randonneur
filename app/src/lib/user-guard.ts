import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

/**
 * Checks auth + user status. Returns { user, error } where error is a NextResponse if failed.
 * Usage:
 *   const { user, error } = await requireActiveUser();
 *   if (error) return error;
 */
export async function requireActiveUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  });
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }

  if (user.status === "banned") {
    return { user: null, error: NextResponse.json({ error: "Account banned" }, { status: 403 }) };
  }
  if (user.status === "muted") {
    return { user: null, error: NextResponse.json({ error: "Account muted" }, { status: 403 }) };
  }

  return { user, error: null, session };
}
