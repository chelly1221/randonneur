import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { runAcpScraper } from "@/lib/kora-scraper";
import { logAuditAction, AUDIT_ACTIONS } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [enabledSetting, lastScrapeSetting, lastResultSetting] =
    await Promise.all([
      prisma.setting.findUnique({ where: { key: "KORA_SCRAPER_ENABLED" } }),
      prisma.setting.findUnique({ where: { key: "KORA_LAST_SCRAPE_DATE" } }),
      prisma.setting.findUnique({ where: { key: "KORA_LAST_SCRAPE_RESULT" } }),
    ]);

  const acpEventCount = await prisma.event.count({
    where: { sourceType: "acp" },
  });

  return NextResponse.json({
    enabled: enabledSetting?.value !== "false",
    lastScrapeDate: lastScrapeSetting?.value ?? null,
    lastResult: lastResultSetting ? JSON.parse(lastResultSetting.value) : null,
    koraEventCount: acpEventCount,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await runAcpScraper();

  logAuditAction(
    session.user.id,
    AUDIT_ACTIONS.SCRAPER_RUN,
    "scraper",
    "kora",
    { scraper: "ACP BRM", result }
  );

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
    where: { key: "KORA_SCRAPER_ENABLED" },
    update: { value: String(enabled) },
    create: { key: "KORA_SCRAPER_ENABLED", value: String(enabled) },
  });

  return NextResponse.json({ enabled });
}
