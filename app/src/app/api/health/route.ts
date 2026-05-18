import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

async function checkService(
  name: string,
  checkFn: () => Promise<void>
): Promise<{ name: string; status: "ok" | "error"; message?: string }> {
  try {
    await checkFn();
    return { name, status: "ok" };
  } catch (e) {
    return {
      name,
      status: "error",
      message: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function GET() {
  const checks = await Promise.all([
    checkService("postgres", async () => {
      await prisma.$queryRaw`SELECT 1`;
    }),
    checkService("minio", async () => {
      const res = await fetch(
        `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/minio/health/live`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
  ]);

  const allOk = checks.every((c) => c.status === "ok");

  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded", services: checks },
    { status: allOk ? 200 : 503 }
  );
}
