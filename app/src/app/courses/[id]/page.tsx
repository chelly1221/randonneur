import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { downloadGpx } from "@/lib/minio";
import { parseGpx } from "@/lib/gpx";
import { CourseDetailClient } from "@/components/course/course-detail-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompletionForm } from "@/components/course/completion-form";
import { CATEGORIES } from "@/types";
import {
  Download,
  ArrowLeft,
  ArrowRight,
  Mountain,
  Clock,
  MapPin,
  User,
} from "lucide-react";
import Link from "next/link";
import { FavoriteButton } from "@/components/course/favorite-button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CourseDetailPage({ params }: Props) {
  const { id } = await params;

  const [course, checkpoints] = await Promise.all([
    prisma.course.findUnique({ where: { id } }),
    prisma.checkpoint.findMany({
      where: { courseId: id },
      orderBy: { distanceKm: "asc" },
    }),
  ]);

  if (!course) notFound();

  const geoResult: { geojson: string }[] = await prisma.$queryRawUnsafe(
    `SELECT ST_AsGeoJSON(geom) as geojson FROM courses WHERE id = $1::uuid`,
    id
  );

  let gpxData = null;
  let geojsonParsed = null;

  if (course.gpxFileKey) {
    try {
      const gpxBuffer = await downloadGpx(course.gpxFileKey);
      const gpxString = gpxBuffer.toString("utf-8");
      gpxData = parseGpx(gpxString);
      geojsonParsed = gpxData.geojson;
    } catch {
      // GPX parsing failed, fall back to DB geometry
    }
  }

  if (!geojsonParsed && geoResult[0]?.geojson) {
    const geom = JSON.parse(geoResult[0].geojson);
    geojsonParsed = {
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, geometry: geom, properties: {} }],
    };
  }

  let bounds = gpxData?.bounds ?? null;
  if (!bounds && geoResult[0]?.geojson) {
    const geom = JSON.parse(geoResult[0].geojson);
    if (geom.coordinates) {
      let minLat = Infinity,
        maxLat = -Infinity,
        minLng = Infinity,
        maxLng = -Infinity;
      for (const [lng, lat] of geom.coordinates) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      bounds = { minLat, maxLat, minLng, maxLng };
    }
  }

  const categories = CATEGORIES.filter((c) => course.category.includes(c.value));
  const elevations = gpxData?.elevations ?? [];

  const cpData = checkpoints.map((cp) => ({
    id: cp.id,
    name: cp.name,
    description: cp.description,
    distanceKm: cp.distanceKm,
    imageKey: cp.imageKey,
  }));

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col px-4 py-3 lg:py-3">
      {/* Header row */}
      <div className="mx-auto mb-2 flex w-full max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/courses"
            className="inline-flex items-center gap-1 text-sm text-t-muted hover:text-t-text"
          >
            <ArrowLeft className="h-4 w-4" />
            목록
          </Link>
          <h1 className="text-xl font-bold lg:text-2xl">
            {categories.map((cat) => <span key={cat.value} className="mr-1">{cat.emoji}</span>)}
            {course.name}
          </h1>
          <Badge variant="primary">{course.region}</Badge>
          {categories.map((cat) => <Badge key={cat.value}>{cat.label}</Badge>)}
          {course.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <FavoriteButton courseId={id} />
          <CompletionForm courseId={id} />
          {course.gpxFileKey && (
            <a href={`/api/courses/${course.id}/gpx`}>
              <Button variant="outline" size="sm">
                <Download className="mr-1 h-4 w-4" />
                GPX
              </Button>
            </a>
          )}
        </div>
      </div>

      {(course.description || course.designer) && (
        <div className="mx-auto mb-2 w-full max-w-7xl flex items-center gap-3 text-sm text-t-sub">
          {course.description && <p>{course.description}</p>}
          {course.designer && (
            <span className="flex items-center gap-1 text-xs text-t-muted">
              <User className="h-3 w-3" />
              {course.designer}
            </span>
          )}
        </div>
      )}

      {/* Map + Stats row */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-3 overflow-hidden lg:flex-row flex-col min-h-0">
        <CourseDetailClient
          geojson={geojsonParsed}
          bounds={bounds}
          elevations={elevations}
          checkpoints={cpData}
          compact
        />

        {/* Stats sidebar */}
        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-72">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-1">
            <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-t-muted">
                <ArrowRight className="h-3.5 w-3.5" />
                거리
              </div>
              <p className="font-semibold text-t-text">{course.distanceKm} km</p>
            </div>
            <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-t-muted">
                <Mountain className="h-3.5 w-3.5" />
                획득 고도
              </div>
              <p className="font-semibold text-t-text">{course.elevationM} m</p>
            </div>
            {course.estimatedTime && (
              <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-t-muted">
                  <Clock className="h-3.5 w-3.5" />
                  예상 시간
                </div>
                <p className="font-semibold text-t-text">{course.estimatedTime}</p>
              </div>
            )}
            <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-t-muted">
                <MapPin className="h-3.5 w-3.5" />
                구간
              </div>
              <p className="font-semibold text-t-text text-sm">{course.startLocation} → {course.endLocation}</p>
            </div>
          </div>

          {/* Checkpoint list */}
          {cpData.length > 0 && (
            <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2 overflow-y-auto max-h-[40vh] lg:max-h-none lg:flex-1 lg:min-h-0">
              <p className="text-xs font-medium text-t-muted mb-2">체크포인트</p>
              <div className="space-y-1.5">
                {cpData.map((cp, i) => (
                  <div key={cp.id} className="flex items-start gap-2 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-orange/20 text-[10px] font-bold text-sky-orange mt-0.5">
                      {i + 1}
                    </span>
                    {cp.imageKey && (
                      <a
                        href={`/api/images/${cp.imageKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/images/${cp.imageKey}`}
                          alt={cp.name}
                          className="h-10 w-10 rounded object-cover border border-t-border"
                          loading="lazy"
                        />
                      </a>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-t-text">{cp.name}</span>
                      <span className="text-t-muted">{cp.distanceKm} km</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
