import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadGpx } from "@/lib/minio";
import { parseGpx, sampleElevations } from "@/lib/gpx";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const courseId = formData.get("courseId") as string;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const gpxString = buffer.toString("utf-8");

  // Parse GPX to extract metadata
  let parsed = null;
  try {
    parsed = parseGpx(gpxString);
  } catch {
    return NextResponse.json({ error: "Invalid GPX file" }, { status: 400 });
  }

  // Upload to MinIO
  const key = `courses/${courseId}.gpx`;
  await uploadGpx(key, buffer);

  // Extract first LineString geometry from geojson
  let lineGeometry = null;
  for (const feature of parsed.geojson.features) {
    if (feature.geometry.type === "LineString") {
      lineGeometry = feature.geometry;
      break;
    }
    if (feature.geometry.type === "MultiLineString") {
      // Flatten to first linestring
      lineGeometry = {
        type: "LineString",
        coordinates: feature.geometry.coordinates.flat(),
      };
      break;
    }
  }

  const elevationProfile = sampleElevations(parsed.elevations);

  return NextResponse.json({
    key,
    distance: parsed.distance,
    elevation: parsed.elevationGain,
    geojson: lineGeometry,
    elevationProfile: {
      points: elevationProfile,
    },
  });
}
