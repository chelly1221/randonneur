import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { runBcrScraper } from "@/lib/bcr-scraper";

export async function GET() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [enabledSetting, lastScrapeSetting, lastResultSetting] =
    await Promise.all([
      prisma.setting.findUnique({ where: { key: "BCR_SCRAPER_ENABLED" } }),
      prisma.setting.findUnique({ where: { key: "BCR_LAST_SCRAPE_DATE" } }),
      prisma.setting.findUnique({ where: { key: "BCR_LAST_SCRAPE_RESULT" } }),
    ]);

  const bcrCourseCount = await prisma.course.count({
    where: { sourceType: "bcr" },
  });

  return NextResponse.json({
    enabled: enabledSetting?.value !== "false",
    lastScrapeDate: lastScrapeSetting?.value ?? null,
    lastResult: lastResultSetting ? JSON.parse(lastResultSetting.value) : null,
    bcrCourseCount,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await runBcrScraper();

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
    where: { key: "BCR_SCRAPER_ENABLED" },
    update: { value: String(enabled) },
    create: { key: "BCR_SCRAPER_ENABLED", value: String(enabled) },
  });

  return NextResponse.json({ enabled });
}
