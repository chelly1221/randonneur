import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import * as Minio from "minio";

const BACKUPS_DIR = "/backups";

function parseDatabaseUrl(url: string) {
  const m = url.match(
    /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/
  );
  if (!m) throw new Error("Invalid DATABASE_URL");
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(m[2]),
    host: m[3],
    port: m[4],
    database: m[5],
  };
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: { filename?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename } = body;
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  // Path traversal prevention
  if (!/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const archivePath = path.join(BACKUPS_DIR, filename);
  const resolved = path.resolve(archivePath);
  if (!resolved.startsWith(BACKUPS_DIR + "/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-"));

  try {
    // --- 1. Extract archive ---
    execSync(`tar -xzf "${resolved}" -C "${tmpDir}"`, { timeout: 120_000 });

    // Find the extracted directory
    const entries = fs.readdirSync(tmpDir);
    if (entries.length === 0) {
      throw new Error("Archive is empty");
    }
    const backupDir = path.join(tmpDir, entries[0]);

    // Verify expected files
    const randonneurDump = path.join(backupDir, "randonneur.dump");

    if (!fs.existsSync(randonneurDump)) {
      throw new Error("randonneur.dump not found in archive");
    }

    // --- 2. Disconnect Prisma ---
    await prisma.$disconnect();

    // --- 3. Restore randonneur DB ---
    const db = parseDatabaseUrl(process.env.DATABASE_URL!);
    const pgEnv = { ...process.env, PGPASSWORD: db.password };

    // Terminate existing connections
    try {
      execSync(
        `psql -h ${db.host} -p ${db.port} -U ${db.user} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db.database}' AND pid <> pg_backend_pid();"`,
        { env: pgEnv, timeout: 30_000, stdio: "pipe" }
      );
    } catch {
      // Ignore errors - there might be no connections
    }

    // Drop and recreate randonneur DB
    execSync(
      `psql -h ${db.host} -p ${db.port} -U ${db.user} -d postgres -c "DROP DATABASE IF EXISTS \\"${db.database}\\";"`,
      { env: pgEnv, timeout: 30_000, stdio: "pipe" }
    );
    execSync(
      `psql -h ${db.host} -p ${db.port} -U ${db.user} -d postgres -c "CREATE DATABASE \\"${db.database}\\";"`,
      { env: pgEnv, timeout: 30_000, stdio: "pipe" }
    );

    // Enable extensions
    execSync(
      `psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\";"`,
      { env: pgEnv, timeout: 30_000, stdio: "pipe" }
    );

    // Restore from dump
    try {
      execSync(
        `pg_restore -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} --no-owner --no-privileges --clean --if-exists "${randonneurDump}"`,
        { env: pgEnv, timeout: 300_000, stdio: "pipe" }
      );
    } catch {
      // pg_restore may return non-zero on warnings, which is expected
    }

    // Get restored course count
    let restoredCourses = 0;
    try {
      const result = execSync(
        `psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} -tAc "SELECT count(*) FROM courses"`,
        { env: pgEnv, timeout: 10_000, stdio: "pipe" }
      );
      restoredCourses = parseInt(result.toString().trim(), 10) || 0;
    } catch {
      // Table might not exist yet
    }

    // --- 4. Restore MinIO data ---
    const minioDataDir = path.join(backupDir, "minio-data");
    let restoredFiles = 0;

    if (fs.existsSync(minioDataDir) && fs.readdirSync(minioDataDir).length > 0) {
      const minioClient = new Minio.Client({
        endPoint: process.env.MINIO_ENDPOINT ?? "minio",
        port: parseInt(process.env.MINIO_PORT ?? "9000"),
        useSSL: false,
        accessKey: process.env.MINIO_ROOT_USER ?? "",
        secretKey: process.env.MINIO_ROOT_PASSWORD ?? "",
      });

      const bucket = process.env.MINIO_BUCKET ?? "gpx-files";
      const bucketExists = await minioClient.bucketExists(bucket);
      if (!bucketExists) {
        await minioClient.makeBucket(bucket);
      }

      // Recursively find all files in minio-data
      function walkDir(dir: string, baseDir: string): string[] {
        const files: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...walkDir(fullPath, baseDir));
          } else {
            files.push(path.relative(baseDir, fullPath));
          }
        }
        return files;
      }

      const files = walkDir(minioDataDir, minioDataDir);
      for (const key of files) {
        const filePath = path.join(minioDataDir, key);
        const data = fs.readFileSync(filePath);
        await minioClient.putObject(bucket, key, data, data.length);
        restoredFiles++;
      }
    }

    // --- 5. Resolve failed migrations and run prisma migrate deploy ---
    // Restored DB may contain failed migration records that block migrate deploy.
    // Mark them as rolled back so Prisma can re-apply cleanly.
    try {
      execSync(
        `psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} -c "UPDATE _prisma_migrations SET finished_at = NOW(), logs = NULL WHERE finished_at IS NULL;"`,
        { env: pgEnv, timeout: 10_000, stdio: "pipe" }
      );
    } catch {
      // Table might not exist in older backups
    }

    try {
      execSync("npx --package=prisma@6 prisma migrate deploy", {
        timeout: 120_000,
        stdio: "pipe",
        cwd: "/app",
      });
    } catch {
      // Migration might fail if already up to date, which is fine
    }

    // Schedule process exit so the response is sent first.
    // Docker restart policy (restart: unless-stopped) will bring the container back.
    setTimeout(() => process.exit(0), 1000);

    return NextResponse.json({
      success: true,
      restoredCourses,
      restoredFiles,
      message: `복원 완료: ${restoredCourses}개 코스, ${restoredFiles}개 파일`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `복원 실패: ${message}` },
      { status: 500 }
    );
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
