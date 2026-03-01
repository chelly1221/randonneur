export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const settings = await prisma.setting.findMany();
      for (const { key, value } of settings) {
        process.env[key] = value;
      }
      if (settings.length > 0) {
        console.log(`[instrumentation] Loaded ${settings.length} settings from DB`);
      }
    } catch (e: unknown) {
      // Table doesn't exist yet (pre-migration) — silently ignore
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("settings") && !msg.includes("does not exist")) {
        console.warn("[instrumentation] Failed to load settings:", msg);
      }
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available during build — ignore
  }

  // ACP BRM scraper scheduler
  scheduleAcpScraper();

  // Audax Australia permanent course scraper scheduler
  scheduleAudaxAuScraper();

  // Korea Randonneurs permanent course scraper scheduler
  scheduleKoraPermScraper();

  // Randonneurs.be permanent course scraper scheduler
  scheduleRandonneursBeScraper();
}

/**
 * Schedule the ACP BRM scraper to run once daily.
 * Uses setInterval (1 hour) + date check to avoid external dependencies.
 */
function scheduleAcpScraper() {
  // Initial delay: 30 seconds after server start
  setTimeout(async () => {
    await checkAndRunAcpScraper();

    // Then check every hour
    setInterval(checkAndRunAcpScraper, 60 * 60 * 1000);
  }, 30_000);
}

async function checkAndRunAcpScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      // Check if scraper is enabled
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "KORA_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      // Check if already ran today (KST)
      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "KORA_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        // Compare dates in KST (UTC+9)
        const toKSTDate = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 10);
        };
        if (toKSTDate(lastScrape) === toKSTDate(now)) return;
      }

      console.log("[acp-scraper] Starting daily scrape...");
      const { runAcpScraper } = await import("./lib/kora-scraper");
      const result = await runAcpScraper();
      console.log(
        `[acp-scraper] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[acp-scraper] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[acp-scraper] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

/**
 * Schedule the Audax Australia scraper to run once monthly.
 * Uses setInterval (6 hours) + month check to avoid external dependencies.
 */
function scheduleAudaxAuScraper() {
  // Initial delay: 2 minutes after server start (stagger from ACP's 30s)
  setTimeout(async () => {
    await checkAndRunAudaxAuScraper();

    // Then check every 6 hours
    setInterval(checkAndRunAudaxAuScraper, 6 * 60 * 60 * 1000);
  }, 120_000);
}

async function checkAndRunAudaxAuScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      // Check if scraper is enabled
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "AUDAX_AU_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      // Check if already ran this month (compare YYYY-MM)
      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "AUDAX_AU_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7); // YYYY-MM
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[audax-au] Starting monthly scrape...");
      const { runAudaxAuScraper } = await import("./lib/audax-au-scraper");
      const result = await runAudaxAuScraper();
      console.log(
        `[audax-au] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[audax-au] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[audax-au] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

/**
 * Schedule the Korea Randonneurs permanent course scraper to run once monthly.
 * Uses setInterval (6 hours) + month check to avoid external dependencies.
 */
function scheduleKoraPermScraper() {
  // Initial delay: 4 minutes after server start (stagger from AU's 2min)
  setTimeout(async () => {
    await checkAndRunKoraPermScraper();

    // Then check every 6 hours
    setInterval(checkAndRunKoraPermScraper, 6 * 60 * 60 * 1000);
  }, 240_000);
}

async function checkAndRunKoraPermScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      // Check if scraper is enabled
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "KORA_PERM_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      // Check if already ran this month (compare YYYY-MM)
      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "KORA_PERM_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7); // YYYY-MM
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[kora-perm] Starting monthly scrape...");
      const { runKoraPermScraper } = await import("./lib/kora-permanents-scraper");
      const result = await runKoraPermScraper();
      console.log(
        `[kora-perm] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[kora-perm] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[kora-perm] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

/**
 * Schedule the Randonneurs.be scraper to run once monthly.
 * Uses setInterval (6 hours) + month check to avoid external dependencies.
 */
function scheduleRandonneursBeScraper() {
  // Initial delay: 6 minutes after server start (stagger from KORA's 4min)
  setTimeout(async () => {
    await checkAndRunRandonneursBeScraper();

    // Then check every 6 hours
    setInterval(checkAndRunRandonneursBeScraper, 6 * 60 * 60 * 1000);
  }, 360_000);
}

async function checkAndRunRandonneursBeScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      // Check if scraper is enabled
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "RANDONNEURS_BE_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      // Check if already ran this month (compare YYYY-MM)
      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "RANDONNEURS_BE_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7); // YYYY-MM
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[randonneurs-be] Starting monthly scrape...");
      const { runRandonneursBeScraper } = await import("./lib/randonneurs-be-scraper");
      const result = await runRandonneursBeScraper();
      console.log(
        `[randonneurs-be] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[randonneurs-be] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[randonneurs-be] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}
