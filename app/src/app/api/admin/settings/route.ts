import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logAuditAction, AUDIT_ACTIONS } from "@/lib/audit";

interface SettingDef {
  key: string;
  label: string;
  group: string;
  password?: boolean;
}

const SETTING_DEFINITIONS: SettingDef[] = [
  // Auth
  { key: "NEXTAUTH_SECRET", label: "NextAuth 시크릿", group: "인증 (Auth)", password: true },
  { key: "NEXTAUTH_URL", label: "NextAuth URL", group: "인증 (Auth)" },
  // MinIO
  { key: "MINIO_ENDPOINT", label: "MinIO 엔드포인트", group: "파일 저장소 (MinIO)" },
  { key: "MINIO_PORT", label: "MinIO 포트", group: "파일 저장소 (MinIO)" },
  { key: "MINIO_BUCKET", label: "MinIO 버킷명", group: "파일 저장소 (MinIO)" },
  { key: "MINIO_ROOT_USER", label: "MinIO 사용자", group: "파일 저장소 (MinIO)" },
  { key: "MINIO_ROOT_PASSWORD", label: "MinIO 비밀번호", group: "파일 저장소 (MinIO)", password: true },
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const dbSettings = await prisma.setting.findMany();
  const dbMap = new Map(dbSettings.map((s) => [s.key, s.value]));

  const settings = SETTING_DEFINITIONS.map((def) => ({
    ...def,
    value: dbMap.get(def.key) ?? process.env[def.key] ?? "",
    source: dbMap.has(def.key) ? "db" as const : "env" as const,
  }));

  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const incoming = body.settings as Record<string, string> | undefined;

  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const validKeys = new Set(SETTING_DEFINITIONS.map((d) => d.key));
  const entries = Object.entries(incoming).filter(([k]) => validKeys.has(k));

  if (entries.length === 0) {
    return NextResponse.json({ error: "No valid settings" }, { status: 400 });
  }

  // Upsert all settings in a transaction
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  logAuditAction(
    session.user.id,
    AUDIT_ACTIONS.SETTINGS_UPDATE,
    "setting",
    null,
    { keys: entries.map(([k]) => k) }
  );

  // Schedule restart after response is sent
  setTimeout(() => {
    console.log("[settings] Restarting to apply new settings...");
    process.exit(0);
  }, 1000);

  return NextResponse.json({ success: true, message: "설정이 저장되었습니다. 서버를 재시작합니다." });
}
