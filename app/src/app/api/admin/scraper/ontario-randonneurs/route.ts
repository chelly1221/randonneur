import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { runOntarioRandonneursScraper } from "@/lib/ontario-randonneurs-scraper";

export async function GET() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [enabledSetting, lastScrapeSetting, lastResultSetting] =
    await Promise.all([
      prisma.setting.findUnique({ where: { key: "OR_SCRAPER_ENABLED" } }),
      prisma.setting.findUnique({ where: { key: "OR_LAST_SCRAPE_DATE" } }),
      prisma.setting.findUnique({ where: { key: "OR_LAST_SCRAPE_RESULT" } }),
    ]);

  const orCourseCount = await prisma.course.count({
    where: { sourceType: "ontario-randonneurs" },
  });

  return NextResponse.json({
    enabled: enabledSetting?.value !== "false",
    lastScrapeDate: lastScrapeSetting?.value ?? null,
    lastResult: lastResultSetting ? JSON.parse(lastResultSetting.value) : null,
    orCourseCount,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await runOntarioRandonneursScraper();

  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { enabled } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  await prisma.setting.upsert({
    where: { key: "OR_SCRAPER_ENABLED" },
    update: { value: String(enabled) },
    create: { key: "OR_SCRAPER_ENABLED", value: String(enabled) },
  });

  return NextResponse.json({ enabled });
}
