import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/user-guard";
import { uploadGpx, ensureBucket } from "@/lib/minio";
import { parseGpx } from "@/lib/gpx";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const region = searchParams.get("region");
  const q = searchParams.get("q");

  const where: Prisma.SharedRouteWhereInput = {};
  if (region) where.region = region;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const [routes, total] = await Promise.all([
    prisma.sharedRoute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: { id: true, keycloakId: true, displayName: true, avatarKey: true },
        },
      },
    }),
    prisma.sharedRoute.count({ where }),
  ]);

  return NextResponse.json({ routes, total });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const title = formData.get("title") as string | null;
  const description = (formData.get("description") as string | null) || null;
  const region = (formData.get("region") as string | null) || null;
  const gpxFile = formData.get("gpxFile") as File | null;

  if (!title?.trim()) {
    return NextResponse.json({ error: "제목을 입력해주세요" }, { status: 400 });
  }
  if (!gpxFile || gpxFile.size === 0) {
    return NextResponse.json({ error: "GPX 파일을 첨부해주세요" }, { status: 400 });
  }
  if (gpxFile.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "GPX 파일은 10MB 이하만 가능합니다" }, { status: 400 });
  }

  // Read and parse the GPX file
  const gpxBuffer = Buffer.from(await gpxFile.arrayBuffer());
  const gpxString = gpxBuffer.toString("utf-8");

  let distance: number | null = null;
  let elevation: number | null = null;
  try {
    const parsed = parseGpx(gpxString);
    distance = parsed.distance > 0 ? parsed.distance : null;
    elevation = parsed.elevationGain > 0 ? parsed.elevationGain : null;
  } catch {
    // If parsing fails, continue without distance/elevation
  }

  // Create the record first to get the ID
  const route = await prisma.sharedRoute.create({
    data: {
      userId: user!.id,
      title: title.trim(),
      description,
      distance,
      elevation,
      region,
      gpxFileKey: "placeholder", // will update after upload
    },
    include: {
      user: {
        select: { id: true, keycloakId: true, displayName: true, avatarKey: true },
      },
    },
  });

  // Upload GPX to MinIO
  const gpxKey = `shared-routes/${route.id}.gpx`;
  try {
    await ensureBucket();
    await uploadGpx(gpxKey, gpxBuffer);
  } catch (e) {
    // Clean up the record if upload fails
    await prisma.sharedRoute.delete({ where: { id: route.id } });
    console.error("Failed to upload GPX:", e);
    return NextResponse.json({ error: "GPX 업로드에 실패했습니다" }, { status: 500 });
  }

  // Update the record with the actual GPX key
  const updated = await prisma.sharedRoute.update({
    where: { id: route.id },
    data: { gpxFileKey: gpxKey },
    include: {
      user: {
        select: { id: true, keycloakId: true, displayName: true, avatarKey: true },
      },
    },
  });

  return NextResponse.json(updated, { status: 201 });
}
