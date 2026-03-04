import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search");
  const status = searchParams.get("status"); // "active", "muted", "banned", or null (all)
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  const where: Prisma.UserWhereInput = {};

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  if (status && ["active", "muted", "banned"].includes(status)) {
    where.status = status;
  }

  const findArgs: Prisma.UserFindManyArgs = {
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: {
      _count: { select: { completions: true } },
    },
  };

  if (cursor) {
    findArgs.cursor = { id: cursor };
    findArgs.skip = 1;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany(findArgs),
    prisma.user.count({ where }),
  ]);

  const hasMore = users.length > limit;
  const items = hasMore ? users.slice(0, limit) : users;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({
    users: items,
    total,
    hasMore,
    nextCursor,
  });
}
