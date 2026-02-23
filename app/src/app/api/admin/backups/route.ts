import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import * as Minio from "minio";

const BACKUPS_DIR = "/backups";

export async function GET() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return NextResponse.json({ backups: [] });
    }

    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith(".tar.gz"))
      .map((filename) => {
        const stat = fs.statSync(path.join(BACKUPS_DIR, filename));
        return {
          filename,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ backups: files });
  } catch {
    return NextResponse.json({ error: "Failed to list backups" }, { status: 500 });
  }
}

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

export async function POST() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .replace(/\..+/, "")
    .replace(/(\d{8})(\d{6})/, "$1-$2");
  const backupName = `backup-${timestamp}`;
  const backupDir = path.join(BACKUPS_DIR, backupName);

  try {
    fs.mkdirSync(backupDir, { recursive: true });

    // --- 1. pg_dump randonneur DB ---
    const db = parseDatabaseUrl(process.env.DATABASE_URL!);
    const pgEnv = { ...process.env, PGPASSWORD: db.password };

    execSync(
      `pg_dump -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} --format=custom -f "${backupDir}/randonneur.dump"`,
      { env: pgEnv, timeout: 120_000 }
    );

    // --- 2. pg_dump keycloak DB ---
    execSync(
      `pg_dump -h ${db.host} -p ${db.port} -U ${db.user} -d keycloak --format=custom -f "${backupDir}/keycloak.dump"`,
      { env: pgEnv, timeout: 120_000 }
    );

    // --- 3. Export MinIO bucket ---
    const minioDir = path.join(backupDir, "minio-data");
    fs.mkdirSync(minioDir, { recursive: true });

    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "minio",
      port: parseInt(process.env.MINIO_PORT ?? "9000"),
      useSSL: false,
      accessKey: process.env.MINIO_ROOT_USER ?? "",
      secretKey: process.env.MINIO_ROOT_PASSWORD ?? "",
    });

    const bucket = process.env.MINIO_BUCKET ?? "gpx-files";
    const bucketExists = await minioClient.bucketExists(bucket);

    if (bucketExists) {
      const objects: string[] = [];
      const stream = minioClient.listObjects(bucket, "", true);
      for await (const obj of stream) {
        if (obj.name) objects.push(obj.name);
      }

      for (const key of objects) {
        const objStream = await minioClient.getObject(bucket, key);
        const filePath = path.join(minioDir, key);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const chunks: Buffer[] = [];
        for await (const chunk of objStream) {
          chunks.push(Buffer.from(chunk));
        }
        fs.writeFileSync(filePath, Buffer.concat(chunks));
      }
    }

    // --- 4. Create tar.gz archive ---
    const archivePath = path.join(BACKUPS_DIR, `${backupName}.tar.gz`);
    execSync(`tar -czf "${archivePath}" -C "${BACKUPS_DIR}" "${backupName}"`, {
      timeout: 120_000,
    });

    // Clean up temp directory
    fs.rmSync(backupDir, { recursive: true, force: true });

    const stat = fs.statSync(archivePath);
    return NextResponse.json({
      filename: `${backupName}.tar.gz`,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
    });
  } catch (e) {
    // Clean up on failure
    try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Backup failed: ${message}` }, { status: 500 });
  }
}
