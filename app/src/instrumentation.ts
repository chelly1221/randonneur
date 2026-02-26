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
}
