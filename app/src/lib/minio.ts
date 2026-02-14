import * as Minio from "minio";

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "minio",
  port: parseInt(process.env.MINIO_PORT ?? "9000"),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER ?? "",
  secretKey: process.env.MINIO_ROOT_PASSWORD ?? "",
});

const BUCKET = process.env.MINIO_BUCKET ?? "gpx-files";

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
  }
}

export async function uploadGpx(
  key: string,
  data: Buffer,
  contentType = "application/gpx+xml"
) {
  await ensureBucket();
  await minioClient.putObject(BUCKET, key, data, data.length, {
    "Content-Type": contentType,
  });
  return key;
}

export async function downloadGpx(key: string): Promise<Buffer> {
  const stream = await minioClient.getObject(BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteGpx(key: string) {
  await minioClient.removeObject(BUCKET, key);
}

export async function getPresignedUrl(
  key: string,
  expirySeconds = 3600
): Promise<string> {
  return minioClient.presignedGetObject(BUCKET, key, expirySeconds);
}

export async function listObjects(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  const stream = minioClient.listObjects(BUCKET, prefix, true);
  for await (const obj of stream) {
    if (obj.name) keys.push(obj.name);
  }
  return keys;
}
