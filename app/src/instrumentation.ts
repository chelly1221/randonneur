// In-memory mutex to prevent concurrent runs of the same scraper.
// If a scraper is still running when its next interval fires, the run is skipped.
const runningScrapers = new Set<string>();

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

  // ACP BRM scraper — check every hour
  setInterval(checkAndRunAcpScraper, 60 * 60 * 1000);

  // Audax Australia — check every 6 hours
  setInterval(checkAndRunAudaxAuScraper, 6 * 60 * 60 * 1000);

  // Korea Randonneurs permanents — check every 6 hours
  setInterval(checkAndRunKoraPermScraper, 6 * 60 * 60 * 1000);

  // Randonneurs.be — check every 6 hours
  setInterval(checkAndRunRandonneursBeScraper, 6 * 60 * 60 * 1000);

  // BC Randonneurs — check every 6 hours
  setInterval(checkAndRunBcrScraper, 6 * 60 * 60 * 1000);

  // Randonneurs Ontario — check every 6 hours
  setInterval(checkAndRunOntarioScraper, 6 * 60 * 60 * 1000);

  // Alberta Randonneurs — check every 6 hours
  setInterval(checkAndRunAlbertaScraper, 6 * 60 * 60 * 1000);

  // Audax Germany — check every 6 hours
  setInterval(checkAndRunAudaxDeScraper, 6 * 60 * 60 * 1000);

  // Audax Ireland — check every 6 hours
  setInterval(checkAndRunAudaxIrelandScraper, 6 * 60 * 60 * 1000);

  // Audax Italy — check every 6 hours
  setInterval(checkAndRunAudaxItalyScraper, 6 * 60 * 60 * 1000);

  // Audax Japan — check every 6 hours
  setInterval(checkAndRunAudaxJapanScraper, 6 * 60 * 60 * 1000);

  // Randonneurs Norway — check every 6 hours
  setInterval(checkAndRunRandonneursNoScraper, 6 * 60 * 60 * 1000);

  // Kiwi Randonneurs (NZ) — check every 6 hours
  setInterval(checkAndRunKiwiRandonneursScraper, 6 * 60 * 60 * 1000);

  // Audax UK — check every 6 hours
  setInterval(checkAndRunAudaxUkScraper, 6 * 60 * 60 * 1000);

  // RUSA (USA) — check every 6 hours
  setInterval(checkAndRunRusaScraper, 6 * 60 * 60 * 1000);

  // Rancat (Spain) — check every 6 hours
  setInterval(checkAndRunRancatScraper, 6 * 60 * 60 * 1000);

  // Audax Denmark — check every 6 hours
  setInterval(checkAndRunAudaxDkScraper, 6 * 60 * 60 * 1000);

  // SR France — check every 6 hours
  setInterval(checkAndRunSrFranceScraper, 6 * 60 * 60 * 1000);

  // Audax South Africa — check every 6 hours
  setInterval(checkAndRunAudaxSaScraper, 6 * 60 * 60 * 1000);
}

async function checkAndRunAcpScraper() {
  const scraperName = "acp-scraper";
  if (runningScrapers.has(scraperName)) {
    console.log(`[${scraperName}] Skipping — previous run still in progress`);
    return;
  }
  runningScrapers.add(scraperName);
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
  } finally {
    runningScrapers.delete(scraperName);
  }
}

async function checkAndRunAudaxAuScraper() {
  const scraperName = "audax-au";
  if (runningScrapers.has(scraperName)) {
    console.log(`[${scraperName}] Skipping — previous run still in progress`);
    return;
  }
  runningScrapers.add(scraperName);
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
  } finally {
    runningScrapers.delete(scraperName);
  }
}

async function checkAndRunKoraPermScraper() {
  const scraperName = "kora-perm";
  if (runningScrapers.has(scraperName)) {
    console.log(`[${scraperName}] Skipping — previous run still in progress`);
    return;
  }
  runningScrapers.add(scraperName);
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
  } finally {
    runningScrapers.delete(scraperName);
  }
}

async function checkAndRunRandonneursBeScraper() {
  const scraperName = "randonneurs-be";
  if (runningScrapers.has(scraperName)) {
    console.log(`[${scraperName}] Skipping — previous run still in progress`);
    return;
  }
  runningScrapers.add(scraperName);
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
  } finally {
    runningScrapers.delete(scraperName);
  }
}

async function checkAndRunBcrScraper() {
  const scraperName = "bcr";
  if (runningScrapers.has(scraperName)) {
    console.log(`[${scraperName}] Skipping — previous run still in progress`);
    return;
  }
  runningScrapers.add(scraperName);
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      // Check if scraper is enabled
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "BCR_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      // Check if already ran this month (compare YYYY-MM)
      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "BCR_LAST_SCRAPE_DATE" },
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

      console.log("[bcr] Starting monthly scrape...");
      const { runBcrScraper } = await import("./lib/bcr-scraper");
      const result = await runBcrScraper();
      console.log(
        `[bcr] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[bcr] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[bcr] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  } finally {
    runningScrapers.delete(scraperName);
  }
}

async function checkAndRunOntarioScraper() {
  const scraperName = "ontario";
  if (runningScrapers.has(scraperName)) {
    console.log(`[${scraperName}] Skipping — previous run still in progress`);
    return;
  }
  runningScrapers.add(scraperName);
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      // Check if scraper is enabled
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "OR_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      // Check if already ran this month (compare YYYY-MM)
      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "OR_LAST_SCRAPE_DATE" },
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

      console.log("[ontario] Starting monthly scrape...");
      const { runOntarioRandonneursScraper } = await import("./lib/ontario-randonneurs-scraper");
      const result = await runOntarioRandonneursScraper();
      console.log(
        `[ontario] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[ontario] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ontario] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  } finally {
    runningScrapers.delete(scraperName);
  }
}

async function checkAndRunAlbertaScraper() {
  const scraperName = "alberta";
  if (runningScrapers.has(scraperName)) {
    console.log(`[${scraperName}] Skipping — previous run still in progress`);
    return;
  }
  runningScrapers.add(scraperName);
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      // Check if scraper is enabled
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "AB_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      // Check if already ran this month (compare YYYY-MM)
      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "AB_LAST_SCRAPE_DATE" },
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

      console.log("[alberta] Starting monthly scrape...");
      const { runAlbertaRandonneursScraper } = await import("./lib/alberta-randonneurs-scraper");
      const result = await runAlbertaRandonneursScraper();
      console.log(
        `[alberta] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[alberta] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[alberta] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  } finally {
    runningScrapers.delete(scraperName);
  }
}

async function checkAndRunAudaxDeScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "DE_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "DE_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[audax-de] Starting monthly scrape...");
      const { runAudaxDeScraper } = await import("./lib/audax-de-scraper");
      const result = await runAudaxDeScraper();
      console.log(
        `[audax-de] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[audax-de] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[audax-de] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunAudaxIrelandScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "IE_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "IE_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[audax-ireland] Starting monthly scrape...");
      const { runAudaxIrelandScraper } = await import("./lib/audax-ireland-scraper");
      const result = await runAudaxIrelandScraper();
      console.log(
        `[audax-ireland] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[audax-ireland] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[audax-ireland] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunAudaxItalyScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "IT_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "IT_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[audax-italy] Starting monthly scrape...");
      const { runAudaxItalyScraper } = await import("./lib/audax-italy-scraper");
      const result = await runAudaxItalyScraper();
      console.log(
        `[audax-italy] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[audax-italy] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[audax-italy] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunAudaxJapanScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "JP_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "JP_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[audax-japan] Starting monthly scrape...");
      const { runAudaxJapanScraper } = await import("./lib/audax-japan-scraper");
      const result = await runAudaxJapanScraper();
      console.log(
        `[audax-japan] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[audax-japan] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[audax-japan] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunRandonneursNoScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "NO_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "NO_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[randonneurs-no] Starting monthly scrape...");
      const { runRandonneursNoScraper } = await import("./lib/randonneurs-no-scraper");
      const result = await runRandonneursNoScraper();
      console.log(
        `[randonneurs-no] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[randonneurs-no] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[randonneurs-no] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunKiwiRandonneursScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "NZ_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "NZ_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[kiwi-randonneurs] Starting monthly scrape...");
      const { runKiwiRandonneursScraper } = await import("./lib/kiwi-randonneurs-scraper");
      const result = await runKiwiRandonneursScraper();
      console.log(
        `[kiwi-randonneurs] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[kiwi-randonneurs] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[kiwi-randonneurs] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunAudaxUkScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "GB_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "GB_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[audax-uk] Starting monthly scrape...");
      const { runAudaxUkScraper } = await import("./lib/audax-uk-scraper");
      const result = await runAudaxUkScraper();
      console.log(
        `[audax-uk] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[audax-uk] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[audax-uk] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunRusaScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "US_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "US_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[rusa] Starting monthly scrape...");
      const { runRusaScraper } = await import("./lib/rusa-scraper");
      const result = await runRusaScraper();
      console.log(
        `[rusa] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[rusa] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[rusa] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunRancatScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "ES_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "ES_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[rancat] Starting monthly scrape...");
      const { runRancatScraper } = await import("./lib/rancat-scraper");
      const result = await runRancatScraper();
      console.log(
        `[rancat] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[rancat] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[rancat] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunAudaxDkScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "DK_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "DK_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[audax-dk] Starting monthly scrape...");
      const { runAudaxDkScraper } = await import("./lib/audax-dk-scraper");
      const result = await runAudaxDkScraper();
      console.log(
        `[audax-dk] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[audax-dk] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[audax-dk] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunSrFranceScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "FR_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "FR_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[sr-france] Starting monthly scrape...");
      const { runSrFranceScraper } = await import("./lib/sr-france-scraper");
      const result = await runSrFranceScraper();
      console.log(
        `[sr-france] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[sr-france] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[sr-france] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}

async function checkAndRunAudaxSaScraper() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    try {
      const enabledSetting = await prisma.setting.findUnique({
        where: { key: "ZA_SCRAPER_ENABLED" },
      });
      if (enabledSetting?.value === "false") return;

      const lastScrapeSetting = await prisma.setting.findUnique({
        where: { key: "ZA_LAST_SCRAPE_DATE" },
      });

      if (lastScrapeSetting) {
        const lastScrape = new Date(lastScrapeSetting.value);
        const now = new Date();
        const toMonth = (d: Date) => {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 7);
        };
        if (toMonth(lastScrape) === toMonth(now)) return;
      }

      console.log("[audax-sa] Starting monthly scrape...");
      const { runAudaxSaScraper } = await import("./lib/audax-sa-scraper");
      const result = await runAudaxSaScraper();
      console.log(
        `[audax-sa] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn("[audax-sa] Errors:", result.errors.slice(0, 5));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[audax-sa] Failed:", msg);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // Prisma not available — ignore
  }
}
