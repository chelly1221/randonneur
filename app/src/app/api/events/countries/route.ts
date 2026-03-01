import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const rows = await prisma.event.findMany({
    where: { sourceType: "acp", country: { not: null } },
    distinct: ["country"],
    select: { country: true },
    orderBy: { country: "asc" },
  });

  const countries = rows
    .map((r) => r.country)
    .filter((c): c is string => c !== null);

  return NextResponse.json(countries);
}
