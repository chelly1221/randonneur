import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const badges = await prisma.badge.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(badges);
}
